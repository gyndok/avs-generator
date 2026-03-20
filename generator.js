// ── AVS Generator: parsing + HTML rendering (ported from generate_avs.py) ──

const QR_API_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://g.page/r/CR1ccgPImkkOEBE/review';

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Parse measurements ──
function parseMeasurements(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('Date:')) continue;
    const parts = {};
    for (const p of trimmed.split('|')) {
      const idx = p.indexOf(':');
      if (idx > -1) {
        parts[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
      }
    }
    rows.push({
      date:   parts.Date || '',
      weight: (parts.Weight || '').replace(/ lbs/i, ''),
      waist:  (parts.Waist || '').replace(/ in/i, ''),
      neck:   (parts.Neck || '').replace(/ in/i, ''),
      hip:    (parts.Hip || '').replace(/ in/i, ''),
      bmi:    parts.BMI || '',
    });
  }
  return rows;
}

// ── Split raw text into letter + measurement lines ──
function splitInput(raw) {
  const lines = raw.split('\n');
  const letterLines = [];
  const measLines = [];
  let inMeas = false;
  for (const line of lines) {
    if (/^\s*Date:\s/.test(line)) inMeas = true;
    if (inMeas) measLines.push(line);
    else letterLines.push(line);
  }
  return { letter: letterLines.join('\n'), measText: measLines.join('\n') };
}

// ── Extract stats from letter ──
function extractStats(letter, measurements) {
  const stats = {
    start_weight: '', current_weight: '', lbs_lost: '', pct_lost: '',
    goal_weight: '', start_waist: '', current_waist: '', start_hip: '', current_hip: '',
  };
  let m;

  m = letter.match(/started at (\d+(?:\.\d+)?)\s*(?:pounds?|lbs)/i);
  if (m) stats.start_weight = m[1];

  m = letter.match(/(?:today you(?:'re| are)|now (?:weigh|at))\s+(\d+(?:\.\d+)?)\s*(?:pounds?|lbs)/i);
  if (m) stats.current_weight = m[1];

  m = letter.match(/(?:lost|loss of)\s+(\d+(?:\.\d+)?)\s*(?:pounds?|lbs)/i);
  if (m) stats.lbs_lost = m[1];

  m = letter.match(/(\d+(?:\.\d+)?)\s*%\s*of (?:your )?(?:the )?(?:way|starting|body)/i);
  if (m) stats.pct_lost = m[1];

  m = letter.match(/goal (?:weight )?(?:is |of )?(\d+(?:\.\d+)?)\s*(?:pounds?|lbs)/i);
  if (m) stats.goal_weight = m[1];

  m = letter.match(/waist\s+(?:has )?(?:decreased|went|dropped|changed)\s+from\s+(\d+(?:\.\d+)?)\s*(?:inches?|in)\s+to\s+(\d+(?:\.\d+)?)\s*(?:inches?|in)/i);
  if (m) { stats.start_waist = m[1]; stats.current_waist = m[2]; }

  m = letter.match(/hips?\s+(?:has |have )?(?:decreased|went|dropped|changed)\s+from\s+(\d+(?:\.\d+)?)\s*(?:inches?|in)\s+to\s+(\d+(?:\.\d+)?)\s*(?:inches?|in)/i);
  if (m) { stats.start_hip = m[1]; stats.current_hip = m[2]; }

  // Fall back to measurements
  if (measurements.length) {
    if (!stats.start_weight) stats.start_weight = measurements[0].weight;
    if (!stats.current_weight) stats.current_weight = measurements[measurements.length - 1].weight;
    if (!stats.start_waist) stats.start_waist = measurements[0].waist;
    if (!stats.current_waist) stats.current_waist = measurements[measurements.length - 1].waist;
    if (!stats.start_hip) stats.start_hip = measurements[0].hip;
    if (!stats.current_hip) stats.current_hip = measurements[measurements.length - 1].hip;
  }

  if (!stats.lbs_lost && stats.start_weight && stats.current_weight) {
    const diff = parseFloat(stats.start_weight) - parseFloat(stats.current_weight);
    if (!isNaN(diff)) stats.lbs_lost = diff.toFixed(1);
  }
  if (!stats.pct_lost && stats.lbs_lost && stats.start_weight) {
    const pct = (parseFloat(stats.lbs_lost) / parseFloat(stats.start_weight)) * 100;
    if (!isNaN(pct)) stats.pct_lost = pct.toFixed(1);
  }

  return stats;
}

// ── Parse letter sections ──
const SECTION_PATTERNS = [
  ['nutrition_smart', /^(?:smart\s+goal\s*[-–—]\s*nutrition|nutrition\s+smart\s+goal|smart\s+nutrition\s+goal)/i],
  ['exercise_smart',  /^(?:smart\s+goal\s*[-–—]\s*exercise|exercise\s+smart\s+goal|smart\s+exercise\s+goal)/i],
  ['medication',      /^medication/i],
  ['fitte',           /^(?:exercise\s+prescription|fitte)/i],
  ['nutrition_guide', /^nutrition\s+(?:guidelines?|goals?)/i],
  ['next_steps',      /^next\s+steps?/i],
  ['lifestyle',       /^lifestyle/i],
  ['_action_plan',    /^action\s+plan/i],
];

function parseLetterSections(letter) {
  const sections = { preamble: [] };
  for (const [k] of SECTION_PATTERNS) {
    if (!k.startsWith('_')) sections[k] = [];
  }

  let current = 'preamble';
  for (const line of letter.split('\n')) {
    let matched = null;
    const trimmed = line.trim();
    for (const [key, pat] of SECTION_PATTERNS) {
      if (pat.test(trimmed)) { matched = key; break; }
    }
    if (matched && !matched.startsWith('_')) { current = matched; continue; }
    if (matched && matched.startsWith('_')) continue;
    sections[current].push(line);
  }

  // Trim blank lines
  for (const k of Object.keys(sections)) {
    while (sections[k].length && !sections[k][0].trim()) sections[k].shift();
    while (sections[k].length && !sections[k][sections[k].length - 1].trim()) sections[k].pop();
  }
  return sections;
}

// ── HTML renderers ──
function renderGoalItems(lines) {
  const icons = { specific: '🎯', measurable: '📏', achievable: '✅', realistic: '💡', 'time-related': '⏰', time: '⏰' };
  return lines.filter(l => l.trim()).map(line => {
    const m = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const icon = icons[m[1].trim().toLowerCase()] || '•';
      return `<div class="goal-item"><span class="goal-icon">${icon}</span><div class="goal-text"><strong>${esc(m[1].trim())}:</strong> ${esc(m[2].trim())}</div></div>`;
    }
    return `<div class="goal-item"><span class="goal-icon">•</span><div class="goal-text">${esc(line.trim())}</div></div>`;
  }).join('\n');
}

function renderMedItems(lines) {
  const warn = /\b(call if|report|warning|do not|avoid|severe|emergency|planning pregnancy)\b/i;
  return lines.filter(l => l.trim()).map(line => {
    if (warn.test(line)) return `<div class="warn-row">⚠️ ${esc(line.trim())}</div>`;
    return `<div class="med-item"><span class="med-icon">💊</span><div>${esc(line.trim())}</div></div>`;
  }).join('\n');
}

function renderFitteTable(lines) {
  const rows = lines.filter(l => l.trim()).map(line => {
    const m = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (m) return `<tr><td>${esc(m[1].trim())}</td><td>${esc(m[2].trim())}</td></tr>`;
    return `<tr><td colspan="2">${esc(line.trim())}</td></tr>`;
  }).join('\n');
  return `<table class="fitte-table"><tbody>${rows}</tbody></table>`;
}

function renderNutrList(lines) {
  const items = lines.filter(l => l.trim()).map(line => {
    const clean = line.trim().replace(/^\d+[.)]\s*/, '');
    return `<li>${esc(clean)}</li>`;
  }).join('');
  return `<ul class="nutr-list">${items}</ul>`;
}

function renderNextSteps(lines) {
  let num = 1;
  return lines.filter(l => l.trim()).map(line => {
    const clean = line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');
    if (!clean) return '';
    return `<div class="step-item"><span class="step-num">${num++}</span><div>${esc(clean)}</div></div>`;
  }).join('\n');
}

// ── SVG chart ──
function buildSvgChart(measurements, goalWeight) {
  if (!measurements.length) return '<p style="font-size:7pt;color:#9ca3af;">No chart data.</p>';
  const weights = measurements.map(r => parseFloat(r.weight));
  if (weights.some(isNaN)) return '<p style="font-size:7pt;color:#9ca3af;">Could not parse weights.</p>';
  const dates = measurements.map(r => r.date);
  const goal = parseFloat(goalWeight) || (Math.min(...weights) - 5);
  const allVals = [...weights, goal];
  const minW = Math.min(...allVals) - 5;
  const maxW = Math.max(...allVals) + 5;

  const VW = 460, VH = 165, PL = 50, PR = 20, PT = 10, PB = 20;
  const CW = VW - PL - PR, CH = VH - PT - PB;
  const n = weights.length;
  const sx = i => n === 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW;
  const sy = v => PT + (1 - (v - minW) / (maxW - minW)) * CH;
  const goalY = sy(goal);

  const pts = weights.map((w, i) => `${sx(i).toFixed(1)},${sy(w).toFixed(1)}`).join(' ');
  const polyPts = pts + ` ${sx(n-1).toFixed(1)},${(PT+CH).toFixed(1)} ${sx(0).toFixed(1)},${(PT+CH).toFixed(1)}`;

  let grids = '', yLabels = '';
  for (let i = 0; i < 5; i++) {
    const gy = PT + i * (CH / 4);
    grids += `<line x1="${PL}" y1="${gy.toFixed(1)}" x2="${VW-PR}" y2="${gy.toFixed(1)}" stroke="#f3f4f6" stroke-width="1"/>`;
    const val = minW + (4 - i) * (maxW - minW) / 4;
    yLabels += `<text x="${PL-3}" y="${(gy+3).toFixed(1)}" text-anchor="end" font-size="6" fill="#9ca3af">${val.toFixed(0)}</text>`;
  }

  let xLabels = '';
  dates.forEach((d, i) => {
    const parts = d.split('/');
    const short = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : d;
    const color = i === n - 1 ? '#059669' : '#9ca3af';
    const fw = i === n - 1 ? ' font-weight="600"' : '';
    xLabels += `<text x="${sx(i).toFixed(1)}" y="${VH-4}" text-anchor="middle" font-size="5.5" fill="${color}"${fw}>${esc(short)}</text>`;
  });

  let dots = '';
  weights.forEach((wt, i) => {
    const cx = sx(i), cy = sy(wt);
    if (i === n - 1) {
      dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="#059669" stroke="#fff" stroke-width="2"/>`;
      dots += `<text x="${cx.toFixed(1)}" y="${(cy-8).toFixed(1)}" text-anchor="middle" font-size="7" fill="#059669" font-weight="700">${wt}★</text>`;
    } else {
      dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="#fff" stroke="#059669" stroke-width="2"/>`;
      dots += `<text x="${cx.toFixed(1)}" y="${(cy-7).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#374151" font-weight="600">${wt}</text>`;
    }
  });

  return `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
  <defs><linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" style="stop-color:#059669;stop-opacity:0.18"/>
    <stop offset="100%" style="stop-color:#059669;stop-opacity:0.0"/>
  </linearGradient></defs>
  ${grids}
  <line x1="${PL}" y1="${PT+CH}" x2="${VW-PR}" y2="${PT+CH}" stroke="#d1d5db" stroke-width="1"/>
  <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+CH}" stroke="#d1d5db" stroke-width="1"/>
  <text x="10" y="${PT + CH/2}" text-anchor="middle" font-size="6" fill="#9ca3af" transform="rotate(-90,10,${(PT + CH/2).toFixed(1)})">Weight (lbs)</text>
  <line x1="${PL}" y1="${goalY.toFixed(1)}" x2="${VW-PR}" y2="${goalY.toFixed(1)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="${VW-PR+2}" y="${(goalY+4).toFixed(1)}" font-size="6" fill="#b45309" font-weight="600">Goal</text>
  <polygon points="${polyPts}" fill="url(#lineGrad)"/>
  <polyline points="${pts}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  ${xLabels}
  ${yLabels}
</svg>`;
}

// ── Measurements table ──
function buildMeasurementsTable(measurements) {
  const rowsHtml = measurements.map((r, i) => {
    const isLast = i === measurements.length - 1;
    const cls = isLast ? ' class="highlight"' : '';
    const label = r.date + (isLast ? ' ★' : '');
    return `<tr${cls}><td>${esc(label)}</td><td>${esc(r.weight)} lbs</td><td>${esc(r.waist)}"</td><td>${esc(r.hip)}"</td><td>${esc(r.bmi)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Date</th><th>Weight</th><th>Waist</th><th>Hip</th><th>BMI</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function buildMeasurementsNote(stats) {
  const parts = [];
  if (stats.start_waist && stats.current_waist) {
    const d = parseFloat(stats.start_waist) - parseFloat(stats.current_waist);
    if (!isNaN(d)) parts.push(`<strong>📏 Waist:</strong> ${stats.start_waist}" → ${stats.current_waist}" (${d >= 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}")<br>`);
  }
  if (stats.start_hip && stats.current_hip) {
    const d = parseFloat(stats.start_hip) - parseFloat(stats.current_hip);
    if (!isNaN(d)) parts.push(`<strong>📏 Hips:</strong> ${stats.start_hip}" → ${stats.current_hip}" (${d >= 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}")`);
  }
  return parts.length ? parts.join('\n') : 'Body composition changes tracked above.';
}

// ── Hero band ──
function buildHero(stats) {
  const pct = parseFloat(stats.pct_lost || '0') || 0;
  const lbs = stats.lbs_lost || '?';
  const pctStr = stats.pct_lost || '?';

  let progressStr = '';
  if (stats.start_weight && stats.current_weight && stats.goal_weight) {
    const sw = parseFloat(stats.start_weight), cw = parseFloat(stats.current_weight), gw = parseFloat(stats.goal_weight);
    const totalToLose = sw - gw;
    if (totalToLose > 0) {
      const pctToGoal = ((sw - cw) / totalToLose) * 100;
      progressStr = ` · ${pctToGoal.toFixed(0)}% to goal`;
    }
  }

  const sub = `${lbs} lbs lost · ${pctStr}% of body weight${progressStr}`;
  if (pct >= 15) return { emoji: '🏆', title: 'Outstanding Achievement! 🏆', sub };
  if (pct >= 10) return { emoji: '💪', title: 'Excellent Progress! 💪', sub };
  return { emoji: '🌟', title: 'Great Work! Keep Going! 🌟', sub };
}

// ── Main: generate filled HTML ──
function generateFilledHtml(rawText, patientName, templateHtml) {
  const { letter, measText } = splitInput(rawText);
  const measurements = parseMeasurements(measText);
  const stats = extractStats(letter, measurements);
  const sections = parseLetterSections(letter);
  const hero = buildHero(stats);

  const preamble = sections.preamble.filter(l => l.trim()).join(' ');
  const achievementText = preamble || `Today's visit summary for ${patientName}.`;

  const smartNutrition = renderGoalItems(sections.nutrition_smart || [])
    || "<div class='goal-item'><span class='goal-icon'>ℹ️</span><div>See your provider for nutrition goals.</div></div>";
  const smartExercise = renderGoalItems(sections.exercise_smart || [])
    || "<div class='goal-item'><span class='goal-icon'>ℹ️</span><div>See your provider for exercise goals.</div></div>";
  const medication = renderMedItems(sections.medication || [])
    || "<div class='med-item'><span class='med-icon'>💊</span><div>No medication updates.</div></div>";
  const fitteTable = renderFitteTable(sections.fitte || [])
    || "<table class='fitte-table'><tbody><tr><td>See provider for FITTE prescription.</td></tr></tbody></table>";
  const nutritionGuide = renderNutrList(sections.nutrition_guide || [])
    || "<ul class='nutr-list'><li>Follow your personalized nutrition plan.</li></ul>";
  const nextSteps = renderNextSteps(sections.next_steps || [])
    || "<div class='step-item'><span class='step-num'>1</span><div>Follow up as directed.</div></div>";

  let visitDate;
  if (measurements.length) {
    const raw = measurements[measurements.length - 1].date;
    const parts = raw.split('/');
    visitDate = parts.length === 3 ? `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2]}` : raw;
  } else {
    const d = new Date();
    visitDate = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
  }

  const svg = buildSvgChart(measurements, stats.goal_weight);
  const table = buildMeasurementsTable(measurements);
  const measNote = buildMeasurementsNote(stats);

  const replacements = {
    '{{PATIENT_NAME}}': patientName,
    '{{HERO_EMOJI}}': hero.emoji,
    '{{HERO_TITLE}}': hero.title,
    '{{HERO_SUB}}': hero.sub,
    '{{START_WEIGHT}}': stats.start_weight || '—',
    '{{CURRENT_WEIGHT}}': stats.current_weight || '—',
    '{{LBS_LOST}}': stats.lbs_lost || '—',
    '{{PCT_LOST}}': stats.pct_lost || '—',
    '{{GOAL_WEIGHT}}': stats.goal_weight || '—',
    '{{VISIT_DATE}}': visitDate,
    '{{ACHIEVEMENT_TEXT}}': achievementText,
    '{{WEIGHT_CHART_SVG}}': svg,
    '{{MEASUREMENTS_TABLE}}': table,
    '{{MEASUREMENTS_NOTE}}': measNote,
    '{{SMART_NUTRITION}}': smartNutrition,
    '{{SMART_EXERCISE}}': smartExercise,
    '{{MEDICATION}}': medication,
    '{{FITTE_TABLE}}': fitteTable,
    '{{NUTRITION_GUIDELINES}}': nutritionGuide,
    '{{NEXT_STEPS}}': nextSteps,
    '{{QR_API_URL}}': QR_API_URL,
  };

  let result = templateHtml;
  for (const [k, v] of Object.entries(replacements)) {
    result = result.split(k).join(v);
  }
  return result;
}

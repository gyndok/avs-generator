const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  esc, parseMeasurements, splitInput, extractStats,
  renderFitteTable, renderNutrList, buildSvgChart,
  buildMeasurementsNote, buildHero, generateFilledHtml,
} = require('../generator.js');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'avs_template.html'), 'utf8');

const SAMPLE_MEAS = [
  'Date: 8/19/2025 | Weight: 237.1 lbs | Waist: 40 in | Neck: 16 in | Hip: 49 in | BMI: 36.85',
  'Date: 9/16/2025 | Weight: 228.5 lbs | Waist: 37.5 in | Neck: 15 in | Hip: 47.5 in | BMI: 35.51',
].join('\n');

const SAMPLE_LETTER = [
  'Dear Jane, you started at 237.1 pounds and today you are 228.5 pounds.',
  'You have lost 8.6 pounds, which is 3.6% of your starting weight. Your goal weight is 180 pounds.',
  '',
  'SMART Goal - Nutrition',
  'Specific: Eat 100g of protein daily for the next 4 weeks.',
  '',
  'Medication',
  'Continue Zepbound 5 mg weekly.',
  'Call if you have severe abdominal pain.',
  '',
  'Next Steps',
  'Recheck labs at your next appointment.',
].join('\n');

test('parseMeasurements strips units and keeps row order', () => {
  const rows = parseMeasurements(SAMPLE_MEAS);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].weight, '237.1');
  assert.equal(rows[1].waist, '37.5');
  assert.equal(rows[1].bmi, '35.51');
});

test('splitInput keeps prose "Date:" lines in the letter', () => {
  const { letter, measText } = splitInput('Date: your next visit is soon.\n' + SAMPLE_MEAS);
  assert.match(letter, /your next visit/);
  assert.equal(parseMeasurements(measText).length, 2);
});

test('extractStats falls back to measurements and computes loss', () => {
  const stats = extractStats('', parseMeasurements(SAMPLE_MEAS));
  assert.equal(stats.start_weight, '237.1');
  assert.equal(stats.current_weight, '228.5');
  assert.equal(stats.lbs_lost, '8.6');
  assert.equal(stats.pct_lost, '3.6');
});

test('measurements note shows a minus for decreases and a plus for gains', () => {
  const down = buildMeasurementsNote({ start_waist: '40', current_waist: '37.5', start_hip: '49', current_hip: '47.5' });
  assert.match(down, /Waist:<\/strong> 40" → 37\.5" \(−2\.50"\)/);
  assert.match(down, /Hips:<\/strong> 49" → 47\.5" \(−1\.50"\)/);
  const up = buildMeasurementsNote({ start_waist: '37', current_waist: '39', start_hip: '', current_hip: '' });
  assert.match(up, /\(\+2\.00"\)/);
});

test('measurements note escapes HTML in measurement-derived values', () => {
  const note = buildMeasurementsNote({ start_waist: '40 <img src=x>', current_waist: '38', start_hip: '', current_hip: '' });
  assert.ok(!note.includes('<img'), 'raw markup must not pass through');
  assert.match(note, /&lt;img/);
});

test('empty FITTE/nutrition renderers return empty string so fallbacks fire', () => {
  assert.equal(renderFitteTable([]), '');
  assert.equal(renderNutrList([]), '');
  const html = generateFilledHtml('Hello.\n' + SAMPLE_MEAS, 'Jane', TEMPLATE);
  assert.match(html, /See provider for FITTE prescription/);
  assert.match(html, /Follow your personalized nutrition plan/);
});

test('chart starts at the letter starting weight when it predates the first weigh-in', () => {
  const rows = parseMeasurements(SAMPLE_MEAS);
  const svg = buildSvgChart(rows, '180', '245');
  assert.match(svg, />Start</, 'has a Start x-axis label');
  assert.match(svg, />245</, 'plots the starting weight value');
  // Same start as first weigh-in → no duplicate Start point.
  assert.ok(!buildSvgChart(rows, '180', '237.1').includes('>Start<'));
  // No starting weight known → unchanged.
  assert.ok(!buildSvgChart(rows, '180', '').includes('>Start<'));
});

test('chart omits the goal line when no goal weight is known', () => {
  const rows = parseMeasurements(SAMPLE_MEAS);
  assert.ok(!buildSvgChart(rows, '').includes('>Goal<'));
  assert.ok(buildSvgChart(rows, '180').includes('>Goal<'));
});

test('hero switches to supportive messaging on net gain', () => {
  const hero = buildHero({ lbs_lost: '-3.0', pct_lost: '-1.5', start_weight: '200', current_weight: '203', goal_weight: '' });
  assert.match(hero.title, /Support/);
  assert.match(hero.sub, /\+3\.0 lbs/);
});

test('generateFilledHtml fills every placeholder and embeds the QR inline', () => {
  const html = generateFilledHtml(SAMPLE_LETTER + '\n\n' + SAMPLE_MEAS, 'Jane Doe', TEMPLATE);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), 'no unreplaced {{PLACEHOLDER}} tokens');
  assert.match(html, /data:image\/png;base64,/);
  assert.ok(!html.includes('api.qrserver.com'), 'no remote QR fetch');
  assert.match(html, /- - Goal \(180 lbs\)/);
  assert.match(html, /Continue Zepbound 5 mg weekly/);
  assert.match(html, /⚠️ Call if you have severe abdominal pain/);
});

test('generateFilledHtml escapes hostile letter text', () => {
  const html = generateFilledHtml('<script>alert(1)</script>\n' + SAMPLE_MEAS, 'Jane', TEMPLATE);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

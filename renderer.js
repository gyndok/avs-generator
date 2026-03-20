// ── Renderer: UI event handling ──

const TEMPLATE_HTML = `TEMPLATE_PLACEHOLDER`;

// Load the template via fetch (it's bundled as a file)
let templateCache = null;
async function getTemplate() {
  if (templateCache) return templateCache;
  const resp = await fetch('avs_template.html');
  templateCache = await resp.text();
  return templateCache;
}

const btnGenerate = document.getElementById('btnGenerate');
const btnPrint = document.getElementById('btnPrint');
const btnOpen = document.getElementById('btnOpen');
const statusEl = document.getElementById('status');

let lastPdfPath = null;

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type ? `status-${type}` : '';
}

btnGenerate.addEventListener('click', async () => {
  const rawText = document.getElementById('rawText').value.trim();
  if (!rawText) {
    setStatus('Please paste the patient letter and measurements.', 'error');
    return;
  }

  const patientName = document.getElementById('patientName').value.trim() || 'Patient';

  btnGenerate.disabled = true;
  setStatus('Generating PDF...', 'working');

  try {
    const template = await getTemplate();
    const filledHtml = generateFilledHtml(rawText, patientName, template);
    const result = await window.api.generatePdf(filledHtml, patientName);

    if (result.success) {
      lastPdfPath = result.path;
      const sizeKb = (result.size / 1024).toFixed(1);
      setStatus(`PDF saved: ${result.path} (${sizeKb} KB)`, 'success');
      btnPrint.disabled = false;
      btnOpen.disabled = false;
    } else {
      setStatus('PDF generation cancelled.', 'error');
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    btnGenerate.disabled = false;
  }
});

btnOpen.addEventListener('click', () => {
  if (lastPdfPath) window.api.openFile(lastPdfPath);
});

btnPrint.addEventListener('click', async () => {
  if (!lastPdfPath) return;
  setStatus('Printing...', 'working');
  const result = await window.api.printPdf(lastPdfPath);
  if (result.success) {
    setStatus('Sent to printer!', 'success');
  } else {
    setStatus(`Print error: ${result.error}`, 'error');
  }
});

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let printWindow;

const DEFAULT_LP_PRINTER = 'HP_Color_LaserJet_Pro_M453_4';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 750,
    title: 'AVS Generator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

function closePrintWindow() {
  if (printWindow && !printWindow.isDestroyed()) {
    printWindow.close();
  }
  printWindow = null;
}

// Generate PDF from filled HTML
ipcMain.handle('generate-pdf', async (_event, filledHtml, patientName) => {
  closePrintWindow();

  printWindow = new BrowserWindow({
    width: 816, // 8.5in at 96dpi
    height: 1056, // 11in at 96dpi
    show: false,
    webPreferences: { contextIsolation: true },
  });

  const tmpPath = path.join(app.getPath('temp'), 'avs_preview.html');
  let pdfBuffer;

  try {
    fs.writeFileSync(tmpPath, filledHtml, 'utf-8');
    await printWindow.loadFile(tmpPath);
    await new Promise(r => setTimeout(r, 1500));
    pdfBuffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    closePrintWindow();
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = (patientName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
  const defaultName = `AVS_${safeName}_${timestamp}.pdf`;

  const outputDir = path.join(app.getPath('home'), 'clawd', 'output', 'avs');
  fs.mkdirSync(outputDir, { recursive: true });

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save AVS PDF',
    defaultPath: path.join(outputDir, defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (!filePath) return { success: false, reason: 'cancelled' };

  try {
    fs.writeFileSync(filePath, pdfBuffer);
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }

  return { success: true, path: filePath, size: pdfBuffer.length };
});

ipcMain.handle('open-file', async (_event, filePath) => {
  const err = await shell.openPath(filePath);
  return err || null;
});

ipcMain.handle('print-pdf', async (_event, filePath) => {
  try {
    execFileSync('lp', ['-d', DEFAULT_LP_PRINTER, filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

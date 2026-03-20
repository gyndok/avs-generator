const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let printWindow;

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

// Generate PDF from filled HTML
ipcMain.handle('generate-pdf', async (_event, filledHtml, patientName) => {
  // Create a hidden window to render the AVS HTML
  printWindow = new BrowserWindow({
    width: 816,  // 8.5in at 96dpi
    height: 1056, // 11in at 96dpi
    show: false,
    webPreferences: { contextIsolation: true },
  });

  // Write filled HTML to a temp file so CSS/fonts load properly
  const tmpPath = path.join(app.getPath('temp'), 'avs_preview.html');
  fs.writeFileSync(tmpPath, filledHtml, 'utf-8');
  await printWindow.loadFile(tmpPath);

  // Wait for fonts/images to load
  await new Promise(r => setTimeout(r, 1500));

  const pdfBuffer = await printWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  printWindow.close();
  printWindow = null;

  // Ask user where to save
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

  fs.writeFileSync(filePath, pdfBuffer);
  return { success: true, path: filePath, size: pdfBuffer.length };
});

// Open PDF after save
ipcMain.handle('open-file', async (_event, filePath) => {
  shell.openPath(filePath);
});

// Print PDF
ipcMain.handle('print-pdf', async (_event, filePath) => {
  const { execSync } = require('child_process');
  try {
    execSync(`lp -d HP_Color_LaserJet_Pro_M453_4 "${filePath}"`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

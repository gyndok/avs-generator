const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  generatePdf: (html, patientName) => ipcRenderer.invoke('generate-pdf', html, patientName),
  openFile: (path) => ipcRenderer.invoke('open-file', path),
  printPdf: (path) => ipcRenderer.invoke('print-pdf', path),
});

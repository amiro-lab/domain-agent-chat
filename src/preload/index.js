const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bridge', {
  onStatus: (cb) => ipcRenderer.on('status', (_, msg) => cb(msg)),
  openChrome: () => ipcRenderer.send('open-chrome'),
  quitChrome: () => ipcRenderer.send('quit-chrome'),
})

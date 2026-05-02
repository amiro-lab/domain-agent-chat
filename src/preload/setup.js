const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('setup', {
  fetchTeams: (url) => ipcRenderer.invoke('setup:fetch-teams', url),
  joinTeam: (data) => ipcRenderer.invoke('setup:join-team', data),
  saveConfig: (cfg) => ipcRenderer.invoke('setup:save-config', cfg),
  finishSetup: () => ipcRenderer.send('setup:finish'),
})

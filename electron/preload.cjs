const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('suiji', {
  read: () => ipcRenderer.invoke('notes:read'),
  mutate: command => ipcRenderer.invoke('notes:mutate', command),
  info: () => ipcRenderer.invoke('app:info'),
  openData: () => ipcRenderer.invoke('app:open-data'),
  copy: text => ipcRenderer.invoke('app:copy', text),
  openLink: url => ipcRenderer.invoke('app:open-link', url),
  export: data => ipcRenderer.invoke('app:export', data)
});

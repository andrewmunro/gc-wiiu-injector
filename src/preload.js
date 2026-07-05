const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStatus: () => ipcRenderer.invoke('status:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  downloadTools: () => ipcRenderer.invoke('tools:download'),
  downloadBase: (opts) => ipcRenderer.invoke('base:download', opts),
  importBase: (opts) => ipcRenderer.invoke('base:import', opts),
  pickFile: (title, filters) => ipcRenderer.invoke('dialog:pickFile', { title, filters }),
  pickDir: (title) => ipcRenderer.invoke('dialog:pickDir', { title }),
  inject: (options) => ipcRenderer.invoke('inject:run', options),
  batch: (options) => ipcRenderer.invoke('batch:run', options),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  saveNincfg: (opts) => ipcRenderer.invoke('nincfg:save', opts),
  onLog: (cb) => ipcRenderer.on('log', (_e, d) => cb(d.line)),
  onToolsProgress: (cb) => ipcRenderer.on('tools:progress', (_e, d) => cb(d)),
  onBaseProgress: (cb) => ipcRenderer.on('base:progress', (_e, d) => cb(d)),
  onInjectProgress: (cb) => ipcRenderer.on('inject:progress', (_e, d) => cb(d)),
});

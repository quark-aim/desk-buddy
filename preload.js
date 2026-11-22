const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('buddy', {
  getState: () => ipcRenderer.invoke('state:get'),
  setState: (d) => ipcRenderer.send('state:set', d),
  move: (dir) => ipcRenderer.send('move', dir),
  media: (k) => ipcRenderer.send('media', k),
  openSpotify: () => ipcRenderer.send('open-spotify'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  voiceListen: () => ipcRenderer.send('voice-listen'),
  onVoice: (cb) => ipcRenderer.on('voice-result', (_, d) => cb(d)),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  focusWindow: () => ipcRenderer.send('focus-window'),
  onForeground: (cb) => ipcRenderer.on('foreground', (_, d) => cb(d)),
  onSpotify: (cb) => ipcRenderer.on('spotify', (_, t) => cb(t)),
  onOpenCommand: (cb) => ipcRenderer.on('open-command', () => cb()),
});

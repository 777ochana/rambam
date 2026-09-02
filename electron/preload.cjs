const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hayad', {
  stats: () => ipcRenderer.invoke('library:stats'),
  search: (q, category = 'all', limit = 80) => ipcRenderer.invoke('library:search', { q, category, limit }),
  context: (id, source = 'built-in', radius = 6) => ipcRenderer.invoke('library:context', { id, source, radius }),
  books: (category = 'all') => ipcRenderer.invoke('library:books', { category }),
  chat: (q, category = 'all', useAI = false) => ipcRenderer.invoke('library:chat', { q, category, useAI }),
  importSource: () => ipcRenderer.invoke('library:import'),
  pickMaster: () => ipcRenderer.invoke('master:pick'),
  saveDraft: t => ipcRenderer.invoke('draft:save', { text: t }),
  loadDraft: () => ipcRenderer.invoke('draft:load'),
  getAI: () => ipcRenderer.invoke('ai:get-settings'),
  saveAI: x => ipcRenderer.invoke('ai:save-settings', x),
  testAI: x => ipcRenderer.invoke('ai:test', x),
  deleteAI: () => ipcRenderer.invoke('ai:delete-key'),
  version: () => ipcRenderer.invoke('app:version')
});

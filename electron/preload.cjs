const { contextBridge, ipcRenderer } = require('electron');

// The backup folder on Windows: the same calls as the Android BackupFolder plugin, so src/backup.js works unchanged.
// Errors come back as the plain message ("No folder chosen"), as the plugin's do.
const call = method => arg => ipcRenderer.invoke(`backup:${method}`, arg)
  .catch(e => { throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); });
contextBridge.exposeInMainWorld('inkmapBackupFolder',
  Object.fromEntries(['pick', 'current', 'write', 'read', 'exists', 'remove', 'rename'].map(m => [m, call(m)])));

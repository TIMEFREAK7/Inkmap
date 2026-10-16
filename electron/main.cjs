const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const DEV_URL = process.env.INKMAP_DEV_URL; // e.g. http://localhost:5173 while developing

// The backup folder the person picked (remembered in the app's own settings folder).
const config = () => path.join(app.getPath('userData'), 'backup-folder.json');
async function folder() {
  try {
    const f = JSON.parse(await fs.readFile(config(), 'utf8')).folder;
    await fs.access(f);
    return f;
  } catch { return null; } // never picked, or the folder is gone (a USB drive unplugged)
}
// Only a plain file name, always inside the picked folder: the page can't reach anywhere else on the disk.
async function file(name) {
  const f = await folder();
  if (!f) throw new Error('No backup folder chosen');
  return path.join(f, path.basename(String(name)));
}
const describe = f => (f ? { uri: f, name: f } : {});

function backupFolder(win) {
  const handlers = {
    pick: async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for your Inkmap backup', defaultPath: app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) throw new Error('No folder chosen');
      await fs.writeFile(config(), JSON.stringify({ folder: r.filePaths[0] }));
      return describe(r.filePaths[0]);
    },
    current: async () => describe(await folder()),
    write: async ({ name, data, base64 }) => { await fs.writeFile(await file(name), base64 ? Buffer.from(data, 'base64') : data); },
    read: async ({ name, base64 }) => ({ data: (await fs.readFile(await file(name))).toString(base64 ? 'base64' : 'utf8') }),
    exists: async ({ name }) => ({ exists: await fs.access(await file(name)).then(() => true, () => false) }),
    remove: async ({ name }) => { await fs.rm(await file(name), { force: true }); },
    rename: async ({ from, to }) => { await fs.rename(await file(from), await file(to)); },
  };
  for (const [method, run] of Object.entries(handlers)) {
    ipcMain.handle(`backup:${method}`, (e, arg) => {
      if (e.sender !== win.webContents) throw new Error('Not allowed');
      return run(arg ?? {});
    });
  }
}

app.whenReady().then(() => {
  // Fully offline: refuse every network request except the local dev server.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) =>
    cb({ cancel: !(DEV_URL && d.url.startsWith(DEV_URL)) }));

  const win = new BrowserWindow({
    width: 1200, height: 800, backgroundColor: '#0b1026', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  backupFolder(win);
  // Stay on the app's own page: no navigating away and no new windows, whatever a link or script asks for.
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.on('window-all-closed', () => app.quit());

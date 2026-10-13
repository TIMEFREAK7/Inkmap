const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');

const DEV_URL = process.env.INKMAP_DEV_URL; // e.g. http://localhost:5173 while developing

app.whenReady().then(() => {
  // Fully offline: refuse every network request except the local dev server.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) =>
    cb({ cancel: !(DEV_URL && d.url.startsWith(DEV_URL)) }));

  const win = new BrowserWindow({
    width: 1200, height: 800, backgroundColor: '#0b1026', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.on('window-all-closed', () => app.quit());

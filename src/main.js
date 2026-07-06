const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { paths, ensureDirs } = require('./paths');
const settings = require('./settings');
const { ensureTools, missingTools } = require('./tools');
const { downloadTitle } = require('./nus');
const { decryptBase, looksDecrypted } = require('./cdecrypt');
const { inject } = require('./inject');

let win;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function listBases() {
  ensureDirs();
  return fs
    .readdirSync(paths.bases, { withFileTypes: true })
    .filter((d) => d.isDirectory() && looksDecrypted(path.join(paths.bases, d.name)))
    .map((d) => ({ name: d.name, dir: path.join(paths.bases, d.name) }));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#14161b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ensureDirs();
  createWindow();
});
app.on('window-all-closed', () => app.quit());

function createBatchedLog(channel, intervalMs = 150) {
  let buf = [], timer = null;
  return (line) => {
    buf.push(line);
    if (!timer) {
      timer = setTimeout(() => {
        if (buf.length) send(channel, { line: buf.join('\n') });
        buf = [];
        timer = null;
      }, intervalMs);
    }
  };
}
const logTo = (channel) => createBatchedLog(channel);

ipcMain.handle('status:get', () => ({
  missingTools: missingTools(),
  settings: settings.load(),
  bases: listBases(),
  dataRoot: paths.dataRoot,
}));

ipcMain.handle('settings:save', (_e, s) => {
  if (s.commonKey && !settings.validCommonKey(s.commonKey)) {
    throw new Error('Common key must be 32 hex characters.');
  }
  if (s.commonKey) s.commonKey = s.commonKey.trim().toLowerCase();
  return settings.save(s);
});

ipcMain.handle('tools:download', async () => {
  await ensureTools({
    onProgress: (frac, name) => send('tools:progress', { frac, name }),
    log: logTo('log'),
  });
  return { missingTools: missingTools() };
});

ipcMain.handle('base:download', async (_e, { tid, key, name, region }) => {
  const nusDir = path.join(paths.temp, 'nus', tid.toLowerCase());
  await downloadTitle(tid, key, nusDir, {
    onProgress: (frac) => send('base:progress', { frac, phase: 'download' }),
    log: logTo('log'),
  });
  send('base:progress', { frac: 1, phase: 'decrypt' });
  const label = `${(name || tid).replace(/:/g, '')}${region ? ` [${region}]` : ''}`;
  const out = path.join(paths.bases, label);
  await decryptBase(nusDir, out, settings.load().commonKey, logTo('log'));
  fs.rmSync(nusDir, { recursive: true, force: true });
  return { bases: listBases() };
});

ipcMain.handle('base:import', async (_e, { dir, name }) => {
  if (looksDecrypted(dir)) {
    // Already-decrypted dump (e.g. from Dumpling): copy it in.
    const out = path.join(paths.bases, name || path.basename(dir));
    fs.cpSync(dir, out, { recursive: true });
    return { bases: listBases() };
  }
  if (fs.existsSync(path.join(dir, 'title.tmd'))) {
    const out = path.join(paths.bases, name || path.basename(dir));
    await decryptBase(dir, out, settings.load().commonKey, logTo('log'));
    return { bases: listBases() };
  }
  throw new Error(
    'This folder is neither a decrypted title (code/content/meta) nor a NUS download (title.tmd + .app files).'
  );
});

ipcMain.handle('dialog:pickFile', async (_e, { title, filters }) => {
  const r = await dialog.showOpenDialog(win, { title, filters, properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:pickDir', async (_e, { title }) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

let injecting = false;
ipcMain.handle('inject:run', async (_e, options) => {
  if (injecting) throw new Error('An injection is already running.');
  injecting = true;
  try {
    const s = settings.load();
    const res = await inject(
      { ...options, outDir: options.outDir || s.outDir, commonKey: s.commonKey },
      {
        onProgress: (pct, msg) => send('inject:progress', { pct, msg }),
        log: logTo('log'),
      }
    );
    return res;
  } finally {
    injecting = false;
  }
});

ipcMain.handle('batch:run', async (_e, options) => {
  if (injecting) throw new Error('An injection is already running.');
  if (!options.gamePath && !options.dir) {
    const r = await dialog.showOpenDialog(win, { title: 'Select folder of games', properties: ['openDirectory'] });
    options.dir = r.filePaths?.[0];
    if (!options.dir) return { canceled: true };
  }
  injecting = true;
  try {
    const { batchInject } = require('./batch');
    const s = settings.load();
    const results = await batchInject(
      { ...options, outDir: options.outDir || s.outDir, commonKey: s.commonKey },
      {
        onProgress: ({ index, total, pct, msg, name }) => send('batch:progress', { index, total, pct, msg, name }),
        log: ({ index, line }) => send('batch:log', { index, line }),
      }
    );
    return { results };
  } finally {
    injecting = false;
  }
});

ipcMain.handle('nincfg:save', async (_e, { preset, forceVideo } = {}) => {
  const { buildNincfg } = require('./nincfg');
  const r = await dialog.showOpenDialog(win, {
    title: 'Select your SD card root (nincfg.bin will be written there)',
    properties: ['openDirectory'],
  });
  if (r.canceled) return { saved: false };
  const dest = path.join(r.filePaths[0], 'nincfg.bin');
  fs.writeFileSync(dest, buildNincfg({ preset: preset || 'recommended', forceVideo: forceVideo || null }));
  return { saved: true, dest };
});

ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p || paths.output));

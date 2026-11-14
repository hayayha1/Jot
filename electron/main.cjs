const { app, BrowserWindow, ipcMain, shell, dialog, Menu, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

app.setName('随记');
app.setAppUserModelId('app.suiji.notes');
let win;
let store;
let closing = false;
let closeInProgress = false;
const devUrl = process.env.SUIJI_DEV_URL;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    const { FileStore } = await import('../shared/store.mjs');
    store = new FileStore();
    try { await store.read(); }
    catch (error) { dialog.showErrorBox('无法打开笔记', error.message); app.quit(); return; }
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1240, height: 850, minWidth: 760, minHeight: 560,
      title: '随记', backgroundColor: '#fbfcfa', show: false,
      autoHideMenuBar: true, icon: path.join(__dirname, '../assets/icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    });
    const isTrusted = (event) => {
      const url = event.senderFrame?.url;
      return event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && (devUrl ? url?.startsWith(`${devUrl}/`) : url === pathToFileURL(path.join(__dirname, '../dist/index.html')).href);
    };
    function handle(channel, fn) {
      ipcMain.handle(channel, async (event, ...args) => {
        if (!isTrusted(event)) throw new Error('不受信任的窗口');
        return fn(...args);
      });
    }
    handle('notes:read', () => store.read());
    handle('notes:mutate', command => store.mutate(command));
    handle('app:info', () => ({
      dataDir: store.dir, version: app.getVersion(), desktop: true,
      mcpConfig: { mcpServers: { suiji: { command: process.execPath, args: [path.join(app.getAppPath(), app.isPackaged ? 'mcp/server.cjs' : 'mcp/server.mjs')], env: { ELECTRON_RUN_AS_NODE: '1', SUIJI_DATA_DIR: store.dir } } } }
    }));
    handle('app:open-data', () => shell.openPath(store.dir));
    handle('app:copy', text => { if (typeof text !== 'string') throw new Error('内容格式错误'); clipboard.writeText(text); });
    handle('app:open-link', async raw => {
      const url = new URL(raw);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('只支持网页或邮件链接');
      await shell.openExternal(url.href);
    });
    handle('app:export', async ({ title, content }) => {
      if (typeof content !== 'string' || typeof title !== 'string') throw new Error('导出内容格式错误');
      const result = await dialog.showSaveDialog(win, { title: '导出笔记', defaultPath: `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)}.html`, filters: [{ name: 'HTML 笔记（包含图片）', extensions: ['html'] }] });
      if (result.canceled) return false;
      await fs.writeFile(result.filePath, content, 'utf8');
      return true;
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    win.once('ready-to-show', () => win.show());
    win.on('close', async event => {
      if (closing) return;
      event.preventDefault();
      if (closeInProgress) return;
      closeInProgress = true;
      try {
        await win.webContents.executeJavaScript('window.suijiFlush ? window.suijiFlush() : Promise.resolve()');
        await store.queue;
        closing = true;
        win.destroy();
      } catch (error) { closeInProgress = false; dialog.showErrorBox('保存未完成', `窗口已保留，请重试。${error.message}`); }
    });
    if (devUrl) await win.loadURL(devUrl);
    else await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }).catch(error => { dialog.showErrorBox('随记启动失败', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}

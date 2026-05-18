const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

ipcMain.handle('send-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.on('minimize-window', () => mainWindow.minimize());
ipcMain.on('close-window', () => mainWindow.close());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

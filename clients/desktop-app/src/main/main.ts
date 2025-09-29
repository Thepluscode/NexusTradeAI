//clients/desktop-app/src/main/main.ts
import { app, BrowserWindow, Menu, ipcMain, dialog, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import windowStateKeeper from 'electron-window-state';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import path from 'path';

// Initialize store
const store = new Store();

class DesktopApp {
  private mainWindow: BrowserWindow | null = null;
  private tradingWindows: Map<string, BrowserWindow> = new Map();

  constructor() {
    this.setupApp();
    this.setupAutoUpdater();
    this.setupIpcHandlers();
  }

  private setupApp() {
    // App event handlers
    app.whenReady().then(() => {
      electronApp.setAppUserModelId('com.nexustrade.desktop');
      
      this.createMainWindow();
      this.createMenu();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      this.saveWindowStates();
    });
  }

  private createMainWindow() {
    // Restore window state
    const mainWindowState = windowStateKeeper({
      defaultWidth: 1400,
      defaultHeight: 900
    });

    this.mainWindow = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minWidth: 1200,
      minHeight: 800,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      }
    });

    // Let windowStateKeeper manage the window
    mainWindowState.manage(this.mainWindow);

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
      
      if (is.dev) {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    // Load the app
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
  }

  private createMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Trading Window',
            accelerator: 'CmdOrCtrl+N',
            click: () => this.createTradingWindow()
          },
          { type: 'separator' },
          {
            label: 'Import Portfolio',
            click: () => this.importPortfolio()
          },
          {
            label: 'Export Data',
            click: () => this.exportData()
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => app.quit()
          }
        ]
      },
      {
        label: 'Trading',
        submenu: [
          {
            label: 'Quick Buy',
            accelerator: 'CmdOrCtrl+B',
            click: () => this.quickOrder('buy')
          },
          {
            label: 'Quick Sell',
            accelerator: 'CmdOrCtrl+S',
            click: () => this.quickOrder('sell')
          },
          { type: 'separator' },
          {
            label: 'Cancel All Orders',
            click: () => this.cancelAllOrders()
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' },
          { type: 'separator' },
          {
            label: 'Always on Top',
            type: 'checkbox',
            click: (menuItem) => {
              this.mainWindow?.setAlwaysOnTop(menuItem.checked);
            }
          }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About Nexus Trade AI',
            click: () => this.showAbout()
          },
          {
            label: 'Documentation',
            click: () => shell.openExternal('https://docs.nexustrade.ai')
          },
          {
            label: 'Check for Updates',
            click: () => autoUpdater.checkForUpdatesAndNotify()
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template as any);
    Menu.setApplicationMenu(menu);
  }

  private createTradingWindow(symbol?: string) {
    const tradingWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      parent: this.mainWindow || undefined,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const windowId = Date.now().toString();
    this.tradingWindows.set(windowId, tradingWindow);

    tradingWindow.on('closed', () => {
      this.tradingWindows.delete(windowId);
    });

    const url = is.dev 
      ? `${process.env['ELECTRON_RENDERER_URL']}/trading${symbol ? `?symbol=${symbol}` : ''}`
      : `file://${path.join(__dirname, '../renderer/trading.html')}${symbol ? `?symbol=${symbol}` : ''}`;

    tradingWindow.loadURL(url);
  }

  private setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: 'A new version is available. Would you like to download it?',
        buttons: ['Download', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. The application will restart to apply the update.',
        buttons: ['Restart Now', 'Later']
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });
  }

  private setupIpcHandlers() {
    // Window management
    ipcMain.handle('create-trading-window', (_, symbol) => {
      this.createTradingWindow(symbol);
    });

    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    // Store operations
    ipcMain.handle('store-get', (_, key) => {
      return store.get(key);
    });

    ipcMain.handle('store-set', (_, key, value) => {
      store.set(key, value);
    });

    ipcMain.handle('store-delete', (_, key) => {
      store.delete(key);
    });

    // Trading operations
    ipcMain.handle('quick-order', (_, type, symbol, quantity) => {
      return this.executeQuickOrder(type, symbol, quantity);
    });

    // File operations
    ipcMain.handle('show-save-dialog', async () => {
      const result = await dialog.showSaveDialog(this.mainWindow!, {
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      return result;
    });

    ipcMain.handle('show-open-dialog', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openFile'],
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      return result;
    });
  }

  private async executeQuickOrder(type: 'buy' | 'sell', symbol: string, quantity: number) {
    // Implementation for quick order execution
    try {
      // Send to main window for processing
      this.mainWindow?.webContents.send('quick-order-request', { type, symbol, quantity });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private quickOrder(type: 'buy' | 'sell') {
    this.mainWindow?.webContents.send('show-quick-order', type);
  }

  private cancelAllOrders() {
    this.mainWindow?.webContents.send('cancel-all-orders');
  }

  private async importPortfolio() {
    const result = await dialog.showOpenDialog(this.mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'JSON Files', extensions: ['json'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      this.mainWindow?.webContents.send('import-portfolio', result.filePaths[0]);
    }
  }

  private async exportData() {
    const result = await dialog.showSaveDialog(this.mainWindow!, {
      defaultPath: `nexus-trade-export-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'JSON Files', extensions: ['json'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      this.mainWindow?.webContents.send('export-data', result.filePath);
    }
  }

  private showAbout() {
    dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: 'About Nexus Trade AI',
      message: 'Nexus Trade AI Desktop',
      detail: `Version: ${app.getVersion()}\nAI-Powered Trading Platform\n© 2024 Nexus Trade AI`
    });
  }

  private saveWindowStates() {
    // Save any custom window states if needed
    store.set('app.lastClosed', Date.now());
  }
}

// Initialize the app
new DesktopApp();
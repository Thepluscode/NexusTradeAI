import { Menu, MenuItemConstructorOptions, BrowserWindow, app, shell } from 'electron';
import * as isDev from 'electron-is-dev';

export function createMenu(mainWindow: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // App Menu (macOS)
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Preferences...',
          accelerator: 'Cmd+,',
          click: () => {
            mainWindow.webContents.send('open-preferences');
          }
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Order',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-order');
          }
        },
        {
          label: 'Import Portfolio',
          click: () => {
            mainWindow.webContents.send('import-portfolio');
          }
        },
        {
          label: 'Export Data',
          submenu: [
            {
              label: 'Export Trades',
              click: () => {
                mainWindow.webContents.send('export-trades');
              }
            },
            {
              label: 'Export Portfolio',
              click: () => {
                mainWindow.webContents.send('export-portfolio');
              }
            }
          ]
        },
        { type: 'separator' },
        ...(isMac ? [] : [
          {
            label: 'Preferences',
            accelerator: 'Ctrl+,',
            click: () => {
              mainWindow.webContents.send('open-preferences');
            }
          },
          { type: 'separator' as const }
        ]),
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
          { type: 'separator' as const },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' as const },
              { role: 'stopSpeaking' as const }
            ]
          }
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },

    // Trading Menu
    {
      label: 'Trading',
      submenu: [
        {
          label: 'Quick Buy',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('quick-buy');
          }
        },
        {
          label: 'Quick Sell',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('quick-sell');
          }
        },
        { type: 'separator' },
        {
          label: 'Cancel All Orders',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            mainWindow.webContents.send('cancel-all-orders');
          }
        },
        {
          label: 'Close All Positions',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => {
            mainWindow.webContents.send('close-all-positions');
          }
        },
        { type: 'separator' },
        {
          label: 'Trading Hotkeys',
          click: () => {
            mainWindow.webContents.send('show-hotkeys');
          }
        }
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow.webContents.send('navigate-to', 'dashboard');
          }
        },
        {
          label: 'Trading',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow.webContents.send('navigate-to', 'trading');
          }
        },
        {
          label: 'Portfolio',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            mainWindow.webContents.send('navigate-to', 'portfolio');
          }
        },
        {
          label: 'Markets',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            mainWindow.webContents.send('navigate-to', 'markets');
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [])
      ]
    },

    // Help Menu
    {
      role: 'help',
      submenu: [
        {
          label: 'About NexusTrade',
          click: () => {
            mainWindow.webContents.send('show-about');
          }
        },
        {
          label: 'User Guide',
          click: async () => {
            await shell.openExternal('https://docs.nexustrade.ai');
          }
        },
        {
          label: 'API Documentation',
          click: async () => {
            await shell.openExternal('https://api.nexustrade.ai/docs');
          }
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            mainWindow.webContents.send('show-shortcuts');
          }
        },
        { type: 'separator' },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/nexustrade/issues');
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow.webContents.send('check-updates');
          }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}
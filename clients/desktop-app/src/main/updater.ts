import { autoUpdater } from 'electron-updater';
import { dialog, BrowserWindow } from 'electron';
import * as isDev from 'electron-is-dev';

// Configure auto updater
export function setupUpdater(): void {
  if (isDev) {
    // Skip auto updater in development
    return;
  }

  // Configure update server
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'nexustrade',
    repo: 'desktop-app',
    private: false,
  });

  // Auto updater events
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    sendStatusToWindow('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    sendStatusToWindow('Update available. Downloading...');

    // Show notification to user
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available and will be downloaded in the background.`,
        buttons: ['OK']
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info);
    sendStatusToWindow('App is up to date.');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
    sendStatusToWindow(`Update error: ${err.message}`);

    // Show error to user
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (mainWindow) {
      dialog.showErrorBox('Update Error', `Failed to check for updates: ${err.message}`);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage += ` - Downloaded ${progressObj.percent}%`;
    logMessage += ` (${progressObj.transferred}/${progressObj.total})`;

    console.log(logMessage);
    sendStatusToWindow(`Downloading update: ${Math.round(progressObj.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    sendStatusToWindow('Update downloaded. Will install on restart.');

    // Show install prompt
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded successfully. The application will restart to apply the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          // User chose to restart now
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  // Check for updates on startup (after 3 seconds)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);

  // Check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);
}

function sendStatusToWindow(message: string): void {
  const mainWindow = BrowserWindow.getFocusedWindow();
  if (mainWindow) {
    mainWindow.webContents.send('update-status', message);
  }
}

// Manual update check
export function checkForUpdates(): void {
  if (isDev) {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Development Mode',
        message: 'Auto-updater is disabled in development mode.',
        buttons: ['OK']
      });
    }
    return;
  }

  autoUpdater.checkForUpdatesAndNotify();
}

// Force update installation
export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
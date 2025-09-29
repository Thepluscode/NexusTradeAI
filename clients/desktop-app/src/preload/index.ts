//clients/desktop-app/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// Custom APIs for renderer
const api = {
  // Window operations
  createTradingWindow: (symbol?: string) => ipcRenderer.invoke('create-trading-window', symbol),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Store operations
  store: {
    get: (key: string) => ipcRenderer.invoke('store-get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store-delete', key)
  },

  // Trading operations
  quickOrder: (type: 'buy' | 'sell', symbol: string, quantity: number) => 
    ipcRenderer.invoke('quick-order', type, symbol, quantity),

  // File operations
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),

  // Event listeners
  on: (channel: string, callback: Function) => {
    const validChannels = [
      'quick-order-request',
      'show-quick-order',
      'cancel-all-orders',
      'import-portfolio',
      'export-data'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electronAPI = api;
}
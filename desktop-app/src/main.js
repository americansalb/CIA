/**
 * CIA Testing Platform - Electron Main Process
 *
 * Features:
 * 1. Automatic camera/microphone permissions (no browser prompts!)
 * 2. Kiosk/lockdown mode during tests
 * 3. Prevents switching to other applications
 * 4. Device fingerprinting for identity binding
 * 5. Screen recording without browser limitations
 * 6. Reliable video upload with retry
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  systemPreferences,
  powerSaveBlocker,
  globalShortcut,
  screen,
} = require('electron');
const path = require('path');
const Store = require('electron-store');

// Persistent storage for device registration
const store = new Store({
  name: 'cia-config',
  encryptionKey: 'cia-secure-key-change-in-production',
});

// Configuration
const CONFIG = {
  // Server URL - change for production
  serverUrl: process.env.CIA_SERVER_URL || 'https://your-cia-server.com',

  // Window settings
  window: {
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
  },

  // Lockdown settings
  lockdown: {
    enabled: true,
    blockKeyboardShortcuts: true,
    preventWindowClose: true,
    disableDevTools: true,
    kioskMode: false, // Set true for full kiosk
  },
};

// Global state
let mainWindow = null;
let isInTest = false;
let powerSaveBlockerId = null;

/**
 * Create the main application window
 */
function createWindow() {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: CONFIG.window.width,
    height: CONFIG.window.height,
    minWidth: CONFIG.window.minWidth,
    minHeight: CONFIG.window.minHeight,
    center: true,
    show: false, // Don't show until ready
    backgroundColor: '#ffffff',

    // Security settings
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for some media APIs
      preload: path.join(__dirname, 'preload.js'),

      // Enable media features
      webSecurity: true,
      allowRunningInsecureContent: false,

      // Disable dev tools in production
      devTools: !app.isPackaged && !CONFIG.lockdown.disableDevTools,
    },

    // Window frame settings
    frame: !CONFIG.lockdown.kioskMode,
    fullscreen: CONFIG.lockdown.kioskMode,
    kiosk: CONFIG.lockdown.kioskMode,
    resizable: !CONFIG.lockdown.kioskMode,
    closable: true,
    minimizable: !isInTest,
    maximizable: true,
    alwaysOnTop: isInTest && CONFIG.lockdown.enabled,

    // Prevent flash of white background
    paintWhenInitiallyHidden: true,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Load the application
  if (process.argv.includes('--dev')) {
    // Development mode - load from localhost
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load from server
    mainWindow.loadURL(CONFIG.serverUrl);
  }

  // Handle window close
  mainWindow.on('close', (event) => {
    if (isInTest && CONFIG.lockdown.preventWindowClose) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Test in Progress',
        message: 'You cannot close the application during a test.',
        detail: 'Please complete or submit your test first.',
        buttons: ['OK'],
      });
      return false;
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation away from the test
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedHosts = [
      new URL(CONFIG.serverUrl).host,
      'localhost',
      '127.0.0.1',
    ];

    const targetHost = new URL(url).host;
    if (!allowedHosts.includes(targetHost)) {
      console.log(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });

  // Block new windows/popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log(`Blocked popup: ${url}`);
    return { action: 'deny' };
  });
}

/**
 * Setup automatic media permissions
 * This is the KEY fix - no more browser permission prompts!
 */
function setupMediaPermissions() {
  // Grant all media permissions automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'media',           // Camera and microphone
      'mediaKeySystem',  // Media key system
      'geolocation',     // Location (if needed)
      'notifications',   // Notifications
      'fullscreen',      // Fullscreen
      'pointerLock',     // Pointer lock (for mouse)
    ];

    if (allowedPermissions.includes(permission)) {
      console.log(`✓ Granted permission: ${permission}`);
      callback(true);
    } else {
      console.log(`✗ Denied permission: ${permission}`);
      callback(false);
    }
  });

  // Also handle permission check requests
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'fullscreen'];
    return allowedPermissions.includes(permission);
  });

  // For macOS: Request camera/mic access at system level
  if (process.platform === 'darwin') {
    requestMacOSMediaAccess();
  }
}

/**
 * Request macOS camera/microphone access
 */
async function requestMacOSMediaAccess() {
  try {
    // Check camera access
    const cameraStatus = systemPreferences.getMediaAccessStatus('camera');
    if (cameraStatus !== 'granted') {
      const cameraGranted = await systemPreferences.askForMediaAccess('camera');
      console.log(`Camera access: ${cameraGranted ? 'granted' : 'denied'}`);
    }

    // Check microphone access
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus !== 'granted') {
      const micGranted = await systemPreferences.askForMediaAccess('microphone');
      console.log(`Microphone access: ${micGranted ? 'granted' : 'denied'}`);
    }

    // Check screen recording access (for screen sharing)
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log(`Screen recording status: ${screenStatus}`);
  } catch (error) {
    console.error('Error requesting macOS media access:', error);
  }
}

/**
 * Enable test lockdown mode
 */
function enableLockdown() {
  if (!CONFIG.lockdown.enabled) return;

  isInTest = true;
  console.log('🔒 Test lockdown enabled');

  // Prevent system sleep
  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');

  // Make window always on top
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setMinimizable(false);
    mainWindow.focus();
  }

  // Block keyboard shortcuts
  if (CONFIG.lockdown.blockKeyboardShortcuts) {
    registerLockdownShortcuts();
  }

  // Notify renderer
  if (mainWindow) {
    mainWindow.webContents.send('lockdown-enabled');
  }
}

/**
 * Disable test lockdown mode
 */
function disableLockdown() {
  isInTest = false;
  console.log('🔓 Test lockdown disabled');

  // Allow system sleep again
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }

  // Remove always on top
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimizable(true);
  }

  // Unregister shortcuts
  globalShortcut.unregisterAll();

  // Notify renderer
  if (mainWindow) {
    mainWindow.webContents.send('lockdown-disabled');
  }
}

/**
 * Register keyboard shortcuts to block during lockdown
 */
function registerLockdownShortcuts() {
  const shortcutsToBlock = [
    'Alt+Tab',        // Switch windows
    'Alt+F4',         // Close window
    'CommandOrControl+Tab', // Switch tabs
    'CommandOrControl+W',   // Close tab
    'CommandOrControl+Q',   // Quit app
    'CommandOrControl+N',   // New window
    'CommandOrControl+Shift+N', // New incognito
    'F11',            // Fullscreen toggle
    'CommandOrControl+Shift+I', // Dev tools
    'CommandOrControl+Shift+J', // Console
    'F12',            // Dev tools
    'CommandOrControl+R',   // Refresh
    'CommandOrControl+Shift+R', // Hard refresh
    'CommandOrControl+P',   // Print
    'CommandOrControl+S',   // Save
  ];

  shortcutsToBlock.forEach((shortcut) => {
    try {
      globalShortcut.register(shortcut, () => {
        console.log(`Blocked shortcut: ${shortcut}`);
        // Don't do anything - just block
      });
    } catch (error) {
      // Some shortcuts may not be registerable on all platforms
      console.log(`Could not register shortcut: ${shortcut}`);
    }
  });
}

/**
 * Get device fingerprint for identity binding
 */
async function getDeviceFingerprint() {
  try {
    const { machineId } = require('node-machine-id');
    const os = require('os');

    const id = await machineId();

    return {
      machineId: id,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      osVersion: os.release(),
      electronVersion: process.versions.electron,
    };
  } catch (error) {
    console.error('Error getting device fingerprint:', error);
    return null;
  }
}

// ==================== IPC HANDLERS ====================

/**
 * Handle requests from renderer process
 */
function setupIpcHandlers() {
  // Get device info
  ipcMain.handle('get-device-info', async () => {
    return await getDeviceFingerprint();
  });

  // Enable lockdown mode
  ipcMain.on('enable-lockdown', () => {
    enableLockdown();
  });

  // Disable lockdown mode
  ipcMain.on('disable-lockdown', () => {
    disableLockdown();
  });

  // Check if in lockdown
  ipcMain.handle('is-locked', () => {
    return isInTest;
  });

  // Get stored value
  ipcMain.handle('store-get', (event, key) => {
    return store.get(key);
  });

  // Set stored value
  ipcMain.on('store-set', (event, key, value) => {
    store.set(key, value);
  });

  // Show error dialog
  ipcMain.on('show-error', (event, title, message) => {
    dialog.showErrorBox(title, message);
  });

  // Show message dialog
  ipcMain.handle('show-message', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result.response;
  });

  // Get media sources (for screen sharing)
  ipcMain.handle('get-media-sources', async () => {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });

  // Check camera/mic status
  ipcMain.handle('check-media-access', async () => {
    if (process.platform === 'darwin') {
      return {
        camera: systemPreferences.getMediaAccessStatus('camera'),
        microphone: systemPreferences.getMediaAccessStatus('microphone'),
        screen: systemPreferences.getMediaAccessStatus('screen'),
      };
    }
    // On Windows/Linux, assume granted (handled at app level)
    return {
      camera: 'granted',
      microphone: 'granted',
      screen: 'granted',
    };
  });

  // Request media access (macOS)
  ipcMain.handle('request-media-access', async (event, mediaType) => {
    if (process.platform === 'darwin') {
      return await systemPreferences.askForMediaAccess(mediaType);
    }
    return true;
  });

  // Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Quit application
  ipcMain.on('quit-app', () => {
    if (!isInTest) {
      app.quit();
    }
  });
}

// ==================== APP LIFECYCLE ====================

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window if user tries to open another instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// App ready
app.whenReady().then(() => {
  setupMediaPermissions();
  setupIpcHandlers();
  createWindow();

  // macOS: Recreate window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
  }
});

// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (process.argv.includes('--dev')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

console.log('CIA Testing Platform - Electron App Started');
console.log(`Platform: ${process.platform}`);
console.log(`Electron: ${process.versions.electron}`);
console.log(`Node: ${process.versions.node}`);

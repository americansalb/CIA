/**
 * CIA Testing Platform - Preload Script
 *
 * This script runs in the renderer process but has access to Node.js APIs.
 * It creates a bridge between the web app and Electron's main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('ciaDesktop', {
  // ==================== DEVICE INFO ====================

  /**
   * Get unique device fingerprint
   */
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),

  /**
   * Get app version
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * Check if running in desktop app
   */
  isDesktopApp: () => true,

  // ==================== LOCKDOWN MODE ====================

  /**
   * Enable test lockdown mode
   * - Prevents window closing
   * - Blocks Alt+Tab, etc.
   * - Makes window always on top
   */
  enableLockdown: () => ipcRenderer.send('enable-lockdown'),

  /**
   * Disable test lockdown mode
   */
  disableLockdown: () => ipcRenderer.send('disable-lockdown'),

  /**
   * Check if currently in lockdown
   */
  isLocked: () => ipcRenderer.invoke('is-locked'),

  /**
   * Listen for lockdown state changes
   */
  onLockdownEnabled: (callback) => {
    ipcRenderer.on('lockdown-enabled', callback);
  },

  onLockdownDisabled: (callback) => {
    ipcRenderer.on('lockdown-disabled', callback);
  },

  // ==================== MEDIA ACCESS ====================

  /**
   * Check camera/microphone access status
   * Returns: { camera: 'granted'|'denied'|'not-determined', microphone: ..., screen: ... }
   */
  checkMediaAccess: () => ipcRenderer.invoke('check-media-access'),

  /**
   * Request camera or microphone access (macOS only)
   * @param {string} mediaType - 'camera' or 'microphone'
   */
  requestMediaAccess: (mediaType) => ipcRenderer.invoke('request-media-access', mediaType),

  /**
   * Get available screen sources for screen sharing
   * Returns array of { id, name, thumbnail }
   */
  getMediaSources: () => ipcRenderer.invoke('get-media-sources'),

  // ==================== STORAGE ====================

  /**
   * Get stored value
   */
  storeGet: (key) => ipcRenderer.invoke('store-get', key),

  /**
   * Set stored value
   */
  storeSet: (key, value) => ipcRenderer.send('store-set', key, value),

  // ==================== DIALOGS ====================

  /**
   * Show error dialog
   */
  showError: (title, message) => ipcRenderer.send('show-error', title, message),

  /**
   * Show message dialog
   * @param {Object} options - { type, title, message, detail, buttons }
   * @returns {number} - Index of clicked button
   */
  showMessage: (options) => ipcRenderer.invoke('show-message', options),

  // ==================== APP CONTROL ====================

  /**
   * Quit the application (only works when not in test)
   */
  quitApp: () => ipcRenderer.send('quit-app'),
});

// ==================== ENHANCED MEDIA HANDLING ====================

/**
 * Override getUserMedia to provide better error handling
 * and automatic permission granting in desktop app
 */
const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

navigator.mediaDevices.getUserMedia = async function (constraints) {
  console.log('[CIA Desktop] getUserMedia called with:', constraints);

  try {
    // In Electron, permissions are pre-granted, so this should always work
    const stream = await originalGetUserMedia(constraints);
    console.log('[CIA Desktop] getUserMedia success');
    return stream;
  } catch (error) {
    console.error('[CIA Desktop] getUserMedia error:', error.name, error.message);

    // Provide more helpful error messages
    let userMessage = '';

    switch (error.name) {
      case 'NotAllowedError':
        userMessage = 'Camera/microphone access was denied. Please check system permissions.';
        break;
      case 'NotFoundError':
        userMessage = 'No camera or microphone found. Please connect a device and try again.';
        break;
      case 'NotReadableError':
        userMessage = 'Camera/microphone is in use by another application. Please close other apps and try again.';
        break;
      case 'OverconstrainedError':
        userMessage = 'Camera does not support the requested settings. Trying with lower quality...';
        // Could retry with lower constraints here
        break;
      case 'SecurityError':
        userMessage = 'Security error accessing media devices.';
        break;
      default:
        userMessage = `Error accessing camera/microphone: ${error.message}`;
    }

    // Show native dialog with helpful message
    ipcRenderer.send('show-error', 'Media Access Error', userMessage);

    throw error;
  }
};

/**
 * Override getDisplayMedia for better screen sharing
 */
const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);

if (originalGetDisplayMedia) {
  navigator.mediaDevices.getDisplayMedia = async function (constraints) {
    console.log('[CIA Desktop] getDisplayMedia called');

    try {
      // In Electron, we can use desktopCapturer for more control
      const sources = await ipcRenderer.invoke('get-media-sources');

      if (sources.length === 0) {
        throw new Error('No screen sources available');
      }

      // For simplicity, use the entire screen
      // In production, you might want to show a picker
      const screenSource = sources.find(s => s.name === 'Entire Screen' || s.name.includes('Screen')) || sources[0];

      const stream = await originalGetUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id,
          },
        },
      });

      console.log('[CIA Desktop] getDisplayMedia success');
      return stream;
    } catch (error) {
      console.error('[CIA Desktop] getDisplayMedia error:', error);
      ipcRenderer.send('show-error', 'Screen Share Error', 'Failed to capture screen. Please try again.');
      throw error;
    }
  };
}

// ==================== WINDOW EVENTS ====================

// Notify when page is about to unload
window.addEventListener('beforeunload', (event) => {
  // Let the main process handle this
  console.log('[CIA Desktop] beforeunload event');
});

// Log when page loads
window.addEventListener('load', () => {
  console.log('[CIA Desktop] Page loaded');

  // Inject indicator that this is the desktop app
  const indicator = document.createElement('meta');
  indicator.name = 'cia-desktop-app';
  indicator.content = 'true';
  document.head.appendChild(indicator);
});

console.log('[CIA Desktop] Preload script loaded');

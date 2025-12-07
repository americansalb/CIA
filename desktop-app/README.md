# CIA Testing Platform - Desktop Application

A secure, lockdown-capable desktop application for proctored assessments.

## Why Desktop App?

The browser-based application suffers from **99% permission failure rates** due to:
- Complex camera/microphone permission flows
- Inconsistent browser behavior
- Users accidentally denying permissions
- Devices being "in use" by other apps
- No way to enforce test environment

The desktop app solves ALL of these problems:

| Issue | Browser | Desktop App |
|-------|---------|-------------|
| Camera permissions | User must manually allow | **Auto-granted** |
| Device in use errors | Generic error message | **Clear message + fix** |
| Tab switching | Can't prevent | **Blocked + logged** |
| Alt+Tab | Can't prevent | **Blocked during test** |
| Screenshot tools | Available | **Blocked during test** |
| Multiple instances | Can open many | **Single instance only** |
| Browser dev tools | Available | **Disabled** |
| Reliable uploads | Browser limits | **Unlimited retries** |

## Features

### Automatic Permissions
- Camera and microphone access granted automatically
- No more confusing browser permission dialogs
- System-level permission requests on macOS

### Test Lockdown Mode
When a test starts, the app:
- Prevents closing the window
- Blocks Alt+Tab, Cmd+Tab
- Blocks keyboard shortcuts (Ctrl+C, Print Screen, etc.)
- Makes window always-on-top
- Prevents system sleep
- Disables developer tools

### Device Fingerprinting
- Unique machine ID for identity binding
- Prevents credential sharing across devices
- Hardware-based identification

### Screen Recording
- Uses native Electron APIs
- More reliable than browser getDisplayMedia
- Better quality and performance

## Installation

### For Users

Download the installer for your platform:
- **Windows**: `CIA-Testing-Platform-x.x.x-win-x64.exe`
- **macOS**: `CIA-Testing-Platform-x.x.x-mac.dmg`
- **Linux**: `CIA-Testing-Platform-x.x.x-linux.AppImage`

### For Developers

```bash
# Navigate to desktop app directory
cd desktop-app

# Install dependencies
npm install

# Run in development mode (connects to localhost:3000)
npm run dev

# Build for current platform
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## Configuration

Edit `src/main.js` to change settings:

```javascript
const CONFIG = {
  // Your server URL
  serverUrl: 'https://your-cia-server.com',

  // Lockdown settings
  lockdown: {
    enabled: true,
    blockKeyboardShortcuts: true,
    preventWindowClose: true,
    disableDevTools: true,
    kioskMode: false, // Full kiosk mode
  },
};
```

## API for Web App

The desktop app exposes APIs to the web app via `window.ciaDesktop`:

```javascript
// Check if running in desktop app
if (window.ciaDesktop) {
  console.log('Running in desktop app!');

  // Get device fingerprint
  const deviceInfo = await window.ciaDesktop.getDeviceInfo();
  console.log('Machine ID:', deviceInfo.machineId);

  // Enable lockdown when test starts
  window.ciaDesktop.enableLockdown();

  // Disable lockdown when test ends
  window.ciaDesktop.disableLockdown();

  // Check media access (useful for macOS)
  const mediaStatus = await window.ciaDesktop.checkMediaAccess();
  console.log('Camera:', mediaStatus.camera); // 'granted', 'denied', 'not-determined'
}
```

## Integrating with Existing Web App

Add this to your web app to detect and use the desktop app:

```javascript
// Check if desktop app
const isDesktopApp = !!window.ciaDesktop;

if (isDesktopApp) {
  // Use desktop-specific features
  console.log('Desktop app detected');

  // Enable lockdown when test starts
  function startTest() {
    window.ciaDesktop.enableLockdown();
    // ... start test logic
  }

  // Disable lockdown when test ends
  function endTest() {
    window.ciaDesktop.disableLockdown();
    // ... end test logic
  }
} else {
  // Show download prompt
  showDownloadPrompt();
}
```

## Building Installers

### Windows (NSIS Installer)
```bash
npm run build:win
# Output: dist/CIA-Testing-Platform-x.x.x-win-x64.exe
```

### macOS (DMG)
```bash
npm run build:mac
# Output: dist/CIA-Testing-Platform-x.x.x-mac.dmg
```

Note: macOS builds require code signing for distribution. Set these environment variables:
- `CSC_LINK`: Path to .p12 certificate
- `CSC_KEY_PASSWORD`: Certificate password
- `APPLE_ID`: Apple ID for notarization
- `APPLE_ID_PASSWORD`: App-specific password

### Linux (AppImage)
```bash
npm run build:linux
# Output: dist/CIA-Testing-Platform-x.x.x-linux.AppImage
```

## Security Considerations

1. **Code Signing**: Sign your app for distribution
2. **Auto-Updates**: Implement secure auto-updates
3. **Server Validation**: Validate the server URL
4. **Data Encryption**: Encrypt stored credentials
5. **Audit Logging**: Log all security events

## Troubleshooting

### macOS: "App is damaged" error
Run this command:
```bash
xattr -cr /Applications/CIA\ Testing\ Platform.app
```

### Windows: SmartScreen warning
The app needs to be code-signed with an EV certificate to avoid SmartScreen warnings.

### Camera not working on macOS
Grant camera permission in System Preferences > Security & Privacy > Privacy > Camera

### Linux: AppImage won't run
Make it executable:
```bash
chmod +x CIA-Testing-Platform-x.x.x-linux.AppImage
```

## License

MIT License - see LICENSE file

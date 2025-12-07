/**
 * Media Permissions Handler
 *
 * Provides reliable camera/microphone access with:
 * 1. Pre-flight permission checking
 * 2. Detailed error messages for each failure type
 * 3. Automatic fallback to lower quality
 * 4. Device enumeration
 * 5. Device-in-use detection
 * 6. Browser compatibility checking
 */

class MediaPermissionsHandler {
  constructor(options = {}) {
    this.options = {
      onStatusChange: options.onStatusChange || (() => {}),
      onError: options.onError || (() => {}),
      preferredVideoWidth: options.preferredVideoWidth || 1280,
      preferredVideoHeight: options.preferredVideoHeight || 720,
    };

    this.stream = null;
    this.devices = {
      cameras: [],
      microphones: [],
    };
  }

  /**
   * Check browser compatibility before anything else
   */
  checkBrowserCompatibility() {
    const issues = [];

    // Check HTTPS
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      issues.push({
        type: 'no_https',
        message: 'Camera access requires a secure connection (HTTPS).',
        action: 'Please access this site using https:// instead of http://',
        severity: 'critical',
      });
    }

    // Check getUserMedia support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      issues.push({
        type: 'no_media_api',
        message: 'Your browser does not support camera/microphone access.',
        action: 'Please use a modern browser like Chrome, Firefox, Safari, or Edge.',
        severity: 'critical',
      });
    }

    // Check for desktop app
    if (window.ciaDesktop) {
      return { compatible: true, isDesktopApp: true, issues: [] };
    }

    return {
      compatible: issues.filter(i => i.severity === 'critical').length === 0,
      isDesktopApp: false,
      issues,
    };
  }

  /**
   * Check current permission status without prompting
   */
  async checkPermissionStatus() {
    const status = {
      camera: 'unknown',
      microphone: 'unknown',
    };

    try {
      // Use Permissions API if available
      if (navigator.permissions) {
        try {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' });
          status.camera = cameraPermission.state; // 'granted', 'denied', or 'prompt'
        } catch (e) {
          // Camera permission query not supported
        }

        try {
          const micPermission = await navigator.permissions.query({ name: 'microphone' });
          status.microphone = micPermission.state;
        } catch (e) {
          // Microphone permission query not supported
        }
      }
    } catch (e) {
      console.warn('Permissions API not fully supported');
    }

    return status;
  }

  /**
   * Enumerate available devices
   */
  async enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.devices.cameras = devices.filter(d => d.kind === 'videoinput');
      this.devices.microphones = devices.filter(d => d.kind === 'audioinput');

      return {
        cameras: this.devices.cameras.map(d => ({
          id: d.deviceId,
          label: d.label || `Camera ${this.devices.cameras.indexOf(d) + 1}`,
        })),
        microphones: this.devices.microphones.map(d => ({
          id: d.deviceId,
          label: d.label || `Microphone ${this.devices.microphones.indexOf(d) + 1}`,
        })),
        hasCameras: this.devices.cameras.length > 0,
        hasMicrophones: this.devices.microphones.length > 0,
      };
    } catch (error) {
      console.error('Device enumeration failed:', error);
      return {
        cameras: [],
        microphones: [],
        hasCameras: false,
        hasMicrophones: false,
        error: error.message,
      };
    }
  }

  /**
   * Request camera and microphone with progressive fallback
   */
  async requestMedia(options = {}) {
    const {
      video = true,
      audio = true,
      videoDeviceId = null,
      audioDeviceId = null,
    } = options;

    // Try multiple constraint configurations
    const constraintConfigs = [
      // Attempt 1: High quality
      {
        video: video ? {
          width: { ideal: this.options.preferredVideoWidth },
          height: { ideal: this.options.preferredVideoHeight },
          facingMode: 'user',
          ...(videoDeviceId && { deviceId: { exact: videoDeviceId } }),
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(audioDeviceId && { deviceId: { exact: audioDeviceId } }),
        } : false,
      },

      // Attempt 2: Medium quality (if high fails)
      {
        video: video ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
        } : false,
      },

      // Attempt 3: Minimum constraints
      {
        video: video,
        audio: audio,
      },
    ];

    let lastError = null;

    for (let i = 0; i < constraintConfigs.length; i++) {
      const constraints = constraintConfigs[i];
      console.log(`[MediaPermissions] Attempt ${i + 1}:`, constraints);

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log('[MediaPermissions] Success with attempt', i + 1);

        // Get actual track settings
        const videoTrack = this.stream.getVideoTracks()[0];
        const audioTrack = this.stream.getAudioTracks()[0];

        return {
          success: true,
          stream: this.stream,
          video: videoTrack ? {
            label: videoTrack.label,
            settings: videoTrack.getSettings(),
          } : null,
          audio: audioTrack ? {
            label: audioTrack.label,
            settings: audioTrack.getSettings(),
          } : null,
          qualityLevel: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
        };
      } catch (error) {
        console.warn(`[MediaPermissions] Attempt ${i + 1} failed:`, error.name);
        lastError = error;

        // Don't retry for permission-related errors
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
          break;
        }
      }
    }

    // All attempts failed - return detailed error
    return this.handleError(lastError);
  }

  /**
   * Handle and categorize media errors
   */
  handleError(error) {
    const errorInfo = {
      success: false,
      stream: null,
      error: {
        name: error.name,
        message: error.message,
        type: 'unknown',
        userMessage: '',
        action: '',
        canRetry: false,
      },
    };

    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        errorInfo.error.type = 'permission_denied';
        errorInfo.error.userMessage = 'Camera/microphone access was denied.';
        errorInfo.error.action = this.getPermissionResetInstructions();
        errorInfo.error.canRetry = false;
        break;

      case 'NotFoundError':
      case 'DevicesNotFoundError':
        errorInfo.error.type = 'no_device';
        errorInfo.error.userMessage = 'No camera or microphone found on this device.';
        errorInfo.error.action = 'Please connect a camera and microphone, then click "Try Again".';
        errorInfo.error.canRetry = true;
        break;

      case 'NotReadableError':
      case 'TrackStartError':
        errorInfo.error.type = 'device_in_use';
        errorInfo.error.userMessage = 'Your camera or microphone is being used by another application.';
        errorInfo.error.action = 'Please close other apps using your camera (like Zoom, Skype, Teams, or another browser tab), then click "Try Again".';
        errorInfo.error.canRetry = true;
        break;

      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        errorInfo.error.type = 'constraints_failed';
        errorInfo.error.userMessage = 'Your camera does not support the required settings.';
        errorInfo.error.action = 'Trying with lower quality settings...';
        errorInfo.error.canRetry = true;
        break;

      case 'SecurityError':
        errorInfo.error.type = 'security_error';
        errorInfo.error.userMessage = 'Security restrictions prevent camera access.';
        errorInfo.error.action = 'Please ensure you are using HTTPS and that this site is not blocked.';
        errorInfo.error.canRetry = false;
        break;

      case 'AbortError':
        errorInfo.error.type = 'aborted';
        errorInfo.error.userMessage = 'Camera access was interrupted.';
        errorInfo.error.action = 'Please click "Try Again" to retry.';
        errorInfo.error.canRetry = true;
        break;

      case 'TypeError':
        errorInfo.error.type = 'invalid_constraints';
        errorInfo.error.userMessage = 'There was a configuration error.';
        errorInfo.error.action = 'Please refresh the page and try again.';
        errorInfo.error.canRetry = true;
        break;

      default:
        errorInfo.error.type = 'unknown';
        errorInfo.error.userMessage = `An unexpected error occurred: ${error.message}`;
        errorInfo.error.action = 'Please refresh the page and try again. If the problem persists, try using a different browser.';
        errorInfo.error.canRetry = true;
    }

    this.options.onError(errorInfo.error);
    return errorInfo;
  }

  /**
   * Get browser-specific instructions for resetting permissions
   */
  getPermissionResetInstructions() {
    const ua = navigator.userAgent.toLowerCase();

    if (ua.includes('chrome') && !ua.includes('edg')) {
      return `
To allow camera access in Chrome:
1. Click the camera icon in the address bar (🎥)
2. Select "Always allow" for camera and microphone
3. Click "Done" and refresh the page

Or: Go to chrome://settings/content/camera and allow this site.
      `.trim();
    }

    if (ua.includes('firefox')) {
      return `
To allow camera access in Firefox:
1. Click the camera icon in the address bar
2. Click "Don't Block" or remove the block
3. Refresh the page

Or: Go to Settings > Privacy & Security > Permissions > Camera
      `.trim();
    }

    if (ua.includes('safari') && !ua.includes('chrome')) {
      return `
To allow camera access in Safari:
1. Go to Safari > Settings for This Website
2. Set Camera and Microphone to "Allow"
3. Refresh the page

Or: Go to Safari > Preferences > Websites > Camera
      `.trim();
    }

    if (ua.includes('edg')) {
      return `
To allow camera access in Edge:
1. Click the lock icon in the address bar
2. Set Camera and Microphone to "Allow"
3. Refresh the page

Or: Go to edge://settings/content/camera and allow this site.
      `.trim();
    }

    return `
To allow camera access:
1. Look for a camera icon in your browser's address bar
2. Click it and select "Allow"
3. Refresh the page

If you don't see the icon, check your browser's privacy settings.
    `.trim();
  }

  /**
   * Stop all media tracks
   */
  stopMedia() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log(`[MediaPermissions] Stopped track: ${track.kind}`);
      });
      this.stream = null;
    }
  }

  /**
   * Test microphone audio level
   */
  async testMicrophoneLevel(stream, duration = 3000) {
    return new Promise((resolve) => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
          resolve({ success: false, error: 'AudioContext not supported' });
          return;
        }

        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);

        microphone.connect(analyser);
        analyser.fftSize = 256;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let maxLevel = 0;
        let samples = 0;

        const checkLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          maxLevel = Math.max(maxLevel, average);
          samples++;
        };

        const intervalId = setInterval(checkLevel, 100);

        setTimeout(() => {
          clearInterval(intervalId);
          microphone.disconnect();
          audioContext.close();

          resolve({
            success: true,
            maxLevel,
            averageSamples: samples,
            isWorking: maxLevel > 5, // Very low threshold
            recommendation: maxLevel < 5
              ? 'No audio detected. Please check your microphone connection.'
              : maxLevel < 15
              ? 'Audio level is low. Please speak louder or move closer to the microphone.'
              : 'Microphone is working correctly.',
          });
        }, duration);
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  }

  /**
   * Full pre-flight check before test
   */
  async runPreflightCheck() {
    const results = {
      browser: null,
      permissions: null,
      devices: null,
      media: null,
      microphone: null,
      overall: 'pending',
      issues: [],
      canProceed: false,
    };

    // Step 1: Browser compatibility
    results.browser = this.checkBrowserCompatibility();
    if (!results.browser.compatible) {
      results.issues.push(...results.browser.issues);
      results.overall = 'failed';
      return results;
    }

    // Step 2: Check permission status
    results.permissions = await this.checkPermissionStatus();
    if (results.permissions.camera === 'denied' || results.permissions.microphone === 'denied') {
      results.issues.push({
        type: 'permission_denied',
        message: 'Camera or microphone permission was previously denied.',
        action: this.getPermissionResetInstructions(),
        severity: 'critical',
      });
    }

    // Step 3: Enumerate devices
    results.devices = await this.enumerateDevices();
    if (!results.devices.hasCameras) {
      results.issues.push({
        type: 'no_camera',
        message: 'No camera detected on this device.',
        action: 'Please connect a camera and refresh the page.',
        severity: 'critical',
      });
    }
    if (!results.devices.hasMicrophones) {
      results.issues.push({
        type: 'no_microphone',
        message: 'No microphone detected on this device.',
        action: 'Please connect a microphone and refresh the page.',
        severity: 'critical',
      });
    }

    // Step 4: Request media access
    results.media = await this.requestMedia();
    if (!results.media.success) {
      results.issues.push({
        type: results.media.error.type,
        message: results.media.error.userMessage,
        action: results.media.error.action,
        severity: 'critical',
      });
      results.overall = 'failed';
      return results;
    }

    // Step 5: Test microphone
    results.microphone = await this.testMicrophoneLevel(results.media.stream);
    if (!results.microphone.isWorking) {
      results.issues.push({
        type: 'microphone_silent',
        message: 'Microphone does not appear to be capturing audio.',
        action: results.microphone.recommendation,
        severity: 'warning',
      });
    }

    // Determine overall result
    const criticalIssues = results.issues.filter(i => i.severity === 'critical');
    results.overall = criticalIssues.length > 0 ? 'failed' : 'passed';
    results.canProceed = criticalIssues.length === 0;

    return results;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MediaPermissionsHandler;
}
if (typeof window !== 'undefined') {
  window.MediaPermissionsHandler = MediaPermissionsHandler;
}

/**
 * Device Fingerprint Collector (Client-Side)
 *
 * Collects browser characteristics to create a unique device fingerprint.
 * This is sent to the server to:
 * 1. Detect credential sharing (same device, different users)
 * 2. Detect suspicious environments (VMs, automation tools)
 * 3. Track device trust over time
 */

class DeviceFingerprintCollector {
  constructor() {
    this.components = {};
    this.collected = false;
  }

  /**
   * Collect all fingerprint components
   */
  async collect() {
    if (this.collected && Object.keys(this.components).length > 0) {
      return this.components;
    }

    // Basic navigator properties
    this.components.userAgent = navigator.userAgent;
    this.components.language = navigator.language || navigator.userLanguage;
    this.components.languages = (navigator.languages || []).join(',');
    this.components.platform = navigator.platform;
    this.components.hardwareConcurrency = navigator.hardwareConcurrency || 'unknown';
    this.components.deviceMemory = navigator.deviceMemory || 'unknown';
    this.components.cookieEnabled = navigator.cookieEnabled;
    this.components.doNotTrack = navigator.doNotTrack || 'unknown';

    // Screen properties
    this.components.screenResolution = `${screen.width}x${screen.height}`;
    this.components.availableScreenResolution = `${screen.availWidth}x${screen.availHeight}`;
    this.components.colorDepth = screen.colorDepth;
    this.components.pixelRatio = window.devicePixelRatio || 1;

    // Timezone
    this.components.timezoneOffset = new Date().getTimezoneOffset();
    this.components.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Storage availability
    this.components.localStorage = this.checkLocalStorage();
    this.components.sessionStorage = this.checkSessionStorage();
    this.components.indexedDB = !!window.indexedDB;

    // Plugin count (helps detect headless browsers)
    this.components.pluginCount = navigator.plugins ? navigator.plugins.length : 0;
    this.components.plugins = this.getPluginList();

    // WebDriver detection (automation)
    this.components.webdriver = navigator.webdriver || false;

    // Canvas fingerprint
    this.components.canvasHash = await this.getCanvasFingerprint();

    // WebGL fingerprint
    const webglInfo = this.getWebGLInfo();
    this.components.webglVendor = webglInfo.vendor;
    this.components.webglRenderer = webglInfo.renderer;
    this.components.webglHash = webglInfo.hash;

    // Audio fingerprint
    this.components.audioHash = await this.getAudioFingerprint();

    // Font detection (hash of available fonts)
    this.components.fonts = await this.getFontFingerprint();

    // Touch support
    this.components.touchSupport = this.getTouchSupport();

    // Connection info
    if (navigator.connection) {
      this.components.connectionType = navigator.connection.effectiveType;
      this.components.connectionDownlink = navigator.connection.downlink;
    }

    // Battery status (if available)
    this.components.battery = await this.getBatteryInfo();

    // Permissions
    this.components.permissions = await this.checkPermissions();

    this.collected = true;
    return this.components;
  }

  /**
   * Check localStorage availability
   */
  checkLocalStorage() {
    try {
      localStorage.setItem('fp_test', '1');
      localStorage.removeItem('fp_test');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check sessionStorage availability
   */
  checkSessionStorage() {
    try {
      sessionStorage.setItem('fp_test', '1');
      sessionStorage.removeItem('fp_test');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get plugin list
   */
  getPluginList() {
    if (!navigator.plugins || navigator.plugins.length === 0) {
      return '';
    }

    const plugins = [];
    for (let i = 0; i < navigator.plugins.length && i < 10; i++) {
      plugins.push(navigator.plugins[i].name);
    }
    return plugins.join(',');
  }

  /**
   * Generate canvas fingerprint
   */
  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = 200;
      canvas.height = 50;

      // Draw text with various fonts
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 200, 50);

      ctx.fillStyle = '#069';
      ctx.fillText('Fingerprint Test 123 !@#', 2, 15);

      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.font = '18px Times New Roman';
      ctx.fillText('Canvas FP', 4, 30);

      // Get data URL and hash it
      const dataUrl = canvas.toDataURL();
      return await this.hashString(dataUrl);
    } catch (e) {
      return 'canvas_error';
    }
  }

  /**
   * Get WebGL information
   */
  getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) {
        return { vendor: 'no_webgl', renderer: 'no_webgl', hash: 'no_webgl' };
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

      let vendor = 'unknown';
      let renderer = 'unknown';

      if (debugInfo) {
        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }

      // Additional WebGL parameters for hash
      const params = [
        gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        gl.getParameter(gl.MAX_VARYING_VECTORS),
        gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
        vendor,
        renderer,
      ].join('|');

      return {
        vendor,
        renderer,
        hash: this.simpleHash(params),
      };
    } catch (e) {
      return { vendor: 'error', renderer: 'error', hash: 'webgl_error' };
    }
  }

  /**
   * Get audio context fingerprint
   */
  async getAudioFingerprint() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return 'no_audio_context';

      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      const processor = context.createScriptProcessor(4096, 1, 1);

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, context.currentTime);

      gain.gain.setValueAtTime(0, context.currentTime);

      oscillator.connect(analyser);
      analyser.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

      oscillator.start(0);

      return new Promise((resolve) => {
        processor.onaudioprocess = (event) => {
          const data = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            sum += Math.abs(data[i]);
          }

          oscillator.disconnect();
          processor.disconnect();
          gain.disconnect();
          context.close();

          resolve(this.simpleHash(sum.toString()));
        };

        // Timeout fallback
        setTimeout(() => {
          try {
            oscillator.disconnect();
            processor.disconnect();
            gain.disconnect();
            context.close();
          } catch (e) {}
          resolve('audio_timeout');
        }, 1000);
      });
    } catch (e) {
      return 'audio_error';
    }
  }

  /**
   * Get font fingerprint by detecting available fonts
   */
  async getFontFingerprint() {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testFonts = [
      'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria',
      'Comic Sans MS', 'Consolas', 'Courier', 'Courier New',
      'Georgia', 'Helvetica', 'Impact', 'Lucida Console',
      'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Palatino Linotype',
      'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    ];

    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const getTextWidth = (font) => {
      ctx.font = `${testSize} ${font}`;
      return ctx.measureText(testString).width;
    };

    // Get baseline widths
    const baseWidths = {};
    for (const baseFont of baseFonts) {
      baseWidths[baseFont] = getTextWidth(baseFont);
    }

    // Check which fonts are available
    const availableFonts = [];
    for (const font of testFonts) {
      for (const baseFont of baseFonts) {
        const width = getTextWidth(`'${font}', ${baseFont}`);
        if (width !== baseWidths[baseFont]) {
          availableFonts.push(font);
          break;
        }
      }
    }

    return this.simpleHash(availableFonts.join(','));
  }

  /**
   * Get touch support information
   */
  getTouchSupport() {
    return {
      maxTouchPoints: navigator.maxTouchPoints || 0,
      touchEvent: 'ontouchstart' in window,
      touchPoints: navigator.msMaxTouchPoints || 0,
    };
  }

  /**
   * Get battery information (if available)
   */
  async getBatteryInfo() {
    try {
      if (!navigator.getBattery) return 'no_battery_api';

      const battery = await navigator.getBattery();
      return {
        charging: battery.charging,
        level: Math.round(battery.level * 100),
      };
    } catch (e) {
      return 'battery_error';
    }
  }

  /**
   * Check various permissions
   */
  async checkPermissions() {
    const permissions = {};

    const permissionNames = ['camera', 'microphone', 'notifications', 'geolocation'];

    for (const name of permissionNames) {
      try {
        const result = await navigator.permissions.query({ name });
        permissions[name] = result.state;
      } catch (e) {
        permissions[name] = 'error';
      }
    }

    return permissions;
  }

  /**
   * Simple hash function (for non-sensitive data)
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * SHA-256 hash (for sensitive data)
   */
  async hashString(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get full fingerprint hash
   */
  async getFingerprint() {
    const components = await this.collect();

    // Create deterministic string from components
    const fingerprintString = [
      components.userAgent,
      components.language,
      components.platform,
      components.hardwareConcurrency,
      components.deviceMemory,
      components.screenResolution,
      components.colorDepth,
      components.timezoneOffset,
      components.canvasHash,
      components.webglHash,
      components.webglVendor,
      components.webglRenderer,
      components.audioHash,
      components.fonts,
      components.plugins,
    ].join('|||');

    const hash = await this.hashString(fingerprintString);

    return {
      hash,
      components,
    };
  }

  /**
   * Analyze collected data for suspicious indicators
   */
  analyzeSuspiciousness() {
    const suspicions = [];

    // Check for automation indicators
    if (this.components.webdriver) {
      suspicions.push({ type: 'webdriver', severity: 'critical' });
    }

    // Check for VM indicators
    const vmIndicators = ['virtualbox', 'vmware', 'parallels', 'virtual'];
    const rendererLower = (this.components.webglRenderer || '').toLowerCase();
    for (const vm of vmIndicators) {
      if (rendererLower.includes(vm)) {
        suspicions.push({ type: 'vm_detected', vm, severity: 'high' });
      }
    }

    // Check for headless browser indicators
    if (this.components.pluginCount === 0) {
      suspicions.push({ type: 'no_plugins', severity: 'medium' });
    }

    // Check for impossible values
    if (this.components.hardwareConcurrency > 64) {
      suspicions.push({ type: 'unusual_cpu_cores', severity: 'low' });
    }

    return {
      suspicious: suspicions.length > 0,
      suspicions,
      riskScore: suspicions.reduce((score, s) => {
        const severityScores = { critical: 0.5, high: 0.3, medium: 0.1, low: 0.05 };
        return score + (severityScores[s.severity] || 0);
      }, 0),
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceFingerprintCollector;
}
if (typeof window !== 'undefined') {
  window.DeviceFingerprintCollector = DeviceFingerprintCollector;
}

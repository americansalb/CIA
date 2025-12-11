/**
 * Browser Lockdown Service
 *
 * Client-side anti-cheating measures:
 * 1. Tab switch detection
 * 2. Window blur detection
 * 3. Copy/paste prevention
 * 4. Right-click prevention
 * 5. Keyboard shortcut blocking
 * 6. Developer tools detection
 * 7. Print prevention
 */

class BrowserLockService {
  constructor(options = {}) {
    this.isLocked = false;
    this.violations = [];
    this.onViolation = options.onViolation || (() => {});
    this.onSuspend = options.onSuspend || (() => {});

    // Configurable thresholds
    this.maxWarnings = options.maxWarnings || 5;
    this.maxCriticalViolations = options.maxCriticalViolations || 3;

    // Track violation counts
    this.warningCount = 0;
    this.criticalCount = 0;

    // Bind methods
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleWindowBlur = this.handleWindowBlur.bind(this);
    this.handleWindowFocus = this.handleWindowFocus.bind(this);
    this.preventAction = this.preventAction.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
  }

  /**
   * Enable browser lockdown
   */
  enable() {
    if (this.isLocked) return;

    this.isLocked = true;

    // 1. Tab visibility detection
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // 2. Window focus/blur detection
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);

    // 3. Context menu (right-click) prevention
    document.addEventListener('contextmenu', this.preventAction);

    // 4. Copy/cut/paste prevention
    document.addEventListener('copy', this.preventAction);
    document.addEventListener('cut', this.preventAction);
    document.addEventListener('paste', this.preventAction);

    // 5. Keyboard shortcut blocking
    document.addEventListener('keydown', this.handleKeydown);

    // 6. Prevent leaving page without confirmation
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // 7. Disable text selection on test content
    this.disableTextSelection();

    // 8. Start developer tools detection
    this.startDevToolsDetection();

    // 9. Disable drag and drop
    document.addEventListener('dragstart', this.preventAction);
    document.addEventListener('drop', this.preventAction);

    console.log('[BrowserLock] Lockdown enabled');
  }

  /**
   * Disable browser lockdown
   */
  disable() {
    if (!this.isLocked) return;

    this.isLocked = false;

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('focus', this.handleWindowFocus);
    document.removeEventListener('contextmenu', this.preventAction);
    document.removeEventListener('copy', this.preventAction);
    document.removeEventListener('cut', this.preventAction);
    document.removeEventListener('paste', this.preventAction);
    document.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('dragstart', this.preventAction);
    document.removeEventListener('drop', this.preventAction);

    this.stopDevToolsDetection();
    this.enableTextSelection();

    console.log('[BrowserLock] Lockdown disabled');
  }

  /**
   * Handle tab visibility change
   */
  handleVisibilityChange() {
    if (!this.isLocked) return;

    if (document.hidden) {
      this.recordViolation('tab_switch', 'warning', {
        visibilityState: document.visibilityState,
      });
    }
  }

  /**
   * Handle window blur (clicking outside browser)
   */
  handleWindowBlur() {
    if (!this.isLocked) return;

    this.blurTime = Date.now();
    this.recordViolation('window_blur', 'warning');
  }

  /**
   * Handle window focus return
   */
  handleWindowFocus() {
    if (!this.isLocked || !this.blurTime) return;

    const blurDuration = Date.now() - this.blurTime;
    this.blurTime = null;

    // If away for more than 10 seconds, escalate severity
    if (blurDuration > 10000) {
      this.recordViolation('extended_blur', 'critical', {
        duration: blurDuration,
      });
    }
  }

  /**
   * Prevent default action (copy, paste, right-click, etc.)
   */
  preventAction(event) {
    if (!this.isLocked) return;

    event.preventDefault();

    const typeMap = {
      'contextmenu': 'right_click',
      'copy': 'copy_attempt',
      'cut': 'cut_attempt',
      'paste': 'paste_attempt',
      'dragstart': 'drag_attempt',
      'drop': 'drop_attempt',
    };

    const type = typeMap[event.type] || event.type;
    this.recordViolation(type, 'info');
  }

  /**
   * Handle keyboard events - block dangerous shortcuts
   */
  handleKeydown(event) {
    if (!this.isLocked) return;

    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey; // metaKey for Mac
    const shift = event.shiftKey;
    const alt = event.altKey;

    // Blocked shortcuts
    const blockedShortcuts = [
      // Developer tools
      { key: 'f12', ctrl: false, shift: false, alt: false },
      { key: 'i', ctrl: true, shift: true, alt: false },   // Ctrl+Shift+I
      { key: 'j', ctrl: true, shift: true, alt: false },   // Ctrl+Shift+J
      { key: 'c', ctrl: true, shift: true, alt: false },   // Ctrl+Shift+C (elements)

      // Copy/paste
      { key: 'c', ctrl: true, shift: false, alt: false },
      { key: 'v', ctrl: true, shift: false, alt: false },
      { key: 'x', ctrl: true, shift: false, alt: false },

      // Find/search
      { key: 'f', ctrl: true, shift: false, alt: false },
      { key: 'g', ctrl: true, shift: false, alt: false },

      // Print
      { key: 'p', ctrl: true, shift: false, alt: false },

      // View source
      { key: 'u', ctrl: true, shift: false, alt: false },

      // Save page
      { key: 's', ctrl: true, shift: false, alt: false },

      // Open file
      { key: 'o', ctrl: true, shift: false, alt: false },

      // New tab/window
      { key: 't', ctrl: true, shift: false, alt: false },
      { key: 'n', ctrl: true, shift: false, alt: false },

      // Browser history
      { key: 'h', ctrl: true, shift: false, alt: false },

      // Refresh
      { key: 'r', ctrl: true, shift: false, alt: false },
      { key: 'f5', ctrl: false, shift: false, alt: false },

      // Screenshot (Windows)
      { key: 'printscreen', ctrl: false, shift: false, alt: false },
    ];

    const isBlocked = blockedShortcuts.some(combo =>
      key === combo.key &&
      ctrl === combo.ctrl &&
      shift === combo.shift &&
      alt === combo.alt
    );

    if (isBlocked) {
      event.preventDefault();
      event.stopPropagation();

      const severity = key === 'f12' || (ctrl && shift) ? 'warning' : 'info';
      this.recordViolation('blocked_shortcut', severity, { key, ctrl, shift, alt });
    }
  }

  /**
   * Handle page unload - warn user
   */
  handleBeforeUnload(event) {
    if (!this.isLocked) return;

    event.preventDefault();
    event.returnValue = 'You are in the middle of a test. Are you sure you want to leave?';
    return event.returnValue;
  }

  /**
   * Disable text selection
   */
  disableTextSelection() {
    const style = document.createElement('style');
    style.id = 'browser-lock-no-select';
    style.textContent = `
      .test-content, .test-content * {
        user-select: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Re-enable text selection
   */
  enableTextSelection() {
    const style = document.getElementById('browser-lock-no-select');
    if (style) style.remove();
  }

  /**
   * Start developer tools detection
   */
  startDevToolsDetection() {
    this.devToolsInterval = setInterval(() => {
      if (!this.isLocked) return;

      // Method 1: Window size difference
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;

      if (widthThreshold || heightThreshold) {
        // Only report once per detection
        if (!this.devToolsDetected) {
          this.devToolsDetected = true;
          this.recordViolation('devtools_open', 'critical');
        }
      } else {
        this.devToolsDetected = false;
      }

      // Method 2: Console detection (debugger statement timing)
      // This is more intrusive, so only use in high-stakes tests
    }, 1000);
  }

  /**
   * Stop developer tools detection
   */
  stopDevToolsDetection() {
    if (this.devToolsInterval) {
      clearInterval(this.devToolsInterval);
      this.devToolsInterval = null;
    }
  }

  /**
   * Record a violation
   */
  recordViolation(type, severity, metadata = {}) {
    const violation = {
      type,
      severity,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.violations.push(violation);

    // Update counts
    if (severity === 'warning') {
      this.warningCount++;
    } else if (severity === 'critical') {
      this.criticalCount++;
    }

    // Notify callback
    this.onViolation(violation);

    // Show warning to user
    if (severity === 'warning' || severity === 'critical') {
      this.showWarningToast(type, severity);
    }

    // Check if should suspend
    if (this.criticalCount >= this.maxCriticalViolations) {
      this.triggerSuspension('Multiple critical violations detected');
    } else if (this.warningCount >= this.maxWarnings) {
      this.triggerSuspension('Too many warnings accumulated');
    }

    console.warn(`[BrowserLock] Violation: ${type} (${severity})`, metadata);
  }

  /**
   * Show warning toast to user
   */
  showWarningToast(type, severity) {
    const messages = {
      'tab_switch': 'Please stay on this tab during the test',
      'window_blur': 'Please keep this window focused',
      'extended_blur': 'You were away from the test for too long',
      'right_click': 'Right-click is disabled during the test',
      'copy_attempt': 'Copy is not allowed during the test',
      'paste_attempt': 'Paste is not allowed during the test',
      'blocked_shortcut': 'This keyboard shortcut is disabled',
      'devtools_open': 'Developer tools are not allowed during the test',
    };

    const message = messages[type] || 'Please follow test guidelines';

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `browser-lock-toast browser-lock-toast-${severity}`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      background: ${severity === 'critical' ? '#f44336' : severity === 'warning' ? '#ff9800' : '#2196f3'};
      color: white;
      border-radius: 8px;
      font-family: sans-serif;
      font-size: 14px;
      z-index: 100000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;
    toast.innerHTML = `
      <strong>${severity === 'critical' ? 'Warning!' : 'Notice'}</strong><br>
      ${message}
    `;

    // Add animation style if not exists
    if (!document.getElementById('browser-lock-toast-style')) {
      const style = document.createElement('style');
      style.id = 'browser-lock-toast-style';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Trigger test suspension
   */
  triggerSuspension(reason) {
    console.error(`[BrowserLock] Test suspended: ${reason}`);
    this.onSuspend(reason, this.violations);
  }

  /**
   * Get violation summary
   */
  getViolationSummary() {
    return {
      total: this.violations.length,
      byType: this.violations.reduce((acc, v) => {
        acc[v.type] = (acc[v.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: {
        info: this.violations.filter(v => v.severity === 'info').length,
        warning: this.warningCount,
        critical: this.criticalCount,
      },
      violations: this.violations,
    };
  }

  /**
   * Reset violation counts (for retries)
   */
  reset() {
    this.violations = [];
    this.warningCount = 0;
    this.criticalCount = 0;
    this.devToolsDetected = false;
    this.blurTime = null;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserLockService;
}
if (typeof window !== 'undefined') {
  window.BrowserLockService = BrowserLockService;
}

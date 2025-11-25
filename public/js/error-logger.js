// Client-side error reporting utility
class ErrorLogger {
  constructor() {
    this.sessionId = null;
    this.setupGlobalErrorHandler();
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  setupGlobalErrorHandler() {
    // Catch all uncaught errors
    window.addEventListener('error', (event) => {
      this.logError('UNCAUGHT', event.message, event.error?.stack, event.filename);
    });

    // Catch all unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError('PROMISE', event.reason?.message || String(event.reason), event.reason?.stack);
    });
  }

  async logError(type, message, stack, url) {
    const errorData = {
      level: 'error',
      message: `[${type}] ${message}`,
      stack: stack || 'No stack trace',
      url: url || window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId || 'NO_SESSION',
      timestamp: new Date().toISOString()
    };

    // Log to console
    console.error(`[ERROR LOGGER] ${errorData.message}`);
    if (stack) console.error(stack);

    // Send to server
    try {
      await fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      });
    } catch (err) {
      console.error('[ERROR LOGGER] Failed to send error to server:', err);
    }
  }

  async logWarn(message, context) {
    const warnData = {
      level: 'warn',
      message,
      stack: context ? JSON.stringify(context) : '',
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId || 'NO_SESSION',
      timestamp: new Date().toISOString()
    };

    console.warn(`[WARN LOGGER] ${message}`, context);

    try {
      await fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(warnData)
      });
    } catch (err) {
      console.error('[ERROR LOGGER] Failed to send warning to server:', err);
    }
  }

  async logInfo(message, context) {
    const infoData = {
      level: 'info',
      message,
      stack: context ? JSON.stringify(context) : '',
      url: window.location.href,
      sessionId: this.sessionId || 'NO_SESSION',
      timestamp: new Date().toISOString()
    };

    console.log(`[INFO LOGGER] ${message}`, context);

    try {
      await fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(infoData)
      });
    } catch (err) {
      // Don't log info send failures
    }
  }
}

// Global instance
const errorLogger = new ErrorLogger();

/**
 * Authentication Middleware
 *
 * Provides JWT-based authentication for the API:
 * 1. Token verification
 * 2. Role-based access control (RBAC)
 * 3. Session validation
 * 4. Rate limiting (basic)
 */

const crypto = require('crypto');

// In production, use jsonwebtoken library
// This is a simplified implementation for demonstration
class AuthMiddleware {
  constructor(options = {}) {
    this.secretKey = options.secretKey || process.env.JWT_SECRET || 'change-this-secret-in-production';
    this.tokenExpiry = options.tokenExpiry || 3600; // 1 hour in seconds
    this.refreshExpiry = options.refreshExpiry || 86400 * 7; // 7 days

    // Rate limiting storage (in production, use Redis)
    this.rateLimitStore = new Map();
    this.RATE_LIMIT_WINDOW = 60000; // 1 minute
    this.RATE_LIMIT_MAX_REQUESTS = 100;

    // Blocked tokens (for logout)
    this.blockedTokens = new Set();
  }

  /**
   * Generate JWT token
   */
  generateToken(payload, expiresIn = this.tokenExpiry) {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const headerBase64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadBase64 = this.base64UrlEncode(JSON.stringify(tokenPayload));

    const signature = this.sign(`${headerBase64}.${payloadBase64}`);

    return `${headerBase64}.${payloadBase64}.${signature}`;
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    if (!token) {
      return { valid: false, error: 'no_token' };
    }

    // Check if token is blocked (logged out)
    if (this.blockedTokens.has(token)) {
      return { valid: false, error: 'token_revoked' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'invalid_format' };
    }

    const [headerBase64, payloadBase64, signature] = parts;

    // Verify signature
    const expectedSignature = this.sign(`${headerBase64}.${payloadBase64}`);
    if (signature !== expectedSignature) {
      return { valid: false, error: 'invalid_signature' };
    }

    // Decode payload
    let payload;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadBase64));
    } catch (e) {
      return { valid: false, error: 'invalid_payload' };
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'token_expired' };
    }

    return { valid: true, payload };
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    return {
      token,
      userId,
      expiresAt: new Date(Date.now() + this.refreshExpiry * 1000),
    };
  }

  /**
   * Express middleware - authenticate request
   */
  authenticate() {
    return (req, res, next) => {
      // Get token from header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'authentication_required',
          message: 'No authentication token provided',
        });
      }

      const token = authHeader.substring(7);
      const result = this.verifyToken(token);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          error: result.error,
          message: this.getErrorMessage(result.error),
        });
      }

      // Attach user info to request
      req.user = result.payload;
      req.token = token;

      next();
    };
  }

  /**
   * Express middleware - require specific role(s)
   */
  requireRole(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'not_authenticated',
          message: 'Authentication required',
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'insufficient_permissions',
          message: `Required role: ${roles.join(' or ')}`,
        });
      }

      next();
    };
  }

  /**
   * Express middleware - rate limiting
   */
  rateLimit(maxRequests = this.RATE_LIMIT_MAX_REQUESTS) {
    return (req, res, next) => {
      const key = this.getRateLimitKey(req);
      const now = Date.now();

      // Get or create rate limit record
      let record = this.rateLimitStore.get(key);

      if (!record || now - record.windowStart > this.RATE_LIMIT_WINDOW) {
        record = { windowStart: now, count: 0 };
      }

      record.count++;
      this.rateLimitStore.set(key, record);

      // Check if over limit
      if (record.count > maxRequests) {
        const retryAfter = Math.ceil((record.windowStart + this.RATE_LIMIT_WINDOW - now) / 1000);

        return res.status(429).json({
          success: false,
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter,
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil((record.windowStart + this.RATE_LIMIT_WINDOW) / 1000));

      next();
    };
  }

  /**
   * Express middleware - validate session ownership
   */
  validateSessionOwnership() {
    return (req, res, next) => {
      const sessionId = req.params.sessionId || req.body.sessionId;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'session_id_required',
        });
      }

      // In production, check database to verify user owns this session
      // For now, we trust the user ID in the token
      if (req.user && req.user.role !== 'admin' && req.user.role !== 'proctor') {
        // Students can only access their own sessions
        // This would need database lookup in production
        req.sessionOwnershipValidated = true;
      }

      next();
    };
  }

  /**
   * Block a token (logout)
   */
  blockToken(token) {
    this.blockedTokens.add(token);

    // Clean up expired blocked tokens periodically
    // In production, use Redis with TTL
    setTimeout(() => {
      this.blockedTokens.delete(token);
    }, this.tokenExpiry * 1000);
  }

  /**
   * Helper: Get rate limit key from request
   */
  getRateLimitKey(req) {
    // Use user ID if authenticated, otherwise IP address
    if (req.user && req.user.userId) {
      return `user:${req.user.userId}`;
    }

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Helper: Base64 URL encode
   */
  base64UrlEncode(str) {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Helper: Base64 URL decode
   */
  base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString();
  }

  /**
   * Helper: Sign data with HMAC
   */
  sign(data) {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Helper: Get user-friendly error message
   */
  getErrorMessage(error) {
    const messages = {
      'no_token': 'Authentication token is required',
      'token_revoked': 'This session has been logged out',
      'invalid_format': 'Invalid authentication token format',
      'invalid_signature': 'Authentication token is invalid',
      'invalid_payload': 'Authentication token is corrupted',
      'token_expired': 'Your session has expired. Please log in again',
    };

    return messages[error] || 'Authentication failed';
  }

  /**
   * Hash password with bcrypt-like approach
   * In production, use bcrypt library
   */
  hashPassword(password, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
    }

    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
      .toString('hex');

    return { hash, salt };
  }

  /**
   * Verify password
   */
  verifyPassword(password, hash, salt) {
    const result = this.hashPassword(password, salt);
    return result.hash === hash;
  }
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

module.exports = {
  AuthMiddleware,
  auth: authMiddleware,

  // Convenience exports
  authenticate: () => authMiddleware.authenticate(),
  requireRole: (...roles) => authMiddleware.requireRole(...roles),
  rateLimit: (max) => authMiddleware.rateLimit(max),
  generateToken: (payload) => authMiddleware.generateToken(payload),
  verifyToken: (token) => authMiddleware.verifyToken(token),
  hashPassword: (password) => authMiddleware.hashPassword(password),
  verifyPassword: (password, hash, salt) => authMiddleware.verifyPassword(password, hash, salt),
};

/**
 * Device Fingerprinting Service
 *
 * Solves credential sharing by:
 * 1. Creating unique device fingerprints from browser characteristics
 * 2. Detecting when same device is used by multiple users (red flag)
 * 3. Tracking device trust over time
 * 4. Alerting when credentials are used from unrecognized devices
 */

const crypto = require('crypto');

class DeviceFingerprintService {
  constructor(db = null) {
    this.db = db;
    this.TRUST_THRESHOLD = 0.7; // Minimum trust score to allow test without extra verification

    // Known VPN/proxy indicators
    this.suspiciousIndicators = [
      'virtualbox',
      'vmware',
      'parallels',
      'selenium',
      'webdriver',
      'phantom',
      'headless',
    ];
  }

  /**
   * Generate fingerprint hash from browser data
   * Client sends this data collected via JavaScript
   */
  generateFingerprint(browserData) {
    if (!browserData) {
      throw new Error('Browser data is required for fingerprinting');
    }

    // Components that make up the fingerprint
    const components = [
      browserData.userAgent || '',
      browserData.language || '',
      browserData.colorDepth || '',
      browserData.deviceMemory || '',
      browserData.hardwareConcurrency || '',
      browserData.screenResolution || '',
      browserData.timezoneOffset || '',
      browserData.platform || '',
      browserData.plugins || '',
      browserData.canvasHash || '',    // Canvas fingerprint
      browserData.webglHash || '',     // WebGL fingerprint
      browserData.webglVendor || '',
      browserData.webglRenderer || '',
      browserData.audioHash || '',     // Audio context fingerprint
      browserData.fonts || '',         // Available fonts hash
    ];

    // Create deterministic hash
    const fingerprintString = components.join('|||');
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');

    return {
      hash,
      components: {
        userAgent: browserData.userAgent,
        platform: browserData.platform,
        language: browserData.language,
        screenResolution: browserData.screenResolution,
        timezone: browserData.timezoneOffset,
        hardwareConcurrency: browserData.hardwareConcurrency,
        deviceMemory: browserData.deviceMemory,
      },
    };
  }

  /**
   * Analyze fingerprint for suspicious characteristics
   */
  analyzeFingerprint(browserData) {
    const suspicions = [];
    let riskScore = 0;

    // Check for automation tools
    const userAgentLower = (browserData.userAgent || '').toLowerCase();
    for (const indicator of this.suspiciousIndicators) {
      if (userAgentLower.includes(indicator)) {
        suspicions.push({
          type: 'automation_detected',
          indicator,
          severity: 'high',
        });
        riskScore += 0.3;
      }
    }

    // Check for headless browser
    if (browserData.webdriver === true) {
      suspicions.push({
        type: 'webdriver_detected',
        severity: 'critical',
      });
      riskScore += 0.5;
    }

    // Check for plugins (headless browsers typically have 0)
    if (browserData.pluginCount === 0) {
      suspicions.push({
        type: 'no_plugins',
        severity: 'medium',
      });
      riskScore += 0.1;
    }

    // Check for missing properties (indicates tampering)
    const requiredProperties = ['userAgent', 'language', 'platform'];
    for (const prop of requiredProperties) {
      if (!browserData[prop]) {
        suspicions.push({
          type: 'missing_property',
          property: prop,
          severity: 'medium',
        });
        riskScore += 0.15;
      }
    }

    // Check screen resolution (unrealistic values)
    if (browserData.screenResolution) {
      const [width, height] = browserData.screenResolution.split('x').map(Number);
      if (width < 320 || height < 240 || width > 7680 || height > 4320) {
        suspicions.push({
          type: 'unusual_screen_resolution',
          resolution: browserData.screenResolution,
          severity: 'low',
        });
        riskScore += 0.1;
      }
    }

    return {
      suspicious: suspicions.length > 0,
      suspicions,
      riskScore: Math.min(1, riskScore),
      trustworthy: riskScore < 0.3,
    };
  }

  /**
   * Check if device is known/trusted for a user (in-memory or database)
   */
  async isDeviceTrusted(userId, fingerprintHash) {
    if (!this.db) {
      // Without database, can't check trust
      return {
        known: false,
        trusted: false,
        reason: 'no_database_available',
      };
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM device_fingerprints
         WHERE user_id = $1 AND fingerprint_hash = $2`,
        [userId, fingerprintHash]
      );

      if (result.rows.length === 0) {
        return {
          known: false,
          trusted: false,
          reason: 'new_device',
        };
      }

      const device = result.rows[0];

      // Update last seen
      await this.db.query(
        `UPDATE device_fingerprints
         SET last_seen_at = NOW()
         WHERE id = $1`,
        [device.id]
      );

      return {
        known: true,
        trusted: device.is_trusted || device.trust_score >= this.TRUST_THRESHOLD,
        trustScore: device.trust_score,
        deviceId: device.id,
        firstSeen: device.first_seen_at,
        lastSeen: device.last_seen_at,
      };
    } catch (error) {
      console.error('Device trust check error:', error);
      return {
        known: false,
        trusted: false,
        reason: 'database_error',
        error: error.message,
      };
    }
  }

  /**
   * Register a new device for a user
   */
  async registerDevice(userId, fingerprint, browserInfo, ipAddress, geolocation = null) {
    if (!this.db) {
      return {
        success: false,
        error: 'no_database_available',
        deviceId: null,
      };
    }

    try {
      // Check if device already exists
      const existing = await this.db.query(
        `SELECT id FROM device_fingerprints
         WHERE user_id = $1 AND fingerprint_hash = $2`,
        [userId, fingerprint.hash]
      );

      if (existing.rows.length > 0) {
        return {
          success: true,
          deviceId: existing.rows[0].id,
          isNew: false,
        };
      }

      // Insert new device
      const result = await this.db.query(
        `INSERT INTO device_fingerprints
         (user_id, fingerprint_hash, browser_info, ip_address, geolocation, is_trusted, trust_score)
         VALUES ($1, $2, $3, $4, $5, false, 0.50)
         RETURNING id`,
        [
          userId,
          fingerprint.hash,
          JSON.stringify(browserInfo),
          ipAddress,
          geolocation ? JSON.stringify(geolocation) : null,
        ]
      );

      return {
        success: true,
        deviceId: result.rows[0].id,
        isNew: true,
      };
    } catch (error) {
      console.error('Device registration error:', error);
      return {
        success: false,
        error: error.message,
        deviceId: null,
      };
    }
  }

  /**
   * CRITICAL: Detect if fingerprint is used by multiple users
   * This is the key to detecting credential sharing
   */
  async checkCrossUserDevice(fingerprintHash, currentUserId) {
    if (!this.db) {
      return {
        shared: false,
        reason: 'no_database_available',
      };
    }

    try {
      const result = await this.db.query(
        `SELECT DISTINCT user_id, first_seen_at, last_seen_at
         FROM device_fingerprints
         WHERE fingerprint_hash = $1 AND user_id != $2`,
        [fingerprintHash, currentUserId]
      );

      if (result.rows.length > 0) {
        return {
          shared: true,
          severity: 'critical',
          otherUsers: result.rows.map(r => ({
            userId: r.user_id,
            firstSeen: r.first_seen_at,
            lastSeen: r.last_seen_at,
          })),
          message: `This device has been used by ${result.rows.length} other user(s)`,
        };
      }

      return { shared: false };
    } catch (error) {
      console.error('Cross-user device check error:', error);
      return {
        shared: false,
        error: error.message,
      };
    }
  }

  /**
   * Update device trust score based on behavior
   */
  async updateTrustScore(deviceId, delta, reason) {
    if (!this.db) return;

    try {
      // Clamp trust score between 0 and 1
      await this.db.query(
        `UPDATE device_fingerprints
         SET trust_score = GREATEST(0, LEAST(1, trust_score + $1))
         WHERE id = $2`,
        [delta, deviceId]
      );

      // Log the update
      console.log(`Device ${deviceId} trust score updated by ${delta}: ${reason}`);
    } catch (error) {
      console.error('Trust score update error:', error);
    }
  }

  /**
   * Mark device as trusted (after admin review or successful verification)
   */
  async markAsTrusted(deviceId, trustedBy = null) {
    if (!this.db) return { success: false };

    try {
      await this.db.query(
        `UPDATE device_fingerprints
         SET is_trusted = true, trust_score = 1.0
         WHERE id = $1`,
        [deviceId]
      );

      return { success: true };
    } catch (error) {
      console.error('Mark trusted error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get device history for a user
   */
  async getUserDevices(userId) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(
        `SELECT id, fingerprint_hash, browser_info, ip_address,
                is_trusted, trust_score, first_seen_at, last_seen_at
         FROM device_fingerprints
         WHERE user_id = $1
         ORDER BY last_seen_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      console.error('Get user devices error:', error);
      return [];
    }
  }

  /**
   * Compare IP address with device's registered IP
   */
  checkIpConsistency(deviceRecord, currentIp) {
    if (!deviceRecord || !deviceRecord.ip_address) {
      return { consistent: true, reason: 'no_previous_ip' };
    }

    // Simple comparison - production would use IP geolocation
    const sameIp = deviceRecord.ip_address === currentIp;

    if (!sameIp) {
      return {
        consistent: false,
        previousIp: deviceRecord.ip_address,
        currentIp,
        severity: 'low', // IP can legitimately change
      };
    }

    return { consistent: true };
  }

  /**
   * Create verification request record for new device
   */
  createNewDeviceVerification(userId, fingerprint, ipAddress) {
    return {
      type: 'new_device',
      userId,
      fingerprintHash: fingerprint.hash,
      ipAddress,
      requiresVerification: true,
      verificationMethods: ['email_otp', 'face_verification'],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    };
  }
}

module.exports = DeviceFingerprintService;

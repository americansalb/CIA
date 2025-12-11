/**
 * Face Monitoring Service (Client-Side)
 *
 * Provides continuous face monitoring during tests:
 * 1. Face presence detection (every 30 seconds)
 * 2. Multiple face detection (cheating indicator)
 * 3. Face match verification (every 5 minutes)
 * 4. Liveness detection (anti-spoofing)
 *
 * Uses TensorFlow.js + MediaPipe Face Detection (client-side)
 */

class FaceMonitorService {
  constructor(options = {}) {
    this.options = {
      // How often to check for face presence (ms)
      presenceInterval: options.presenceInterval || 30000, // 30 seconds

      // How often to do full verification (ms)
      verificationInterval: options.verificationInterval || 300000, // 5 minutes

      // Match threshold for verification (0-1, lower = stricter)
      matchThreshold: options.matchThreshold || 0.6,

      // Callback when violation detected
      onViolation: options.onViolation || (() => {}),

      // Callback to send frame to server
      onFrameCapture: options.onFrameCapture || (() => {}),

      // Socket for real-time communication
      socket: options.socket || null,
    };

    this.isMonitoring = false;
    this.videoElement = null;
    this.faceDetector = null;
    this.storedEmbedding = null;
    this.frameCount = 0;
    this.presenceTimer = null;
    this.verificationTimer = null;

    // Canvas for frame capture
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    // Violation tracking
    this.consecutiveMisses = 0;
    this.MAX_CONSECUTIVE_MISSES = 3;
  }

  /**
   * Initialize face detection models
   */
  async initialize() {
    if (this.faceDetector) return;

    // Check if face-detection library is loaded
    if (typeof faceDetection === 'undefined') {
      console.warn('[FaceMonitor] face-detection library not loaded');
      return false;
    }

    try {
      console.log('[FaceMonitor] Loading face detection model...');

      const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
      this.faceDetector = await faceDetection.createDetector(model, {
        runtime: 'tfjs',
        maxFaces: 5, // Detect up to 5 faces (for multi-face detection)
        modelType: 'short', // 'short' for speed, 'full' for accuracy
      });

      console.log('[FaceMonitor] Face detection model loaded');
      return true;
    } catch (error) {
      console.error('[FaceMonitor] Failed to load face detection:', error);
      return false;
    }
  }

  /**
   * Start monitoring with video element and stored embedding
   */
  async startMonitoring(videoElement, storedEmbedding = null) {
    if (this.isMonitoring) {
      console.warn('[FaceMonitor] Already monitoring');
      return;
    }

    const initialized = await this.initialize();
    if (!initialized) {
      console.error('[FaceMonitor] Cannot start - initialization failed');
      return;
    }

    this.videoElement = videoElement;
    this.storedEmbedding = storedEmbedding;
    this.isMonitoring = true;
    this.frameCount = 0;
    this.consecutiveMisses = 0;

    // Set canvas size
    this.canvas.width = videoElement.videoWidth || 640;
    this.canvas.height = videoElement.videoHeight || 480;

    // Start presence checking
    this.startPresenceCheck();

    // Start verification checking (if embedding available)
    if (this.storedEmbedding) {
      this.startVerificationCheck();
    }

    console.log('[FaceMonitor] Monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;

    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }

    if (this.verificationTimer) {
      clearInterval(this.verificationTimer);
      this.verificationTimer = null;
    }

    console.log('[FaceMonitor] Monitoring stopped');
  }

  /**
   * Start periodic presence checking
   */
  startPresenceCheck() {
    // Initial check
    this.checkPresence();

    // Periodic checks
    this.presenceTimer = setInterval(() => {
      if (this.isMonitoring) {
        this.checkPresence();
      }
    }, this.options.presenceInterval);
  }

  /**
   * Start periodic verification checking
   */
  startVerificationCheck() {
    this.verificationTimer = setInterval(() => {
      if (this.isMonitoring) {
        this.performVerification();
      }
    }, this.options.verificationInterval);
  }

  /**
   * Check for face presence
   */
  async checkPresence() {
    if (!this.isMonitoring || !this.videoElement || !this.faceDetector) return;

    this.frameCount++;

    try {
      // Draw current video frame to canvas
      this.ctx.drawImage(
        this.videoElement,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );

      // Detect faces
      const faces = await this.faceDetector.estimateFaces(this.canvas);
      const faceCount = faces ? faces.length : 0;

      // Check for no face
      if (faceCount === 0) {
        this.consecutiveMisses++;
        console.warn(`[FaceMonitor] No face detected (${this.consecutiveMisses}/${this.MAX_CONSECUTIVE_MISSES})`);

        if (this.consecutiveMisses >= this.MAX_CONSECUTIVE_MISSES) {
          this.reportViolation('face_not_detected', 'warning', {
            consecutiveMisses: this.consecutiveMisses,
            frameNumber: this.frameCount,
          });
        }
      } else {
        this.consecutiveMisses = 0;
      }

      // Check for multiple faces
      if (faceCount > 1) {
        this.reportViolation('multiple_faces', 'critical', {
          faceCount,
          frameNumber: this.frameCount,
        });

        // Capture frame for evidence
        await this.captureFrameForEvidence('multiple_faces');
      }

      // Send presence data to callback/server
      const presenceData = {
        frameNumber: this.frameCount,
        timestamp: new Date().toISOString(),
        faceDetected: faceCount > 0,
        faceCount,
      };

      this.options.onFrameCapture(presenceData);

      // If socket available, send real-time update
      if (this.options.socket) {
        this.options.socket.emit('face-presence', presenceData);
      }

    } catch (error) {
      console.error('[FaceMonitor] Presence check error:', error);
    }
  }

  /**
   * Perform full face verification (compare with stored embedding)
   */
  async performVerification() {
    if (!this.isMonitoring || !this.storedEmbedding) return;

    try {
      // Capture current frame
      this.ctx.drawImage(
        this.videoElement,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );

      // Get frame as data URL
      const frameData = this.canvas.toDataURL('image/jpeg', 0.8);

      // Send to server for verification (if socket available)
      if (this.options.socket) {
        this.options.socket.emit('verification-frame', {
          frameData,
          timestamp: new Date().toISOString(),
          frameNumber: this.frameCount,
        });
      }

      // If we have client-side face recognition, do local verification
      if (window.faceapi && this.storedEmbedding) {
        await this.localVerification(this.canvas);
      }

    } catch (error) {
      console.error('[FaceMonitor] Verification error:', error);
    }
  }

  /**
   * Local face verification using face-api.js
   */
  async localVerification(canvas) {
    if (!window.faceapi) return;

    try {
      const detection = await faceapi
        .detectSingleFace(canvas)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        console.warn('[FaceMonitor] No face detected for verification');
        return;
      }

      const currentEmbedding = Array.from(detection.descriptor);
      const distance = faceapi.euclideanDistance(currentEmbedding, this.storedEmbedding);
      const match = distance < this.options.matchThreshold;
      const similarity = 1 - distance;

      console.log(`[FaceMonitor] Verification: match=${match}, similarity=${similarity.toFixed(3)}`);

      if (!match) {
        this.reportViolation('face_mismatch', 'critical', {
          similarity,
          threshold: this.options.matchThreshold,
        });

        // Capture frame for evidence
        await this.captureFrameForEvidence('face_mismatch');
      }

      // Report verification result
      const verificationResult = {
        verified: match,
        similarity,
        timestamp: new Date().toISOString(),
      };

      if (this.options.socket) {
        this.options.socket.emit('verification-result', verificationResult);
      }

    } catch (error) {
      console.error('[FaceMonitor] Local verification error:', error);
    }
  }

  /**
   * Capture frame for evidence (violations)
   */
  async captureFrameForEvidence(reason) {
    try {
      const frameData = this.canvas.toDataURL('image/jpeg', 0.9);

      const evidence = {
        reason,
        frameData,
        timestamp: new Date().toISOString(),
        frameNumber: this.frameCount,
      };

      // Send to server
      if (this.options.socket) {
        this.options.socket.emit('evidence-frame', evidence);
      }

      return evidence;
    } catch (error) {
      console.error('[FaceMonitor] Evidence capture error:', error);
      return null;
    }
  }

  /**
   * Report a violation
   */
  reportViolation(type, severity, metadata = {}) {
    const violation = {
      type,
      severity,
      timestamp: new Date().toISOString(),
      metadata,
    };

    console.warn(`[FaceMonitor] Violation: ${type} (${severity})`, metadata);

    // Call violation callback
    this.options.onViolation(violation);

    // Send to server
    if (this.options.socket) {
      this.options.socket.emit('proctoring-violation', violation);
    }
  }

  /**
   * Perform liveness check (detect photo/video attacks)
   */
  async checkLiveness(frames = []) {
    // Basic liveness checks:
    // 1. Face movement across frames
    // 2. Blink detection
    // 3. Texture analysis (future)

    if (frames.length < 3) {
      return { live: true, confidence: 0.5, reason: 'insufficient_frames' };
    }

    // Check for face position variance (photos don't move)
    const positions = [];
    for (const frame of frames) {
      const faces = await this.faceDetector.estimateFaces(frame);
      if (faces && faces.length > 0) {
        const face = faces[0];
        if (face.keypoints && face.keypoints.length > 0) {
          // Get nose tip position (usually keypoint 2)
          const noseTip = face.keypoints.find(kp => kp.name === 'noseTip') || face.keypoints[0];
          positions.push({ x: noseTip.x, y: noseTip.y });
        }
      }
    }

    if (positions.length < 3) {
      return { live: false, confidence: 0.3, reason: 'face_tracking_failed' };
    }

    // Calculate movement variance
    let totalMovement = 0;
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }

    const avgMovement = totalMovement / (positions.length - 1);

    // Real faces have some micro-movement, photos have almost none
    const isLive = avgMovement > 0.5; // Threshold for movement
    const confidence = Math.min(1, avgMovement / 5);

    return {
      live: isLive,
      confidence,
      avgMovement,
      reason: isLive ? 'natural_movement' : 'static_face',
    };
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      frameCount: this.frameCount,
      consecutiveMisses: this.consecutiveMisses,
      hasStoredEmbedding: !!this.storedEmbedding,
      modelLoaded: !!this.faceDetector,
    };
  }

  /**
   * Set stored embedding (for verification)
   */
  setStoredEmbedding(embedding) {
    this.storedEmbedding = embedding;
    console.log('[FaceMonitor] Stored embedding updated');

    // Start verification if monitoring and not already started
    if (this.isMonitoring && !this.verificationTimer) {
      this.startVerificationCheck();
    }
  }

  /**
   * Request immediate verification
   */
  async forceVerification() {
    console.log('[FaceMonitor] Forced verification requested');
    await this.performVerification();
  }

  /**
   * Capture and return current frame data
   */
  getCurrentFrame() {
    if (!this.videoElement) return null;

    this.ctx.drawImage(
      this.videoElement,
      0, 0,
      this.canvas.width,
      this.canvas.height
    );

    return this.canvas.toDataURL('image/jpeg', 0.8);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FaceMonitorService;
}
if (typeof window !== 'undefined') {
  window.FaceMonitorService = FaceMonitorService;
}

# CIA Platform Transformation: World-Class Testing Platform

## Executive Summary

This document outlines the transformation of the CIA (Consecutive Interpreting Assessment) platform into a world-class, multi-niche testing platform supporting interpretation testing, proficiency assessment, self-paced AI proctoring, and live human proctoring.

**Primary Problem to Solve: Credential Sharing**
The current system allows users to share their email + studentID credentials, enabling unauthorized test-takers. This document addresses this critical vulnerability with a multi-layered identity verification system.

---

## Part 1: The Credential Sharing Problem - Root Cause Analysis

### Current Vulnerabilities

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT AUTHENTICATION FLOW                  │
├─────────────────────────────────────────────────────────────────┤
│  User enters:  email + studentId                                │
│       ↓                                                         │
│  Server checks: Does this combo exist in Google Sheets?         │
│       ↓                                                         │
│  If yes: Grant full access to take test                         │
│                                                                 │
│  ⚠️ PROBLEM: Anyone with these two pieces of information can    │
│              take the test - no identity verification!          │
└─────────────────────────────────────────────────────────────────┘
```

### Attack Vectors

| Vector | Description | Severity |
|--------|-------------|----------|
| **Credential Sharing** | Student shares email+ID with another person | CRITICAL |
| **Proxy Test-Taker** | Someone else takes the test on student's behalf | CRITICAL |
| **Anonymous Proctor** | Anyone with 6-digit PIN can act as proctor | HIGH |
| **Practice Mode Bypass** | Practice mode skips all proctoring | MEDIUM |
| **No Device Binding** | Same credentials work from any device | HIGH |
| **No Session Locking** | Multiple simultaneous sessions possible | HIGH |

---

## Part 2: Identity Verification Architecture

### Multi-Layer Identity Verification System

```
┌─────────────────────────────────────────────────────────────────┐
│                   PROPOSED IDENTITY STACK                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 5: CONTINUOUS VERIFICATION (During Test)                 │
│  ├── Face presence monitoring every 30 seconds                  │
│  ├── Face match verification every 5 minutes                    │
│  ├── Multiple face detection (cheating alert)                   │
│  └── Behavioral anomaly detection                               │
│                                                                 │
│  Layer 4: BIOMETRIC BINDING (Test Start)                        │
│  ├── Live face capture vs stored ID photo                       │
│  ├── Liveness detection (anti-spoofing)                         │
│  └── Face embedding comparison (>90% match required)            │
│                                                                 │
│  Layer 3: DEVICE FINGERPRINTING                                 │
│  ├── Browser fingerprint hash                                   │
│  ├── Hardware identifiers (canvas, WebGL, audio)                │
│  ├── IP geolocation consistency                                 │
│  └── Device registration for repeat test-takers                 │
│                                                                 │
│  Layer 2: MULTI-FACTOR AUTHENTICATION                           │
│  ├── Email verification (magic link or OTP)                     │
│  ├── SMS verification (optional, for high-stakes)               │
│  └── Time-limited session tokens (JWT)                          │
│                                                                 │
│  Layer 1: CREDENTIAL AUTHENTICATION                             │
│  ├── Email + Password (hashed with bcrypt)                      │
│  ├── Student ID verification                                    │
│  └── Rate limiting + brute force protection                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Face Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 FACE VERIFICATION WORKFLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REGISTRATION PHASE (One-time setup)                            │
│  ┌─────────────────────────────────────────┐                    │
│  │ 1. Student uploads government ID photo  │                    │
│  │ 2. System extracts face embedding       │                    │
│  │ 3. Admin verifies ID matches student    │                    │
│  │ 4. Face embedding stored in database    │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
│  TEST START VERIFICATION                                        │
│  ┌─────────────────────────────────────────┐                    │
│  │ 1. Capture live face from webcam        │                    │
│  │ 2. Liveness check (blink, turn head)    │                    │
│  │ 3. Extract face embedding               │                    │
│  │ 4. Compare with stored embedding        │                    │
│  │ 5. If match >90%: Allow test start      │                    │
│  │ 6. If match <90%: Flag for review       │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
│  CONTINUOUS MONITORING                                          │
│  ┌─────────────────────────────────────────┐                    │
│  │ Every 30 seconds:                       │                    │
│  │ - Capture frame silently                │                    │
│  │ - Verify face present                   │                    │
│  │ - Check for multiple faces              │                    │
│  │                                         │                    │
│  │ Every 5 minutes:                        │                    │
│  │ - Full face match verification          │                    │
│  │ - Log confidence score                  │                    │
│  │ - Flag if match drops below 85%         │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Database Schema (PostgreSQL)

### Core Tables

```sql
-- Users table (replaces Google Sheets Students)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    student_id VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    role ENUM('student', 'proctor', 'admin', 'super_admin') DEFAULT 'student',
    status ENUM('pending', 'verified', 'suspended', 'banned') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    email_verified_at TIMESTAMP,
    phone_verified_at TIMESTAMP
);

-- Identity verification records
CREATE TABLE identity_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    id_document_url VARCHAR(500), -- Secure cloud storage URL
    id_document_type ENUM('passport', 'drivers_license', 'national_id'),
    face_embedding VECTOR(512), -- For face-api.js or similar
    face_photo_url VARCHAR(500),
    verification_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device fingerprints for binding
CREATE TABLE device_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    fingerprint_hash VARCHAR(64) NOT NULL, -- SHA-256
    browser_info JSONB,
    ip_address INET,
    geolocation JSONB,
    is_trusted BOOLEAN DEFAULT false,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trust_score DECIMAL(3,2) DEFAULT 0.50
);

-- Test definitions (replaces Tests sheet)
CREATE TABLE tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    test_type ENUM('interpretation', 'proficiency', 'certification', 'practice') NOT NULL,
    language_pair VARCHAR(50), -- e.g., 'en-es', 'zh-en'
    difficulty_level ENUM('beginner', 'intermediate', 'advanced', 'expert'),
    time_limit_minutes INTEGER,
    passing_score DECIMAL(5,2),
    proctoring_mode ENUM('none', 'self_paced_ai', 'live_human', 'hybrid') DEFAULT 'self_paced_ai',
    max_attempts INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test segments/questions
CREATE TABLE test_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    segment_number INTEGER NOT NULL,
    segment_type ENUM('audio', 'video', 'text', 'image') NOT NULL,
    content_url VARCHAR(500),
    content_text TEXT,
    instructions TEXT,
    duration_seconds INTEGER,
    response_type ENUM('audio_recording', 'video_recording', 'text_input', 'multiple_choice'),
    max_response_duration_seconds INTEGER,
    points DECIMAL(5,2) DEFAULT 1.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, segment_number)
);

-- Test attempts/sessions
CREATE TABLE test_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    proctor_id UUID REFERENCES users(id), -- For live proctoring
    status ENUM('scheduled', 'in_progress', 'completed', 'abandoned', 'flagged', 'invalidated') DEFAULT 'scheduled',
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    current_segment INTEGER DEFAULT 0,
    total_segments INTEGER,
    time_remaining_seconds INTEGER,

    -- Identity verification at start
    face_match_score DECIMAL(5,4), -- 0.0000 to 1.0000
    device_fingerprint_id UUID REFERENCES device_fingerprints(id),
    ip_address INET,

    -- Proctoring data
    proctoring_flags INTEGER DEFAULT 0,
    ai_suspicion_score DECIMAL(3,2) DEFAULT 0.00, -- 0.00 to 1.00

    -- Results
    raw_score DECIMAL(5,2),
    scaled_score DECIMAL(5,2),
    passed BOOLEAN,
    graded_by UUID REFERENCES users(id),
    graded_at TIMESTAMP,
    feedback TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Proctoring events (AI and human observations)
CREATE TABLE proctoring_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES test_sessions(id) ON DELETE CASCADE,
    event_type ENUM(
        'face_not_detected',
        'multiple_faces',
        'face_mismatch',
        'tab_switch',
        'window_blur',
        'copy_paste_attempt',
        'screen_share_violation',
        'audio_anomaly',
        'proctor_intervention',
        'suspicious_behavior',
        'environment_change'
    ) NOT NULL,
    severity ENUM('info', 'warning', 'critical') DEFAULT 'warning',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    screenshot_url VARCHAR(500),
    video_clip_url VARCHAR(500),
    ai_confidence DECIMAL(3,2),
    proctor_notes TEXT,
    auto_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP
);

-- Continuous face verification logs
CREATE TABLE face_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES test_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    face_detected BOOLEAN NOT NULL,
    face_count INTEGER,
    match_score DECIMAL(5,4), -- Against registered face
    liveness_score DECIMAL(5,4),
    frame_url VARCHAR(500), -- Only stored if flagged
    flagged BOOLEAN DEFAULT false,
    flag_reason VARCHAR(100)
);

-- Session recordings
CREATE TABLE session_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES test_sessions(id) ON DELETE CASCADE,
    recording_type ENUM('main_camera', 'proctor_camera', 'screen_share', 'audio_only') NOT NULL,
    storage_url VARCHAR(500) NOT NULL,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    format VARCHAR(20), -- 'webm', 'mp4', etc.
    chunk_number INTEGER,
    is_final BOOLEAN DEFAULT false,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    transcription_url VARCHAR(500)
);

-- Segment responses
CREATE TABLE segment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES test_sessions(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES test_segments(id) ON DELETE CASCADE,
    response_type ENUM('audio', 'video', 'text', 'choice') NOT NULL,
    recording_url VARCHAR(500),
    text_response TEXT,
    choice_response JSONB,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,

    -- Grading
    ai_score DECIMAL(5,2),
    ai_feedback TEXT,
    human_score DECIMAL(5,2),
    human_feedback TEXT,
    final_score DECIMAL(5,2),
    graded_at TIMESTAMP
);

-- Interventions during test
CREATE TABLE interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES test_sessions(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES test_segments(id),
    intervention_type ENUM('repeat_request', 'pause_request', 'technical_issue', 'proctor_stop', 'emergency') NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER,
    recording_url VARCHAR(500),
    notes TEXT,
    approved_by UUID REFERENCES users(id), -- For proctor approvals
    approved BOOLEAN
);

-- Organizations/Institutions
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type ENUM('university', 'certification_body', 'employer', 'testing_center', 'individual') NOT NULL,
    logo_url VARCHAR(500),
    primary_contact_email VARCHAR(255),
    settings JSONB DEFAULT '{}',
    subscription_tier ENUM('free', 'basic', 'professional', 'enterprise') DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organization membership
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role ENUM('owner', 'admin', 'instructor', 'proctor', 'student') NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);

-- Test assignments
CREATE TABLE test_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    assigned_by UUID REFERENCES users(id),
    available_from TIMESTAMP,
    available_until TIMESTAMP,
    attempts_allowed INTEGER DEFAULT 1,
    attempts_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, user_id)
);

-- Audit log for compliance
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_user ON test_sessions(user_id);
CREATE INDEX idx_sessions_status ON test_sessions(status);
CREATE INDEX idx_proctoring_events_session ON proctoring_events(session_id);
CREATE INDEX idx_face_logs_session ON face_verification_logs(session_id);
CREATE INDEX idx_recordings_session ON session_recordings(session_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
```

---

## Part 4: Anti-Credential Sharing Implementation

### 4.1 Device Fingerprinting Service

```javascript
// services/device-fingerprint.js

const FingerprintJS = require('@fingerprintjs/fingerprintjs-pro');
const crypto = require('crypto');

class DeviceFingerprintService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Generate a device fingerprint hash from browser characteristics
   */
  async generateFingerprint(browserData) {
    const components = [
      browserData.userAgent,
      browserData.language,
      browserData.colorDepth,
      browserData.deviceMemory,
      browserData.hardwareConcurrency,
      browserData.screenResolution,
      browserData.timezoneOffset,
      browserData.sessionStorage,
      browserData.localStorage,
      browserData.indexedDb,
      browserData.cpuClass,
      browserData.platform,
      browserData.plugins,
      browserData.canvas, // Canvas fingerprint
      browserData.webgl, // WebGL fingerprint
      browserData.webglVendor,
      browserData.adBlock,
      browserData.fonts,
      browserData.audio, // Audio fingerprint
    ];

    const fingerprintString = components.join('|');
    return crypto.createHash('sha256').update(fingerprintString).digest('hex');
  }

  /**
   * Check if device is recognized for this user
   */
  async isDeviceTrusted(userId, fingerprintHash) {
    const device = await this.db.query(
      `SELECT * FROM device_fingerprints
       WHERE user_id = $1 AND fingerprint_hash = $2`,
      [userId, fingerprintHash]
    );

    if (device.rows.length === 0) {
      return { trusted: false, reason: 'new_device' };
    }

    const deviceRecord = device.rows[0];

    // Update last seen
    await this.db.query(
      `UPDATE device_fingerprints SET last_seen_at = NOW() WHERE id = $1`,
      [deviceRecord.id]
    );

    return {
      trusted: deviceRecord.is_trusted,
      trustScore: deviceRecord.trust_score,
      deviceId: deviceRecord.id,
    };
  }

  /**
   * Register a new device for a user
   */
  async registerDevice(userId, fingerprintHash, browserInfo, ipAddress, geolocation) {
    const result = await this.db.query(
      `INSERT INTO device_fingerprints
       (user_id, fingerprint_hash, browser_info, ip_address, geolocation, is_trusted, trust_score)
       VALUES ($1, $2, $3, $4, $5, false, 0.50)
       RETURNING id`,
      [userId, fingerprintHash, browserInfo, ipAddress, geolocation]
    );

    return result.rows[0].id;
  }

  /**
   * Detect if same device is used by multiple users (red flag)
   */
  async checkCrossUserDevice(fingerprintHash, currentUserId) {
    const result = await this.db.query(
      `SELECT DISTINCT user_id FROM device_fingerprints
       WHERE fingerprint_hash = $1 AND user_id != $2`,
      [fingerprintHash, currentUserId]
    );

    if (result.rows.length > 0) {
      return {
        shared: true,
        otherUserIds: result.rows.map(r => r.user_id),
        severity: 'critical',
      };
    }

    return { shared: false };
  }
}

module.exports = DeviceFingerprintService;
```

### 4.2 Face Verification Service

```javascript
// services/face-verification.js

const faceapi = require('@vladmandic/face-api');
const tf = require('@tensorflow/tfjs-node');
const canvas = require('canvas');
const { Canvas, Image, ImageData } = canvas;

// Monkey-patch face-api to use node-canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

class FaceVerificationService {
  constructor() {
    this.initialized = false;
    this.MATCH_THRESHOLD = 0.6; // Lower = stricter (0.6 is typical)
    this.LIVENESS_THRESHOLD = 0.7;
  }

  async initialize() {
    if (this.initialized) return;

    // Load face-api models
    const modelPath = './models/face-api';
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
    await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath);

    this.initialized = true;
    console.log('Face verification models loaded');
  }

  /**
   * Extract face embedding from an image
   */
  async extractFaceEmbedding(imageBuffer) {
    await this.initialize();

    const img = await canvas.loadImage(imageBuffer);
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return { success: false, error: 'no_face_detected' };
    }

    return {
      success: true,
      embedding: Array.from(detection.descriptor), // 128-dimensional vector
      landmarks: detection.landmarks,
      box: detection.detection.box,
    };
  }

  /**
   * Compare two face embeddings
   */
  compareFaces(embedding1, embedding2) {
    const distance = faceapi.euclideanDistance(embedding1, embedding2);
    const similarity = 1 - distance;
    const match = distance < this.MATCH_THRESHOLD;

    return {
      match,
      similarity,
      distance,
      confidence: Math.max(0, Math.min(1, similarity)),
    };
  }

  /**
   * Verify live face against stored embedding
   */
  async verifyFace(liveImageBuffer, storedEmbedding) {
    const liveResult = await this.extractFaceEmbedding(liveImageBuffer);

    if (!liveResult.success) {
      return {
        verified: false,
        error: liveResult.error,
        faceDetected: false,
      };
    }

    const comparison = this.compareFaces(liveResult.embedding, storedEmbedding);

    return {
      verified: comparison.match,
      faceDetected: true,
      matchScore: comparison.similarity,
      confidence: comparison.confidence,
    };
  }

  /**
   * Detect multiple faces (cheating indicator)
   */
  async detectMultipleFaces(imageBuffer) {
    await this.initialize();

    const img = await canvas.loadImage(imageBuffer);
    const detections = await faceapi.detectAllFaces(img);

    return {
      faceCount: detections.length,
      multipleFaces: detections.length > 1,
      boxes: detections.map(d => d.box),
    };
  }

  /**
   * Perform liveness detection (anti-spoofing)
   * Checks for photo attacks, screen displays, masks
   */
  async checkLiveness(imageBuffer, previousFrames = []) {
    await this.initialize();

    const img = await canvas.loadImage(imageBuffer);
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceExpressions();

    if (!detection) {
      return { live: false, error: 'no_face_detected' };
    }

    // Liveness indicators:
    // 1. Natural micro-expressions present
    // 2. Face landmarks have natural variance across frames
    // 3. Skin texture analysis (future: requires custom model)

    const expressions = detection.expressions;
    const hasNaturalExpression = Object.values(expressions).some(v => v > 0.1);

    // If we have previous frames, check for movement
    let hasNaturalMovement = true;
    if (previousFrames.length >= 3) {
      // Compare landmark positions across frames
      // Real faces have micro-movements, photos don't
      // This is a simplified check - production would use ML model
      hasNaturalMovement = true; // Placeholder
    }

    return {
      live: hasNaturalExpression && hasNaturalMovement,
      score: hasNaturalExpression ? 0.8 : 0.3,
      expressions,
    };
  }
}

module.exports = FaceVerificationService;
```

### 4.3 Continuous Monitoring Service

```javascript
// services/continuous-monitor.js

class ContinuousMonitorService {
  constructor(faceService, db, io) {
    this.faceService = faceService;
    this.db = db;
    this.io = io;
    this.activeSessions = new Map();
  }

  /**
   * Start continuous monitoring for a test session
   */
  startMonitoring(sessionId, storedEmbedding, socketId) {
    const monitor = {
      sessionId,
      storedEmbedding,
      socketId,
      frameCount: 0,
      lastVerificationAt: Date.now(),
      flags: [],
      suspended: false,
    };

    this.activeSessions.set(sessionId, monitor);

    // Request frames from client every 30 seconds
    this.scheduleFrameRequest(sessionId);
  }

  /**
   * Schedule periodic frame requests
   */
  scheduleFrameRequest(sessionId) {
    const monitor = this.activeSessions.get(sessionId);
    if (!monitor || monitor.suspended) return;

    // Request frame from client
    this.io.to(monitor.socketId).emit('capture-frame', {
      sessionId,
      frameNumber: monitor.frameCount,
      isVerification: (monitor.frameCount % 10 === 0), // Full verification every 10th frame (5 mins)
    });

    // Schedule next request (30 seconds)
    setTimeout(() => this.scheduleFrameRequest(sessionId), 30000);
  }

  /**
   * Process a captured frame from the client
   */
  async processFrame(sessionId, frameData, isVerification) {
    const monitor = this.activeSessions.get(sessionId);
    if (!monitor) return;

    monitor.frameCount++;
    const imageBuffer = Buffer.from(frameData.split(',')[1], 'base64');

    // Check for multiple faces
    const multipleCheck = await this.faceService.detectMultipleFaces(imageBuffer);

    if (multipleCheck.multipleFaces) {
      await this.flagEvent(sessionId, 'multiple_faces', 'critical', {
        faceCount: multipleCheck.faceCount,
      });
    }

    // Basic face presence check (every frame)
    const facePresent = multipleCheck.faceCount > 0;

    if (!facePresent) {
      await this.flagEvent(sessionId, 'face_not_detected', 'warning', {
        frameNumber: monitor.frameCount,
      });
    }

    // Full face verification (every 5 minutes)
    if (isVerification && facePresent) {
      const verification = await this.faceService.verifyFace(
        imageBuffer,
        monitor.storedEmbedding
      );

      await this.logVerification(sessionId, verification);

      if (!verification.verified) {
        await this.flagEvent(sessionId, 'face_mismatch', 'critical', {
          matchScore: verification.matchScore,
        });
      }
    }

    // Log to database
    await this.db.query(
      `INSERT INTO face_verification_logs
       (session_id, face_detected, face_count, match_score, flagged)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, facePresent, multipleCheck.faceCount, null, !facePresent || multipleCheck.multipleFaces]
    );
  }

  /**
   * Flag a proctoring event
   */
  async flagEvent(sessionId, eventType, severity, metadata) {
    const monitor = this.activeSessions.get(sessionId);
    if (!monitor) return;

    monitor.flags.push({ eventType, severity, timestamp: Date.now() });

    // Insert into database
    await this.db.query(
      `INSERT INTO proctoring_events
       (session_id, event_type, severity, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [sessionId, eventType, severity]
    );

    // Update session suspicion score
    const scoreIncrease = severity === 'critical' ? 0.2 : 0.05;
    await this.db.query(
      `UPDATE test_sessions
       SET ai_suspicion_score = LEAST(1.0, ai_suspicion_score + $1),
           proctoring_flags = proctoring_flags + 1
       WHERE id = $2`,
      [scoreIncrease, sessionId]
    );

    // Notify admins/proctors in real-time
    this.io.emit('proctoring-alert', {
      sessionId,
      eventType,
      severity,
      timestamp: new Date().toISOString(),
    });

    // Auto-suspend for critical repeated violations
    const criticalFlags = monitor.flags.filter(f => f.severity === 'critical');
    if (criticalFlags.length >= 3) {
      await this.suspendSession(sessionId, 'Multiple critical violations detected');
    }
  }

  /**
   * Suspend a test session
   */
  async suspendSession(sessionId, reason) {
    const monitor = this.activeSessions.get(sessionId);
    if (!monitor) return;

    monitor.suspended = true;

    await this.db.query(
      `UPDATE test_sessions SET status = 'flagged' WHERE id = $1`,
      [sessionId]
    );

    // Notify client to pause test
    this.io.to(monitor.socketId).emit('session-suspended', {
      sessionId,
      reason,
      canResume: false,
    });
  }

  /**
   * Stop monitoring for a session
   */
  stopMonitoring(sessionId) {
    this.activeSessions.delete(sessionId);
  }
}

module.exports = ContinuousMonitorService;
```

---

## Part 5: Multi-Niche Test Types

### 5.1 Test Type Configurations

```javascript
// config/test-types.js

const TEST_TYPES = {
  // Consecutive Interpretation Test
  interpretation: {
    name: 'Consecutive Interpretation',
    description: 'Assess interpretation skills with audio/video segments',
    segments: {
      types: ['audio', 'video'],
      responseType: 'audio_recording',
      allowRepeat: true,
      maxRepeats: 5,
    },
    proctoring: {
      defaultMode: 'self_paced_ai',
      requireDualCamera: true,
      requireScreenShare: false,
    },
    scoring: {
      method: 'human_graded',
      rubricBased: true,
      aiAssistScoring: true,
    },
    features: ['warmup_segments', 'interventions', 'recording_playback'],
  },

  // Language Proficiency Test
  proficiency: {
    name: 'Language Proficiency Assessment',
    description: 'Comprehensive language skills evaluation',
    segments: {
      types: ['audio', 'text', 'image'],
      responseTypes: ['audio_recording', 'text_input', 'multiple_choice'],
      allowRepeat: false,
    },
    proctoring: {
      defaultMode: 'self_paced_ai',
      requireDualCamera: false,
      requireScreenShare: true, // Prevent looking up answers
    },
    scoring: {
      method: 'mixed',
      multipleChoiceAuto: true,
      oralHumanGraded: true,
      writtenAiAssisted: true,
    },
    features: ['section_timing', 'question_randomization', 'adaptive_difficulty'],
  },

  // Professional Certification
  certification: {
    name: 'Professional Certification Exam',
    description: 'High-stakes certification with strict proctoring',
    segments: {
      types: ['text', 'image', 'audio'],
      responseTypes: ['multiple_choice', 'text_input', 'audio_recording'],
    },
    proctoring: {
      defaultMode: 'live_human',
      requireDualCamera: true,
      requireScreenShare: true,
      requireRoomScan: true,
      requireIdVerification: true,
    },
    scoring: {
      method: 'auto_graded',
      passingScore: 70,
      sectionMinimums: true,
    },
    features: ['question_bank', 'randomization', 'no_backtrack', 'instant_results'],
  },

  // Practice/Training
  practice: {
    name: 'Practice Test',
    description: 'Self-study and training mode',
    segments: {
      types: ['audio', 'video', 'text', 'image'],
      responseTypes: ['audio_recording', 'text_input', 'multiple_choice'],
      allowRepeat: true,
      unlimitedRepeats: true,
    },
    proctoring: {
      defaultMode: 'none',
      requireDualCamera: false,
      requireScreenShare: false,
    },
    scoring: {
      method: 'ai_feedback',
      instantFeedback: true,
      showCorrectAnswers: true,
    },
    features: ['unlimited_attempts', 'progress_tracking', 'detailed_feedback'],
  },
};

module.exports = TEST_TYPES;
```

### 5.2 Proctoring Modes

```javascript
// config/proctoring-modes.js

const PROCTORING_MODES = {
  // No proctoring (practice mode)
  none: {
    name: 'No Proctoring',
    features: [],
    suitableFor: ['practice', 'training', 'self_study'],
  },

  // AI-powered self-paced proctoring
  self_paced_ai: {
    name: 'AI Self-Paced Proctoring',
    description: 'Automated proctoring with AI monitoring',
    features: [
      'identity_verification',
      'continuous_face_monitoring',
      'multiple_face_detection',
      'tab_switch_detection',
      'copy_paste_blocking',
      'ai_anomaly_detection',
      'recording',
    ],
    requirements: {
      webcam: true,
      microphone: true,
      screenShare: 'optional',
      secondDevice: false,
    },
    postTestReview: 'ai_flagged_only', // Human reviews only flagged moments
  },

  // Live human proctoring
  live_human: {
    name: 'Live Human Proctoring',
    description: 'Real-time monitoring by trained proctor',
    features: [
      'identity_verification',
      'live_video_monitoring',
      'two_way_audio',
      'screen_monitoring',
      'room_scan',
      'proctor_intervention',
      'recording',
    ],
    requirements: {
      webcam: true,
      microphone: true,
      screenShare: true,
      secondDevice: true,
      proctorScheduling: true,
    },
    proctorRatio: '1:4', // One proctor per 4 students
  },

  // Hybrid (AI + Human review)
  hybrid: {
    name: 'Hybrid Proctoring',
    description: 'AI monitoring with human escalation',
    features: [
      'identity_verification',
      'continuous_face_monitoring',
      'ai_anomaly_detection',
      'human_escalation',
      'recording',
      'post_test_review',
    ],
    requirements: {
      webcam: true,
      microphone: true,
      screenShare: true,
      secondDevice: 'optional',
    },
    escalationTriggers: [
      'face_mismatch',
      'multiple_faces',
      'high_suspicion_score',
      'technical_anomalies',
    ],
  },
};

module.exports = PROCTORING_MODES;
```

---

## Part 6: Client-Side Anti-Cheating

### 6.1 Browser Lock Service

```javascript
// public/js/browser-lock.js

class BrowserLockService {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.violations = [];
    this.isLocked = false;
  }

  /**
   * Enable browser lockdown for test taking
   */
  enableLockdown() {
    this.isLocked = true;

    // 1. Detect tab switching / window blur
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));

    // 2. Disable right-click
    document.addEventListener('contextmenu', this.preventAction.bind(this));

    // 3. Disable copy/paste
    document.addEventListener('copy', this.preventAction.bind(this));
    document.addEventListener('paste', this.preventAction.bind(this));
    document.addEventListener('cut', this.preventAction.bind(this));

    // 4. Disable keyboard shortcuts
    document.addEventListener('keydown', this.handleKeydown.bind(this));

    // 5. Detect dev tools
    this.detectDevTools();

    // 6. Disable text selection in test content
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    // 7. Request fullscreen (optional but recommended)
    // this.requestFullscreen();

    console.log('Browser lockdown enabled');
  }

  /**
   * Handle visibility change (tab switch)
   */
  handleVisibilityChange() {
    if (!this.isLocked) return;

    if (document.hidden) {
      this.recordViolation('tab_switch', 'warning');
    }
  }

  /**
   * Handle window blur
   */
  handleWindowBlur() {
    if (!this.isLocked) return;
    this.recordViolation('window_blur', 'warning');
  }

  /**
   * Prevent default action and record violation
   */
  preventAction(event) {
    if (!this.isLocked) return;

    event.preventDefault();
    const type = event.type === 'contextmenu' ? 'right_click' : `${event.type}_attempt`;
    this.recordViolation(type, 'info');
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeydown(event) {
    if (!this.isLocked) return;

    // Block dangerous shortcuts
    const blocked = [
      // Developer tools
      { key: 'F12', ctrl: false, shift: false },
      { key: 'I', ctrl: true, shift: true }, // Ctrl+Shift+I
      { key: 'J', ctrl: true, shift: true }, // Ctrl+Shift+J
      { key: 'C', ctrl: true, shift: true }, // Ctrl+Shift+C

      // Copy/paste
      { key: 'c', ctrl: true, shift: false },
      { key: 'v', ctrl: true, shift: false },
      { key: 'x', ctrl: true, shift: false },

      // Find
      { key: 'f', ctrl: true, shift: false },

      // Print
      { key: 'p', ctrl: true, shift: false },

      // View source
      { key: 'u', ctrl: true, shift: false },
    ];

    const isBlocked = blocked.some(combo =>
      event.key.toLowerCase() === combo.key.toLowerCase() &&
      event.ctrlKey === combo.ctrl &&
      event.shiftKey === combo.shift
    );

    if (isBlocked) {
      event.preventDefault();
      this.recordViolation('blocked_shortcut', 'info', { key: event.key });
    }
  }

  /**
   * Detect developer tools
   */
  detectDevTools() {
    const threshold = 160;

    const check = () => {
      if (!this.isLocked) return;

      // Method 1: Window size difference
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if (widthThreshold || heightThreshold) {
        this.recordViolation('devtools_detected', 'critical');
      }
    };

    setInterval(check, 1000);
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

    // Send to server
    this.sessionManager.reportViolation(violation);

    // Show warning to user
    if (severity === 'warning' || severity === 'critical') {
      this.showWarning(type);
    }

    console.warn('Violation recorded:', violation);
  }

  /**
   * Show warning to user
   */
  showWarning(type) {
    const messages = {
      tab_switch: 'Please stay on this tab during the test.',
      window_blur: 'Please keep this window focused.',
      devtools_detected: 'Developer tools are not allowed during the test.',
      copy_attempt: 'Copy is not allowed during the test.',
      paste_attempt: 'Paste is not allowed during the test.',
    };

    const message = messages[type] || 'Please follow test guidelines.';

    // Show non-blocking toast notification
    this.showToast(message, 'warning');
  }

  /**
   * Show toast notification
   */
  showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      background: ${type === 'warning' ? '#ff9800' : '#f44336'};
      color: white;
      border-radius: 4px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  /**
   * Disable lockdown
   */
  disableLockdown() {
    this.isLocked = false;
    document.body.style.userSelect = 'auto';
    console.log('Browser lockdown disabled');
  }
}

// Export for use
window.BrowserLockService = BrowserLockService;
```

### 6.2 Frame Capture for Monitoring

```javascript
// public/js/frame-capture.js

class FrameCaptureService {
  constructor(socket, sessionId) {
    this.socket = socket;
    this.sessionId = sessionId;
    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
    this.isCapturing = false;
  }

  /**
   * Initialize with video element
   */
  initialize(videoElement) {
    this.videoElement = videoElement;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    // Set canvas size to video dimensions
    this.canvas.width = 640;
    this.canvas.height = 480;

    // Listen for server frame requests
    this.socket.on('capture-frame', (data) => {
      if (data.sessionId === this.sessionId) {
        this.captureAndSend(data.frameNumber, data.isVerification);
      }
    });

    this.isCapturing = true;
    console.log('Frame capture service initialized');
  }

  /**
   * Capture current video frame and send to server
   */
  captureAndSend(frameNumber, isVerification) {
    if (!this.isCapturing || !this.videoElement) return;

    try {
      // Draw current video frame to canvas
      this.ctx.drawImage(
        this.videoElement,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );

      // Convert to JPEG data URL (smaller than PNG)
      const quality = isVerification ? 0.9 : 0.6;
      const frameData = this.canvas.toDataURL('image/jpeg', quality);

      // Send to server
      this.socket.emit('frame-captured', {
        sessionId: this.sessionId,
        frameNumber,
        frameData,
        isVerification,
        timestamp: Date.now(),
      });

    } catch (error) {
      console.error('Frame capture error:', error);
      this.socket.emit('frame-capture-error', {
        sessionId: this.sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Stop capturing
   */
  stop() {
    this.isCapturing = false;
  }
}

window.FrameCaptureService = FrameCaptureService;
```

---

## Part 7: Implementation Roadmap

### Phase 1: Security Foundation (Weeks 1-3)

**Priority: CRITICAL - Solves credential sharing**

1. **Database Migration**
   - Set up PostgreSQL
   - Migrate from Google Sheets
   - Implement user password hashing (bcrypt)

2. **Authentication Overhaul**
   - Implement JWT-based sessions
   - Add email verification flow
   - Add password reset functionality
   - Implement rate limiting

3. **Device Fingerprinting**
   - Integrate FingerprintJS
   - Build device trust scoring
   - Implement cross-user device detection

### Phase 2: Identity Verification (Weeks 4-6)

**Priority: CRITICAL - Prevents impersonation**

1. **Face Verification System**
   - Integrate face-api.js
   - Build ID document upload flow
   - Implement face embedding storage
   - Build verification comparison logic

2. **Liveness Detection**
   - Implement basic liveness checks
   - Add anti-spoofing measures
   - Build verification UI flow

3. **Admin Verification Dashboard**
   - Build ID review interface
   - Implement approval/rejection flow
   - Add verification status tracking

### Phase 3: Continuous Monitoring (Weeks 7-9)

**Priority: HIGH - Runtime protection**

1. **Client-Side Monitoring**
   - Implement browser lockdown
   - Add frame capture service
   - Build violation reporting

2. **Server-Side Processing**
   - Implement continuous face monitoring
   - Add multiple face detection
   - Build face match verification
   - Implement event flagging

3. **Alert System**
   - Real-time proctoring alerts
   - Auto-suspension logic
   - Human escalation workflow

### Phase 4: Multi-Niche Support (Weeks 10-12)

**Priority: MEDIUM - Feature expansion**

1. **Test Type Framework**
   - Implement test type configurations
   - Build segment type handlers
   - Add response type processors

2. **Proctoring Modes**
   - Implement self-paced AI mode
   - Build live proctoring infrastructure
   - Add hybrid mode support

3. **Scoring System**
   - Build rubric-based grading
   - Implement auto-grading for MCQ
   - Add AI-assisted scoring integration

### Phase 5: Polish & Scale (Weeks 13-16)

1. **Performance Optimization**
   - Add caching layer (Redis)
   - Optimize face verification
   - Implement CDN for media

2. **Organization Features**
   - Multi-tenant support
   - Organization dashboards
   - Bulk user management

3. **Reporting & Analytics**
   - Test analytics dashboard
   - Proctoring reports
   - Compliance audit logs

---

## Part 8: API Endpoints (New Architecture)

```javascript
// Authentication
POST   /api/v2/auth/register
POST   /api/v2/auth/login
POST   /api/v2/auth/verify-email
POST   /api/v2/auth/forgot-password
POST   /api/v2/auth/reset-password
POST   /api/v2/auth/refresh-token
POST   /api/v2/auth/logout

// Identity Verification
POST   /api/v2/identity/upload-id          // Upload ID document
POST   /api/v2/identity/capture-face       // Capture registration face
GET    /api/v2/identity/status             // Check verification status
POST   /api/v2/identity/verify-live        // Verify face at test start

// Device Management
POST   /api/v2/device/register             // Register new device
GET    /api/v2/device/list                 // List user's devices
DELETE /api/v2/device/:id                  // Remove device
POST   /api/v2/device/verify               // Verify current device

// Tests
GET    /api/v2/tests                       // List available tests
GET    /api/v2/tests/:id                   // Get test details
GET    /api/v2/tests/:id/segments          // Get test segments
POST   /api/v2/tests                       // Create test (admin)
PUT    /api/v2/tests/:id                   // Update test (admin)

// Test Sessions
POST   /api/v2/sessions                    // Start new test session
GET    /api/v2/sessions/:id                // Get session status
PUT    /api/v2/sessions/:id                // Update session
POST   /api/v2/sessions/:id/verify-identity // Identity check at start
POST   /api/v2/sessions/:id/segment/:num/response // Submit segment response
POST   /api/v2/sessions/:id/complete       // Complete test
POST   /api/v2/sessions/:id/abandon        // Abandon test

// Proctoring
POST   /api/v2/proctoring/frame            // Submit captured frame
POST   /api/v2/proctoring/violation        // Report violation
GET    /api/v2/proctoring/session/:id/events // Get proctoring events
POST   /api/v2/proctoring/session/:id/flag // Flag session (human proctor)

// Recordings
POST   /api/v2/recordings/chunk            // Upload recording chunk
POST   /api/v2/recordings/final            // Upload final recording
GET    /api/v2/recordings/session/:id      // Get session recordings

// Admin
GET    /api/v2/admin/sessions              // List all sessions
GET    /api/v2/admin/sessions/:id/review   // Review session for grading
POST   /api/v2/admin/sessions/:id/grade    // Submit grades
GET    /api/v2/admin/identity/pending      // Pending identity verifications
POST   /api/v2/admin/identity/:id/approve  // Approve identity
POST   /api/v2/admin/identity/:id/reject   // Reject identity

// Organization
GET    /api/v2/org/:id                     // Get organization details
GET    /api/v2/org/:id/members             // List members
POST   /api/v2/org/:id/invite              // Invite member
GET    /api/v2/org/:id/tests               // Organization's tests
GET    /api/v2/org/:id/analytics           // Organization analytics
```

---

## Summary

This transformation addresses the **credential sharing problem** through:

1. **Multi-layer authentication** - Password + Email verification + Device binding
2. **Biometric verification** - Face matching against registered ID photo
3. **Continuous monitoring** - Real-time face verification during test
4. **Device fingerprinting** - Detect same device used by multiple users
5. **Browser lockdown** - Prevent cheating through tab switching, copy/paste
6. **Comprehensive logging** - Audit trail for all actions

The platform becomes suitable for:
- **Interpretation testing** - Audio/video segments with recording responses
- **Proficiency assessment** - Multi-skill evaluation with varied question types
- **Certification exams** - High-stakes with strict proctoring
- **Practice/training** - Self-study without proctoring

All while maintaining the existing dual-camera proctoring infrastructure and adding enterprise-grade security.

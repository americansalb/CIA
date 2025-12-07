/**
 * Identity Verification Service
 *
 * Solves the credential sharing problem by:
 * 1. Verifying face against registered ID photo at test start
 * 2. Continuous face monitoring during test
 * 3. Multi-face detection (cheating indicator)
 * 4. Liveness detection (anti-spoofing)
 */

const crypto = require('crypto');

class IdentityVerificationService {
  constructor(options = {}) {
    this.MATCH_THRESHOLD = options.matchThreshold || 0.6; // Lower = stricter
    this.LIVENESS_THRESHOLD = options.livenessThreshold || 0.7;
    this.faceDetector = null;
    this.initialized = false;

    // For server-side face detection (when available)
    this.useFaceApi = options.useFaceApi || false;
  }

  /**
   * Initialize face detection models (server-side)
   * For production, use: @vladmandic/face-api with TensorFlow.js
   */
  async initialize() {
    if (this.initialized) return;

    if (this.useFaceApi) {
      try {
        const faceapi = require('@vladmandic/face-api');
        const tf = require('@tensorflow/tfjs-node');
        const canvas = require('canvas');

        // Monkey-patch for node environment
        faceapi.env.monkeyPatch({
          Canvas: canvas.Canvas,
          Image: canvas.Image,
          ImageData: canvas.ImageData,
        });

        // Load models
        const modelPath = './models/face-api';
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);

        this.faceDetector = faceapi;
        console.log('Face-API models loaded successfully');
      } catch (error) {
        console.warn('Face-API not available, using client-side detection only:', error.message);
        this.useFaceApi = false;
      }
    }

    this.initialized = true;
  }

  /**
   * Extract face embedding from image buffer (server-side)
   */
  async extractFaceEmbedding(imageBuffer) {
    if (!this.useFaceApi || !this.faceDetector) {
      return { success: false, error: 'server_side_detection_unavailable' };
    }

    await this.initialize();

    try {
      const canvas = require('canvas');
      const img = await canvas.loadImage(imageBuffer);

      const detection = await this.faceDetector
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        return { success: false, error: 'no_face_detected' };
      }

      return {
        success: true,
        embedding: Array.from(detection.descriptor), // 128-dimensional vector
        box: detection.detection.box,
        landmarks: detection.landmarks.positions,
      };
    } catch (error) {
      console.error('Face embedding extraction error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Compare two face embeddings using Euclidean distance
   */
  compareFaceEmbeddings(embedding1, embedding2) {
    if (!embedding1 || !embedding2) {
      return { match: false, error: 'invalid_embeddings' };
    }

    if (embedding1.length !== embedding2.length) {
      return { match: false, error: 'embedding_dimension_mismatch' };
    }

    // Calculate Euclidean distance
    let sum = 0;
    for (let i = 0; i < embedding1.length; i++) {
      sum += Math.pow(embedding1[i] - embedding2[i], 2);
    }
    const distance = Math.sqrt(sum);

    // Convert distance to similarity score (0-1)
    const similarity = Math.max(0, 1 - distance);
    const match = distance < this.MATCH_THRESHOLD;

    return {
      match,
      distance,
      similarity,
      confidence: similarity,
      threshold: this.MATCH_THRESHOLD,
    };
  }

  /**
   * Verify identity by comparing live face with stored embedding
   * Called at test start
   */
  async verifyIdentity(liveEmbedding, storedEmbedding) {
    const comparison = this.compareFaceEmbeddings(liveEmbedding, storedEmbedding);

    return {
      verified: comparison.match,
      matchScore: comparison.similarity,
      confidence: comparison.confidence,
      threshold: this.MATCH_THRESHOLD,
      message: comparison.match
        ? 'Identity verified successfully'
        : 'Face does not match registered identity',
    };
  }

  /**
   * Validate face embedding format and quality
   */
  validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      return { valid: false, error: 'embedding_not_array' };
    }

    if (embedding.length !== 128 && embedding.length !== 512) {
      return { valid: false, error: 'invalid_embedding_dimensions' };
    }

    // Check for all zeros (invalid embedding)
    const isAllZeros = embedding.every(v => v === 0);
    if (isAllZeros) {
      return { valid: false, error: 'empty_embedding' };
    }

    // Check for reasonable values
    const hasValidValues = embedding.every(v => typeof v === 'number' && !isNaN(v));
    if (!hasValidValues) {
      return { valid: false, error: 'invalid_embedding_values' };
    }

    return { valid: true };
  }

  /**
   * Generate a hash of the embedding for storage (privacy)
   */
  hashEmbedding(embedding) {
    const embeddingString = JSON.stringify(embedding);
    return crypto.createHash('sha256').update(embeddingString).digest('hex');
  }

  /**
   * Process client-side verification result
   * Client sends: { embedding, matchScore, faceDetected, multipleFaces, livenessScore }
   */
  processClientVerification(clientResult, storedEmbedding) {
    // Validate the client result
    if (!clientResult) {
      return {
        success: false,
        error: 'no_client_result',
        action: 'retry',
      };
    }

    // Check if face was detected
    if (!clientResult.faceDetected) {
      return {
        success: false,
        error: 'no_face_detected',
        action: 'retry',
        message: 'Please ensure your face is visible in the camera',
      };
    }

    // Check for multiple faces (cheating indicator)
    if (clientResult.multipleFaces) {
      return {
        success: false,
        error: 'multiple_faces_detected',
        action: 'flag',
        severity: 'critical',
        message: 'Multiple faces detected. Only the test-taker should be visible.',
      };
    }

    // Check liveness score
    if (clientResult.livenessScore && clientResult.livenessScore < this.LIVENESS_THRESHOLD) {
      return {
        success: false,
        error: 'liveness_check_failed',
        action: 'retry',
        message: 'Please ensure you are using a live camera, not a photo or video',
      };
    }

    // If client provides embedding, do server-side verification
    if (clientResult.embedding && storedEmbedding) {
      const verification = this.compareFaceEmbeddings(clientResult.embedding, storedEmbedding);

      if (!verification.match) {
        return {
          success: false,
          error: 'face_mismatch',
          action: 'flag',
          severity: 'critical',
          matchScore: verification.similarity,
          message: 'Face does not match registered identity',
        };
      }

      return {
        success: true,
        verified: true,
        matchScore: verification.similarity,
        message: 'Identity verified successfully',
      };
    }

    // If no server-side embedding, trust client match score (less secure)
    if (clientResult.matchScore !== undefined) {
      const threshold = 0.85; // Higher threshold for client-reported scores

      if (clientResult.matchScore < threshold) {
        return {
          success: false,
          error: 'face_mismatch',
          action: 'flag',
          severity: 'critical',
          matchScore: clientResult.matchScore,
          message: 'Face does not match registered identity',
        };
      }

      return {
        success: true,
        verified: true,
        matchScore: clientResult.matchScore,
        message: 'Identity verified successfully',
        clientVerified: true,
      };
    }

    // Can't verify without embedding or match score
    return {
      success: false,
      error: 'insufficient_verification_data',
      action: 'retry',
    };
  }

  /**
   * Create identity verification record for database
   */
  createVerificationRecord(userId, result, metadata = {}) {
    return {
      userId,
      verificationType: result.clientVerified ? 'client_side' : 'server_side',
      verified: result.success && result.verified,
      matchScore: result.matchScore || null,
      error: result.error || null,
      action: result.action || null,
      severity: result.severity || null,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        userAgent: metadata.userAgent || null,
        ipAddress: metadata.ipAddress || null,
      },
    };
  }
}

module.exports = IdentityVerificationService;

// IndexedDB Helper for local backup storage
class RecordingBackup {
  constructor() {
    this.dbName = 'CIA_RecordingBackup';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create stores if they don't exist
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true });
          chunkStore.createIndex('sessionId', 'sessionId', { unique: false });
          chunkStore.createIndex('uploaded', 'uploaded', { unique: false });
        }

        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'sessionId' });
        }
      };
    });
  }

  async saveChunk(sessionId, deviceType, chunkNumber, blob, uploaded = false) {
    const transaction = this.db.transaction(['chunks'], 'readwrite');
    const store = transaction.objectStore('chunks');

    const chunkData = {
      sessionId,
      deviceType,
      chunkNumber,
      blob,
      uploaded,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.add(chunkData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markChunkUploaded(chunkId) {
    const transaction = this.db.transaction(['chunks'], 'readwrite');
    const store = transaction.objectStore('chunks');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(chunkId);
      getRequest.onsuccess = () => {
        const chunk = getRequest.result;
        if (chunk) {
          chunk.uploaded = true;
          const updateRequest = store.put(chunk);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getUnuploadedChunks(sessionId) {
    const transaction = this.db.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');
    const index = store.index('sessionId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(sessionId);
      request.onsuccess = () => {
        const chunks = request.result.filter(chunk => !chunk.uploaded);
        resolve(chunks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveMetadata(sessionId, data) {
    const transaction = this.db.transaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');

    const metadata = {
      sessionId,
      ...data,
      lastUpdated: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(sessionId) {
    const transaction = this.db.transaction(['metadata'], 'readonly');
    const store = transaction.objectStore('metadata');

    return new Promise((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearSession(sessionId) {
    const transaction = this.db.transaction(['chunks', 'metadata'], 'readwrite');
    const chunkStore = transaction.objectStore('chunks');
    const metadataStore = transaction.objectStore('metadata');

    const index = chunkStore.index('sessionId');
    const range = IDBKeyRange.only(sessionId);

    return new Promise((resolve, reject) => {
      const deleteChunks = index.openCursor(range);
      deleteChunks.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      metadataStore.delete(sessionId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Global backup instance
const recordingBackup = new RecordingBackup();

// Recording manager for main and proctor devices
class RecordingManager {
  constructor(deviceType, sessionId) {
    this.deviceType = deviceType; // 'main' or 'proctor'
    this.sessionId = sessionId;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.allChunks = []; // Store all chunks for final video
    this.chunkNumber = 0;
    this.isRecording = false;
    this.chunkInterval = null;
    this.startTime = null;
    this.uploadQueue = [];
    this.isUploading = false;
    this.heartbeatInterval = null;
    this.connectionHealthy = true;
    this.retryAttempts = new Map(); // Track retry attempts per chunk
    this.uploadedChunkIds = new Set(); // Track successfully uploaded chunks
  }

  async startRecording(stream) {
    this.stream = stream;
    this.startTime = Date.now();

    // Initialize IndexedDB
    await recordingBackup.init();

    try {
      // Use good video quality for smooth playback, excellent audio for transcription
      // CRITICAL: iOS Safari only supports MP4, not WebM!
      let options = {
        videoBitsPerSecond: 2000000, // 2 Mbps - smooth HD video
        audioBitsPerSecond: 192000, // 192 kbps - excellent audio for transcription
      };

      // Try formats in order of preference
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        // iOS Safari uses MP4
        options.mimeType = 'video/mp4';
      } else {
        // Let browser choose
        console.warn('No preferred format supported, using browser default');
      }

      this.mediaRecorder = new MediaRecorder(stream, options);

      // Store the actual mime type being used (critical for iOS MP4 support)
      this.recordingMimeType = options.mimeType || this.mediaRecorder.mimeType || 'video/webm';
      console.log(`[${this.deviceType}] Recording with format: ${this.recordingMimeType}`);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
          this.allChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.chunks.length > 0) {
          await this.uploadChunk();
        }
      };

      // Start recording with 1-second chunks
      this.mediaRecorder.start(1000);
      this.isRecording = true;

      // Set up 30-second upload interval (reduced from 60s for more frequent backups)
      this.chunkInterval = setInterval(() => {
        if (this.isRecording) {
          this.stopAndUploadChunk();
        }
      }, 30000); // 30 seconds

      // Set up connection heartbeat (every 10 seconds)
      this.heartbeatInterval = setInterval(() => {
        this.checkConnection();
      }, 10000);

      // Save initial metadata
      await recordingBackup.saveMetadata(this.sessionId, {
        deviceType: this.deviceType,
        startTime: this.startTime,
        lastChunkNumber: 0,
      });

      console.log(`[${this.deviceType}] Recording started with enhanced reliability`);
      // Silent for users - they just need to know recording is active
      if (this.deviceType !== 'screen') {
        this.showNotification('Recording started', 'success', 2000);
      }
    } catch (error) {
      console.error(`[${this.deviceType}] Failed to start recording:`, error);
      this.showNotification('Failed to start recording', 'error');
      throw error;
    }
  }

  async checkConnection() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        if (!this.connectionHealthy) {
          this.connectionHealthy = true;
          this.showNotification('Connection restored', 'success');
          // Retry any failed uploads
          await this.retryFailedUploads();
        }
      } else {
        this.connectionHealthy = false;
      }
    } catch (error) {
      if (this.connectionHealthy) {
        this.connectionHealthy = false;
        this.showNotification('Connection issue detected - data being saved locally', 'warning');
      }
    }
  }

  stopAndUploadChunk() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();

      // Restart recording after a brief pause
      setTimeout(() => {
        if (this.isRecording && this.stream) {
          this.mediaRecorder.start(1000);
        }
      }, 100);
    }
  }

  async uploadChunk() {
    if (this.chunks.length === 0) return;

    // Use the actual recording mime type (webm for desktop, mp4 for iOS)
    const blob = new Blob(this.chunks, { type: this.recordingMimeType });
    this.chunks = []; // Clear chunks after creating blob
    this.chunkNumber++;

    // Save to IndexedDB immediately
    const chunkId = await recordingBackup.saveChunk(
      this.sessionId,
      this.deviceType,
      this.chunkNumber,
      blob,
      false
    );

    // Update metadata
    await recordingBackup.saveMetadata(this.sessionId, {
      deviceType: this.deviceType,
      startTime: this.startTime,
      lastChunkNumber: this.chunkNumber,
    });

    // Add to upload queue
    this.uploadQueue.push({ chunkId, blob, chunkNumber: this.chunkNumber });

    // Process queue
    this.processUploadQueue();
  }

  async processUploadQueue() {
    if (this.isUploading || this.uploadQueue.length === 0) return;

    this.isUploading = true;

    while (this.uploadQueue.length > 0) {
      const { chunkId, blob, chunkNumber } = this.uploadQueue[0];

      const success = await this.uploadChunkWithRetry(chunkId, blob, chunkNumber);

      if (success) {
        // Remove from queue
        this.uploadQueue.shift();
        this.uploadedChunkIds.add(chunkId);

        // Mark as uploaded in IndexedDB
        await recordingBackup.markChunkUploaded(chunkId);

        // Silent success - don't notify user about technical chunks
        console.log(`[${this.deviceType}] Chunk ${chunkNumber} uploaded successfully`);
      } else {
        // If upload failed after retries, keep in queue and try again later
        console.warn(`[${this.deviceType}] Chunk ${chunkNumber} upload failed, will retry later`);
        break; // Stop processing queue for now
      }
    }

    this.isUploading = false;
  }

  async uploadChunkWithRetry(chunkId, blob, chunkNumber, attempt = 1) {
    // CRITICAL: NO MAX ATTEMPTS - NEVER GIVE UP!
    // Keep retrying indefinitely until upload succeeds
    const baseDelay = 2000; // 2 seconds
    const maxDelay = 60000; // Cap at 60 seconds between retries

    const formData = new FormData();
    formData.append('video', blob, `${this.deviceType}_chunk_${chunkNumber}.webm`);
    formData.append('sessionId', this.sessionId);
    formData.append('deviceType', this.deviceType);
    formData.append('chunkNumber', chunkNumber.toString());
    formData.append('timestamp', Date.now().toString());

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('/api/upload-chunk', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = await response.json();

      if (result.success) {
        console.log(`[${this.deviceType}] Chunk ${chunkNumber} uploaded successfully (attempt ${attempt})`);
        return true;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error(`[${this.deviceType}] Chunk ${chunkNumber} upload error (attempt ${attempt}):`, error);

      // INFINITE RETRY - exponential backoff capped at maxDelay
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      console.log(`[${this.deviceType}] CRITICAL: Chunk ${chunkNumber} upload failed. Retrying in ${delay}ms... (attempt ${attempt})`);

      // Silent retry - don't show technical details to user
      // Only show critical issues after many attempts
      if (attempt >= 10) {
        this.showNotification(`Connection issue - saving data locally`, 'warning', 5000);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.uploadChunkWithRetry(chunkId, blob, chunkNumber, attempt + 1);
    }
  }

  async retryFailedUploads() {
    const unuploaded = await recordingBackup.getUnuploadedChunks(this.sessionId);

    if (unuploaded.length > 0) {
      console.log(`[${this.deviceType}] Retrying ${unuploaded.length} failed uploads...`);

      for (const chunk of unuploaded) {
        if (!this.uploadedChunkIds.has(chunk.id)) {
          this.uploadQueue.push({
            chunkId: chunk.id,
            blob: chunk.blob,
            chunkNumber: chunk.chunkNumber,
          });
        }
      }

      this.processUploadQueue();
    }
  }

  // Get current upload status
  getUploadStatus() {
    return {
      pendingUploads: this.uploadQueue.length,
      uploadedChunks: this.uploadedChunkIds.size,
      totalChunks: this.chunkNumber,
      isUploading: this.isUploading,
      connectionHealthy: this.connectionHealthy,
    };
  }

  // Check if all uploads are complete
  async areAllUploadsComplete() {
    const unuploaded = await recordingBackup.getUnuploadedChunks(this.sessionId);
    return this.uploadQueue.length === 0 && unuploaded.length === 0;
  }

  async stopRecording() {
    this.isRecording = false;

    // Clear intervals
    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Wait a bit for final ondataavailable event
    await new Promise(resolve => setTimeout(resolve, 500));

    // CRITICAL: Wait for ALL chunks to upload - NEVER proceed with pending uploads
    console.log(`[${this.deviceType}] Waiting for all chunks to upload...`);
    // User-friendly message without technical details
    this.showNotification('Saving recording...', 'info', 0);

    let waitCount = 0;
    while (this.uploadQueue.length > 0) {
      waitCount++;
      if (waitCount % 10 === 0) {
        const status = this.getUploadStatus();
        console.log(`[${this.deviceType}] Still waiting... Pending: ${status.pendingUploads}, Uploaded: ${status.uploadedChunks}/${status.totalChunks}`);
        // Show simple percentage progress without technical details
        const percentComplete = Math.floor((status.uploadedChunks / status.totalChunks) * 100);
        this.showNotification(`Saving... ${percentComplete}%`, 'info', 0);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.processUploadQueue();
    }

    // Verify all chunks uploaded from IndexedDB
    const unuploaded = await recordingBackup.getUnuploadedChunks(this.sessionId);
    if (unuploaded.length > 0) {
      console.error(`[${this.deviceType}] CRITICAL: ${unuploaded.length} chunks still not uploaded!`);
      // User-friendly message - hide technical "chunks" terminology
      this.showNotification(`Finalizing upload...`, 'info', 0);

      // Add them back to queue
      for (const chunk of unuploaded) {
        if (!this.uploadedChunkIds.has(chunk.id)) {
          this.uploadQueue.push({
            chunkId: chunk.id,
            blob: chunk.blob,
            chunkNumber: chunk.chunkNumber,
          });
        }
      }

      // Retry until ALL are uploaded
      await this.stopRecording();
      return;
    }

    console.log(`[${this.deviceType}] All chunks uploaded successfully`);
    // Simple user-friendly message
    this.showNotification('Recording saved successfully', 'success', 2000);
  }

  async uploadFinalVideo(interventionCount = 0) {
    if (this.allChunks.length === 0) {
      console.warn(`[${this.deviceType}] No chunks to upload for final video`);
      return;
    }

    this.showNotification('Finalizing recording...', 'info');

    const blob = new Blob(this.allChunks, { type: 'video/webm' });
    const duration = Math.floor((Date.now() - this.startTime) / 1000);

    const formData = new FormData();
    formData.append('video', blob, `${this.deviceType}_final.webm`);
    formData.append('sessionId', this.sessionId);
    formData.append('deviceType', this.deviceType);
    formData.append('duration', duration.toString());
    formData.append('interventionCount', interventionCount.toString());

    try {
      const response = await this.uploadWithRetry('/api/upload-final', formData, 5);

      const result = await response.json();
      if (result.success) {
        console.log(`[${this.deviceType}] Final video uploaded successfully`);
        this.showNotification('Recording uploaded successfully!', 'success');

        // Clear IndexedDB data for this session
        await recordingBackup.clearSession(this.sessionId);

        return result;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error(`[${this.deviceType}] Final upload error:`, error);
      this.showNotification('Upload failed - data saved locally for recovery', 'error');
      throw error;
    }
  }

  async uploadWithRetry(url, formData, maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout for final upload

        const response = await fetch(url, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return response;
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`Upload attempt ${attempt} failed:`, error);

        if (attempt < maxAttempts) {
          const delay = 2000 * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  showNotification(message, type = 'info', duration = 3000) {
    // Only show notifications for non-screen recordings and only important messages
    // Hide all technical "chunk" details from users
    if (message.toLowerCase().includes('chunk')) {
      // Never show chunk-related messages to users
      console.log(`[${this.deviceType}] ${message}`);
      return;
    }

    const notificationEl = document.getElementById(`${this.deviceType}Notification`);
    if (!notificationEl) return;

    notificationEl.textContent = message;
    notificationEl.className = `recording-notification ${type}`;
    notificationEl.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        notificationEl.style.display = 'none';
      }, duration);
    }
  }

  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
  }
}

// Intervention recorder (separate from main recording)
class InterventionRecorder {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.mediaRecorder = null;
    this.chunks = [];
    this.currentIntervention = null;
  }

  async startRecording(stream) {
    this.chunks = [];
    this.currentIntervention = {
      startTime: Date.now(),
      type: null,
      action: null,
    };

    // CRITICAL: iOS Safari only supports MP4, not WebM!
    let options = {
      videoBitsPerSecond: 2000000, // 2 Mbps - smooth HD video
      audioBitsPerSecond: 192000,
    };

    // Try formats in order of preference
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options.mimeType = 'video/webm';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      // iOS Safari uses MP4
      options.mimeType = 'video/mp4';
    } else {
      // Let browser choose
      console.warn('No preferred format supported for intervention, using browser default');
    }

    this.mediaRecorder = new MediaRecorder(stream, options);
    console.log(`Intervention recording with format: ${options.mimeType || 'default'}`);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000);
    console.log('Intervention recording started');
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = () => {
          this.currentIntervention.endTime = Date.now();
          resolve();
        };
        this.mediaRecorder.stop();
      } else {
        resolve();
      }
    });
  }

  getInterventionBlob() {
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: 'video/webm' });
  }

  setInterventionAction(action) {
    if (this.currentIntervention) {
      this.currentIntervention.action = action;
    }
  }

  getInterventionData() {
    return this.currentIntervention;
  }
}

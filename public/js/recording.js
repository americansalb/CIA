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
  }

  async startRecording(stream) {
    this.stream = stream;
    this.startTime = Date.now();

    try {
      // Use low video quality, good audio quality
      const options = {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 100000, // 100 kbps - low quality video
        audioBitsPerSecond: 192000, // 192 kbps - good audio for transcription
      };

      // Fallback for browsers that don't support vp8
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      this.mediaRecorder = new MediaRecorder(stream, options);

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

      // Set up 60-second upload interval
      this.chunkInterval = setInterval(() => {
        if (this.isRecording) {
          this.stopAndUploadChunk();
        }
      }, 60000); // 60 seconds

      console.log(`[${this.deviceType}] Recording started`);
    } catch (error) {
      console.error(`[${this.deviceType}] Failed to start recording:`, error);
      throw error;
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

    const blob = new Blob(this.chunks, { type: 'video/webm' });
    this.chunks = []; // Clear chunks after creating blob
    this.chunkNumber++;

    const formData = new FormData();
    formData.append('video', blob, `${this.deviceType}_chunk_${this.chunkNumber}.webm`);
    formData.append('sessionId', this.sessionId);
    formData.append('deviceType', this.deviceType);
    formData.append('chunkNumber', this.chunkNumber.toString());
    formData.append('timestamp', Date.now().toString());

    try {
      const response = await fetch('/api/upload-chunk', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        console.log(`[${this.deviceType}] Chunk ${this.chunkNumber} uploaded successfully`);
      } else {
        console.error(`[${this.deviceType}] Chunk upload failed:`, result.message);
      }
    } catch (error) {
      console.error(`[${this.deviceType}] Chunk upload error:`, error);
      // Store failed chunks for retry
    }
  }

  async stopRecording() {
    this.isRecording = false;

    // Clear interval
    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    // Stop media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Wait a bit for final ondataavailable event
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`[${this.deviceType}] Recording stopped`);
  }

  async uploadFinalVideo(interventionCount = 0) {
    if (this.allChunks.length === 0) {
      console.warn(`[${this.deviceType}] No chunks to upload for final video`);
      return;
    }

    const blob = new Blob(this.allChunks, { type: 'video/webm' });
    const duration = Math.floor((Date.now() - this.startTime) / 1000);

    const formData = new FormData();
    formData.append('video', blob, `${this.deviceType}_final.webm`);
    formData.append('sessionId', this.sessionId);
    formData.append('deviceType', this.deviceType);
    formData.append('duration', duration.toString());
    formData.append('interventionCount', interventionCount.toString());

    try {
      const response = await fetch('/api/upload-final', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        console.log(`[${this.deviceType}] Final video uploaded successfully`);
        return result;
      } else {
        console.error(`[${this.deviceType}] Final upload failed:`, result.message);
        throw new Error(result.message);
      }
    } catch (error) {
      console.error(`[${this.deviceType}] Final upload error:`, error);
      throw error;
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

    const options = {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 100000,
      audioBitsPerSecond: 192000,
    };

    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
    }

    this.mediaRecorder = new MediaRecorder(stream, options);

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

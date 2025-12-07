// Proctor device script
let proctorSessionData = null;
let proctorStream = null;
let proctorRecorder = null;
let proctorSocket = null;
let proctorStreamPeer = null;

// Check URL parameters on load (for backwards compatibility)
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pin = urlParams.get('pin');

  if (pin) {
    // Auto-fill the PIN if provided in URL
    document.getElementById('pin').value = pin;
    document.getElementById('pin').focus();
  }
});

// Proctor login form
document.getElementById('proctorLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const pin = document.getElementById('pin').value.trim();
  const errorDiv = document.getElementById('proctorError');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  errorDiv.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Connecting...';

  try {
    const response = await fetch('/api/join-proctor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    const result = await response.json();

    if (result.success) {
      proctorSessionData = {
        sessionId: result.sessionId, // Get session ID from response
        studentInfo: result.studentInfo,
      };

      // Show student info
      document.getElementById('proctorStudentInfo').textContent =
        `${result.studentInfo.email} (ID: ${result.studentInfo.studentId})`;

      // Request camera permissions and show verification page
      await setupProctorVerification();

    } else {
      errorDiv.textContent = result.message;
      errorDiv.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Connect Proctor Camera';
    }
  } catch (error) {
    errorDiv.textContent = `Error: ${error.message}`;
    errorDiv.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Connect Proctor Camera';
  }
});

function showProctorPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
}

// Set up proctor camera verification page
let currentFacingMode = 'user'; // Start with front camera (default for phone/tablet)

async function setupProctorVerification() {
  // Try multiple constraint configurations
  const constraintConfigs = [
    // Attempt 1: High quality with preferred facing mode
    {
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: currentFacingMode },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    },
    // Attempt 2: Medium quality
    {
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: currentFacingMode },
      audio: { echoCancellation: true, noiseSuppression: true }
    },
    // Attempt 3: Any camera, any audio
    {
      video: true,
      audio: true
    }
  ];

  let lastError = null;

  for (let i = 0; i < constraintConfigs.length; i++) {
    try {
      console.log(`[Proctor] Camera attempt ${i + 1}:`, constraintConfigs[i]);
      proctorStream = await navigator.mediaDevices.getUserMedia(constraintConfigs[i]);
      console.log(`[Proctor] Camera success on attempt ${i + 1}`);
      break;
    } catch (error) {
      console.warn(`[Proctor] Attempt ${i + 1} failed:`, error.name, error.message);
      lastError = error;

      // Don't retry for permission-related errors
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        break;
      }
    }
  }

  if (!proctorStream) {
    // Show helpful error message based on error type
    const errorMessage = getProctorErrorMessage(lastError);
    showProctorError(errorMessage);
    return;
  }

  // Show verification page with camera preview
  showProctorPage('proctorVerification');

  // Set up camera preview
  const verificationVideo = document.getElementById('proctorVerificationView');
  verificationVideo.srcObject = proctorStream;

  // Set up checkbox handler
  const checkbox = document.getElementById('proctorPositionConfirm');
  const startBtn = document.getElementById('startProctorRecordingBtn');

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
    } else {
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
    }
  });

  // Set up start button handler
  startBtn.addEventListener('click', async () => {
    await startProctorRecording();
  });
}

// Get helpful error message for proctor camera
function getProctorErrorMessage(error) {
  if (!error) {
    return 'Unknown error accessing camera. Please refresh and try again.';
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return `Camera permission denied.

To fix this:
1. Tap the lock/camera icon in your browser's address bar
2. Allow camera and microphone access
3. Refresh this page and try again

On iPhone Safari: Go to Settings → Safari → Camera → Allow`;

    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return `No camera found on this device.

Please make sure:
1. Your device has a camera
2. No other app is using the camera
3. Camera is not disabled in settings`;

    case 'NotReadableError':
    case 'TrackStartError':
      return `Camera is in use by another app.

Please close these apps and try again:
• Camera app
• Other browser tabs with video
• Video call apps (FaceTime, WhatsApp, etc.)`;

    case 'OverconstrainedError':
      return 'Your camera does not support the required settings. Please try a different device.';

    case 'SecurityError':
      return 'Camera access blocked for security reasons. Make sure you are using HTTPS.';

    default:
      return `Camera error: ${error.message}\n\nPlease refresh and try again.`;
  }
}

// Show error on proctor page
function showProctorError(message) {
  const errorDiv = document.getElementById('proctorError');
  if (errorDiv) {
    errorDiv.innerHTML = `
      <div style="background: #ffebee; border: 1px solid #f44336; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <div style="font-weight: bold; color: #c62828; margin-bottom: 10px;">📷 Camera Error</div>
        <div style="white-space: pre-wrap; color: #333; font-size: 14px; line-height: 1.6;">${escapeHtmlProctor(message)}</div>
        <button onclick="location.reload()" style="margin-top: 15px; background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
          Refresh & Try Again
        </button>
      </div>
    `;
    errorDiv.style.display = 'block';
  } else {
    alert(message);
  }

  // Re-enable the connect button
  const submitBtn = document.querySelector('#proctorLoginForm button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Connect Proctor Camera';
  }
}

// Escape HTML for proctor page
function escapeHtmlProctor(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Switch between front and back camera
async function switchCamera() {
  try {
    // Stop current stream
    if (proctorStream) {
      proctorStream.getTracks().forEach(track => track.stop());
    }

    // Toggle facing mode
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    // Get new stream with switched camera
    proctorStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: currentFacingMode,
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    });

    // Update preview
    const verificationVideo = document.getElementById('proctorVerificationView');
    verificationVideo.srcObject = proctorStream;

    console.log('Switched to', currentFacingMode, 'camera');
  } catch (error) {
    console.error('Failed to switch camera:', error);
    alert('Failed to switch camera. Your device may only have one camera.');
    // Try to restore previous camera
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  }
}

async function startProctorRecording() {
  try {
    // Show proctor recording view
    showProctorPage('proctorView');

    // Set up video display
    const proctorVideo = document.getElementById('proctorCameraView');
    proctorVideo.srcObject = proctorStream;

    // Start recording
    proctorRecorder = new RecordingManager('proctor', proctorSessionData.sessionId);
    await proctorRecorder.startRecording(proctorStream);

    // CRITICAL: Notify main device that proctor is NOW actually recording
    await fetch('/api/confirm-proctor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: proctorSessionData.sessionId }),
    });

    console.log('Proctor recording started and confirmed');

    // Initialize live monitoring for proctor stream
    initializeProctorLiveMonitoring();

    // Poll for main device completion
    pollForTestCompletion();

  } catch (error) {
    console.error('Failed to start proctor recording:', error);
    alert('Failed to start recording. Please refresh and try again.');
  }
}

async function startProctorCamera() {
  try {
    proctorStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    });

    // Show video
    const video = document.getElementById('proctorCameraView');
    video.srcObject = proctorStream;

    // Start recording
    proctorRecorder = new RecordingManager('proctor', proctorSessionData.sessionId);
    await proctorRecorder.startRecording(proctorStream);

    console.log('Proctor recording started');

    // Poll for main device completion
    pollForTestCompletion();

  } catch (error) {
    console.error('Failed to start proctor camera:', error);
    alert('Failed to access camera. Please grant permissions and refresh.');
  }
}

// Check if main device has completed the test
async function pollForTestCompletion() {
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/session-status/${proctorSessionData.sessionId}`);
      const result = await response.json();

      // You would need to add a 'testComplete' flag to session status
      // For now, we'll just check after 40 minutes (35 min test + buffer)
      // In production, the main device should signal completion
    } catch (error) {
      console.error('Error polling test status:', error);
    }
  }, 5000);

  // Auto-stop after 40 minutes as safety
  setTimeout(async () => {
    clearInterval(interval);
    await endProctorRecording();
  }, 40 * 60 * 1000);
}

async function endProctorRecording() {
  console.log('Ending proctor recording');

  if (proctorRecorder) {
    await proctorRecorder.stopRecording();
    await proctorRecorder.uploadFinalVideo(0);
    proctorRecorder.stopStream();
  }

  showProctorPage('proctorComplete');
}

// Handle page close/refresh - try to upload any remaining data
window.addEventListener('beforeunload', async (e) => {
  if (proctorRecorder && proctorRecorder.isRecording) {
    e.preventDefault();
    e.returnValue = 'Recording in progress. Are you sure you want to leave?';

    // Try to stop and upload
    await endProctorRecording();
  }
});

// ==================== LIVE MONITORING FOR PROCTOR ====================
function initializeProctorLiveMonitoring() {
  try {
    if (!proctorSessionData || !proctorStream) {
      console.warn('[Proctor Live Monitoring] Skipping: missing session or stream');
      return;
    }

    if (typeof io === 'undefined') {
      console.warn('[Proctor Live Monitoring] Socket.io not loaded - monitoring disabled');
      return;
    }

    console.log('[Proctor Live Monitoring] Initializing for session:', proctorSessionData.sessionId);

    proctorSocket = io();

    proctorSocket.on('connect', () => {
      console.log('[Proctor] Socket.io connected:', proctorSocket.id);

      // Join session as proctor device
      proctorSocket.emit('join-session', {
        sessionId: proctorSessionData.sessionId,
        email: proctorSessionData.studentInfo.email,
        role: 'proctor',
      });
    });

    // Handle admin monitoring request
    proctorSocket.on('admin-monitoring', ({ adminSocketId }) => {
      console.log('[Proctor] Admin is monitoring this session:', adminSocketId);

      // Create WebRTC peer to stream proctor camera to admin
      if (proctorStream) {
        createProctorPeerForAdmin(adminSocketId, 'proctor', proctorStream);
      }
    });

    // Handle WebRTC signaling from admin
    proctorSocket.on('signal', ({ fromSocketId, signal, deviceType }) => {
      console.log('[Proctor] Received signal from admin:', fromSocketId, deviceType);

      // If we have a peer for this admin, forward the signal
      if (proctorStreamPeer && proctorStreamPeer.targetSocketId === fromSocketId) {
        proctorStreamPeer.peer.signal(signal);
      }
    });

    proctorSocket.on('disconnect', () => {
      console.log('[Proctor Live Monitoring] Disconnected');
    });
  } catch (error) {
    console.error('[Proctor Live Monitoring] Failed to initialize (non-fatal):', error);
  }
}

function createProctorPeerForAdmin(adminSocketId, deviceType, stream) {
  try {
    console.log('[Proctor Live Monitoring] Creating WebRTC peer for admin:', adminSocketId, deviceType);

    if (typeof SimplePeer === 'undefined') {
      console.warn('[Proctor Live Monitoring] SimplePeer library not loaded');
      return;
    }

    // Create peer (proctor is initiator, sends stream to admin)
    const peer = new SimplePeer({
      initiator: true,
      stream: stream,
      trickle: false,
    });

    // When peer generates signal, send to server
    peer.on('signal', (signal) => {
      console.log('[Proctor] Sending signal to admin');
      proctorSocket.emit('signal', {
        sessionId: proctorSessionData.sessionId,
        targetSocketId: adminSocketId,
        signal: signal,
        deviceType: deviceType,
      });
    });

    peer.on('connect', () => {
      console.log('[Proctor] WebRTC peer connected to admin');
    });

    peer.on('error', (err) => {
      console.error('[Proctor] WebRTC peer error:', err);
    });

    // Store peer reference
    proctorStreamPeer = {
      peer: peer,
      targetSocketId: adminSocketId,
    };
  } catch (error) {
    console.error('[Proctor Live Monitoring] Failed to create peer:', error);
  }
}

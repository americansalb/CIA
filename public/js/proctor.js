// Proctor device script
let proctorSessionData = null;
let proctorStream = null;
let proctorRecorder = null;

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

      // Start proctor camera
      await startProctorCamera();

      // Show proctor view
      showProctorPage('proctorView');

      document.getElementById('proctorStudentInfo').textContent =
        `${result.studentInfo.email} (ID: ${result.studentInfo.studentId})`;

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

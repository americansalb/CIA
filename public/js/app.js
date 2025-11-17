// Global state
let studentData = null;
let sessionData = null;
let mainRecorder = null;
let proctorRecorder = null;
let interventionRecorder = null;
let mainStream = null;
let testStartTime = null;
let currentSegment = 0;
let interventionCount = 0;
let repetitionCount = 5;
let testTimer = null;
let testConfig = null;

// Test configuration - will be loaded based on permitted test
const TEST_CONFIGS = {
  // Example structure - you'll populate this with your actual Bunny.net URLs
  'Test_A1': {
    segments: [
      'https://your-bunny-cdn.b-cdn.net/test_a1_segment1.mp3',
      'https://your-bunny-cdn.b-cdn.net/test_a1_segment2.mp3',
      // Add more segments...
    ]
  },
  'Test_A2': {
    segments: [
      'https://your-bunny-cdn.b-cdn.net/test_a2_segment1.mp3',
      // Add more segments...
    ]
  },
  // Add more test variants...
};

// Page navigation
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
}

// Setup universal instructions
function setupUniversalInstructions(videoUrl) {
  const videoPlayer = document.getElementById('universalInstructionsVideo');
  const continueBtn = document.getElementById('instructionsContinueBtn');

  videoPlayer.src = videoUrl;
  continueBtn.disabled = true;

  // Enable continue button when video ends or after 5 seconds (whichever comes first)
  let canContinue = false;

  videoPlayer.onended = () => {
    canContinue = true;
    continueBtn.disabled = false;
    continueBtn.textContent = 'I Understand - Continue';
  };

  // Allow skipping after 5 seconds
  setTimeout(() => {
    if (!canContinue) {
      canContinue = true;
      continueBtn.disabled = false;
      continueBtn.textContent = 'Continue (or wait for video to finish)';
    }
  }, 5000);
}

// Login form handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const studentId = document.getElementById('studentId').value.trim();
  const errorDiv = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');

  errorDiv.style.display = 'none';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Validating...';

  try {
    const response = await fetch('/api/validate-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, studentId }),
    });

    const result = await response.json();

    if (result.success) {
      studentData = result.student;

      // Create session
      const sessionResponse = await fetch('/api/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentData.email,
          studentId: studentData.studentId,
          permittedTest: studentData.permittedTest,
        }),
      });

      const sessionResult = await sessionResponse.json();
      if (sessionResult.success) {
        sessionData = sessionResult;

        // Load test configuration from Google Sheets
        const testConfigResponse = await fetch(`/api/test-config?testName=${encodeURIComponent(studentData.permittedTest)}`);
        const testConfigResult = await testConfigResponse.json();

        if (!testConfigResult.success || !testConfigResult.config || testConfigResult.config.segments.length === 0) {
          throw new Error(`Test "${studentData.permittedTest}" has not been configured yet. Please contact your administrator.`);
        }

        testConfig = testConfigResult.config;

        // Load universal instructions
        const universalResponse = await fetch('/api/test-config?testName=_UNIVERSAL_INSTRUCTIONS');
        const universalResult = await universalResponse.json();

        // Show test info
        document.getElementById('testInfo').innerHTML = `
          <p><strong>Test:</strong> ${studentData.permittedTest}</p>
          <p><strong>Attempt:</strong> ${studentData.attempts}</p>
        `;

        // If universal instructions exist, show them first
        if (universalResult.success && universalResult.config && universalResult.config.segments.length > 0) {
          setupUniversalInstructions(universalResult.config.segments[0]);
          showPage('pageInstructions');
        } else {
          // No universal instructions, go straight to text instructions
          showPage('page2');
        }
      } else {
        throw new Error(sessionResult.message);
      }
    } else {
      errorDiv.textContent = result.message;
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = `Error: ${error.message}`;
    errorDiv.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Continue';
  }
});

// Show proctor setup when moving to page 3
function setupProctorPage() {
  if (!sessionData) return;

  // Generate QR code
  const proctorFullUrl = `${window.location.origin}/proctor?session=${sessionData.sessionId}&pin=${sessionData.proctorPin}`;

  QRCode.toCanvas(
    document.getElementById('qrcode'),
    proctorFullUrl,
    { width: 300 },
    (error) => {
      if (error) console.error('QR code generation error:', error);
    }
  );

  // Display PIN and URL
  document.getElementById('pinDisplay').textContent = sessionData.proctorPin;
  document.getElementById('proctorUrl').textContent = `${window.location.origin}/proctor`;

  // Poll for proctor connection
  checkProctorConnection();
}

// Check if proctor device has connected
async function checkProctorConnection() {
  if (!sessionData) return;

  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/session-status/${sessionData.sessionId}`);
      const result = await response.json();

      if (result.success && result.proctorDeviceConnected) {
        clearInterval(interval);
        document.getElementById('waitingStatus').style.display = 'none';
        document.getElementById('readyStatus').style.display = 'block';
        document.getElementById('proceedBtn').disabled = false;
      }
    } catch (error) {
      console.error('Error checking proctor status:', error);
    }
  }, 2000); // Check every 2 seconds
}

// Override showPage to handle special setup
const originalShowPage = showPage;
showPage = function(pageId) {
  originalShowPage(pageId);

  if (pageId === 'page3') {
    setupProctorPage();
  }
};

// Request camera and microphone permissions
async function requestPermissions() {
  const errorDiv = document.getElementById('permissionError');
  const requestBtn = document.getElementById('requestPermissionsBtn');
  const continueBtn = document.getElementById('continueToTestBtn');

  errorDiv.style.display = 'none';
  requestBtn.disabled = true;

  try {
    mainStream = await navigator.mediaDevices.getUserMedia({
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

    // Show preview
    const previewVideo = document.getElementById('previewVideo');
    previewVideo.srcObject = mainStream;

    // Test microphone
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(mainStream);
    microphone.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function checkAudio() {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      document.getElementById('micLevel').textContent = average > 10 ? '✓ Working' : 'Speak to test...';

      if (average > 10) {
        setTimeout(() => {
          continueBtn.disabled = false;
          document.getElementById('micStatus').innerHTML = '<span style="color: #4caf50;">✓ Microphone is working</span>';
        }, 1000);
      } else {
        requestAnimationFrame(checkAudio);
      }
    }

    checkAudio();

  } catch (error) {
    console.error('Permission error:', error);
    errorDiv.textContent = 'Failed to access camera and microphone. Please grant permissions and try again.';
    errorDiv.style.display = 'block';
    requestBtn.disabled = false;
  }
}

// Start test
document.getElementById('continueToTestBtn')?.addEventListener('click', async () => {
  if (!mainStream) return;

  showPage('page5');

  // Set up video displays
  document.getElementById('mainVideo').srcObject = mainStream;

  // Initialize recorders
  mainRecorder = new RecordingManager('main', sessionData.sessionId);
  await mainRecorder.startRecording(mainStream);

  document.getElementById('mainRecording').classList.add('active');

  // Note: Proctor recorder will be managed by the proctor device
  // For now, we'll show a placeholder for the proctor video
  document.getElementById('proctorVideo').srcObject = null; // Will be handled separately

  // Start test timer
  testStartTime = Date.now();
  startTestTimer();

  // Load first segment
  loadSegment(0);
});

// Test timer
function startTestTimer() {
  testTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    document.getElementById('timerDisplay').textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Check 35-minute limit
    if (minutes >= 35) {
      endTest('Time limit reached');
    }
  }, 1000);
}

// Load audio segment
function loadSegment(index) {
  if (!testConfig || index >= testConfig.segments.length) {
    endTest('All segments completed');
    return;
  }

  currentSegment = index;
  const audioPlayer = document.getElementById('audioPlayer');
  audioPlayer.src = testConfig.segments[index];

  document.getElementById('segmentInfo').textContent =
    `Segment ${index + 1} of ${testConfig.segments.length}`;

  // Auto-play the segment
  audioPlayer.play();

  // When audio ends, show continue button
  audioPlayer.onended = () => {
    document.getElementById('continueBtn').style.display = 'inline-block';
  };
}

// Continue to next segment
function continueToNext() {
  document.getElementById('continueBtn').style.display = 'none';
  loadSegment(currentSegment + 1);
}

// Intervention system
function startIntervention() {
  if (interventionCount >= 10) {
    alert('Maximum interventions reached (10). You cannot request more interventions.');
    return;
  }

  // Show intervention modal
  document.getElementById('interventionModal').classList.add('active');
  document.getElementById('interventionStep1').style.display = 'block';
  document.getElementById('interventionStep2').style.display = 'none';

  // Start recording intervention
  interventionRecorder = new InterventionRecorder(sessionData.sessionId);
  interventionRecorder.startRecording(mainStream);

  // 15-second timer
  let timeLeft = 15;
  const timerEl = document.getElementById('interventionTimer');

  const countdown = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `${timeLeft} seconds`;

    if (timeLeft <= 0) {
      clearInterval(countdown);
      finishIntervention();
    }
  }, 1000);

  // Store interval on window to clear if user clicks finish early
  window.interventionCountdown = countdown;
}

async function finishIntervention() {
  if (window.interventionCountdown) {
    clearInterval(window.interventionCountdown);
  }

  // Stop recording
  await interventionRecorder.stopRecording();

  // Show action selection
  document.getElementById('interventionStep1').style.display = 'none';
  document.getElementById('interventionStep2').style.display = 'block';

  // Update repeat count display
  document.getElementById('repeatCount').textContent = repetitionCount;
}

async function selectInterventionAction(action) {
  interventionCount++;
  updateInterventionDisplay();

  interventionRecorder.setInterventionAction(action);

  if (action === 'repeat') {
    if (repetitionCount > 0) {
      repetitionCount--;
      // Replay current segment
      const audioPlayer = document.getElementById('audioPlayer');
      audioPlayer.currentTime = 0;
      audioPlayer.play();
    } else {
      alert('No repetitions remaining');
    }

    // Close modal
    document.getElementById('interventionModal').classList.remove('active');

  } else if (action === 'research') {
    // Show research pause timer
    document.getElementById('interventionStep2').style.display = 'none';
    document.getElementById('interventionStep3').style.display = 'block';

    // 90-second countdown
    let timeLeft = 90;
    const timerEl = document.getElementById('researchTimer');

    window.researchInterval = setInterval(() => {
      timeLeft--;
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (timeLeft <= 0) {
        clearInterval(window.researchInterval);
        endResearchPause();
      }
    }, 1000);

  } else if (action === 'continue') {
    // Just close modal
    document.getElementById('interventionModal').classList.remove('active');
  }
}

function endResearchPause() {
  if (window.researchInterval) {
    clearInterval(window.researchInterval);
  }

  document.getElementById('interventionModal').classList.remove('active');
  document.getElementById('interventionStep3').style.display = 'none';
}

function updateInterventionDisplay() {
  document.getElementById('interventionCount').textContent = interventionCount;

  const warningEl = document.getElementById('interventionWarning');

  if (interventionCount >= 10) {
    warningEl.textContent = '⚠️ Maximum interventions reached! No more interventions allowed.';
    warningEl.className = 'intervention-limit-danger';
    warningEl.style.display = 'block';
    document.getElementById('interventionBtn').disabled = true;
  } else if (interventionCount >= 5) {
    warningEl.textContent = `⚠️ You have used ${interventionCount - 5} interventions beyond the recommended limit. Points may be deducted.`;
    warningEl.className = 'intervention-limit-warning';
    warningEl.style.display = 'block';
  }
}

// End test
async function endTest(reason = 'Test completed') {
  console.log('Ending test:', reason);

  // Stop timer
  if (testTimer) {
    clearInterval(testTimer);
  }

  // Stop recordings
  if (mainRecorder) {
    await mainRecorder.stopRecording();
    await mainRecorder.uploadFinalVideo(interventionCount);
    mainRecorder.stopStream();
  }

  // Calculate duration
  const duration = Math.floor((Date.now() - testStartTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  // Show completion page
  document.getElementById('summaryStudentId').textContent = studentData.studentId;
  document.getElementById('summaryTest').textContent = studentData.permittedTest;
  document.getElementById('summaryDuration').textContent = `${minutes}m ${seconds}s`;
  document.getElementById('summaryInterventions').textContent = interventionCount;

  showPage('page6');
}

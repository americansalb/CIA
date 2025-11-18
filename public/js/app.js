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
  if (!sessionData) {
    console.error('No session data available');
    return;
  }

  // Generate QR code
  const proctorFullUrl = `${window.location.origin}/proctor?session=${sessionData.sessionId}&pin=${sessionData.proctorPin}`;

  console.log('Setting up proctor page with URL:', proctorFullUrl);

  // Display PIN and URL (primary method - always works)
  document.getElementById('pinDisplay').textContent = sessionData.proctorPin;
  document.getElementById('proctorUrl').textContent = `${window.location.origin}/proctor`;

  // Try to generate QR code (optional enhancement)
  if (typeof QRCode !== 'undefined') {
    try {
      const qrContainer = document.querySelector('.qr-container');
      QRCode.toCanvas(
        document.getElementById('qrcode'),
        proctorFullUrl,
        { width: 250, margin: 2 },
        (error) => {
          if (error) {
            console.error('QR code generation error:', error);
            const errorEl = document.getElementById('qrCodeError');
            if (errorEl) {
              errorEl.textContent = 'QR code unavailable - use PIN method above';
              errorEl.style.display = 'block';
            }
          } else {
            console.log('QR code generated successfully');
            if (qrContainer) qrContainer.style.display = 'block'; // Show QR code if successful
          }
        }
      );
    } catch (error) {
      console.error('QR code exception:', error);
    }
  } else {
    console.warn('QRCode library not loaded - PIN method will be used');
  }

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

// Request camera and microphone permissions
async function requestPermissions() {
  const errorDiv = document.getElementById('permissionError');
  const warningDiv = document.getElementById('qualityWarning');
  const requestBtn = document.getElementById('requestPermissionsBtn');
  const continueBtn = document.getElementById('continueToProctorBtn');
  const qualityChecks = document.getElementById('qualityChecks');

  errorDiv.style.display = 'none';
  warningDiv.style.display = 'none';
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
    qualityChecks.style.display = 'block';

    // Check video quality
    previewVideo.onloadedmetadata = () => {
      const width = previewVideo.videoWidth;
      const height = previewVideo.videoHeight;

      // Resolution check
      const resolutionCheck = document.getElementById('resolutionCheck');
      if (width >= 1280 && height >= 720) {
        resolutionCheck.innerHTML = '<span style="color: #4caf50;">✓ Good (720p+)</span>';
      } else if (width >= 640 && height >= 480) {
        resolutionCheck.innerHTML = '<span style="color: #ff9800;">⚠ Acceptable (480p)</span>';
        warningDiv.textContent = 'Video resolution is lower than recommended. Please use a better camera if possible.';
        warningDiv.style.display = 'block';
      } else {
        resolutionCheck.innerHTML = '<span style="color: #f44336;">✗ Too Low</span>';
        warningDiv.textContent = 'Video resolution is too low. Please use a better camera.';
        warningDiv.style.display = 'block';
      }

      // Start quality checks
      checkVideoQuality();
    };

    // Test microphone
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(mainStream);
    microphone.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let micWorking = false;

    function checkAudio() {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      document.getElementById('micLevel').textContent = average > 10 ? '✓ Working' : 'Speak to test...';

      if (average > 10 && !micWorking) {
        micWorking = true;
        setTimeout(() => {
          document.getElementById('micStatus').innerHTML = '<span style="color: #4caf50;">✓ Microphone is working</span>';
          checkIfReadyToContinue();
        }, 1000);
      } else if (!micWorking) {
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

// Check video quality (lighting and face detection)
let qualityCheckInterval;
function checkVideoQuality() {
  const previewVideo = document.getElementById('previewVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = previewVideo.videoWidth;
  canvas.height = previewVideo.videoHeight;

  qualityCheckInterval = setInterval(() => {
    ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Check lighting (average brightness) - wider range for less sensitivity
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    const lightingLevel = document.getElementById('lightingLevel');
    const warningDiv = document.getElementById('qualityWarning');

    if (avgBrightness > 70 && avgBrightness < 220) {
      lightingLevel.innerHTML = '<span style="color: #4caf50;">✓ Good</span>';
      // Clear warning if it was about lighting
      if (warningDiv.textContent.includes('Lighting')) {
        warningDiv.style.display = 'none';
      }
    } else if (avgBrightness <= 70) {
      lightingLevel.innerHTML = '<span style="color: #ff9800;">⚠ Too Dark</span>';
      warningDiv.textContent = 'Lighting is too dark. Please improve lighting.';
      warningDiv.style.display = 'block';
    } else {
      lightingLevel.innerHTML = '<span style="color: #ff9800;">⚠ Too Bright</span>';
      warningDiv.textContent = 'Lighting is too bright. Please adjust lighting.';
      warningDiv.style.display = 'block';
    }

    // Simple face detection using brightness variance in face region
    const faceRegion = ctx.getImageData(
      canvas.width * 0.25, canvas.height * 0.15,
      canvas.width * 0.5, canvas.height * 0.5
    );
    const faceData = faceRegion.data;
    let faceVariance = 0;
    let faceBrightness = 0;

    for (let i = 0; i < faceData.length; i += 4) {
      const brightness = (faceData[i] + faceData[i + 1] + faceData[i + 2]) / 3;
      faceBrightness += brightness;
    }
    faceBrightness /= (faceData.length / 4);

    // Check if there's sufficient variation (indicating a face vs blank wall)
    for (let i = 0; i < faceData.length; i += 4) {
      const brightness = (faceData[i] + faceData[i + 1] + faceData[i + 2]) / 3;
      faceVariance += Math.abs(brightness - faceBrightness);
    }
    faceVariance /= (faceData.length / 4);

    const faceDetected = document.getElementById('faceDetected');
    // Increased threshold from 20 to 35 for more accurate face detection
    // Also check that brightness isn't too extreme (not a blank white/black screen)
    if (faceVariance > 35 && faceBrightness > 30 && faceBrightness < 230) {
      faceDetected.innerHTML = '<span style="color: #4caf50;">✓ Face Visible</span>';
    } else {
      faceDetected.innerHTML = '<span style="color: #ff9800;">⚠ No Face Detected</span>';
    }

    checkIfReadyToContinue();
  }, 1000);
}

// Check if all quality checks pass (but keep monitoring continuously)
function checkIfReadyToContinue() {
  const faceDetected = document.getElementById('faceDetected').textContent.includes('✓');
  const lightingGood = document.getElementById('lightingLevel').textContent.includes('✓');
  const micWorking = document.getElementById('micStatus').textContent.includes('✓');

  // Enable continue button when all checks pass, but keep monitoring
  const continueBtn = document.getElementById('continueToProctorBtn');
  if (continueBtn) {
    continueBtn.disabled = !(faceDetected && lightingGood && micWorking);
  }
  // Note: Don't clear the interval - keep monitoring continuously
}

// Start test - triggered when clicking Continue from proctor page (page3 -> page5)
// Override the showPage function to handle test start
const origShowPageFunc = showPage;
showPage = async function(pageId) {
  origShowPageFunc(pageId);

  if (pageId === 'page3') {
    setupProctorPage();
  }

  if (pageId === 'page5') {
    // Set up video displays
    if (mainStream) {
      document.getElementById('mainVideo').srcObject = mainStream;

      // Initialize recorders
      mainRecorder = new RecordingManager('main', sessionData.sessionId);
      await mainRecorder.startRecording(mainStream);

      document.getElementById('mainRecording').classList.add('active');

      // Note: Proctor recorder will be managed by the proctor device
      document.getElementById('proctorVideo').srcObject = null; // Will be handled separately

      // Start continuous quality monitoring during test
      startTestQualityMonitoring();

      // Start test timer
      testStartTime = Date.now();
      startTestTimer();

      // Load first segment
      loadSegment(0);
    }
  }
};

// Continue quality monitoring during the test
let testQualityInterval;
function startTestQualityMonitoring() {
  const mainVideo = document.getElementById('mainVideo');
  const monitorDiv = document.getElementById('testQualityMonitor');
  const faceStatus = document.getElementById('testFaceStatus');
  const lightingStatus = document.getElementById('testLightingStatus');

  if (!mainVideo || !monitorDiv) return;

  monitorDiv.style.display = 'block';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  testQualityInterval = setInterval(() => {
    if (mainVideo.videoWidth === 0) return;

    canvas.width = mainVideo.videoWidth;
    canvas.height = mainVideo.videoHeight;
    ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Check lighting
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }
    const avgBrightness = totalBrightness / (data.length / 4);

    if (avgBrightness > 70 && avgBrightness < 220) {
      lightingStatus.innerHTML = 'Lighting: <span style="color: #4caf50;">✓</span>';
    } else {
      lightingStatus.innerHTML = 'Lighting: <span style="color: #f44336;">⚠</span>';
    }

    // Check face presence
    const faceRegion = ctx.getImageData(
      canvas.width * 0.25, canvas.height * 0.15,
      canvas.width * 0.5, canvas.height * 0.5
    );
    const faceData = faceRegion.data;
    let faceVariance = 0;
    let faceBrightness = 0;

    for (let i = 0; i < faceData.length; i += 4) {
      const brightness = (faceData[i] + faceData[i + 1] + faceData[i + 2]) / 3;
      faceBrightness += brightness;
    }
    faceBrightness /= (faceData.length / 4);

    for (let i = 0; i < faceData.length; i += 4) {
      const brightness = (faceData[i] + faceData[i + 1] + faceData[i + 2]) / 3;
      faceVariance += Math.abs(brightness - faceBrightness);
    }
    faceVariance /= (faceData.length / 4);

    // Use same strict face detection as setup page
    if (faceVariance > 35 && faceBrightness > 30 && faceBrightness < 230) {
      faceStatus.innerHTML = 'Face: <span style="color: #4caf50;">✓</span>';
    } else {
      faceStatus.innerHTML = 'Face: <span style="color: #f44336;">⚠</span>';
    }
  }, 2000); // Check every 2 seconds during test
}

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

  // Update segment info
  document.getElementById('segmentInfo').textContent =
    `Segment ${index + 1} of ${testConfig.segments.length}`;

  // Update progress bar
  const progress = ((index + 1) / testConfig.segments.length) * 100;
  document.getElementById('segmentProgressBar').style.width = `${progress}%`;

  // Auto-play the segment
  audioPlayer.play();

  // When audio ends, show continue button
  audioPlayer.onended = () => {
    const continueBtn = document.getElementById('continueBtn');
    continueBtn.style.display = 'inline-flex';
    continueBtn.classList.add('btn-pulse');
    setTimeout(() => continueBtn.classList.remove('btn-pulse'), 1000);
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
      // Update repetitions display
      document.getElementById('repetitionsRemaining').textContent = repetitionCount;
      document.getElementById('repeatCount').textContent = repetitionCount;

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

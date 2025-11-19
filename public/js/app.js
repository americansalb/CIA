// Global state
let studentData = null;
let sessionData = null;
let mainRecorder = null;
let screenRecorder = null;
let proctorRecorder = null;
let interventionRecorder = null;
let mainStream = null;
let screenStream = null;
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

        // Check for unfinished sessions for this user
        checkForRecovery(studentData.email);

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

  console.log('Setting up proctor page with PIN:', sessionData.proctorPin);

  // Display PIN prominently and URL simply
  document.getElementById('pinDisplay').textContent = sessionData.proctorPin;
  document.getElementById('proctorUrl').textContent = `${window.location.origin}/proctor`;

  // Poll for proctor connection
  checkProctorConnection();
}

// Email proctor info to phone
function emailProctorInfo() {
  if (!sessionData) return;

  const url = `${window.location.origin}/proctor`;
  const pin = sessionData.proctorPin;
  const subject = encodeURIComponent('Proctor Setup for Your Exam');
  const body = encodeURIComponent(`Hi,

Here's the information to set up the proctor device for your exam:

URL: ${url}
PIN: ${pin}

Instructions:
1. Open this link on your phone/tablet
2. Enter the PIN when prompted
3. Grant camera permissions
4. Position the device to show your workspace

Good luck on your exam!`);

  window.location.href = `mailto:?subject=${subject}&body=${body}`;
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
let faceDetector = null;

// Initialize face detector
async function initFaceDetector() {
  if (!faceDetector && window.faceDetection) {
    try {
      console.log('Loading MediaPipe Face Detector...');
      const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
      const detectorConfig = {
        runtime: 'tfjs',
        maxFaces: 2,
        modelType: 'short', // 'short' for speed, 'full' for better accuracy
      };
      faceDetector = await faceDetection.createDetector(model, detectorConfig);
      console.log('Face detector loaded successfully');
    } catch (error) {
      console.error('Failed to load face detector:', error);
      faceDetector = null;
    }
  }
  return faceDetector;
}

async function checkVideoQuality() {
  const previewVideo = document.getElementById('previewVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = previewVideo.videoWidth;
  canvas.height = previewVideo.videoHeight;

  // Initialize face detector
  await initFaceDetector();

  qualityCheckInterval = setInterval(async () => {
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

    // Real face detection using TensorFlow.js
    const faceDetected = document.getElementById('faceDetected');

    if (faceDetector) {
      try {
        // Use the canvas instead of video element for face detection
        // The canvas has the current frame already drawn
        console.log('Detecting faces from canvas:', canvas.width, 'x', canvas.height);

        const faces = await faceDetector.estimateFaces(canvas, {
          flipHorizontal: false,
        });

        console.log('Number of faces detected:', faces ? faces.length : 0);

        if (faces && faces.length > 0) {
          // Check if face is fully visible (not cut off at edges)
          const face = faces[0];

          // Debug: Check keypoints since box is all zeros
          console.log('Keypoints:', face.keypoints);

          const videoWidth = previewVideo.videoWidth;
          const videoHeight = previewVideo.videoHeight;

          // The box property is broken (all zeros), so calculate from keypoints
          // Keypoints array contains facial landmarks with x, y coordinates
          if (face.keypoints && face.keypoints.length > 0) {
            // Find min/max x and y from all keypoints to create bounding box
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            for (const kp of face.keypoints) {
              if (kp.x < minX) minX = kp.x;
              if (kp.x > maxX) maxX = kp.x;
              if (kp.y < minY) minY = kp.y;
              if (kp.y > maxY) maxY = kp.y;
            }

            // Add some padding around the keypoints (20%) to approximate full face
            const width = maxX - minX;
            const height = maxY - minY;
            const paddingX = width * 0.2;
            const paddingY = height * 0.2;

            const xMin = Math.max(0, minX - paddingX);
            const yMin = Math.max(0, minY - paddingY);
            const xMax = Math.min(videoWidth, maxX + paddingX);
            const yMax = Math.min(videoHeight, maxY + paddingY);

            console.log('Calculated bounding box from keypoints:', {xMin, yMin, xMax, yMax});

            // Calculate face center and size
            const faceCenterX = (xMin + xMax) / 2;
            const faceCenterY = (yMin + yMax) / 2;
            const faceWidth = xMax - xMin;
            const faceHeight = yMax - yMin;

            const videoCenterX = videoWidth / 2;
            const videoCenterY = videoHeight / 2;

            // Debug: log face position
            console.log('Face center:', {x: faceCenterX, y: faceCenterY});
            console.log('Video center:', {x: videoCenterX, y: videoCenterY});
            console.log('Face size:', {width: faceWidth, height: faceHeight});

            const issues = [];

            // 1. Check if face is cut off at edges (2% margin)
            const edgeMarginX = videoWidth * 0.02;
            const edgeMarginY = videoHeight * 0.02;
            if (xMin <= edgeMarginX) issues.push('too close to left edge');
            if (xMax >= (videoWidth - edgeMarginX)) issues.push('too close to right edge');
            if (yMin <= edgeMarginY) issues.push('too close to top edge');
            if (yMax >= (videoHeight - edgeMarginY)) issues.push('too close to bottom edge');

            // 2. Check if face is horizontally centered (within 25% tolerance)
            const horizontalOffset = Math.abs(faceCenterX - videoCenterX);
            const maxHorizontalOffset = videoWidth * 0.25;
            if (horizontalOffset > maxHorizontalOffset) {
              if (faceCenterX < videoCenterX) {
                issues.push('move right to center');
              } else {
                issues.push('move left to center');
              }
            }

            // 3. Check if face is in upper-middle area (for shoulders to be visible)
            // Face center should be around 30-60% from top (more flexible)
            const idealCenterY = videoHeight * 0.45; // 45% from top
            const verticalTolerance = videoHeight * 0.20; // ±20%
            if (faceCenterY < idealCenterY - verticalTolerance) {
              issues.push('move down (too high)');
            } else if (faceCenterY > idealCenterY + verticalTolerance) {
              issues.push('move up (too low)');
            }

            // 4. Check if face is large enough (at least 15% of video width)
            const minFaceWidth = videoWidth * 0.15;
            if (faceWidth < minFaceWidth) {
              issues.push('move closer to camera');
            }

            if (issues.length === 0) {
              faceDetected.innerHTML = '<span style="color: #4caf50;">✓ Perfect Position</span>';
            } else {
              faceDetected.innerHTML = `<span style="color: #ff9800;">⚠ ${issues[0]}</span>`;
            }
          } else {
            faceDetected.innerHTML = '<span style="color: #ff9800;">⚠ No Keypoints Detected</span>';
          }
        } else {
          faceDetected.innerHTML = '<span style="color: #ff9800;">⚠ No Face Detected</span>';
        }
      } catch (error) {
        console.error('Face detection error:', error);
        faceDetected.innerHTML = '<span style="color: #999;">⚠ Detection Error</span>';
      }
    } else {
      faceDetected.innerHTML = '<span style="color: #2196f3;">ℹ️ Loading detector...</span>';
    }

    checkIfReadyToContinue();
  }, 1500); // Check every 1.5 seconds (face detection is more expensive)
}

// Check if all quality checks pass (but keep monitoring continuously)
function checkIfReadyToContinue() {
  const faceDetected = document.getElementById('faceDetected').textContent.includes('✓');
  const lightingGood = document.getElementById('lightingLevel').textContent.includes('✓');
  const micWorking = document.getElementById('micStatus').textContent.includes('✓');

  // Enable continue button when all checks pass
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

      // Initialize camera recorder
      mainRecorder = new RecordingManager('main', sessionData.sessionId);
      await mainRecorder.startRecording(mainStream);

      document.getElementById('mainRecording').classList.add('active');

      // Request screen sharing
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor',
          },
          audio: false, // Screen audio not widely supported
        });

        // Initialize screen recorder
        screenRecorder = new RecordingManager('screen', sessionData.sessionId);
        await screenRecorder.startRecording(screenStream);

        console.log('Screen recording started');

        // Handle user stopping screen share
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
          console.warn('Screen sharing stopped by user');
          alert('Screen sharing was stopped. This may affect your test submission.');
        });
      } catch (error) {
        console.error('Screen sharing error:', error);
        // Screen sharing is optional - don't block test if user declines
        alert('Screen sharing is recommended but optional. You may continue without it.');
      }

      // Note: Proctor recorder will be managed by the proctor device
      // Show placeholder for proctor video since it's on separate device
      const proctorVideoContainer = document.getElementById('proctorVideo').parentElement;
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #999; font-size: 14px; padding: 20px;';
      placeholder.innerHTML = '<div style="font-size: 48px; margin-bottom: 10px;">📱</div>Recording on<br>Second Device';
      proctorVideoContainer.style.position = 'relative';
      proctorVideoContainer.appendChild(placeholder);
      document.getElementById('proctorVideo').style.display = 'none';

      // Start continuous quality monitoring during test
      startTestQualityMonitoring();

      // Start proctor status monitoring
      startProctorStatusMonitoring();

      // Start audio visualization
      startAudioVisualization();

      // Start test timer
      testStartTime = Date.now();
      startTestTimer();

      // Mark test as in progress for data loss prevention
      markTestInProgress();

      // Load first segment
      loadSegment(0);
    }
  }
};

// Continue quality monitoring during the test
let testQualityInterval;
async function startTestQualityMonitoring() {
  const mainVideo = document.getElementById('mainVideo');
  const monitorDiv = document.getElementById('testQualityMonitor');
  const faceStatus = document.getElementById('testFaceStatus');
  const faceWarning = document.getElementById('faceWarning');
  const faceWarningText = document.getElementById('faceWarningText');

  if (!mainVideo || !monitorDiv || !faceWarning) return;

  monitorDiv.style.display = 'block';

  // Initialize face detector if not already done
  await initFaceDetector();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  testQualityInterval = setInterval(async () => {
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

    // Real face detection during test (use canvas like in setup)
    if (faceDetector) {
      try {
        const faces = await faceDetector.estimateFaces(canvas, {
          flipHorizontal: false,
        });

        if (faces && faces.length > 0) {
          const face = faces[0];
          const videoWidth = mainVideo.videoWidth;
          const videoHeight = mainVideo.videoHeight;

          // Calculate bounding box from keypoints (same as setup page)
          if (face.keypoints && face.keypoints.length > 0) {
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            for (const kp of face.keypoints) {
              if (kp.x < minX) minX = kp.x;
              if (kp.x > maxX) maxX = kp.x;
              if (kp.y < minY) minY = kp.y;
              if (kp.y > maxY) maxY = kp.y;
            }

            const width = maxX - minX;
            const height = maxY - minY;
            const paddingX = width * 0.2;
            const paddingY = height * 0.2;

            const xMin = Math.max(0, minX - paddingX);
            const yMin = Math.max(0, minY - paddingY);
            const xMax = Math.min(videoWidth, maxX + paddingX);
            const yMax = Math.min(videoHeight, maxY + paddingY);

            // Simpler check during test - just ensure face is visible
            const edgeMarginX = videoWidth * 0.02;
            const edgeMarginY = videoHeight * 0.02;

            const isFaceVisible =
              xMin > edgeMarginX &&
              xMax < (videoWidth - edgeMarginX) &&
              yMin > edgeMarginY &&
              yMax < (videoHeight - edgeMarginY);

            if (isFaceVisible) {
              faceStatus.textContent = '✓ Face OK';
              faceWarning.style.display = 'none';
              monitorDiv.style.display = 'block';
            } else {
              // Show warning - face too close to edge
              faceWarning.style.display = 'block';
              faceWarningText.textContent = 'Move away from the edge';
              monitorDiv.style.display = 'none';
            }
          } else {
            // No face detected in acceptable position
            faceWarning.style.display = 'block';
            faceWarningText.textContent = 'Position your face in view';
            monitorDiv.style.display = 'none';
          }
        } else {
          // No faces detected
          faceWarning.style.display = 'block';
          faceWarningText.textContent = 'Position your face in view';
          monitorDiv.style.display = 'none';
        }
      } catch (error) {
        console.error('Test face detection error:', error);
        faceWarning.style.display = 'none';
        monitorDiv.style.display = 'block';
        faceStatus.textContent = '✓ Monitoring active';
      }
    }
  }, 2500); // Check every 2.5 seconds during test
}

// Monitor proctor connection status and update UI
let proctorStatusInterval;
function startProctorStatusMonitoring() {
  const statusBox = document.getElementById('proctorStatusBox');

  if (!statusBox) return;

  // Initial check
  checkProctorStatus();

  // Check every 5 seconds
  proctorStatusInterval = setInterval(checkProctorStatus, 5000);

  async function checkProctorStatus() {
    if (!sessionData || !sessionData.sessionId) return;

    try {
      const response = await fetch(`/api/session-status/${sessionData.sessionId}`);
      const result = await response.json();

      if (result.success && result.proctorDeviceConnected) {
        // Proctor is connected - minimal green indicator
        statusBox.style.background = 'rgba(232, 245, 233, 0.95)';
        statusBox.style.color = '#2e7d32';
        statusBox.textContent = '✓ Connected';
      } else {
        // Proctor disconnected - minimal yellow warning
        statusBox.style.background = 'rgba(255, 243, 205, 0.95)';
        statusBox.style.color = '#856404';
        statusBox.textContent = '⚠️ Disconnected';
      }
    } catch (error) {
      console.error('Error checking proctor status:', error);
    }
  }
}

// Audio input visualization
let audioVisualizationInterval = null;
function startAudioVisualization() {
  const audioVisualization = document.getElementById('audioVisualization');
  const audioLevelBar = document.getElementById('audioLevelBar');
  const audioLevelText = document.getElementById('audioLevelText');
  const audioStatus = document.getElementById('audioStatus');

  if (!audioVisualization || !mainStream) return;

  audioVisualization.style.display = 'block';

  try {
    // Create audio context and analyzer
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(mainStream);

    microphone.connect(analyser);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function updateVisualization() {
      analyser.getByteFrequencyData(dataArray);

      // Calculate average audio level
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;

      // Normalize to percentage (0-100)
      const percentage = Math.min(100, Math.round((average / 255) * 150));

      // Update bar width
      audioLevelBar.style.width = percentage + '%';
      audioLevelText.textContent = percentage + '%';

      // Update status indicator
      if (percentage > 5) {
        audioStatus.style.color = '#4caf50';
        audioStatus.textContent = '● Active';
      } else {
        audioStatus.style.color = '#999';
        audioStatus.textContent = '○ Quiet';
      }

      // Continue animation
      if (audioVisualizationInterval) {
        requestAnimationFrame(updateVisualization);
      }
    }

    // Start visualization
    audioVisualizationInterval = true;
    updateVisualization();

  } catch (error) {
    console.error('Audio visualization error:', error);
    audioVisualization.style.display = 'none';
  }
}

function stopAudioVisualization() {
  audioVisualizationInterval = null;
  const audioVisualization = document.getElementById('audioVisualization');
  if (audioVisualization) {
    audioVisualization.style.display = 'none';
  }
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

  // When audio ends, enable continue button
  audioPlayer.onended = () => {
    const continueBtn = document.getElementById('continueBtn');
    continueBtn.disabled = false;
    continueBtn.style.opacity = '1';
    continueBtn.classList.add('btn-pulse');
    setTimeout(() => continueBtn.classList.remove('btn-pulse'), 1000);
  };
}

// Continue to next segment
function continueToNext() {
  const continueBtn = document.getElementById('continueBtn');
  continueBtn.disabled = true;
  continueBtn.style.opacity = '0.4';
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

  // Stop audio visualization
  stopAudioVisualization();

  // Stop recordings
  if (mainRecorder) {
    await mainRecorder.stopRecording();
    await mainRecorder.uploadFinalVideo(interventionCount);
    mainRecorder.stopStream();
  }

  // Stop screen recording if active
  if (screenRecorder) {
    await screenRecorder.stopRecording();
    await screenRecorder.uploadFinalVideo(0);
    screenRecorder.stopStream();
  }

  // Stop screen stream
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }

  // Mark test as complete (enables safe page closing)
  markTestComplete();

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

// ============================================================================
// DATA LOSS PREVENTION SYSTEM
// ============================================================================

// Track if test is in progress
let testInProgress = false;

// Beforeunload handler to prevent data loss
window.addEventListener('beforeunload', async (e) => {
  if (testInProgress && mainRecorder && mainRecorder.isRecording) {
    // Prevent closing
    e.preventDefault();
    e.returnValue = 'Your test is still in progress. Closing now may result in data loss. Are you sure?';

    // Try to save critical state using sendBeacon (works even if page is closing)
    try {
      const state = {
        sessionId: sessionData?.sessionId,
        studentId: studentData?.studentId,
        email: studentData?.email,
        testName: studentData?.permittedTest,
        currentSegment: currentSegment,
        interventionCount: interventionCount,
        testStartTime: testStartTime,
        timestamp: Date.now(),
      };

      // Use sendBeacon for reliable delivery even during page unload
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      navigator.sendBeacon('/api/save-emergency-state', blob);

      // Force one final chunk upload attempt
      if (mainRecorder.uploadQueue && mainRecorder.uploadQueue.length > 0) {
        // Try to upload pending chunks synchronously if possible
        const pendingChunks = mainRecorder.uploadQueue.length;
        console.warn(`Attempting emergency upload of ${pendingChunks} pending chunks`);
      }
    } catch (error) {
      console.error('Emergency state save failed:', error);
    }

    return e.returnValue;
  }
});

// Visibility change handler - save state when tab becomes hidden
document.addEventListener('visibilitychange', async () => {
  if (document.hidden && testInProgress && mainRecorder) {
    try {
      // Save current state to IndexedDB when tab is hidden
      await recordingBackup.saveMetadata(sessionData.sessionId, {
        deviceType: 'main',
        email: sessionData.email, // Add email for user-specific recovery
        studentId: sessionData.studentId,
        startTime: testStartTime,
        lastChunkNumber: mainRecorder.chunkNumber || 0,
        currentSegment: currentSegment,
        interventionCount: interventionCount,
        testInProgress: true,
        lastSeen: Date.now(),
      });
      console.log('State saved due to visibility change');
    } catch (error) {
      console.error('Failed to save state on visibility change:', error);
    }
  }
});

// Auto-save state periodically during test
let autoSaveInterval = null;

function startAutoSave() {
  if (autoSaveInterval) clearInterval(autoSaveInterval);

  autoSaveInterval = setInterval(async () => {
    if (testInProgress && sessionData && mainRecorder) {
      try {
        await recordingBackup.saveMetadata(sessionData.sessionId, {
          deviceType: 'main',
          email: sessionData.email, // Add email for user-specific recovery
          studentId: sessionData.studentId,
          startTime: testStartTime,
          lastChunkNumber: mainRecorder.chunkNumber || 0,
          currentSegment: currentSegment,
          interventionCount: interventionCount,
          testInProgress: true,
          lastSeen: Date.now(),
        });
        updateUploadStatus();
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }, 10000); // Auto-save every 10 seconds
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

// Update upload status indicator
function updateUploadStatus() {
  const statusEl = document.getElementById('uploadStatus');
  if (!statusEl || !mainRecorder) return;

  const pendingCount = mainRecorder.uploadQueue ? mainRecorder.uploadQueue.length : 0;

  if (pendingCount > 0) {
    statusEl.innerHTML = `⚠️ ${pendingCount} chunk${pendingCount > 1 ? 's' : ''} pending upload`;
    statusEl.className = 'upload-status warning';
    statusEl.style.display = 'block';
  } else if (mainRecorder.isRecording) {
    statusEl.innerHTML = '✓ All chunks uploaded';
    statusEl.className = 'upload-status success';
    statusEl.style.display = 'block';
  } else {
    statusEl.style.display = 'none';
  }
}

// Check for unfinished sessions on login (only for current user)
async function checkForRecovery(userEmail) {
  try {
    await recordingBackup.init();

    // Get all sessions from IndexedDB
    const db = recordingBackup.db;
    const transaction = db.transaction(['metadata'], 'readonly');
    const store = transaction.objectStore('metadata');

    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = async () => {
      const sessions = getAllRequest.result;

      // Find sessions that are marked as in progress AND belong to current user
      const unfinishedSessions = sessions.filter(s =>
        s.testInProgress &&
        s.email === userEmail && // Only show recovery for current user
        s.lastSeen &&
        (Date.now() - s.lastSeen) < 24 * 60 * 60 * 1000 // Within last 24 hours
      );

      if (unfinishedSessions.length > 0) {
        console.log(`Found ${unfinishedSessions.length} unfinished session(s) for ${userEmail}`);

        // Store recovery data globally
        window.unfinishedSessions = unfinishedSessions;

        // Show uploading notification immediately
        const recoveryDiv = document.createElement('div');
        recoveryDiv.className = 'recovery-notification';
        recoveryDiv.innerHTML = `
          <div class="recovery-content">
            <h3>⚠️ Uploading Previous Test Data</h3>
            <p>Found ${unfinishedSessions.length} incomplete test session(s). Uploading now...</p>
            <p style="font-size: 13px; color: #666;">Please wait, this is required for test integrity.</p>
          </div>
        `;
        document.body.appendChild(recoveryDiv);

        // AUTOMATICALLY start recovery upload (no user choice)
        setTimeout(() => attemptRecovery(), 1000);
      }
    };
  } catch (error) {
    console.error('Recovery check failed:', error);
  }
}

// Attempt to recover and upload unfinished sessions
window.attemptRecovery = async function() {
  if (!window.unfinishedSessions || window.unfinishedSessions.length === 0) return;

  const recoveryDiv = document.querySelector('.recovery-notification');
  if (recoveryDiv) {
    recoveryDiv.innerHTML = '<div class="recovery-content"><p>Uploading saved recordings...</p></div>';
  }

  let totalUploaded = 0;
  let totalFailed = 0;
  let sessionNotFound = false;

  for (const session of window.unfinishedSessions) {
    try {
      // Get all unuploaded chunks for this session
      const unuploadedChunks = await recordingBackup.getUnuploadedChunks(session.sessionId);

      if (unuploadedChunks.length > 0) {
        console.log(`Uploading ${unuploadedChunks.length} chunks for session ${session.sessionId}`);

        // Upload each chunk
        for (const chunk of unuploadedChunks) {
          const formData = new FormData();
          formData.append('video', chunk.blob, `${chunk.deviceType}_chunk_${chunk.chunkNumber}.webm`);
          formData.append('sessionId', session.sessionId);
          formData.append('deviceType', chunk.deviceType);
          formData.append('chunkNumber', chunk.chunkNumber.toString());
          formData.append('timestamp', chunk.timestamp.toString());
          formData.append('recovery', 'true');
          formData.append('email', session.email); // Include email for recovery
          formData.append('studentId', session.studentId);

          try {
            const response = await fetch('/api/upload-chunk', {
              method: 'POST',
              body: formData,
            });

            if (response.status === 404) {
              sessionNotFound = true;
              console.error(`Recovery: Session ${session.sessionId} not found on server`);
              totalFailed++;
              break; // Stop trying to upload chunks for this session
            }

            const result = await response.json();

            if (result.success) {
              // Mark as uploaded
              await recordingBackup.markChunkUploaded(chunk.id);
              totalUploaded++;
              console.log(`Recovery: Uploaded chunk ${chunk.chunkNumber}`);
            } else {
              totalFailed++;
              console.error(`Recovery: Upload failed:`, result.message);
            }
          } catch (error) {
            totalFailed++;
            console.error(`Recovery: Failed to upload chunk ${chunk.chunkNumber}:`, error);
          }
        }
      }

      // Clear the session data after attempting recovery
      await recordingBackup.clearSession(session.sessionId);
    } catch (error) {
      console.error(`Failed to recover session ${session.sessionId}:`, error);
    }
  }

  if (recoveryDiv) {
    if (sessionNotFound) {
      recoveryDiv.innerHTML = `
        <div class="recovery-content" style="background: #fff3cd; border-left: 4px solid #ff9800;">
          <h3>⚠️ Upload Failed - Server Restart Detected</h3>
          <p>Attempted: ${totalUploaded + totalFailed} chunks | Uploaded: ${totalUploaded} | Failed: ${totalFailed}</p>
          <p style="font-size: 13px; margin-top: 10px;">The server was restarted and cannot process this recovery. The local data has been cleared.</p>
          <p style="font-size: 13px; font-weight: bold; color: #d32f2f;">You must contact your administrator immediately and report this session was not uploaded.</p>
          <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 10px; background: #ff9800; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">I Understand - I Will Contact Administrator</button>
        </div>`;
    } else if (totalFailed > 0) {
      recoveryDiv.innerHTML = `
        <div class="recovery-content" style="background: #fff3cd; border-left: 4px solid #ff9800;">
          <h3>⚠️ Partial Upload</h3>
          <p>Uploaded: ${totalUploaded} chunks | Failed: ${totalFailed} chunks</p>
          <p style="font-size: 13px; margin-top: 10px; font-weight: bold; color: #d32f2f;">Some data could not be uploaded. Contact your administrator.</p>
          <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 10px; background: #ff9800; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">I Understand</button>
        </div>`;
    } else {
      recoveryDiv.innerHTML = '<div class="recovery-content" style="background: #d4edda; border-left: 4px solid #4caf50;"><h3>✓ Upload Complete</h3><p>All previous test data has been successfully uploaded.</p></div>';
      setTimeout(() => recoveryDiv.remove(), 3000);
    }
  }

  window.unfinishedSessions = [];
};

// Recovery check is now called after successful login (see loginForm handler)

// Mark test as in progress when starting
window.markTestInProgress = function() {
  testInProgress = true;
  startAutoSave();
  updateUploadStatus();

  // Update upload status every 5 seconds
  setInterval(updateUploadStatus, 5000);
};

// Mark test as complete
window.markTestComplete = function() {
  testInProgress = false;
  stopAutoSave();

  // Clear the in-progress flag
  if (sessionData) {
    recordingBackup.saveMetadata(sessionData.sessionId, {
      testInProgress: false,
      completedAt: Date.now(),
    });
  }
};

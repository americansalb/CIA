// Global state
let studentData = null;
let sessionData = null;
let mainRecorder = null;
let screenRecorder = null;
let proctorRecorder = null;
let interventionRecorder = null;
let audioRecorder = null; // Separate high-quality audio recording
let mainStream = null;
let screenStream = null;
let testStartTime = null;
let currentSegment = 0;
let interventionCount = 0;
let testTimer = null;
let testConfig = null;
let isWarmupMode = false;
let warmupCompleted = false;
let isPracticeMode = false;

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
  // Pause all audio and video elements before changing pages
  document.querySelectorAll('audio, video').forEach(media => {
    if (!media.paused && !media.id.includes('mainVideo') && !media.id.includes('proctorVideo')) {
      media.pause();
    }
  });

  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
}

// Load universal instructions (video or audio) for pageTestInstructions
function loadUniversalInstructions() {
  const mediaPlayer = document.getElementById('universalInstructionsMedia');

  // Check if instructions URL was loaded during login
  if (testConfig && testConfig.universalInstructionsUrl) {
    const mediaUrl = testConfig.universalInstructionsUrl;

    // Set the media source (works for both video and audio)
    mediaPlayer.src = mediaUrl;
    mediaPlayer.style.display = 'block';
    mediaPlayer.load();

    // Auto-play the instructions
    mediaPlayer.play().catch(err => {
      console.log('Auto-play blocked, user will need to click play:', err);
    });
  }
}

// Replay instructions audio
function replayInstructionsAudio() {
  const mediaPlayer = document.getElementById('universalInstructionsMedia');
  if (mediaPlayer && mediaPlayer.src) {
    mediaPlayer.currentTime = 0;
    mediaPlayer.play();
  }
}

// Selected test (when multiple tests are available)
let selectedTest = null;

// Login form handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const studentId = document.getElementById('studentId').value.trim();
  const practiceModeCheckbox = document.getElementById('practiceMode');
  isPracticeMode = practiceModeCheckbox?.checked || false;

  if (isPracticeMode) {
    console.log('PRACTICE MODE enabled - proctoring will be skipped');
  }

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
      console.log('Student data:', studentData);
      console.log('Permitted tests:', studentData.permittedTests);

      // Check if student has multiple permitted tests
      if (studentData.permittedTests && studentData.permittedTests.length > 1) {
        // Show test selection page
        showTestSelectionPage(studentData.permittedTests);
      } else if (studentData.permittedTests && studentData.permittedTests.length === 1) {
        // Single test - proceed directly
        studentData.permittedTest = studentData.permittedTests[0];
        await proceedAfterTestSelection();
      } else if (studentData.permittedTest) {
        // Backward compatibility: single permittedTest field
        await proceedAfterTestSelection();
      } else {
        throw new Error('No tests have been assigned to you. Please contact your administrator.');
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

// Show test selection page with available tests
function showTestSelectionPage(permittedTests) {
  const container = document.getElementById('testSelectionContainer');
  container.innerHTML = '';

  permittedTests.forEach((testName, index) => {
    const testOption = document.createElement('div');
    testOption.className = 'test-option';
    testOption.style.cssText = `
      background: white;
      border: 3px solid #e0e0e0;
      border-radius: 12px;
      padding: 20px;
      margin: 15px 0;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 15px;
    `;

    testOption.innerHTML = `
      <div style="width: 30px; height: 30px; border: 3px solid #00897b; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <div class="test-option-check" style="width: 16px; height: 16px; background: #00897b; border-radius: 50%; display: none;"></div>
      </div>
      <div>
        <div style="font-size: 18px; font-weight: 600; color: #333;">${escapeHtml(testName)}</div>
        <div style="font-size: 14px; color: #888; margin-top: 4px;">Option ${index + 1} of ${permittedTests.length}</div>
      </div>
    `;

    testOption.addEventListener('click', () => selectTest(testName, testOption));
    testOption.addEventListener('mouseenter', () => {
      if (selectedTest !== testName) {
        testOption.style.borderColor = '#b2dfdb';
        testOption.style.background = '#f5f5f5';
      }
    });
    testOption.addEventListener('mouseleave', () => {
      if (selectedTest !== testName) {
        testOption.style.borderColor = '#e0e0e0';
        testOption.style.background = 'white';
      }
    });

    container.appendChild(testOption);
  });

  showPage('pageTestSelection');
}

// Handle test selection
function selectTest(testName, element) {
  selectedTest = testName;

  // Update visual state of all options
  document.querySelectorAll('.test-option').forEach(opt => {
    opt.style.borderColor = '#e0e0e0';
    opt.style.background = 'white';
    opt.querySelector('.test-option-check').style.display = 'none';
  });

  // Highlight selected option
  element.style.borderColor = '#00897b';
  element.style.background = '#e0f2f1';
  element.querySelector('.test-option-check').style.display = 'block';

  // Enable continue button
  const selectBtn = document.getElementById('selectTestBtn');
  selectBtn.disabled = false;
  selectBtn.style.opacity = '1';
}

// Confirm test selection and proceed
async function confirmTestSelection() {
  if (!selectedTest) {
    alert('Please select an exam first.');
    return;
  }

  const selectBtn = document.getElementById('selectTestBtn');
  selectBtn.disabled = true;
  selectBtn.textContent = 'Loading...';

  try {
    // Set the selected test as the permitted test
    studentData.permittedTest = selectedTest;
    await proceedAfterTestSelection();
  } catch (error) {
    const errorDiv = document.getElementById('testSelectionError');
    errorDiv.textContent = `Error: ${error.message}`;
    errorDiv.style.display = 'block';
    selectBtn.disabled = false;
    selectBtn.textContent = 'Continue with Selected Exam';
  }
}

// Continue after test selection (common flow for single and multiple tests)
async function proceedAfterTestSelection() {
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

    // Set session ID for error logging
    errorLogger.setSessionId(sessionData.sessionId);
    console.log('✓ Error logging initialized for session:', sessionData.sessionId);

    // Check for unfinished sessions for this user
    checkForRecovery(studentData.email);

    // Load test configuration from Google Sheets
    const testConfigResponse = await fetch(`/api/test-config?testName=${encodeURIComponent(studentData.permittedTest)}`);
    const testConfigResult = await testConfigResponse.json();

    if (!testConfigResult.success || !testConfigResult.config || testConfigResult.config.segments.length === 0) {
      throw new Error(`Test "${studentData.permittedTest}" has not been configured yet. Please contact your administrator.`);
    }

    testConfig = testConfigResult.config;

    // Load universal instructions config (but don't show yet)
    const universalResponse = await fetch('/api/test-config?testName=_UNIVERSAL_INSTRUCTIONS');
    const universalResult = await universalResponse.json();

    console.log('universalResult:', universalResult);
    console.log('universalResult.config.warmupSegments:', universalResult.config?.warmupSegments);
    console.log('universalResult.config.warmupAudioUrl:', universalResult.config?.warmupAudioUrl);

    // Store warmup segments/URL if available
    if (universalResult.success && universalResult.config) {
      if (universalResult.config.warmupSegments && universalResult.config.warmupSegments.length > 0) {
        testConfig.warmupSegments = universalResult.config.warmupSegments;
        console.log('✓ Loaded', testConfig.warmupSegments.length, 'warmup segments into testConfig:', testConfig.warmupSegments);
      } else if (universalResult.config.warmupAudioUrl) {
        testConfig.warmupAudioUrl = universalResult.config.warmupAudioUrl;
        console.log('✓ Loaded warmup URL into testConfig:', testConfig.warmupAudioUrl);
      } else {
        console.warn('✗ No warmup found in universal config!');
      }
      // Store instructions URL for later
      testConfig.universalInstructionsUrl = universalResult.config.segments?.[0] || null;
    } else {
      console.error('✗ universalResult failed or no config!');
    }

    // Practice mode: Skip ALL proctoring (camera, screen share, proctor device)
    if (isPracticeMode) {
      console.log('PRACTICE MODE: Skipping all proctoring, going to test instructions');
      showPage('pageTestInstructions');
    } else {
      // Normal mode: Go to camera/mic setup
      showPage('page4');
    }
  } else {
    throw new Error(sessionResult.message);
  }
}

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

  // Generate QR code for proctor device to scan using QR code API
  const proctorUrl = `${window.location.origin}/proctor?pin=${sessionData.proctorPin}`;
  const qrImage = document.getElementById('qrCode');

  if (qrImage) {
    const encodedUrl = encodeURIComponent(proctorUrl);
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedUrl}&color=00897b`;
    console.log('QR code generated for:', proctorUrl);
  }

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

// Request camera and microphone permissions with MUCH better error handling
async function requestPermissions() {
  const errorDiv = document.getElementById('permissionError');
  const warningDiv = document.getElementById('qualityWarning');
  const requestBtn = document.getElementById('requestPermissionsBtn');
  const continueBtn = document.getElementById('continueToProctorBtn');
  const qualityChecks = document.getElementById('qualityChecks');

  errorDiv.style.display = 'none';
  warningDiv.style.display = 'none';
  requestBtn.disabled = true;
  requestBtn.textContent = 'Checking...';

  // Stop any existing stream before requesting new one
  if (mainStream) {
    mainStream.getTracks().forEach(track => track.stop());
    mainStream = null;
  }

  // Step 1: Check browser compatibility
  const compatCheck = checkBrowserCompatibility();
  if (!compatCheck.compatible) {
    showPermissionError(compatCheck.error, compatCheck.action, false);
    requestBtn.disabled = false;
    requestBtn.textContent = 'Grant Permissions';
    return;
  }

  // Step 2: Check if permissions were previously denied
  const permStatus = await checkPermissionStatus();
  if (permStatus.camera === 'denied' || permStatus.microphone === 'denied') {
    showPermissionError(
      'Camera or microphone permission was previously denied.',
      getPermissionResetInstructions(),
      false
    );
    requestBtn.disabled = false;
    requestBtn.textContent = 'Grant Permissions';
    return;
  }

  // Step 3: Try to get media with progressive fallback
  requestBtn.textContent = 'Requesting access...';

  const constraintConfigs = [
    // Attempt 1: High quality
    {
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    },
    // Attempt 2: Medium quality
    {
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true }
    },
    // Attempt 3: Minimum - just ask for any camera/mic
    {
      video: true,
      audio: true
    }
  ];

  let lastError = null;

  for (let i = 0; i < constraintConfigs.length; i++) {
    try {
      console.log(`[Permissions] Attempt ${i + 1}:`, constraintConfigs[i]);
      mainStream = await navigator.mediaDevices.getUserMedia(constraintConfigs[i]);
      console.log(`[Permissions] Success on attempt ${i + 1}`);
      break; // Success!
    } catch (error) {
      console.warn(`[Permissions] Attempt ${i + 1} failed:`, error.name, error.message);
      lastError = error;

      // Don't retry for permission-related errors
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        break;
      }
    }
  }

  // If we don't have a stream, handle the error
  if (!mainStream) {
    handleMediaError(lastError);
    requestBtn.disabled = false;
    requestBtn.textContent = 'Try Again';
    return;
  }

  // Success! Show preview
  requestBtn.textContent = 'Setting up...';
  const previewVideo = document.getElementById('previewVideo');
  previewVideo.srcObject = mainStream;
  qualityChecks.style.display = 'block';

  // Check video quality
  previewVideo.onloadedmetadata = () => {
    const width = previewVideo.videoWidth;
    const height = previewVideo.videoHeight;

    const resolutionCheck = document.getElementById('resolutionCheck');
    if (width >= 1280 && height >= 720) {
      resolutionCheck.innerHTML = '<span style="color: #4caf50;">✓ Good (720p+)</span>';
    } else if (width >= 640 && height >= 480) {
      resolutionCheck.innerHTML = '<span style="color: #ff9800;">⚠ Acceptable (480p)</span>';
      warningDiv.textContent = 'Video resolution is lower than recommended, but will work.';
      warningDiv.style.display = 'block';
    } else {
      resolutionCheck.innerHTML = '<span style="color: #ff9800;">⚠ Low (' + width + 'x' + height + ')</span>';
      warningDiv.textContent = 'Video resolution is low, but we can continue.';
      warningDiv.style.display = 'block';
    }

    checkVideoQuality();
  };

  // Update button immediately - permissions are granted at this point
  requestBtn.textContent = 'Permissions Granted ✓';
  requestBtn.disabled = true;

  // Test microphone with webkit fallback
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn('AudioContext not supported, skipping mic test');
      document.getElementById('micStatus').innerHTML = '<span style="color: #ff9800;">⚠ Cannot test (old browser)</span>';
      checkIfReadyToContinue();
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(mainStream);
    microphone.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let micWorking = false;
    let checkCount = 0;
    const maxChecks = 150; // 5 seconds at 30fps

    function checkAudio() {
      checkCount++;
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      const micStatusEl = document.getElementById('micStatus');

      if (average > 5) {
        // Sound detected - mic is working
        if (!micWorking) {
          micWorking = true;
          if (micStatusEl) {
            micStatusEl.innerHTML = '<span style="color: #4caf50;">✓ Microphone working</span>';
          }
          checkIfReadyToContinue();
        }
      } else {
        // No sound - show prompt with audio level bar
        if (micStatusEl && !micWorking) {
          const barWidth = Math.min(average * 10, 100);
          micStatusEl.innerHTML = `
            <span style="color: #ff9800;">Say "testing" into your microphone</span>
            <div style="background: #eee; height: 8px; border-radius: 4px; margin-top: 5px; width: 150px;">
              <div style="background: #4caf50; height: 100%; border-radius: 4px; width: ${barWidth}%; transition: width 0.1s;"></div>
            </div>
          `;
        }
      }

      // Keep checking until mic works
      if (!micWorking) {
        requestAnimationFrame(checkAudio);
      }
    }

    checkAudio();
  } catch (audioError) {
    console.error('Audio test error:', audioError);
    document.getElementById('micStatus').innerHTML = '<span style="color: #ff9800;">⚠ Could not test microphone</span>';
    checkIfReadyToContinue();
  }
}

// Check browser compatibility before requesting permissions
function checkBrowserCompatibility() {
  // Check HTTPS
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return {
      compatible: false,
      error: 'Secure connection required',
      action: 'Camera access requires HTTPS. Please access this site using https:// instead of http://'
    };
  }

  // Check getUserMedia support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      compatible: false,
      error: 'Browser not supported',
      action: 'Your browser does not support camera access. Please use Chrome, Firefox, Safari, or Edge.'
    };
  }

  return { compatible: true };
}

// Check current permission status without prompting
async function checkPermissionStatus() {
  const status = { camera: 'unknown', microphone: 'unknown' };

  if (navigator.permissions) {
    try {
      const cam = await navigator.permissions.query({ name: 'camera' });
      status.camera = cam.state;
    } catch (e) { /* not supported */ }

    try {
      const mic = await navigator.permissions.query({ name: 'microphone' });
      status.microphone = mic.state;
    } catch (e) { /* not supported */ }
  }

  return status;
}

// Handle specific media errors with helpful messages
function handleMediaError(error) {
  let title = 'Camera/Microphone Error';
  let message = '';
  let action = '';
  let canRetry = true;

  // Handle null/undefined error
  if (!error) {
    showPermissionError('Unknown Error: Could not access camera or microphone.', 'Please refresh the page and try again.', true);
    return;
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      title = 'Permission Denied';
      message = 'You denied camera/microphone access, or it was blocked.';
      action = getPermissionResetInstructions();
      canRetry = false;
      break;

    case 'NotFoundError':
    case 'DevicesNotFoundError':
      title = 'No Camera/Microphone Found';
      message = 'We could not find a camera or microphone on this device.';
      action = '1. Make sure a camera and microphone are connected\n2. Check that they are not disabled in device settings\n3. Try unplugging and reconnecting them\n4. Click "Try Again"';
      break;

    case 'NotReadableError':
    case 'TrackStartError':
      title = 'Camera/Microphone In Use';
      message = 'Your camera or microphone is being used by another application.';
      action = '1. Close other apps that might use your camera:\n   • Zoom, Skype, Teams, Google Meet\n   • Other browser tabs with video\n   • Photo/video apps\n2. Click "Try Again"';
      break;

    case 'OverconstrainedError':
      title = 'Camera Settings Issue';
      message = 'Your camera does not support the required settings.';
      action = 'We tried multiple settings but none worked. Please try a different camera or browser.';
      break;

    case 'SecurityError':
      title = 'Security Error';
      message = 'Camera access was blocked for security reasons.';
      action = 'Make sure you are using HTTPS and that this site is not blocked in your browser settings.';
      canRetry = false;
      break;

    case 'AbortError':
      title = 'Request Cancelled';
      message = 'The camera request was interrupted.';
      action = 'Please click "Try Again" to retry.';
      break;

    default:
      title = 'Unexpected Error';
      message = error.message || 'An unknown error occurred.';
      action = 'Please refresh the page and try again. If the problem persists, try a different browser.';
  }

  showPermissionError(title + ': ' + message, action, canRetry);
}

// Get browser-specific instructions for resetting permissions
function getPermissionResetInstructions() {
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('chrome') && !ua.includes('edg')) {
    return `To fix this in Chrome:
1. Click the camera icon 🎥 in the address bar (right side)
2. Select "Always allow" for both camera and microphone
3. Click "Done"
4. Refresh this page (Ctrl+R or Cmd+R)

Or go to: chrome://settings/content/camera`;
  }

  if (ua.includes('firefox')) {
    return `To fix this in Firefox:
1. Click the lock icon 🔒 in the address bar
2. Click the X next to "Blocked" for camera/microphone
3. Refresh this page (Ctrl+R or Cmd+R)

Or go to: Settings → Privacy & Security → Permissions`;
  }

  if (ua.includes('safari') && !ua.includes('chrome')) {
    return `To fix this in Safari:
1. Click Safari menu → Settings for This Website
2. Set Camera and Microphone to "Allow"
3. Refresh this page (Cmd+R)

Or go to: Safari → Preferences → Websites → Camera`;
  }

  if (ua.includes('edg')) {
    return `To fix this in Edge:
1. Click the lock icon 🔒 in the address bar
2. Set Camera and Microphone to "Allow"
3. Refresh this page (Ctrl+R)

Or go to: edge://settings/content/camera`;
  }

  return `To allow camera access:
1. Look for a camera or lock icon in your browser's address bar
2. Click it and change permissions to "Allow"
3. Refresh this page

If you don't see the icon, check your browser's settings for site permissions.`;
}

// Show permission error with formatted message
function showPermissionError(message, action, canRetry) {
  const errorDiv = document.getElementById('permissionError');

  errorDiv.innerHTML = `
    <div style="margin-bottom: 10px;"><strong>${escapeHtml(message)}</strong></div>
    <div style="background: #fff; padding: 15px; border-radius: 6px; text-align: left; white-space: pre-wrap; font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.6; color: #333;">${escapeHtml(action)}</div>
    ${!canRetry ? '<div style="margin-top: 10px; color: #d32f2f;"><strong>You may need to refresh the page after changing permissions.</strong></div>' : ''}
  `;
  errorDiv.style.display = 'block';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

    // If elements don't exist (page changed), stop the interval
    if (!lightingLevel || !warningDiv) {
      clearInterval(qualityCheckInterval);
      qualityCheckInterval = null;
      return;
    }

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

// Request screen sharing before continuing to proctor setup
async function requestScreenShareAndContinue() {
  // Practice mode: Skip screen sharing and proctor setup entirely
  if (isPracticeMode) {
    console.log('PRACTICE MODE: Skipping screen sharing and proctor setup');
    showPage('page5'); // Go directly to test instructions
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
      },
      audio: false,
    });

    console.log('Screen sharing granted');

    // Handle user stopping screen share
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      console.warn('Screen sharing stopped by user');
      alert('Screen sharing was stopped. This may affect your test submission.');
    });

    // Continue to proctor page
    showPage('page3');
  } catch (error) {
    console.error('Screen sharing error:', error);
    // Screen sharing is optional - allow user to continue
    const continueAnyway = confirm('Screen sharing is recommended. Continue without it?');
    if (continueAnyway) {
      showPage('page3');
    }
  }
}

// Start test - triggered when clicking Continue from proctor page (page3 -> page5)
// Override the showPage function to handle test start
const origShowPageFunc = showPage;
showPage = async function(pageId) {
  origShowPageFunc(pageId);

  if (pageId === 'page3') {
    setupProctorPage();
  }

  if (pageId === 'pageTestInstructions') {
    // Load universal instructions (video or audio) from _UNIVERSAL_INSTRUCTIONS
    loadUniversalInstructions();
  }

  if (pageId === 'page5') {
    // Show Practice Mode overlay if no camera
    if (isPracticeMode) {
      const overlay = document.getElementById('practiceModeOverlay');
      if (overlay) {
        overlay.style.display = 'flex';
      }
    }

    // Set up video displays and recording (only if camera is available)
    if (mainStream) {
      document.getElementById('mainVideo').srcObject = mainStream;

      // Initialize camera recorder
      mainRecorder = new RecordingManager('main', sessionData.sessionId);
      await mainRecorder.startRecording(mainStream);

      // Initialize screen recorder if screen share was granted earlier
      if (screenStream) {
        try {
          screenRecorder = new RecordingManager('screen', sessionData.sessionId);
          await screenRecorder.startRecording(screenStream);
          console.log('Screen recording started');
        } catch (error) {
          console.error('Screen recording error:', error);
        }
      }

      // Initialize separate audio-only recording (mic + screen audio mixed)
      try {
        audioRecorder = new AudioRecordingManager(sessionData.sessionId);
        await audioRecorder.startRecording(mainStream, screenStream);
        console.log('Audio-only recording started');
      } catch (error) {
        console.error('Audio recording error:', error);
        // Continue without audio-only recording
      }

      // Start continuous quality monitoring during test
      startTestQualityMonitoring();

      // Start proctor status monitoring
      startProctorStatusMonitoring();

      // Show recording indicators immediately (recording starts when page loads)
      showProctorIndicators();

      // Start audio visualization
      startAudioVisualization();

      // Initialize live monitoring with WebRTC
      initializeLiveMonitoring();
    }

    // Hide proctor video element (recording is on separate device)
    document.getElementById('proctorVideo').style.display = 'none';

    // These run regardless of camera (Practice Mode needs these)
    // Start test timer
    testStartTime = Date.now();
    startTestTimer();

    // Mark test as in progress for data loss prevention
    markTestInProgress();

    // Show pre-session overlay - test cannot start until pre-session is done
    if (!isWarmupMode) {
      console.log('Showing pre-session overlay for test');
      showPreSessionOverlay();
    } else {
      console.log('Starting pre-session modal for warmup');
      startMandatoryPreSession();
    }
  }
};

// Continue quality monitoring during the test
let testQualityInterval;
async function startTestQualityMonitoring() {
  const mainVideo = document.getElementById('mainVideo');
  const faceWarning = document.getElementById('faceWarning');
  const faceWarningText = document.getElementById('faceWarningText');

  if (!mainVideo || !faceWarning) return;

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
              // Face is properly positioned - hide warning
              faceWarning.style.display = 'none';
            } else {
              // Show warning - face too close to edge
              faceWarning.style.display = 'block';
              faceWarningText.textContent = '⚠️ Move away from the edge - center your face';
            }
          } else {
            // No face detected in acceptable position
            faceWarning.style.display = 'block';
            faceWarningText.textContent = '⚠️ Position your face in the camera view';
          }
        } else {
          // No faces detected
          faceWarning.style.display = 'block';
          faceWarningText.textContent = '⚠️ Position your face in the camera view';
        }
      } catch (error) {
        console.error('Test face detection error:', error);
        // On error, hide warning to avoid false alarms
        faceWarning.style.display = 'none';
      }
    }
  }, 2500); // Check every 2.5 seconds during test
}

// Show proctor recording and mic indicators
function showProctorIndicators() {
  // Show indicators on main camera
  const mainRecIndicator = document.getElementById('mainRecordingIndicator');
  const mainMicIndicator = document.getElementById('mainMicIndicator');
  const mainMicIcon = document.getElementById('mainMicIcon');

  if (mainRecIndicator) {
    mainRecIndicator.style.display = 'flex';
  }

  if (mainMicIndicator) {
    mainMicIndicator.style.display = 'block';
  }

  // Show indicators on proctor camera
  const recIndicator = document.getElementById('proctorRecordingIndicator');
  const micIndicator = document.getElementById('proctorMicIndicator');
  const micIcon = document.getElementById('proctorMicIcon');

  if (recIndicator) {
    recIndicator.style.display = 'flex';
  }

  if (micIndicator) {
    micIndicator.style.display = 'block';
  }

  // Animate microphones based on audio
  if (mainMicIcon) {
    animateMainMic();
  }
  if (micIcon) {
    animateProctorMic();
  }
}

// Animate main camera microphone icon based on audio level
function animateMainMic() {
  const mainVideo = document.getElementById('mainVideo');
  const micIcon = document.getElementById('mainMicIcon');

  if (!mainVideo || !mainVideo.srcObject || !micIcon) return;

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(mainVideo.srcObject);
    microphone.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function checkAudio() {
      if (!mainVideo.srcObject) return; // Stop if stream ends

      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      // Animate mic if audio detected
      if (average > 10) {
        micIcon.style.animation = 'micBounce 0.3s ease-in-out';
      } else {
        micIcon.style.animation = 'none';
      }

      requestAnimationFrame(checkAudio);
    }

    checkAudio();
  } catch (error) {
    console.log('Main mic animation not available:', error);
  }
}

// Animate proctor microphone icon based on audio level
function animateProctorMic() {
  const proctorVideo = document.getElementById('proctorVideo');
  const micIcon = document.getElementById('proctorMicIcon');

  if (!proctorVideo || !proctorVideo.srcObject || !micIcon) return;

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(proctorVideo.srcObject);
    microphone.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function checkAudio() {
      if (!proctorVideo.srcObject) return; // Stop if stream ends

      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      // Animate mic if audio detected
      if (average > 10) {
        micIcon.style.animation = 'micBounce 0.3s ease-in-out';
      } else {
        micIcon.style.animation = 'none';
      }

      requestAnimationFrame(checkAudio);
    }

    checkAudio();
  } catch (error) {
    console.log('Proctor mic animation not available:', error);
  }
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

    // CRITICAL FIX: Check the actual video stream, not just the session API
    // Session API can return 404 if session expired in memory, but WebRTC stream is still active
    const proctorVideo = document.getElementById('proctorVideo');
    const hasActiveStream = proctorVideo && proctorVideo.srcObject && proctorVideo.srcObject.active;

    if (hasActiveStream) {
      // Video stream is active - this is the source of truth
      statusBox.style.background = 'rgba(232, 245, 233, 0.95)';
      statusBox.style.color = '#2e7d32';
      statusBox.textContent = '✓ Connected';

      // Show recording and mic indicators
      showProctorIndicators();
      return;
    }

    // If no active stream, check API as backup (but don't trust 404s as "disconnected")
    try {
      const response = await fetch(`/api/session-status/${sessionData.sessionId}`);

      // If API returns 404, ignore it - session might just be expired in memory
      if (response.status === 404) {
        // Don't show disconnected warning for 404s
        return;
      }

      const result = await response.json();

      if (result.success && result.proctorDeviceConnected) {
        statusBox.style.background = 'rgba(232, 245, 233, 0.95)';
        statusBox.style.color = '#2e7d32';
        statusBox.textContent = '✓ Connected';
      } else {
        // Only show disconnected if API explicitly says so (not 404)
        statusBox.style.background = 'rgba(255, 243, 205, 0.95)';
        statusBox.style.color = '#856404';
        statusBox.textContent = '⚠️ Disconnected';
      }
    } catch (error) {
      // Network errors - don't show false disconnection warnings
      console.log('Proctor status check failed (non-critical):', error);
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
    // Handle warmup completion vs test completion differently
    if (isWarmupMode) {
      // Warmup completed - show completion modal
      console.log('Warmup completed - showing completion modal');
      const modal = document.getElementById('warmupCompletionModal');
      if (modal) {
        modal.style.display = 'flex';
      }
      warmupCompleted = true;
    } else {
      // Test completed - end test normally
      endTest('All segments completed');
    }
    return;
  }

  currentSegment = index;
  const audioPlayer = document.getElementById('audioPlayer');
  const segmentUrl = testConfig.segments[index];

  console.log(`Loading ${isWarmupMode ? 'warmup' : 'test'} segment ${index + 1}/${testConfig.segments.length}:`, segmentUrl);

  // COMPREHENSIVE ERROR HANDLING: Validate URL before loading
  if (!segmentUrl || typeof segmentUrl !== 'string') {
    const error = `Invalid audio URL: ${segmentUrl}`;
    console.error(error);
    errorLogger.logError('AUDIO', error, '', window.location.href);
    alert(`Audio configuration error. Segment ${index + 1} has an invalid URL. Please contact support.`);
    return;
  }

  // Clear previous error handlers
  audioPlayer.onerror = null;
  audioPlayer.onloadedmetadata = null;

  // Add error handler BEFORE setting src
  audioPlayer.onerror = function(e) {
    const errorMsg = `Failed to load audio segment ${index + 1}/${testConfig.segments.length}`;
    const errorDetails = `URL: ${segmentUrl}, Error code: ${audioPlayer.error?.code}, Message: ${audioPlayer.error?.message}`;

    console.error(errorMsg, errorDetails);
    errorLogger.logError('AUDIO_LOAD', `${errorMsg} - ${errorDetails}`, '', segmentUrl);

    alert(`❌ Audio Failed to Load\n\nSegment ${index + 1} could not be loaded.\n\nPossible causes:\n- CDN configuration issue\n- File not found\n- Network problem\n\nPlease contact support with this error.`);
  };

  // Add success handler
  audioPlayer.onloadedmetadata = function() {
    console.log(`✓ Audio segment ${index + 1} loaded successfully (duration: ${audioPlayer.duration}s)`);
  };

  // Set source
  audioPlayer.src = segmentUrl;

  // Update segment info - different text for warmup vs test
  if (isWarmupMode) {
    document.getElementById('segmentInfo').textContent =
      `Warmup Segment ${index + 1} of ${testConfig.segments.length} (Not Graded)`;
  } else {
    document.getElementById('segmentInfo').textContent =
      `Segment ${index + 1} of ${testConfig.segments.length}`;
  }

  // Update progress bar
  const progress = ((index + 1) / testConfig.segments.length) * 100;
  document.getElementById('segmentProgressBar').style.width = `${progress}%`;

  // Auto-play the segment
  audioPlayer.play().catch(err => {
    const errorMsg = `Audio playback error: ${err.name} - ${err.message}`;
    console.error(errorMsg);
    errorLogger.logError('AUDIO_PLAY', errorMsg, err.stack, segmentUrl);
    alert(`❌ Failed to play audio\n\nSegment ${index + 1} - ${err.message}\n\nPlease check your connection and try again.`);
  });

  // Test mode: Enable continue button immediately ONLY for monkey@aalb.org
  const testEmail = studentData?.email?.toLowerCase().trim();
  const isTestAccount = testEmail === 'monkey@aalb.org';

  if (isTestAccount) {
    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.style.opacity = '1';
      console.log('TEST MODE (monkey@aalb.org): Continue button enabled immediately');
    }
  } else {
    // Ensure button stays disabled for regular users and Practice Mode
    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.style.opacity = '0.5';
    }
  }

  // When audio ends, enable continue button
  audioPlayer.onended = () => {
    console.log(`Audio ended for ${isWarmupMode ? 'warmup' : 'test'} segment ${index + 1}/${testConfig.segments.length}`);

    const continueBtn = document.getElementById('continueBtn');
    const buttonText = document.getElementById('continueButtonText');

    if (!continueBtn || !buttonText) {
      console.error('Continue button or button text not found!');
      return;
    }

    // Check if this is the last segment
    if (index === testConfig.segments.length - 1) {
      if (isWarmupMode) {
        buttonText.textContent = 'Finish Warmup';
        continueBtn.style.background = '#4caf50';
      } else {
        buttonText.textContent = 'Submit Test';
        continueBtn.style.background = '#4caf50';
      }
    } else {
      buttonText.textContent = 'Continue to Next Segment';
      continueBtn.style.background = '';
    }

    continueBtn.disabled = false;
    continueBtn.style.opacity = '1';
    continueBtn.classList.add('btn-pulse');
    console.log('Continue button enabled');
    setTimeout(() => continueBtn.classList.remove('btn-pulse'), 1000);
  };
}

// Continue to next segment or submit test
async function continueToNext() {
  const continueBtn = document.getElementById('continueBtn');
  const buttonText = document.getElementById('continueButtonText');

  continueBtn.disabled = true;
  continueBtn.style.opacity = '0.4';

  // Check if this was the last segment
  if (currentSegment === testConfig.segments.length - 1) {
    if (isWarmupMode) {
      // Warmup finished - show completion modal
      warmupCompleted = true;
      const modal = document.getElementById('warmupCompletionModal');
      if (modal) {
        modal.style.display = 'flex';
      }
    } else {
      // Test finished - submit
      await submitTest();
    }
  } else {
    // Load next segment
    currentSegment++;
    loadSegment(currentSegment);
  }
}

async function submitTest() {
  try {
    // Stop all recordings and ensure all chunks are uploaded
    if (mainRecorder) {
      await mainRecorder.stopRecording();
    }
    if (screenRecorder) {
      await screenRecorder.stopRecording();
    }
    if (audioRecorder) {
      await audioRecorder.stopRecording();
    }

    // Navigate to completion page
    showPage('page6');
  } catch (error) {
    console.error('Error submitting test:', error);
    alert('There was an error submitting your test. Please contact support.');
  }
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

  // Start recording intervention (only if camera is available)
  if (mainStream) {
    interventionRecorder = new InterventionRecorder(sessionData.sessionId);
    interventionRecorder.startRecording(mainStream);
  }

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

  // Stop recording (if available)
  if (interventionRecorder) {
    await interventionRecorder.stopRecording();
  }

  // Show action selection
  document.getElementById('interventionStep1').style.display = 'none';
  document.getElementById('interventionStep2').style.display = 'block';
}

async function selectInterventionAction(action) {
  interventionCount++;
  updateInterventionDisplay();

  if (interventionRecorder) {
    interventionRecorder.setInterventionAction(action);
  }

  if (action === 'repeat') {
    // Replay current segment
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.currentTime = 0;
    audioPlayer.play();

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
  const remaining = 10 - interventionCount;
  document.getElementById('interventionsRemaining').textContent = remaining;

  const warningEl = document.getElementById('interventionWarning');

  if (interventionCount >= 10) {
    warningEl.textContent = '⚠️ Maximum interventions reached! No more interventions allowed.';
    warningEl.className = 'intervention-limit-danger';
    warningEl.style.display = 'block';
    document.getElementById('interventionBtn').disabled = true;
  } else if (interventionCount >= 6) {
    // After 5 penalty-free interventions, show warning
    const penalized = interventionCount - 5;
    warningEl.textContent = `⚠️ You have used ${penalized} penalized intervention${penalized > 1 ? 's' : ''}. Points may be deducted.`;
    warningEl.className = 'intervention-limit-warning';
    warningEl.style.display = 'block';
  } else if (interventionCount === 5) {
    warningEl.textContent = '⚠️ You have used all 5 penalty-free interventions. Further interventions will be penalized.';
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

  // Stop audio-only recording
  if (audioRecorder) {
    await audioRecorder.stopRecording();
    audioRecorder.stopStream();
  }

  // Stop screen stream
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }

  // Mark test as complete (enables safe page closing)
  markTestComplete();

  // Force hide upload progress modal
  const uploadModal = document.getElementById('uploadProgressModal');
  if (uploadModal) {
    uploadModal.style.display = 'none';
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

// ==================== LIVE MONITORING WITH WEBRTC ====================

let socket = null;
let mainStreamPeer = null;

function initializeLiveMonitoring() {
  // Live monitoring is optional - don't break test if it fails
  try {
    if (!sessionData || !mainStream) {
      console.warn('[Live Monitoring] Skipping: missing session or stream');
      return;
    }

    // Check if io is available (Socket.io loaded)
    if (typeof io === 'undefined') {
      console.warn('[Live Monitoring] Socket.io not loaded - monitoring disabled');
      return;
    }

    console.log('[Live Monitoring] Initializing for session:', sessionData.sessionId);

    // Connect to Socket.io server
    socket = io();

    socket.on('connect_error', (error) => {
      console.warn('[Live Monitoring] Connection error (non-fatal):', error.message);
    });

  socket.on('connect', () => {
    console.log('Socket.io connected:', socket.id);

    // Join session as student
    socket.emit('join-session', {
      sessionId: sessionData.sessionId,
      email: studentData.email,
      role: 'student',
    });
  });

  // Handle admin monitoring request
  socket.on('admin-monitoring', ({ adminSocketId }) => {
    console.log('Admin is monitoring this session:', adminSocketId);

    // Create WebRTC peer to stream main camera to admin
    if (mainStream) {
      createPeerForAdmin(adminSocketId, 'main', mainStream);
    }
  });

  // Handle WebRTC signaling from admin
  socket.on('signal', ({ fromSocketId, signal, deviceType }) => {
    console.log('Received signal from admin:', fromSocketId, deviceType);

    // If we have a peer for this admin, forward the signal
    if (mainStreamPeer && mainStreamPeer.targetSocketId === fromSocketId) {
      mainStreamPeer.peer.signal(signal);
    }
  });

  // Send session progress updates periodically
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('session-update', {
        sessionId: sessionData.sessionId,
        currentSegment: currentSegment,
        totalSegments: testConfig ? testConfig.segments.length : 0,
        elapsedTime: testStartTime ? Math.floor((Date.now() - testStartTime) / 1000) : 0,
      });
    }
  }, 3000); // Update every 3 seconds

  socket.on('disconnect', () => {
    console.log('[Live Monitoring] Disconnected');
  });
  } catch (error) {
    console.error('[Live Monitoring] Failed to initialize (non-fatal):', error);
    console.log('[Live Monitoring] Test will continue without live monitoring');
  }
}

function createPeerForAdmin(adminSocketId, deviceType, stream) {
  try {
    console.log('[Live Monitoring] Creating WebRTC peer for admin:', adminSocketId, deviceType);

    // Check if SimplePeer is available
    if (typeof SimplePeer === 'undefined') {
      console.warn('[Live Monitoring] SimplePeer library not loaded');
      return;
    }

    // Create peer (student is initiator, sends stream to admin)
    const peer = new SimplePeer({
      initiator: true,
      stream: stream,
      trickle: false, // Send all ICE candidates at once
    });

  // When peer generates signal, send to server
  peer.on('signal', (signal) => {
    console.log('Sending signal to admin');
    socket.emit('signal', {
      sessionId: sessionData.sessionId,
      targetSocketId: adminSocketId,
      signal: signal,
      deviceType: deviceType,
    });
  });

  peer.on('connect', () => {
    console.log('WebRTC peer connected to admin');
  });

  peer.on('error', (err) => {
    console.error('WebRTC peer error:', err);
  });

  // Store peer reference
  mainStreamPeer = {
    peer: peer,
    targetSocketId: adminSocketId,
    deviceType: deviceType,
  };
  } catch (error) {
    console.error('[Live Monitoring] Failed to create peer (non-fatal):', error);
  }
}

// ==================== WARMUP MODE ====================
function startWarmup() {
  console.log('=== startWarmup() called ===');
  console.log('testConfig:', testConfig);
  console.log('testConfig.warmupSegments:', testConfig?.warmupSegments);
  console.log('testConfig.warmupAudioUrl:', testConfig?.warmupAudioUrl);

  // Check if warmup is configured (either segments or single URL)
  const hasWarmupSegments = testConfig?.warmupSegments?.length > 0;
  const hasWarmupUrl = testConfig?.warmupAudioUrl;

  console.log('hasWarmupSegments:', hasWarmupSegments);
  console.log('hasWarmupUrl:', hasWarmupUrl);

  if (!testConfig || (!hasWarmupSegments && !hasWarmupUrl)) {
    console.error('✗ NO WARMUP FOUND - showing alert');
    alert('Warmup audio has not been configured. Skipping to actual test.');
    skipToTest();
    return;
  }

  console.log('✓ Starting warmup mode...');
  isWarmupMode = true;
  warmupCompleted = false;

  // Update UI to show it's warmup
  const testHeader = document.querySelector('#page5 .test-header h1');
  if (testHeader) {
    testHeader.textContent = 'Warmup Exercise - Practice Mode';
    testHeader.style.background = 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)';
  }

  // Go to test page - pre-session will handle the rest
  showPage('page5');

  // DON'T load warmup here - wait for pre-session to finish
  console.log('Warmup: Navigated to page5, waiting for pre-session...');
}

function skipToTest() {
  isWarmupMode = false;

  // Go directly to test page (pre-session will be shown automatically)
  showPage('page5');
}

// Load warmup segments (warmup works EXACTLY like a test, just not graded)
function loadWarmup() {
  console.log('=== loadWarmup() called ===');
  console.log('testConfig:', testConfig);
  console.log('testConfig.warmupSegments:', testConfig?.warmupSegments);
  console.log('testConfig.warmupAudioUrl:', testConfig?.warmupAudioUrl);

  // Warmup uses the SAME segment system as tests
  // Just loads warmup segments instead of test segments
  currentSegment = 0;

  // Create warmup segments from warmupSegments array or warmupAudioUrl
  let warmupSegments = [];

  if (testConfig.warmupSegments && testConfig.warmupSegments.length > 0) {
    // Use array of warmup segments
    warmupSegments = testConfig.warmupSegments;
    console.log('✓ Using warmupSegments array:', warmupSegments);
  } else if (testConfig.warmupAudioUrl) {
    // Use single warmup URL
    warmupSegments = [testConfig.warmupAudioUrl];
    console.log('✓ Using warmupAudioUrl:', warmupSegments);
  } else {
    // No warmup configured, skip to test
    console.warn('✗ No warmup audio configured, skipping to test');
    alert('No warmup is configured for this test. Starting the actual test.');
    startActualTest();
    return;
  }

  // Validate warmup segments
  warmupSegments = warmupSegments.filter(url => url && url.trim() !== '');

  if (warmupSegments.length === 0) {
    console.warn('No valid warmup segments found, skipping to test');
    alert('No warmup is configured for this test. Starting the actual test.');
    startActualTest();
    return;
  }

  console.log('Loading warmup with', warmupSegments.length, 'segments:', warmupSegments);

  // Temporarily swap test segments with warmup segments
  window.originalTestSegments = testConfig.segments;
  testConfig.segments = warmupSegments;

  // Load first warmup segment using normal segment loading
  loadSegment(0);
}

// Warmup completion options
function replayInstructions() {
  // Confirm first since this will require setting up cameras again
  const confirmed = confirm(
    'Going back to replay instructions will require you to set up your camera and proctor again.\n\n' +
    'Are you sure you want to go back?\n\n' +
    '(Tip: If you just want more practice, click "Do Warmup Again" instead)'
  );

  if (!confirmed) {
    return; // Stay on the modal
  }

  // Hide warmup completion modal
  const modal = document.getElementById('warmupCompletionModal');
  if (modal) {
    modal.style.display = 'none';
  }

  // Go back to instructions page
  showPage('pageTestInstructions');
  loadUniversalInstructions();
}

function redoWarmup() {
  // Hide warmup completion modal
  const modal = document.getElementById('warmupCompletionModal');
  if (modal) {
    modal.style.display = 'none';
  }

  // Reset warmup and reload
  isWarmupMode = true;
  warmupCompleted = false;
  loadWarmup();
}

function startActualTest() {
  // Hide warmup completion modal
  const modal = document.getElementById('warmupCompletionModal');
  if (modal) {
    modal.style.display = 'none';
  }

  // Restore original test segments
  if (window.originalTestSegments) {
    testConfig.segments = window.originalTestSegments;
  }

  // Reset warmup mode
  isWarmupMode = false;

  // CRITICAL: Reset intervention count - warmup interventions don't carry over to actual test
  interventionCount = 0;
  console.log('✓ Intervention count reset to 0 for actual test');

  // Reset segment index to 0 for the actual test
  currentSegment = 0;

  // Update the display to show 10 remaining
  updateInterventionDisplay();

  // Re-enable intervention button in case it was disabled
  const interventionBtn = document.getElementById('interventionBtn');
  if (interventionBtn) {
    interventionBtn.disabled = false;
  }

  // Clear any intervention warnings from warmup
  const warningEl = document.getElementById('interventionWarning');
  if (warningEl) {
    warningEl.style.display = 'none';
    warningEl.className = '';
  }

  // Reset header to normal test mode
  const testHeader = document.querySelector('#page5 .test-header h1');
  if (testHeader) {
    testHeader.textContent = 'Consecutive Interpreting Assessment';
    testHeader.style.background = '';
  }

  // Reset continue button for actual test
  const continueBtn = document.getElementById('continueBtn');
  const buttonText = document.getElementById('continueButtonText');
  continueBtn.style.display = '';
  continueBtn.disabled = true;
  continueBtn.style.opacity = '0.4';
  continueBtn.style.background = '';
  if (buttonText) {
    buttonText.textContent = 'Continue to Next Segment';
  }

  // Show pre-session overlay for the actual test (warmup had its own pre-session)
  showPreSessionOverlay();
}

// ==================== PRE-SESSION OVERLAY ====================
let hasCompletedPreSession = false;

// Show blocking overlay that forces pre-session before test starts
function showPreSessionOverlay() {
  console.log('showPreSessionOverlay() called');
  const overlay = document.getElementById('preSessionOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    console.log('Pre-session overlay displayed');
  } else {
    console.error('preSessionOverlay element not found!');
  }
  hasCompletedPreSession = false;
}

function startMandatoryPreSession() {
  console.log('startMandatoryPreSession() called');
  openPreSessionModal();
}

// ==================== PRE-SESSION MODAL ====================
let preSessionTimer = null;
let preSessionTimeRemaining = 60;
let preSessionResolve = null;

function openPreSessionModal() {
  console.log('openPreSessionModal() called');
  return new Promise((resolve) => {
    preSessionResolve = resolve;
    preSessionTimeRemaining = 60;

    // Show modal
    const modal = document.getElementById('preSessionModal');
    if (modal) {
      modal.style.display = 'flex';
      console.log('Pre-session modal displayed, starting 60s countdown');
    } else {
      console.error('preSessionModal element not found!');
      return;
    }

    // Update title and description based on warmup vs test vs practice mode
    const title = document.getElementById('preSessionTitle');
    const description = document.getElementById('preSessionDescription');

    if (isPracticeMode) {
      if (title) title.textContent = 'Practice Mode Pre-Session';
      if (description) description.innerHTML = 'This is <strong>practice mode</strong> (not graded). Please perform both <strong>pre-session for patient and provider</strong> now.';
    } else if (isWarmupMode) {
      if (title) title.textContent = 'Warmup Pre-Session';
      if (description) description.innerHTML = 'This is the <strong>practice warmup</strong>. Please perform both <strong>pre-session for patient and provider</strong> now.';
    } else {
      if (title) title.textContent = 'Actual Test Pre-Session';
      if (description) description.innerHTML = 'This is the <strong>graded test</strong>. Please perform both <strong>pre-session for patient and provider</strong> now.';
    }

    // Update timer display
    updatePreSessionTimerDisplay();

    // Start countdown
    preSessionTimer = setInterval(() => {
      preSessionTimeRemaining--;
      updatePreSessionTimerDisplay();

      if (preSessionTimeRemaining <= 0) {
        finishPreSession();
      }
    }, 1000);
  });
}

function updatePreSessionTimerDisplay() {
  const timerDisplay = document.getElementById('preSessionTimerDisplay');
  if (!timerDisplay) return;

  const minutes = Math.floor(preSessionTimeRemaining / 60);
  const seconds = preSessionTimeRemaining % 60;
  timerDisplay.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;

  // Change color as time runs low
  if (preSessionTimeRemaining <= 10) {
    timerDisplay.style.color = '#ff5722';
  } else if (preSessionTimeRemaining <= 30) {
    timerDisplay.style.color = '#ff9800';
  } else {
    timerDisplay.style.color = '#00897b';
  }
}

function finishPreSession() {
  // Clear timer
  if (preSessionTimer) {
    clearInterval(preSessionTimer);
    preSessionTimer = null;
  }

  // Hide modal
  const modal = document.getElementById('preSessionModal');
  modal.style.display = 'none';

  // Show countdown before starting
  showCountdown();
}

// Show 3-2-1 countdown
function showCountdown() {
  const countdownModal = document.getElementById('countdownModal');
  const countdownNumber = document.getElementById('countdownNumber');

  countdownModal.style.display = 'flex';

  let count = 3;
  countdownNumber.textContent = count;

  const countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNumber.textContent = count;
    } else {
      clearInterval(countdownInterval);
      countdownModal.style.display = 'none';

      // Hide pre-session overlay if it exists
      const overlay = document.getElementById('preSessionOverlay');
      if (overlay) {
        overlay.style.display = 'none';
      }
      hasCompletedPreSession = true;

      // CRITICAL FIX: Check if we're in warmup mode or test mode
      if (isWarmupMode) {
        // Load warmup audio, not test segment!
        loadWarmup();
      } else {
        // Start the actual test - load first segment
        loadSegment(0);
      }

      // Resolve the promise if waiting
      if (preSessionResolve) {
        preSessionResolve();
        preSessionResolve = null;
      }
    }
  }, 1000);
}


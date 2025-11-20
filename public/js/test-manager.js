// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(tabName + 'Tab').classList.add('active');
}

// Load all tests
async function loadTests() {
  const container = document.getElementById('testsContainer');
  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const response = await fetch('/api/tests');
    const result = await response.json();

    if (result.success) {
      renderTests(result.tests);
    } else {
      container.innerHTML = '<p style="text-align: center; color: #666;">Failed to load tests</p>';
    }
  } catch (error) {
    console.error('Error loading tests:', error);
    container.innerHTML = '<p style="text-align: center; color: #c33;">Error loading tests</p>';
  }
}

// Render test cards
function renderTests(tests) {
  const container = document.getElementById('testsContainer');

  const header = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h3 style="margin: 0;">Test Library</h3>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Configure tests and universal instructions</p>
      </div>
      <button onclick="createNewTest()" style="background: #28a745;">+ Create New Test</button>
    </div>
    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; cursor: pointer;" onclick="editUniversalInstructions()">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #1976d2;">📹 Universal Instructions</strong>
          <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Instructions shown to all students before every test</p>
        </div>
        <span style="color: #1976d2;">Configure →</span>
      </div>
    </div>
  `;

  if (tests.length === 0) {
    container.innerHTML = header + '<div style="text-align: center; padding: 40px; background: white; border-radius: 8px;"><p style="color: #666; margin-bottom: 10px;">No tests configured yet.</p><p style="color: #888; font-size: 14px;">Click "Create New Test" to get started, or add test names to the Students sheet.</p></div>';
    return;
  }

  const testCards = tests.map(test => {
    const statusClass = test.configured ? 'test-configured' : 'test-not-configured';
    const statusText = test.configured ? '✓ Configured' : 'Not Configured';
    const info = test.configured ? `${test.segmentCount} segments configured` : 'Click to add audio segments';

    return `<div class="test-card" onclick="editTest('${test.name}')"><div class="test-card-header"><div class="test-name">${test.name}</div><div class="test-status ${statusClass}">${statusText}</div></div><div class="test-info">${info}</div></div>`;
  }).join('');

  container.innerHTML = header + testCards;
}

// Edit test
let currentTest = null;
let testSegments = [];

async function editTest(testName) {
  currentTest = testName;

  // Load existing config if any
  try {
    const response = await fetch('/api/test-config?testName=' + encodeURIComponent(testName));
    const result = await response.json();

    if (result.success && result.config.segments.length > 0) {
      testSegments = result.config.segments;
    } else {
      testSegments = [''];
    }
  } catch (error) {
    console.error('Error loading test config:', error);
    testSegments = [''];
  }

  renderTestEditor();
}

// Render test editor
function renderTestEditor() {
  const container = document.getElementById('testsContainer');

  container.innerHTML = `
    <div class="test-editor">
      <h2>${currentTest}</h2>
      <p style="color: #666; margin-bottom: 20px;">Configure audio segments for this test. You can fetch a full audio from Bunny.net and split it visually, or add segment URLs manually.</p>

      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2196f3;">
        <p style="margin: 0; color: #1565c0; font-size: 14px;">
          <strong>ℹ️ Note:</strong> Instructions and warmup audio are configured in Universal Instructions (editable from the main test library page)
        </p>
      </div>

      <h3>🎯 Test Segments (Required)</h3>
      <p style="color: #666; margin-bottom: 15px;">These are the actual graded test segments</p>

      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button class="upload-split-btn" onclick="openAudioSplitter()">🎵 Fetch & Split from Bunny.net</button>
        <button class="add-segment-btn" onclick="addSegment()">+ Add Segment URL Manually</button>
      </div>

      <div id="audioSplitterContainer" style="display: none;"></div>

      <div class="segment-list" id="segmentList"></div>

      <div style="margin-top: 30px;">
        <button class="back-btn" onclick="loadTests()">← Back to Tests</button>
        <button onclick="saveTest()">💾 Save Test</button>
      </div>
    </div>
  `;

  renderSegments();
}

// Render segments
function renderSegments() {
  const list = document.getElementById('segmentList');

  list.innerHTML = testSegments.map((url, index) => {
    const segNum = index + 1;
    return '<div class="segment-item"><span style="min-width: 80px; color: #666;">Segment ' + segNum + ':</span><input type="text" value="' + url + '" placeholder="https://your-cdn.b-cdn.net/cia/test/segment' + segNum + '.mp3" onchange="updateSegment(' + index + ', this.value)" /><button onclick="removeSegment(' + index + ')">Remove</button></div>';
  }).join('');
}

// Add segment
function addSegment() {
  testSegments.push('');
  renderSegments();
}

// Update segment
function updateSegment(index, value) {
  testSegments[index] = value;
}

// Remove segment
function removeSegment(index) {
  testSegments.splice(index, 1);
  if (testSegments.length === 0) {
    testSegments = [''];
  }
  renderSegments();
}

// Save test
async function saveTest() {
  // Filter out empty URLs
  const validSegments = testSegments.filter(url => url.trim() !== '');

  if (validSegments.length === 0) {
    alert('Please add at least one segment URL');
    return;
  }

  // Validate URLs
  for (const url of validSegments) {
    if (!url.startsWith('http')) {
      alert('All segment URLs must start with http:// or https://');
      return;
    }
  }

  try {
    const config = {
      testName: currentTest,
      segments: validSegments,
    };

    const response = await fetch('/api/save-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const result = await response.json();

    if (result.success) {
      alert('Test saved successfully!');
      loadTests();
    } else {
      alert('Failed to save test: ' + result.message);
    }
  } catch (error) {
    console.error('Error saving test:', error);
    alert('Error saving test');
  }
}

// Create new test
function createNewTest() {
  const testName = prompt('Enter a name for the new test (e.g., Test_A1, Test_B2):');
  
  if (!testName || testName.trim() === '') {
    return;
  }

  const cleanName = testName.trim();
  
  // Validate test name format
  if (!/^[A-Za-z0-9_]+$/.test(cleanName)) {
    alert('Test name can only contain letters, numbers, and underscores');
    return;
  }

  currentTest = cleanName;
  testSegments = [''];
  renderTestEditor();
}

// Edit universal instructions
let universalWarmupUrl = '';

async function editUniversalInstructions() {
  currentTest = '_UNIVERSAL_INSTRUCTIONS';

  // Load existing config if any
  try {
    const response = await fetch('/api/test-config?testName=' + encodeURIComponent('_UNIVERSAL_INSTRUCTIONS'));
    const result = await response.json();

    if (result.success && result.config.segments.length > 0) {
      testSegments = result.config.segments;
      universalWarmupUrl = result.config.warmupAudioUrl || '';
    } else {
      testSegments = [''];
      universalWarmupUrl = '';
    }
  } catch (error) {
    console.error('Error loading universal instructions:', error);
    testSegments = [''];
    universalWarmupUrl = '';
  }

  renderUniversalInstructionsEditor();
}

// Render universal instructions editor
function renderUniversalInstructionsEditor() {
  const container = document.getElementById('testsContainer');

  container.innerHTML = `
    <div class="test-editor">
      <h2>📹 Universal Instructions & Warmup</h2>
      <p style="color: #666; margin-bottom: 20px;">
        Configure video/audio files that will play for ALL students at the start of every test.
        These should contain general test-taking instructions and optional warmup exercises.
      </p>

      <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <strong style="color: #856404;">💡 Tip:</strong>
        <p style="margin: 5px 0 0 0; color: #856404; font-size: 14px;">
          Record a video explaining: how to position cameras, how to use interventions, test rules, etc.
          Students will see instructions AFTER proctor setup, then can choose to do warmup before the actual test.
        </p>
      </div>

      <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2196f3;">
        <h3 style="margin-top: 0; color: #1565c0;">📢 Instructions (Video or Audio)</h3>
        <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
          Played after proctor connection, before warmup choice
        </p>
        <input
          type="text"
          value="${testSegments[0] || ''}"
          placeholder="https://your-cdn.b-cdn.net/universal-instructions.mp4"
          style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px;"
          onchange="testSegments[0] = this.value"
        />
      </div>

      <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4caf50;">
        <h3 style="margin-top: 0; color: #2e7d32;">🏃 Warmup Audio (Optional)</h3>
        <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
          Practice segment using same interface as actual test (not graded)
        </p>
        <input
          type="text"
          id="universalWarmupInput"
          value="${universalWarmupUrl}"
          placeholder="https://your-cdn.b-cdn.net/warmup-exercise.mp3"
          style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px;"
          onchange="universalWarmupUrl = this.value"
        />
      </div>

      <div style="margin-top: 30px;">
        <button class="back-btn" onclick="loadTests()">← Back to Tests</button>
        <button onclick="saveUniversalInstructions()">💾 Save Instructions & Warmup</button>
      </div>
    </div>
  `;
}

// Save universal instructions
async function saveUniversalInstructions() {
  const url = testSegments[0]?.trim();
  const warmup = universalWarmupUrl?.trim();

  if (!url) {
    const confirmDelete = confirm('No instructions URL provided. This will remove universal instructions. Continue?');
    if (!confirmDelete) return;
  }

  if (url && !url.startsWith('http')) {
    alert('Instructions URL must start with http:// or https://');
    return;
  }

  if (warmup && !warmup.startsWith('http')) {
    alert('Warmup URL must start with http:// or https://');
    return;
  }

  try {
    const config = {
      testName: '_UNIVERSAL_INSTRUCTIONS',
      segments: url ? [url] : [],
    };

    // Add warmup if provided
    if (warmup) {
      config.warmupAudioUrl = warmup;
    }

    const response = await fetch('/api/save-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const result = await response.json();

    if (result.success) {
      alert('Universal instructions & warmup saved successfully!');
      loadTests();
    } else {
      alert('Failed to save: ' + result.message);
    }
  } catch (error) {
    console.error('Error saving universal instructions:', error);
    alert('Error saving universal instructions');
  }
}

// ===== AUDIO SPLITTER =====

let audioFile = null;
let audioBuffer = null;
let audioContext = null;
let markers = [];
let isPlaying = false;
let currentAudioSource = null;
let playbackStartTime = 0;
let playbackOffset = 0;

function openAudioSplitter() {
  const container = document.getElementById('audioSplitterContainer');
  container.style.display = 'block';

  container.innerHTML = `
    <div class="audio-splitter">
      <h3>🎵 Fetch & Split Audio from Bunny.net</h3>
      <p style="color: #666; margin-bottom: 15px;">
        Paste the Bunny.net URL of your full audio file below. CIA will fetch it, show the waveform,
        and let you visually split it into segments.
      </p>

      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <strong style="color: #1976d2;">💡 How it works:</strong>
        <ol style="margin: 10px 0 0 20px; color: #1976d2; font-size: 14px; line-height: 1.8;">
          <li>Upload your full audio to Bunny.net (via Bunny dashboard)</li>
          <li>Copy the CDN URL (e.g., https://yourcdn.b-cdn.net/full-audio.mp3)</li>
          <li>Paste it below and click "Load Audio"</li>
          <li>Click on waveform to mark where segments should split</li>
          <li>CIA splits and uploads segments back to Bunny.net automatically</li>
        </ol>
      </div>

      <div class="upload-area" style="padding: 20px;">
        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #333;">Bunny.net Audio URL:</label>
          <input
            type="text"
            id="bunnyAudioUrl"
            placeholder="https://yourcdn.b-cdn.net/full-test-audio.mp3"
            style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px;"
          />
        </div>
        <button onclick="loadAudioFromUrl()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); width: 100%;">
          📥 Load Audio from Bunny.net
        </button>
      </div>

      <div id="waveformContainer" style="display: none;">
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div>
              <strong id="audioFileName">Audio File</strong>
              <div style="font-size: 14px; color: #666; margin-top: 5px;">
                Click on waveform to add segment markers • <span id="markerCount">0 markers</span> • <span id="segmentCount">1 segment</span>
              </div>
            </div>
            <button onclick="clearAudioFile()" style="background: #dc3545;">Clear</button>
          </div>

          <div style="margin-bottom: 15px;">
            <canvas id="waveformCanvas" style="width: 100%; height: 150px; background: white; border-radius: 4px; cursor: crosshair;"></canvas>
          </div>

          <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
            <button onclick="togglePlayback()" id="playBtn" style="min-width: 100px;">▶ Play</button>
            <div id="playbackTime" style="font-family: monospace; color: #666;">0:00 / 0:00</div>
            <div style="flex: 1;"></div>
            <button onclick="clearMarkers()" style="background: #ffc107;">Clear Markers</button>
          </div>

          <div style="background: white; padding: 15px; border-radius: 8px;">
            <strong>Segment Preview:</strong>
            <div id="segmentPreview" style="margin-top: 10px; color: #666; font-size: 14px;">
              Add markers by clicking on the waveform above
            </div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px;">
          <button onclick="processAndUpload()" class="process-btn" id="processBtn" disabled>
            🚀 Split & Upload to Bunny.net
          </button>
        </div>
      </div>

      <div id="processingStatus" style="display: none; background: #e3f2fd; padding: 20px; border-radius: 8px; text-align: center; margin-top: 20px;">
        <div class="loading-spinner" style="margin: 0 auto 15px auto;"></div>
        <div id="processingMessage">Processing...</div>
      </div>
    </div>
  `;
}

async function loadAudioFromUrl() {
  const urlInput = document.getElementById('bunnyAudioUrl');
  const audioUrl = urlInput.value.trim();

  if (!audioUrl) {
    alert('Please enter a Bunny.net URL');
    return;
  }

  if (!audioUrl.startsWith('http')) {
    alert('Please enter a valid URL starting with http:// or https://');
    return;
  }

  try {
    // Show loading state
    urlInput.disabled = true;
    document.getElementById('audioFileName').textContent = 'Loading audio from Bunny.net...';
    document.getElementById('waveformContainer').style.display = 'block';

    // Initialize AudioContext
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Fetch audio from Bunny.net
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // Store the URL instead of file object
    audioFile = { url: audioUrl, name: audioUrl.split('/').pop() };

    // Decode audio
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Update UI
    document.getElementById('audioFileName').textContent = audioFile.name;

    // Draw waveform
    drawWaveform();

    // Reset markers
    markers = [];
    updateMarkerInfo();

    // Enable process button
    document.getElementById('processBtn').disabled = false;
  } catch (error) {
    console.error('Error loading audio:', error);
    alert('Failed to load audio from URL: ' + error.message + '\n\nMake sure:\n1. The URL is correct\n2. CORS is enabled on Bunny.net\n3. The file exists and is accessible');
    urlInput.disabled = false;
    document.getElementById('waveformContainer').style.display = 'none';
  }
}

function drawWaveform() {
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2; // Retina
  canvas.height = 300;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Get audio data
  const data = audioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / canvas.width);
  const amp = canvas.height / 2;

  // Draw waveform
  ctx.fillStyle = '#667eea';
  ctx.beginPath();

  for (let i = 0; i < canvas.width; i++) {
    let min = 1.0;
    let max = -1.0;

    for (let j = 0; j < step; j++) {
      const datum = data[(i * step) + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }

    const x = i;
    const y1 = (1 + min) * amp;
    const y2 = (1 + max) * amp;

    ctx.fillRect(x, y1, 1, y2 - y1);
  }

  // Draw markers
  markers.forEach((marker, index) => {
    const x = (marker / audioBuffer.duration) * canvas.width;

    ctx.strokeStyle = '#f5576c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

    ctx.fillStyle = '#f5576c';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${index + 1}`, x + 5, 20);
  });

  // Add click listener
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * 2; // Retina
    const time = (x / canvas.width) * audioBuffer.duration;

    addMarker(time);
  };
}

function addMarker(time) {
  markers.push(time);
  markers.sort((a, b) => a - b);
  drawWaveform();
  updateMarkerInfo();
}

function clearMarkers() {
  markers = [];
  drawWaveform();
  updateMarkerInfo();
}

function updateMarkerInfo() {
  document.getElementById('markerCount').textContent = `${markers.length} markers`;
  document.getElementById('segmentCount').textContent = `${markers.length + 1} segments`;

  // Update segment preview
  const preview = document.getElementById('segmentPreview');

  if (markers.length === 0) {
    preview.innerHTML = 'Add markers by clicking on the waveform above';
    return;
  }

  const segments = [];
  let start = 0;

  markers.forEach((marker, index) => {
    const duration = marker - start;
    segments.push(`Segment ${segments.length + 1}: ${formatTime(start)} - ${formatTime(marker)} (${formatTime(duration)})`);
    start = marker;
  });

  // Last segment
  const duration = audioBuffer.duration - start;
  segments.push(`Segment ${segments.length + 1}: ${formatTime(start)} - ${formatTime(audioBuffer.duration)} (${formatTime(duration)})`);

  preview.innerHTML = segments.map(s => `<div style="padding: 5px 0;">${s}</div>`).join('');
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (!audioBuffer) return;

  currentAudioSource = audioContext.createBufferSource();
  currentAudioSource.buffer = audioBuffer;
  currentAudioSource.connect(audioContext.destination);

  playbackStartTime = audioContext.currentTime;
  currentAudioSource.start(0, playbackOffset);

  isPlaying = true;
  document.getElementById('playBtn').textContent = '⏸ Pause';

  currentAudioSource.onended = () => {
    if (isPlaying) {
      stopPlayback();
      playbackOffset = 0;
    }
  };

  updatePlaybackTime();
}

function stopPlayback() {
  if (currentAudioSource) {
    currentAudioSource.stop();
    currentAudioSource = null;
    playbackOffset += audioContext.currentTime - playbackStartTime;

    if (playbackOffset >= audioBuffer.duration) {
      playbackOffset = 0;
    }
  }

  isPlaying = false;
  document.getElementById('playBtn').textContent = '▶ Play';
}

function updatePlaybackTime() {
  if (!isPlaying) return;

  const elapsed = playbackOffset + (audioContext.currentTime - playbackStartTime);
  const total = audioBuffer.duration;

  document.getElementById('playbackTime').textContent =
    `${formatTime(elapsed)} / ${formatTime(total)}`;

  requestAnimationFrame(updatePlaybackTime);
}

function clearAudioFile() {
  stopPlayback();
  audioFile = null;
  audioBuffer = null;
  markers = [];
  playbackOffset = 0;

  document.getElementById('waveformContainer').style.display = 'none';
  document.getElementById('bunnyAudioUrl').value = '';
  document.getElementById('bunnyAudioUrl').disabled = false;
}

async function processAndUpload() {
  if (!audioFile || !audioBuffer) {
    alert('Please load an audio file first');
    return;
  }

  if (markers.length === 0) {
    const confirm = window.confirm('No markers added. Upload as single segment?');
    if (!confirm) return;
  }

  // Show processing status
  document.getElementById('processingStatus').style.display = 'block';
  document.getElementById('processingMessage').textContent = 'Downloading from Bunny.net, splitting, and uploading segments...';
  document.getElementById('processBtn').disabled = true;

  try {
    // Send URL and markers to backend
    const response = await fetch('/api/split-and-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioUrl: audioFile.url,
        testName: currentTest,
        markers: markers,
      }),
    });

    const result = await response.json();

    if (result.success) {
      // Update test segments with URLs
      testSegments = result.segmentUrls;

      alert(`Success! Created ${result.segmentUrls.length} segments`);

      // Close splitter and refresh
      clearAudioFile();
      document.getElementById('audioSplitterContainer').style.display = 'none';
      renderSegments();
    } else {
      throw new Error(result.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Error processing audio:', error);
    alert('Failed to process audio: ' + error.message);
  } finally {
    document.getElementById('processingStatus').style.display = 'none';
    document.getElementById('processBtn').disabled = false;
  }
}

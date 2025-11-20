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
    <!-- Universal Settings Section - Prominent at Top -->
    <div style="background: linear-gradient(135deg, #00897b 0%, #00695c 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px; color: white; box-shadow: 0 4px 12px rgba(0, 137, 123, 0.3);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0 0 10px 0; color: white; font-size: 24px;">⚙️ Universal Settings</h2>
          <p style="margin: 0; opacity: 0.9; font-size: 15px;">Configure instructions and warmup that apply to ALL tests</p>
        </div>
        <button onclick="editUniversalInstructions()" style="background: white; color: #00897b; padding: 15px 30px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          📹 Edit Instructions & Warmup
        </button>
      </div>
    </div>

    <!-- Tests Section -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h3 style="margin: 0;">Individual Tests</h3>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Configure test-specific audio segments</p>
      </div>
      <button onclick="createNewTest()" style="background: #00897b; color: white;">+ Create New Test</button>
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
let warmupSegments = [];

async function editUniversalInstructions() {
  currentTest = '_UNIVERSAL_INSTRUCTIONS';

  // Load existing config if any
  try {
    const response = await fetch('/api/test-config?testName=' + encodeURIComponent('_UNIVERSAL_INSTRUCTIONS'));
    const result = await response.json();

    if (result.success && result.config.segments.length > 0) {
      testSegments = result.config.segments;
      universalWarmupUrl = result.config.warmupAudioUrl || '';
      warmupSegments = result.config.warmupSegments || [];
    } else {
      testSegments = [''];
      universalWarmupUrl = '';
      warmupSegments = [];
    }
  } catch (error) {
    console.error('Error loading universal instructions:', error);
    testSegments = [''];
    universalWarmupUrl = '';
    warmupSegments = [];
  }

  renderUniversalInstructionsEditor();
}

// Add warmup segment
function addWarmupSegment() {
  warmupSegments.push('');
  renderUniversalInstructionsEditor();
}

// Remove warmup segment
function removeWarmupSegment(index) {
  warmupSegments.splice(index, 1);
  renderUniversalInstructionsEditor();
}

// Render universal instructions editor
function renderUniversalInstructionsEditor() {
  const container = document.getElementById('testsContainer');

  const hasInstructions = testSegments[0] && testSegments[0].trim();
  const hasWarmup = universalWarmupUrl && universalWarmupUrl.trim();

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #00897b 0%, #00695c 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px; color: white;">
        <h2 style="margin: 0 0 10px 0; color: white;">⚙️ Universal Settings</h2>
        <p style="margin: 0; opacity: 0.9;">These settings apply to ALL tests. Students will see these BEFORE their individual test begins.</p>
      </div>

      <!-- Test Flow Diagram -->
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
        <h3 style="margin: 0 0 15px 0; color: #333;">📋 Student Flow</h3>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; color: #666;">
          <span style="background: white; padding: 8px 12px; border-radius: 6px;">1. Login</span>
          <span>→</span>
          <span style="background: white; padding: 8px 12px; border-radius: 6px;">2. Camera Setup</span>
          <span>→</span>
          <span style="background: white; padding: 8px 12px; border-radius: 6px;">3. Proctor Connection</span>
          <span>→</span>
          <span style="background: #e3f2fd; padding: 8px 12px; border-radius: 6px; font-weight: 600;">4. Instructions</span>
          <span>→</span>
          <span style="background: #e8f5e9; padding: 8px 12px; border-radius: 6px; font-weight: 600;">5. Warmup Choice</span>
          <span>→</span>
          <span style="background: white; padding: 8px 12px; border-radius: 6px;">6. Test</span>
        </div>
      </div>

      <!-- Instructions Upload -->
      <div style="background: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
          <div style="background: #e3f2fd; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">
            📹
          </div>
          <div>
            <h3 style="margin: 0; color: #1565c0;">Universal Instructions</h3>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Video or audio explaining test rules, camera positioning, and intervention usage</p>
          </div>
        </div>

        <div style="background: #fafafa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <label style="display: block; color: #333; font-weight: 600; margin-bottom: 8px;">
            Upload URL (Bunny.net CDN or direct link)
          </label>
          <input
            type="text"
            value="${testSegments[0] || ''}"
            placeholder="https://your-cdn.b-cdn.net/instructions.mp4"
            style="width: 100%; padding: 12px; border: 2px solid ${hasInstructions ? '#00897b' : '#e0e0e0'}; border-radius: 8px; font-size: 15px; font-family: monospace;"
            onchange="testSegments[0] = this.value"
          />
          ${hasInstructions ? '<p style="margin: 8px 0 0 0; color: #00897b; font-size: 13px;">✓ Instructions configured</p>' : '<p style="margin: 8px 0 0 0; color: #888; font-size: 13px;">Paste your video/audio URL above</p>'}
        </div>

        <div style="background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 3px solid #ffc107;">
          <p style="margin: 0; color: #856404; font-size: 13px;">
            <strong>💡 Tip:</strong> Use MP4 for video or MP3 for audio. Students can skip after 5 seconds if they've seen it before.
          </p>
        </div>
      </div>

      <!-- Warmup Upload -->
      <div style="background: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
          <div style="background: #e8f5e9; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">
            🏃
          </div>
          <div style="flex: 1;">
            <h3 style="margin: 0; color: #2e7d32;">Warmup Segments (Optional)</h3>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Practice segments - same as test format, NOT graded</p>
          </div>
          <button onclick="addWarmupSegment()" style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">
            + Add Segment
          </button>
        </div>

        <div id="warmupSegmentsList" style="display: flex; flex-direction: column; gap: 12px;">
          ${warmupSegments.length > 0 ? warmupSegments.map((url, i) => `
            <div style="background: #fafafa; padding: 15px; border-radius: 8px; display: flex; gap: 10px; align-items: center;">
              <div style="background: #4caf50; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0;">
                ${i + 1}
              </div>
              <input
                type="text"
                value="${url}"
                placeholder="https://your-cdn.b-cdn.net/warmup-segment-${i + 1}.mp3"
                style="flex: 1; padding: 10px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 14px; font-family: monospace;"
                onchange="warmupSegments[${i}] = this.value"
              />
              <button onclick="removeWarmupSegment(${i})" style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
                Remove
              </button>
            </div>
          `).join('') : '<p style="color: #888; text-align: center; padding: 20px;">No warmup segments yet. Click "Add Segment" to create one.</p>'}
        </div>

        <div style="background: #e8f5e9; padding: 12px; border-radius: 6px; border-left: 3px solid #4caf50; margin-top: 15px;">
          <p style="margin: 0; color: #2e7d32; font-size: 13px;">
            <strong>ℹ️ Note:</strong> Warmup works EXACTLY like the test (segments, interventions, next buttons) - just shorter and not graded.
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 15px; justify-content: space-between;">
        <button onclick="loadTests()" style="background: #757575; color: white; padding: 15px 30px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
          ← Back to Test Library
        </button>
        <button onclick="saveUniversalInstructions()" style="background: linear-gradient(135deg, #00897b 0%, #00695c 100%); color: white; padding: 15px 40px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 137, 123, 0.3);">
          💾 Save Universal Settings
        </button>
      </div>
    </div>
  `;
}

// Save universal instructions
async function saveUniversalInstructions() {
  const url = testSegments[0]?.trim();

  if (!url) {
    const confirmDelete = confirm('No instructions URL provided. This will remove universal instructions. Continue?');
    if (!confirmDelete) return;
  }

  if (url && !url.startsWith('http')) {
    alert('Instructions URL must start with http:// or https://');
    return;
  }

  // Validate warmup segments
  const validWarmupSegments = warmupSegments.filter(s => s && s.trim());
  for (const segment of validWarmupSegments) {
    if (!segment.startsWith('http')) {
      alert('All warmup segment URLs must start with http:// or https://');
      return;
    }
  }

  try {
    const config = {
      testName: '_UNIVERSAL_INSTRUCTIONS',
      segments: url ? [url] : [],
    };

    // Add warmup segments if provided
    if (validWarmupSegments.length > 0) {
      config.warmupSegments = validWarmupSegments;
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

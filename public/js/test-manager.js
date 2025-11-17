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

  container.innerHTML = '<div class="test-editor"><h2>' + currentTest + '</h2><p style="color: #666; margin-bottom: 20px;">Add Bunny.net URLs for each audio segment in order. Students will hear these segments sequentially during the test.</p><button class="add-segment-btn" onclick="addSegment()">+ Add Segment</button><div class="segment-list" id="segmentList"></div><div style="margin-top: 30px;"><button class="back-btn" onclick="loadTests()">← Back to Tests</button><button onclick="saveTest()">💾 Save Test</button></div></div>';

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
    const response = await fetch('/api/save-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testName: currentTest,
        segments: validSegments,
      }),
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
async function editUniversalInstructions() {
  currentTest = '_UNIVERSAL_INSTRUCTIONS';
  
  // Load existing config if any
  try {
    const response = await fetch('/api/test-config?testName=' + encodeURIComponent('_UNIVERSAL_INSTRUCTIONS'));
    const result = await response.json();
    
    if (result.success && result.config.segments.length > 0) {
      testSegments = result.config.segments;
    } else {
      testSegments = [''];
    }
  } catch (error) {
    console.error('Error loading universal instructions:', error);
    testSegments = [''];
  }

  renderUniversalInstructionsEditor();
}

// Render universal instructions editor
function renderUniversalInstructionsEditor() {
  const container = document.getElementById('testsContainer');

  container.innerHTML = `
    <div class="test-editor">
      <h2>📹 Universal Instructions</h2>
      <p style="color: #666; margin-bottom: 20px;">
        Configure a video/audio file that will play for ALL students at the start of every test. 
        This should contain general test-taking instructions, microphone check guidance, and camera setup information.
      </p>

      <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <strong style="color: #856404;">💡 Tip:</strong>
        <p style="margin: 5px 0 0 0; color: #856404; font-size: 14px;">
          Record a video explaining: how to position cameras, how to use interventions, test rules, etc.
          Students will see this BEFORE the proctor setup screen.
        </p>
      </div>

      <div class="segment-list">
        <div class="segment-item">
          <span style="min-width: 150px; color: #666;">Instructions URL:</span>
          <input 
            type="text" 
            value="${testSegments[0] || ''}" 
            placeholder="https://your-cdn.b-cdn.net/universal-instructions.mp4"
            onchange="testSegments[0] = this.value"
          />
        </div>
      </div>

      <div style="margin-top: 30px;">
        <button class="back-btn" onclick="loadTests()">← Back to Tests</button>
        <button onclick="saveUniversalInstructions()">💾 Save Instructions</button>
      </div>
    </div>
  `;
}

// Save universal instructions
async function saveUniversalInstructions() {
  const url = testSegments[0]?.trim();

  if (!url) {
    const confirmDelete = confirm('No URL provided. This will remove universal instructions. Continue?');
    if (!confirmDelete) return;
  }

  if (url && !url.startsWith('http')) {
    alert('URL must start with http:// or https://');
    return;
  }

  try {
    const response = await fetch('/api/save-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testName: '_UNIVERSAL_INSTRUCTIONS',
        segments: url ? [url] : [],
      }),
    });

    const result = await response.json();

    if (result.success) {
      alert('Universal instructions saved successfully!');
      loadTests();
    } else {
      alert('Failed to save: ' + result.message);
    }
  } catch (error) {
    console.error('Error saving universal instructions:', error);
    alert('Error saving universal instructions');
  }
}

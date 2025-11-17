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

  if (tests.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; background: white; border-radius: 8px;"><p style="color: #666; margin-bottom: 10px;">No tests found in the Students sheet.</p><p style="color: #888; font-size: 14px;">Add test names to the Permitted Test column in the Students sheet to configure them here.</p></div>';
    return;
  }

  container.innerHTML = tests.map(test => {
    const statusClass = test.configured ? 'test-configured' : 'test-not-configured';
    const statusText = test.configured ? '✓ Configured' : 'Not Configured';
    const info = test.configured ? `${test.segmentCount} segments configured` : 'Click to add audio segments';

    return `<div class="test-card" onclick="editTest('${test.name}')"><div class="test-card-header"><div class="test-name">${test.name}</div><div class="test-status ${statusClass}">${statusText}</div></div><div class="test-info">${info}</div></div>`;
  }).join('');
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

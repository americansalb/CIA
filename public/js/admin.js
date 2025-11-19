// Admin panel script
let adminEmail = null;
let allRecordings = [];
let filteredRecordings = [];

// Admin login
document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errorDiv = document.getElementById('adminLoginError');
  const form = document.getElementById('adminLoginForm');

  errorDiv.style.display = 'none';

  try {
    const response = await fetch('/api/validate-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (result.success) {
      adminEmail = email;
      document.getElementById('adminEmailDisplay').textContent = email;

      // Show dashboard
      showAdminPage('adminDashboard');

      // Load recordings
      await loadRecordings();

      // Load tests
      await loadTests();
    } else {
      errorDiv.textContent = result.message;
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = `Error: ${error.message}`;
    errorDiv.style.display = 'block';
  }
});

function showAdminPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
}

async function loadRecordings() {
  const container = document.getElementById('recordingsContainer');
  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const response = await fetch('/api/recordings');
    const result = await response.json();

    if (result.success) {
      allRecordings = result.recordings;
      filteredRecordings = allRecordings;
      renderRecordings();
    } else {
      container.innerHTML = '<p style="text-align: center; color: #666;">Failed to load recordings</p>';
    }
  } catch (error) {
    console.error('Error loading recordings:', error);
    container.innerHTML = '<p style="text-align: center; color: #c33;">Error loading recordings</p>';
  }
}

function filterRecordings() {
  const statusFilter = document.getElementById('statusFilter').value;
  const sortFilter = document.getElementById('sortFilter').value;

  // Filter by status
  if (statusFilter === 'all') {
    filteredRecordings = [...allRecordings];
  } else {
    filteredRecordings = allRecordings.filter(r => r.status === statusFilter);
  }

  // Sort
  filteredRecordings.sort((a, b) => {
    const dateA = new Date(a.uploadedAt);
    const dateB = new Date(b.uploadedAt);

    if (sortFilter === 'newest') {
      return dateB - dateA;
    } else {
      return dateA - dateB;
    }
  });

  renderRecordings();
}

function renderRecordings() {
  const container = document.getElementById('recordingsContainer');

  if (filteredRecordings.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No recordings found</p>';
    return;
  }

  container.innerHTML = filteredRecordings.map(recording => createRecordingCard(recording)).join('');
}

function createRecordingCard(recording) {
  const date = new Date(recording.uploadedAt).toLocaleString();
  const duration = recording.duration ? (recording.duration === 'incomplete' ? 'Incomplete' : formatDuration(recording.duration)) : 'Unknown';

  let statusClass, statusText;
  if (recording.status === 'incomplete') {
    statusClass = 'status-incomplete';
    statusText = '⚠️ Incomplete (Left Early)';
  } else if (recording.status === 'pending_review') {
    statusClass = 'status-pending';
    statusText = 'Pending Review';
  } else {
    statusClass = 'status-graded';
    statusText = 'Graded';
  }

  const mainVideo = recording.videos.find(v => v.deviceType === 'main');
  const proctorVideo = recording.videos.find(v => v.deviceType === 'proctor');

  const interventionsList = recording.interventions && recording.interventions.length > 0
    ? `<div class="intervention-list">
        <strong>Interventions (${recording.interventions.length}):</strong>
        ${recording.interventions.map((int, idx) => `
          <div class="intervention-item">
            ${idx + 1}. ${int.action} - ${new Date(int.startTime).toLocaleTimeString()}
          </div>
        `).join('')}
      </div>`
    : '<p style="color: #888;">No interventions recorded</p>';

  return `
    <div class="recording-card">
      <div class="recording-header">
        <div>
          <h2 style="margin: 0; color: #333;">${recording.email}</h2>
          <p style="margin: 5px 0 0 0; color: #666;">Student ID: ${recording.studentId}</p>
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>

      <div class="recording-meta">
        <div class="meta-item">
          <div class="meta-label">Test</div>
          <div class="meta-value">${recording.permittedTest}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Duration</div>
          <div class="meta-value">${duration}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Interventions</div>
          <div class="meta-value">${recording.interventionCount || 0}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Uploaded</div>
          <div class="meta-value">${date}</div>
        </div>
      </div>

      <div class="video-links">
        ${mainVideo ? `<button class="video-link" onclick="openVideoPlayer('${recording.sessionId}', 'main', '${recording.email}')">▶️ View Main Camera</button>` : ''}
        ${proctorVideo ? `<button class="video-link" onclick="openVideoPlayer('${recording.sessionId}', 'proctor', '${recording.email}')">▶️ View Proctor Camera</button>` : ''}
      </div>
      <div class="video-links" style="margin-top: 10px;">
        ${mainVideo ? `<a href="${mainVideo.webViewLink}" target="_blank" class="video-link" style="background: #6c757d; font-size: 13px; padding: 8px 16px;">📂 Main on Drive</a>` : ''}
        ${proctorVideo ? `<a href="${proctorVideo.webViewLink}" target="_blank" class="video-link" style="background: #6c757d; font-size: 13px; padding: 8px 16px;">📂 Proctor on Drive</a>` : ''}
      </div>

      ${interventionsList}

      <div class="grading-section">
        <h3 style="margin: 0 0 15px 0;">Grading</h3>
        <form class="grade-form" onsubmit="submitGrade(event, '${recording.sessionId}')">
          <select name="status" required>
            <option value="">Select Status</option>
            <option value="passed" ${recording.status === 'passed' ? 'selected' : ''}>Passed</option>
            <option value="failed" ${recording.status === 'failed' ? 'selected' : ''}>Failed</option>
            <option value="needs_review" ${recording.status === 'needs_review' ? 'selected' : ''}>Needs Review</option>
          </select>

          <textarea name="notes" placeholder="Add grading notes..." rows="4">${recording.notes || ''}</textarea>

          <button type="submit">Save Grade</button>
        </form>

        ${recording.gradedBy ? `
          <p style="margin-top: 10px; color: #888; font-size: 14px;">
            Last graded by ${recording.gradedBy} on ${new Date(recording.gradedAt).toLocaleString()}
          </p>
        ` : ''}
      </div>
    </div>
  `;
}

async function submitGrade(event, sessionId) {
  event.preventDefault();

  const form = event.target;
  const status = form.status.value;
  const notes = form.notes.value;
  const button = form.querySelector('button[type="submit"]');

  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const response = await fetch('/api/update-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        status,
        notes,
        gradedBy: adminEmail,
      }),
    });

    const result = await response.json();

    if (result.success) {
      button.textContent = '✓ Saved';
      setTimeout(() => {
        button.textContent = 'Save Grade';
        button.disabled = false;
      }, 2000);

      // Reload recordings to reflect changes
      await loadRecordings();
    } else {
      alert('Failed to save grade: ' + result.message);
      button.disabled = false;
      button.textContent = 'Save Grade';
    }
  } catch (error) {
    console.error('Error saving grade:', error);
    alert('Error saving grade');
    button.disabled = false;
    button.textContent = 'Save Grade';
  }
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// ====================
// VIDEO PLAYER
// ====================

let currentChunks = [];
let currentChunkIndex = 0;
let currentSession = null;
let currentDevice = null;
let videoElement = null;

async function openVideoPlayer(sessionId, deviceType, studentEmail) {
  currentSession = sessionId;
  currentDevice = deviceType;
  currentChunkIndex = 0;

  const modal = document.getElementById('videoPlayerModal');
  const title = document.getElementById('videoPlayerTitle');
  const videoLoading = document.getElementById('videoLoading');
  const chunkListContainer = document.getElementById('chunkListContainer');

  videoElement = document.getElementById('chunkVideo');

  title.textContent = `${studentEmail} - ${deviceType === 'main' ? 'Main' : 'Proctor'} Camera`;
  modal.classList.add('active');
  videoLoading.style.display = 'block';
  videoElement.style.display = 'none';

  try {
    // Fetch chunks from server
    const response = await fetch(`/api/session-chunks?sessionId=${encodeURIComponent(sessionId)}&deviceType=${encodeURIComponent(deviceType)}`);
    const result = await response.json();

    if (result.success && result.chunks.length > 0) {
      currentChunks = result.chunks;

      // Update totals
      document.getElementById('totalChunks').textContent = currentChunks.length;

      // Build chunk list
      chunkListContainer.innerHTML = currentChunks.map((chunk, index) => `
        <div class="chunk-item ${index === 0 ? 'active' : ''}" id="chunk-item-${index}" onclick="jumpToChunk(${index})">
          Chunk ${chunk.chunkNumber}
          <div style="font-size: 11px; color: #888;">Click to play</div>
        </div>
      `).join('');

      // Play first chunk
      await playChunk(0);
    } else {
      videoLoading.textContent = 'No chunks found for this recording';
    }
  } catch (error) {
    console.error('Error loading chunks:', error);
    videoLoading.textContent = 'Error loading video chunks';
  }
}

async function playChunk(index) {
  if (index < 0 || index >= currentChunks.length) return;

  currentChunkIndex = index;
  const chunk = currentChunks[index];

  const videoLoading = document.getElementById('videoLoading');
  const currentChunkNum = document.getElementById('currentChunkNum');
  const prevBtn = document.getElementById('prevChunkBtn');
  const nextBtn = document.getElementById('nextChunkBtn');

  // Update UI
  currentChunkNum.textContent = index + 1;
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === currentChunks.length - 1;

  // Update chunk list
  document.querySelectorAll('.chunk-item').forEach((item, i) => {
    item.classList.toggle('active', i === index);
    if (i <= index) item.classList.add('loaded');
  });

  // Load video
  videoLoading.style.display = 'block';
  videoLoading.textContent = `Loading chunk ${index + 1}...`;
  videoElement.style.display = 'none';

  try {
    // Set video source
    videoElement.src = chunk.downloadUrl;
    videoElement.load();

    // Wait for video to be ready
    await new Promise((resolve, reject) => {
      videoElement.onloadeddata = resolve;
      videoElement.onerror = reject;
    });

    videoLoading.style.display = 'none';
    videoElement.style.display = 'block';
    videoElement.play();

    // Auto-play next chunk when this one ends
    videoElement.onended = () => {
      if (currentChunkIndex < currentChunks.length - 1) {
        playNextChunk();
      }
    };
  } catch (error) {
    console.error('Error playing chunk:', error);
    videoLoading.textContent = `Error loading chunk ${index + 1}`;
  }
}

function playNextChunk() {
  if (currentChunkIndex < currentChunks.length - 1) {
    playChunk(currentChunkIndex + 1);
  }
}

function playPreviousChunk() {
  if (currentChunkIndex > 0) {
    playChunk(currentChunkIndex - 1);
  }
}

function jumpToChunk(index) {
  playChunk(index);
}

function closeVideoPlayer() {
  const modal = document.getElementById('videoPlayerModal');
  modal.classList.remove('active');

  // Stop video
  if (videoElement) {
    videoElement.pause();
    videoElement.src = '';
  }

  currentChunks = [];
  currentChunkIndex = 0;
  currentSession = null;
  currentDevice = null;
}

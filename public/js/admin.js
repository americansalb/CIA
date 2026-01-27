// Admin panel script
console.log('[Admin] admin.js script loaded at', new Date().toISOString());
let adminEmail = null;
let allRecordings = [];
let practiceAttempts = [];
let filteredRecordings = [];
let currentStatusFilter = 'all';
let expandedRecordings = new Set();

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

      // Initialize live monitoring immediately on login
      console.log('[Admin] Auto-initializing live monitoring on login');
      initializeLiveMonitoring();
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
    // Load both recordings and practice attempts in parallel
    const [recordingsResponse, practiceResponse] = await Promise.all([
      fetch('/api/recordings'),
      fetch('/api/practice-attempts')
    ]);

    const recordingsResult = await recordingsResponse.json();
    const practiceResult = await practiceResponse.json();

    if (recordingsResult.success) {
      allRecordings = recordingsResult.recordings;
    }

    if (practiceResult.success) {
      practiceAttempts = practiceResult.attempts;
    }

    filterRecordings();
  } catch (error) {
    console.error('Error loading recordings:', error);
    container.innerHTML = '<p style="text-align: center; color: #c33;">Error loading recordings</p>';
  }
}

// Combine all attempts into unified list and filter
function filterRecordings() {
  const searchInput = document.getElementById('searchInput');
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const sortFilter = document.getElementById('sortFilter').value;

  // Combine recordings and practice attempts into one list
  let allAttempts = [
    ...allRecordings.map(r => ({
      ...r,
      type: 'recording',
      date: new Date(r.uploadedAt),
      dateStr: r.uploadedAt
    })),
    ...practiceAttempts.map(p => ({
      ...p,
      type: 'practice',
      date: new Date(p.timestamp),
      dateStr: p.timestamp,
      permittedTest: p.testName
    }))
  ];

  // Filter by search
  if (searchQuery) {
    allAttempts = allAttempts.filter(a =>
      (a.email && a.email.toLowerCase().includes(searchQuery)) ||
      (a.studentId && a.studentId.toLowerCase().includes(searchQuery)) ||
      (a.permittedTest && a.permittedTest.toLowerCase().includes(searchQuery))
    );
  }

  // Sort by date
  allAttempts.sort((a, b) => sortFilter === 'newest' ? b.date - a.date : a.date - b.date);

  // Update count
  const countEl = document.getElementById('totalCount');
  if (countEl) countEl.textContent = `${allAttempts.length} attempts`;

  renderCompactTable(allAttempts);
}

function renderCompactTable(attempts) {
  const container = document.getElementById('recordingsContainer');

  if (attempts.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No attempts found</div>';
    return;
  }

  const rows = attempts.map(a => {
    const date = a.date;
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const isPractice = a.type === 'practice';
    const hasVideo = !isPractice && a.videos && a.videos.length > 0;

    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 12px; font-size: 13px;">
          <strong>${a.email || 'N/A'}</strong>
          <span style="color: #888; margin-left: 8px;">${a.studentId || ''}</span>
        </td>
        <td style="padding: 8px 12px; font-size: 13px; color: #555;">${a.permittedTest || 'N/A'}</td>
        <td style="padding: 8px 12px; font-size: 12px; color: #666;">${dateStr}</td>
        <td style="padding: 8px 12px;">
          ${isPractice
            ? '<span style="background: #ff9800; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">Practice</span>'
            : `<span style="background: ${a.status === 'incomplete' ? '#f44336' : '#4caf50'}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${a.status === 'incomplete' ? 'Incomplete' : 'Complete'}</span>`
          }
        </td>
        <td style="padding: 8px 12px;">
          ${hasVideo
            ? `<button onclick="openMultiView('${a.sessionId}', '${a.email}')" style="background: #667eea; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Watch</button>`
            : '<span style="color: #999; font-size: 11px;">No video</span>'
          }
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #666; text-transform: uppercase;">Student</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #666; text-transform: uppercase;">Test</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #666; text-transform: uppercase;">Date</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #666; text-transform: uppercase;">Type</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #666; text-transform: uppercase;">Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
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
        <button class="video-link" onclick="openMultiView('${recording.sessionId}', '${recording.email}')" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          🎬 View All Cameras
        </button>
        ${mainVideo ? `<button class="video-link" onclick="openVideoPlayer('${recording.sessionId}', 'main', '${recording.email}')" style="background: #5c6bc0;">▶️ Main Only</button>` : ''}
        ${proctorVideo ? `<button class="video-link" onclick="openVideoPlayer('${recording.sessionId}', 'proctor', '${recording.email}')" style="background: #26a69a;">▶️ Proctor Only</button>` : ''}
      </div>
      <div class="video-links" style="margin-top: 10px;">
        ${mainVideo ? `<a href="${mainVideo.webViewLink}" target="_blank" class="video-link" style="background: #6c757d; font-size: 13px; padding: 8px 16px;">📂 Main on Drive</a>` : ''}
        ${proctorVideo ? `<a href="${proctorVideo.webViewLink}" target="_blank" class="video-link" style="background: #6c757d; font-size: 13px; padding: 8px 16px;">📂 Proctor on Drive</a>` : ''}
      </div>
      ${recording.videos.some(v => v.needsConversion) ? `
        <div class="video-links" style="margin-top: 10px; background: #fff3cd; padding: 10px; border-radius: 6px;">
          <span style="color: #856404; font-size: 13px; margin-right: 10px;">⚠️ WebM needs conversion for smooth playback:</span>
          ${recording.videos.filter(v => v.needsConversion).map(v => `
            <button
              class="video-link convert-btn-${v.fileId}"
              onclick="convertVideo('${v.fileId}', '${recording.sessionFolderId}', '${v.fileName}', this)"
              style="background: #ff9800; font-size: 13px; padding: 8px 16px;">
              🔄 Convert ${v.deviceType}
            </button>
          `).join('')}
        </div>
      ` : ''}
      ${recording.chunkCount ? `
        <div class="video-links" style="margin-top: 10px; background: #e3f2fd; padding: 10px; border-radius: 6px;">
          <span style="color: #1565c0; font-size: 13px; display: block; margin-bottom: 8px;">🎬 Combine chunks into single video:</span>
          ${recording.chunkCount.main > 0 ? `
            <button
              class="video-link combine-main-btn"
              onclick="combineChunks('${recording.sessionFolderId}', 'main', '${recording.email}', '${recording.studentId}', this)"
              style="background: #2196f3; font-size: 13px; padding: 8px 16px; margin-right: 8px;">
              🔗 Combine Main (${recording.chunkCount.main} chunks)
            </button>
          ` : ''}
          ${recording.chunkCount.proctor > 0 ? `
            <button
              class="video-link combine-proctor-btn"
              onclick="combineChunks('${recording.sessionFolderId}', 'proctor', '${recording.email}', '${recording.studentId}', this)"
              style="background: #2196f3; font-size: 13px; padding: 8px 16px;">
              🔗 Combine Proctor (${recording.chunkCount.proctor} chunks)
            </button>
          ` : ''}
        </div>
      ` : ''}

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

async function convertVideo(fileId, folderId, fileName, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Converting...';
  button.style.background = '#6c757d';

  try {
    const response = await fetch('/api/convert-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, folderId, fileName }),
    });

    const result = await response.json();

    if (result.success) {
      button.textContent = '✓ Queued!';
      button.style.background = '#28a745';

      // Show success message
      setTimeout(() => {
        button.textContent = '✓ Converting in background';
        button.style.opacity = '0.7';
      }, 1500);
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Conversion error:', error);
    button.textContent = '✗ Failed';
    button.style.background = '#dc3545';

    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
      button.style.background = '#ff9800';
    }, 3000);

    alert('Conversion failed: ' + error.message);
  }
}

async function combineChunks(sessionFolderId, deviceType, email, studentId, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Combining...';
  button.style.background = '#6c757d';

  try {
    const response = await fetch('/api/combine-chunks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionFolderId, deviceType, email, studentId }),
    });

    const result = await response.json();

    if (result.success) {
      button.textContent = '✓ Queued!';
      button.style.background = '#28a745';

      // Show success message
      setTimeout(() => {
        button.textContent = '✓ Combining in background';
        button.style.opacity = '0.7';
      }, 1500);
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Combine chunks error:', error);
    button.textContent = '✗ Failed';
    button.style.background = '#dc3545';

    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
      button.style.background = '#2196f3';
    }, 3000);

    alert('Combine chunks failed: ' + error.message);
  }
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

      // Update the local recording data without reloading
      const recording = allRecordings.find(r => r.sessionId === sessionId);
      if (recording) {
        recording.status = status;
        recording.notes = notes;
        recording.gradedBy = adminEmail;
        recording.gradedAt = new Date().toISOString();
        updateFilterCounts();
      }

      setTimeout(() => {
        button.textContent = 'Save';
        button.disabled = false;
      }, 1500);
    } else {
      alert('Failed to save grade: ' + result.message);
      button.disabled = false;
      button.textContent = 'Save';
    }
  } catch (error) {
    console.error('Error saving grade:', error);
    alert('Error saving grade');
    button.disabled = false;
    button.textContent = 'Save';
  }
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


// ==================== LIVE MONITORING WITH WEBRTC ====================

let adminSocket = null;
let activeSessions = [];
let monitoringPeers = new Map(); // sessionId -> peer object
let currentlyMonitoring = null;

console.log('[Admin] Defining switchTab function');

function switchTab(tabName, event) {
  console.log('[Admin] switchTab called:', tabName);

  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  // Show selected tab
  if (tabName === 'live') {
    console.log('[Admin] Switching to live monitoring tab');
    document.getElementById('liveTab').classList.add('active');
    if (event) event.target.classList.add('active');
    initializeLiveMonitoring();
  } else if (tabName === 'recordings') {
    document.getElementById('recordingsTab').classList.add('active');
    if (event) event.target.classList.add('active');
  } else if (tabName === 'tests') {
    document.getElementById('testsTab').classList.add('active');
    if (event) event.target.classList.add('active');
  }
}

function initializeLiveMonitoring() {
  console.log('[Admin] initializeLiveMonitoring() called');
  console.log('[Admin] Socket.io available?', typeof io !== 'undefined');
  console.log('[Admin] adminSocket exists?', !!adminSocket);
  console.log('[Admin] adminEmail:', adminEmail);

  if (adminSocket && adminSocket.connected) {
    console.log('[Admin] Already connected to live monitoring');
    return;
  }

  if (typeof io === 'undefined') {
    console.error('[Admin] Socket.io library not loaded!');
    return;
  }

  console.log('[Admin] Initializing live monitoring...');

  // Connect to Socket.io
  adminSocket = io();

  adminSocket.on('connect', () => {
    console.log('Admin Socket.io connected:', adminSocket.id);

    // Join as admin
    adminSocket.emit('join-session', {
      sessionId: 'admin',
      email: adminEmail,
      role: 'admin',
    });
  });

  // Receive list of active sessions
  adminSocket.on('active-sessions', (sessions) => {
    console.log('Active sessions updated:', sessions);
    activeSessions = sessions;
    renderActiveSessions();
  });

  // Receive session progress updates
  adminSocket.on('session-progress', (update) => {
    console.log('Session progress:', update);
    updateSessionProgress(update);
  });

  // Receive WebRTC signals from students
  adminSocket.on('signal', ({ fromSocketId, signal, deviceType, sessionId, email }) => {
    console.log('Received signal from student:', sessionId, deviceType);

    // Create peer to receive stream if we're monitoring this student
    if (currentlyMonitoring && currentlyMonitoring.sessionId === sessionId) {
      handleStudentSignal(fromSocketId, signal, deviceType, sessionId, email);
    }
  });

  adminSocket.on('disconnect', () => {
    console.log('Admin Socket.io disconnected');
  });
}

function renderActiveSessions() {
  const container = document.getElementById('activeSessionsContainer');

  if (activeSessions.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: #999;">
        <div style="font-size: 64px; margin-bottom: 20px;">📺</div>
        <p style="font-size: 18px; margin: 0;">No active tests at the moment</p>
        <p style="font-size: 14px; margin-top: 10px;">Students will appear here when they start their tests</p>
      </div>
    `;
    return;
  }

  container.innerHTML = activeSessions.map(session => createSessionCard(session)).join('');
}

function createSessionCard(session) {
  const elapsed = session.elapsedTime || 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes + ':' + String(seconds).padStart(2, '0');

  return `
    <div class="recording-card" style="position: relative;">
      <div class="recording-header">
        <div>
          <h2 style="margin: 0; color: #333;">${session.email}</h2>
          <p style="margin: 5px 0 0 0; color: #666;">Session: ${session.sessionId.substring(0, 8)}...</p>
        </div>
        <span style="padding: 6px 12px; background: #4caf50; color: white; border-radius: 20px; font-size: 14px; font-weight: 600;">
          🔴 LIVE
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 15px 0;">
        <div style="text-align: center; padding: 10px; background: #f5f5f5; border-radius: 6px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Segment</div>
          <div style="font-size: 20px; font-weight: 600; color: #333;">${session.currentSegment || 0}/${session.totalSegments || 0}</div>
        </div>
        <div style="text-align: center; padding: 10px; background: #f5f5f5; border-radius: 6px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Elapsed</div>
          <div style="font-size: 20px; font-weight: 600; color: #333;">${timeStr}</div>
        </div>
      </div>

      <button onclick="monitorStudent('${session.sessionId}', '${session.email}')" style="width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s;">
        📹 Monitor Live Stream
      </button>
    </div>
  `;
}

function updateSessionProgress(update) {
  const session = activeSessions.find(s => s.sessionId === update.sessionId);
  if (session) {
    session.currentSegment = update.currentSegment;
    session.totalSegments = update.totalSegments;
    session.elapsedTime = update.elapsedTime;
    renderActiveSessions();

    // Update modal if currently monitoring this session
    if (currentlyMonitoring && currentlyMonitoring.sessionId === update.sessionId) {
      updateLiveSessionInfo(update);
    }
  }
}

function monitorStudent(sessionId, email) {
  console.log('Starting to monitor student:', sessionId, email);

  currentlyMonitoring = { sessionId, email };

  // Show modal
  const modal = document.getElementById('liveStreamModal');
  const title = document.getElementById('liveStreamTitle');

  title.textContent = `Live Monitoring - ${email}`;
  modal.classList.add('active');

  // Request to monitor this student
  adminSocket.emit('monitor-student', { sessionId });

  // Show session info
  const session = activeSessions.find(s => s.sessionId === sessionId);
  if (session) {
    updateLiveSessionInfo(session);
  }
}

function handleStudentSignal(fromSocketId, signal, deviceType, sessionId, email) {
  console.log('Handling student signal for device:', deviceType);

  // Create peer to receive stream (admin is not initiator)
  const peer = new SimplePeer({
    initiator: false,
    trickle: false,
  });

  // Handle incoming stream
  peer.on('stream', (stream) => {
    console.log('Received stream from student:', deviceType);

    // Display stream in appropriate video element
    if (deviceType === 'main') {
      const videoElement = document.getElementById('liveMainCamera');
      videoElement.srcObject = stream;

      // Update status indicator
      const statusElement = document.getElementById('mainCameraStatus');
      if (statusElement) {
        statusElement.textContent = '✓ Connected';
        statusElement.style.color = '#4caf50';
      }
    } else if (deviceType === 'proctor') {
      const videoElement = document.getElementById('liveProctorCamera');
      videoElement.srcObject = stream;

      // Update status indicator
      const statusElement = document.getElementById('proctorCameraStatus');
      if (statusElement) {
        statusElement.textContent = '✓ Connected';
        statusElement.style.color = '#4caf50';
      }
    }
  });

  peer.on('error', (err) => {
    console.error('WebRTC peer error for', deviceType + ':', err);
  });

  // Send signal back to student/proctor
  peer.on('signal', (answerSignal) => {
    console.log('Sending answer signal to', deviceType);
    adminSocket.emit('signal', {
      sessionId: sessionId,
      targetSocketId: fromSocketId,
      signal: answerSignal,
      deviceType: deviceType,
    });
  });

  // Process student's signal
  peer.signal(signal);

  // Store peer
  monitoringPeers.set(sessionId + '_' + deviceType, peer);
}

function updateLiveSessionInfo(session) {
  const container = document.getElementById('liveSessionInfo');
  const elapsed = session.elapsedTime || 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes + ':' + String(seconds).padStart(2, '0');

  container.innerHTML = `
    <div style="margin-bottom: 15px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Email</div>
      <div style="font-size: 14px; font-weight: 600; color: #333;">${session.email}</div>
    </div>
    <div style="margin-bottom: 15px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Current Segment</div>
      <div style="font-size: 14px; font-weight: 600; color: #333;">${session.currentSegment || 0} of ${session.totalSegments || 0}</div>
    </div>
    <div style="margin-bottom: 15px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Elapsed Time</div>
      <div style="font-size: 14px; font-weight: 600; color: #333;">${timeStr}</div>
    </div>
    <div style="margin-bottom: 15px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Session ID</div>
      <div style="font-size: 12px; font-family: monospace; color: #333;">${session.sessionId}</div>
    </div>
  `;
}

function closeLiveStream() {
  const modal = document.getElementById('liveStreamModal');
  modal.classList.remove('active');

  // Stop all peer connections
  if (currentlyMonitoring) {
    const mainPeerKey = currentlyMonitoring.sessionId + '_main';
    const proctorPeerKey = currentlyMonitoring.sessionId + '_proctor';

    const mainPeer = monitoringPeers.get(mainPeerKey);
    if (mainPeer) {
      mainPeer.destroy();
      monitoringPeers.delete(mainPeerKey);
    }

    const proctorPeer = monitoringPeers.get(proctorPeerKey);
    if (proctorPeer) {
      proctorPeer.destroy();
      monitoringPeers.delete(proctorPeerKey);
    }
  }

  // Clear videos
  const mainVideo = document.getElementById('liveMainCamera');
  const proctorVideo = document.getElementById('liveProctorCamera');
  mainVideo.srcObject = null;
  proctorVideo.srcObject = null;

  // Reset status indicators
  const mainStatus = document.getElementById('mainCameraStatus');
  const proctorStatus = document.getElementById('proctorCameraStatus');
  if (mainStatus) {
    mainStatus.textContent = 'Connecting...';
    mainStatus.style.color = '#ffa500';
  }
  if (proctorStatus) {
    proctorStatus.textContent = 'Connecting...';
    proctorStatus.style.color = '#ffa500';
  }

  currentlyMonitoring = null;
}

// Ensure switchTab is globally accessible
window.switchTab = switchTab;

// ====================
// MULTI-VIEW VIDEO PLAYER
// ====================

let multiViewData = {
  sessionId: null,
  email: null,
  videos: { main: null, proctor: null, screen: null },
  currentSpotlight: 'main'
};

async function openMultiView(sessionId, email) {
  multiViewData.sessionId = sessionId;
  multiViewData.email = email;
  multiViewData.currentSpotlight = 'main';

  const modal = document.getElementById('multiViewModal');
  const title = document.getElementById('multiViewTitle');
  const grid = document.getElementById('multiViewGrid');

  title.textContent = `Multi-View: ${email}`;
  modal.classList.add('active');

  // Reset grid layout
  grid.className = '';

  // Show loading state
  ['Main', 'Proctor', 'Screen'].forEach(type => {
    const box = document.getElementById(`mv${type}`);
    box.classList.add('loading');
    box.classList.remove('spotlight');
  });

  // Fetch chunks for each device type
  const deviceTypes = ['main', 'proctor', 'screen'];

  for (const deviceType of deviceTypes) {
    try {
      const response = await fetch(`/api/session-chunks?sessionId=${encodeURIComponent(sessionId)}&deviceType=${encodeURIComponent(deviceType)}`);
      const result = await response.json();

      const boxId = `mv${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}`;
      const videoId = `mv${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}Video`;
      const box = document.getElementById(boxId);
      const video = document.getElementById(videoId);

      if (result.success && result.chunks && result.chunks.length > 0) {
        // Use the first chunk or combined video
        const firstChunk = result.chunks[0];
        video.src = firstChunk.downloadUrl;
        video.load();
        multiViewData.videos[deviceType] = video;

        video.onloadeddata = () => {
          box.classList.remove('loading');
        };

        video.onerror = () => {
          box.classList.remove('loading');
          console.error(`Failed to load ${deviceType} video`);
        };
      } else {
        // No video for this device type
        box.classList.remove('loading');
        video.src = '';
        const label = box.querySelector('.mv-label');
        label.textContent += ' (No recording)';
      }
    } catch (error) {
      console.error(`Error loading ${deviceType} video:`, error);
      const boxId = `mv${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}`;
      document.getElementById(boxId).classList.remove('loading');
    }
  }

  // Set initial spotlight
  spotlightVideo('main');
}

function spotlightVideo(deviceType) {
  const grid = document.getElementById('multiViewGrid');

  // Remove all spotlight classes
  grid.className = '';
  document.querySelectorAll('.mv-video-box').forEach(box => box.classList.remove('spotlight'));

  // Add spotlight class
  grid.classList.add(`spotlight-${deviceType}`);
  const boxId = `mv${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}`;
  document.getElementById(boxId).classList.add('spotlight');

  multiViewData.currentSpotlight = deviceType;
}

function syncAllVideos() {
  // Get the current time of the spotlight video
  const spotlightVideo = multiViewData.videos[multiViewData.currentSpotlight];
  if (!spotlightVideo) return;

  const currentTime = spotlightVideo.currentTime;

  // Sync all other videos to this time
  Object.values(multiViewData.videos).forEach(video => {
    if (video && video !== spotlightVideo) {
      video.currentTime = currentTime;
    }
  });

  console.log(`Synced all videos to ${currentTime.toFixed(1)}s`);
}

function playAllVideos() {
  Object.values(multiViewData.videos).forEach(video => {
    if (video) {
      video.play().catch(err => console.log('Play failed:', err));
    }
  });
}

function pauseAllVideos() {
  Object.values(multiViewData.videos).forEach(video => {
    if (video) {
      video.pause();
    }
  });
}

function closeMultiView() {
  const modal = document.getElementById('multiViewModal');
  modal.classList.remove('active');

  // Stop all videos
  Object.values(multiViewData.videos).forEach(video => {
    if (video) {
      video.pause();
      video.src = '';
    }
  });

  multiViewData = {
    sessionId: null,
    email: null,
    videos: { main: null, proctor: null, screen: null },
    currentSpotlight: 'main'
  };
}

// Update time display
setInterval(() => {
  const modal = document.getElementById('multiViewModal');
  if (modal.classList.contains('active')) {
    const video = multiViewData.videos[multiViewData.currentSpotlight];
    if (video && !isNaN(video.currentTime)) {
      const time = video.currentTime;
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      document.getElementById('mvTimeDisplay').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }
}, 500);

// Verification log at end of script
console.log('[Admin] Script fully loaded');
console.log('[Admin] switchTab function exists?', typeof switchTab !== 'undefined');
console.log('[Admin] window.switchTab exists?', typeof window.switchTab !== 'undefined');

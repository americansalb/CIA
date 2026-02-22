// Admin panel script — v2.0.0 (video-player-overhaul)
const ADMIN_JS_VERSION = '2.0.0';
console.log(`[Admin] admin.js v${ADMIN_JS_VERSION} loaded at`, new Date().toISOString());
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
    // Real videos = FINAL or COMBINED (not chunk placeholders)
    const hasRealVideo = !isPractice && a.videos && a.videos.some(v => v.fileId !== 'chunks');
    // Needs compile = has uncompiled chunks
    const needsCompile = !isPractice && a.chunkCount && Object.keys(a.chunkCount).length > 0;
    const totalChunks = needsCompile ? Object.values(a.chunkCount).reduce((s, n) => s + n, 0) : 0;

    let actionHtml = '';
    if (hasRealVideo) {
      actionHtml += `<button onclick="openMultiView('${a.sessionId}', '${a.email}')" style="background: #667eea; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Watch</button> `;
      actionHtml += `<button onclick="compileRecording('${a.sessionId}', this, true)" style="background: #6c757d; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">Recompile</button> `;
    }
    if (needsCompile) {
      actionHtml += `<button id="compile-btn-${a.sessionId}" onclick="compileRecording('${a.sessionId}', this, false)" style="background: #ff9800; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Compile (${totalChunks} chunks)</button>`;
    }
    if (!hasRealVideo && !needsCompile && !isPractice) {
      actionHtml = '<span style="color: #999; font-size: 11px;">No video</span>';
    }

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
        <td style="padding: 8px 12px;">${actionHtml}</td>
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
  videoLoading.textContent = 'Loading...';
  videoElement.style.display = 'none';

  try {
    // Fetch chunks from server
    const response = await fetch(`/api/session-chunks?sessionId=${encodeURIComponent(sessionId)}&deviceType=${encodeURIComponent(deviceType)}`);
    const result = await response.json();

    if (!result.success || !result.chunks || result.chunks.length === 0) {
      videoLoading.textContent = 'No video found for this recording';
      return;
    }

    // If we have a combined/FINAL video, play directly with full seeking
    if (result.hasCombinedVideo) {
      const video = result.chunks[0];
      currentChunks = result.chunks;

      document.getElementById('totalChunks').textContent = '1 (combined)';
      chunkListContainer.innerHTML = `
        <div class="chunk-item active" style="background: #4caf50; color: white;">
          Combined Video
          <div style="font-size: 11px; opacity: 0.8;">Full seeking supported</div>
        </div>
      `;

      videoElement.src = video.downloadUrl;
      videoElement.load();
      videoElement.onloadeddata = () => {
        videoLoading.style.display = 'none';
        videoElement.style.display = 'block';
        videoElement.play().catch(e => console.warn('Autoplay blocked:', e.message));
      };
      videoElement.onerror = () => {
        videoLoading.textContent = 'Error loading video — try refreshing';
      };
      // Hide prev/next buttons for single combined video
      document.getElementById('prevChunkBtn').style.display = 'none';
      document.getElementById('nextChunkBtn').style.display = 'none';
      document.getElementById('currentChunkNum').textContent = '1';
      return;
    }

    // Raw chunks only — show compilation prompt instead of crashing
    currentChunks = result.chunks;
    const chunkCount = result.chunks.length;

    document.getElementById('totalChunks').textContent = chunkCount;
    videoLoading.style.display = 'block';
    videoLoading.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">🎬</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">${chunkCount} raw chunks found</div>
        <div style="font-size: 13px; color: #aaa; margin-bottom: 20px;">
          Raw chunks cannot be played smoothly. Compile them into a single video first.
        </div>
        <button id="singleViewCompileBtn" onclick="singleViewCompile('${sessionId}', this)" style="background: #ff9800; color: white; border: none; padding: 12px 32px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
          Compile Now
        </button>
        <div style="margin-top: 16px; border-top: 1px solid #333; padding-top: 16px;">
          <button onclick="forcePlayRawChunks()" style="background: transparent; color: #666; border: 1px solid #444; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Try playing raw chunks anyway (may crash)
          </button>
        </div>
      </div>
    `;

    // Build chunk list sidebar
    chunkListContainer.innerHTML = currentChunks.map((chunk, index) => `
      <div class="chunk-item" id="chunk-item-${index}" onclick="jumpToChunk(${index})">
        Chunk ${chunk.chunkNumber}
        <div style="font-size: 11px; color: #888;">Click to play</div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading chunks:', error);
    videoLoading.textContent = 'Error loading video chunks';
  }
}

// Allow users to force-play raw chunks if they want (with warning)
function forcePlayRawChunks() {
  const videoLoading = document.getElementById('videoLoading');
  videoLoading.style.display = 'none';
  videoElement.style.display = 'block';
  document.getElementById('prevChunkBtn').style.display = '';
  document.getElementById('nextChunkBtn').style.display = '';
  playChunk(0);
}

// Trigger compilation from single-view player
async function singleViewCompile(sessionId, button) {
  button.disabled = true;
  button.textContent = 'Starting compilation...';
  button.style.background = '#6c757d';

  try {
    const response = await fetch('/api/compile-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, force: false }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);

    if (result.status === 'done') {
      button.textContent = 'Done! Reloading...';
      button.style.background = '#4caf50';
      setTimeout(() => openVideoPlayer(sessionId, currentDevice, document.getElementById('videoPlayerTitle').textContent.split(' - ')[0]), 1500);
      return;
    }

    button.textContent = 'Compiling... (this may take a few minutes)';
    const pollId = setInterval(async () => {
      try {
        const statusResp = await fetch(`/api/compile-status?sessionId=${encodeURIComponent(sessionId)}`);
        const statusData = await statusResp.json();
        if (statusData.status === 'done') {
          clearInterval(pollId);
          button.textContent = 'Done! Reloading...';
          button.style.background = '#4caf50';
          setTimeout(() => openVideoPlayer(sessionId, currentDevice, document.getElementById('videoPlayerTitle').textContent.split(' - ')[0]), 1500);
        } else if (statusData.status === 'error') {
          clearInterval(pollId);
          button.textContent = 'Compilation failed — click to retry';
          button.style.background = '#f44336';
          button.disabled = false;
        }
      } catch (e) { console.error('Poll error:', e); }
    }, 5000);
  } catch (err) {
    button.textContent = 'Failed — click to retry';
    button.style.background = '#f44336';
    button.disabled = false;
  }
}

// Track active listeners for cleanup
let _chunkListeners = {};
let _chunkLoadId = 0; // Cancellation token for in-progress loads

function _cleanupChunkListeners() {
  if (videoElement && _chunkListeners) {
    for (const [event, handler] of Object.entries(_chunkListeners)) {
      videoElement.removeEventListener(event, handler);
    }
  }
  _chunkListeners = {};
}

async function playChunk(index) {
  if (index < 0 || index >= currentChunks.length) return;

  // Cancel any in-progress load
  const loadId = ++_chunkLoadId;

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

  // Clean up old listeners before loading new chunk
  _cleanupChunkListeners();

  // Load video
  videoLoading.style.display = 'block';
  videoLoading.textContent = `Loading chunk ${index + 1}...`;
  videoElement.style.display = 'none';

  try {
    // Use preloaded blob URL if available, otherwise fall back to download URL
    const preloadedUrl = _preloadedBlobs[index];
    if (preloadedUrl) {
      videoElement.src = preloadedUrl;
      delete _preloadedBlobs[index]; // Consume it
      console.log(`[Preload] Using cached blob for chunk ${index + 1}`);
    } else {
      videoElement.src = chunk.downloadUrl;
    }
    videoElement.load();

    // Wait for video to be ready with proper cleanup
    await new Promise((resolve, reject) => {
      const onLoaded = () => {
        if (loadId !== _chunkLoadId) return; // Cancelled
        resolve();
      };
      const onError = () => {
        if (loadId !== _chunkLoadId) return; // Cancelled
        reject(new Error(`Chunk ${index + 1} failed to load`));
      };

      _chunkListeners = { loadeddata: onLoaded, error: onError };
      videoElement.addEventListener('loadeddata', onLoaded, { once: true });
      videoElement.addEventListener('error', onError, { once: true });
    });

    // Check if this load was cancelled while waiting
    if (loadId !== _chunkLoadId) return;

    videoLoading.style.display = 'none';
    videoElement.style.display = 'block';
    videoElement.play().catch(e => console.warn('Autoplay blocked:', e.message));

    // Auto-play next chunk when this one ends
    const onEnded = () => {
      if (currentChunkIndex < currentChunks.length - 1) {
        playNextChunk();
      }
    };
    _chunkListeners.ended = onEnded;
    videoElement.addEventListener('ended', onEnded, { once: true });

    // Preload next chunk
    _preloadNextChunk(index + 1);

  } catch (error) {
    if (loadId !== _chunkLoadId) return; // Cancelled
    console.error('Error playing chunk:', error);
    videoLoading.textContent = `Error loading chunk ${index + 1} — `;

    // Auto-skip to next chunk on error
    if (index < currentChunks.length - 1) {
      videoLoading.textContent += 'skipping to next...';
      setTimeout(() => {
        if (loadId === _chunkLoadId) playChunk(index + 1);
      }, 1500);
    } else {
      videoLoading.textContent += 'last chunk';
    }
  }
}

// Preload system for seamless chunk transitions
let _preloadedBlobs = {}; // chunkIndex -> blobUrl
const _MAX_PRELOAD_CACHE = 3;

function _preloadNextChunk(nextIndex) {
  if (nextIndex >= currentChunks.length) return;
  if (_preloadedBlobs[nextIndex]) return; // Already preloaded

  const chunk = currentChunks[nextIndex];
  fetch(chunk.downloadUrl)
    .then(r => r.blob())
    .then(blob => {
      // Evict old entries if cache is full
      const keys = Object.keys(_preloadedBlobs).map(Number);
      while (keys.length >= _MAX_PRELOAD_CACHE) {
        const oldest = keys.shift();
        URL.revokeObjectURL(_preloadedBlobs[oldest]);
        delete _preloadedBlobs[oldest];
      }
      _preloadedBlobs[nextIndex] = URL.createObjectURL(blob);
      console.log(`[Preload] Chunk ${nextIndex + 1} preloaded`);
    })
    .catch(e => console.warn(`[Preload] Chunk ${nextIndex + 1} failed:`, e.message));
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

  // Clean up listeners and preload cache
  _cleanupChunkListeners();
  _chunkLoadId++;
  for (const url of Object.values(_preloadedBlobs)) {
    URL.revokeObjectURL(url);
  }
  _preloadedBlobs = {};

  // Stop video
  if (videoElement) {
    videoElement.pause();
    videoElement.src = '';
    videoElement.onloadeddata = null;
    videoElement.onerror = null;
    videoElement.onended = null;
  }

  // Reset prev/next button visibility
  document.getElementById('prevChunkBtn').style.display = '';
  document.getElementById('nextChunkBtn').style.display = '';

  currentChunks = [];
  currentChunkIndex = 0;
  currentSession = null;
  currentDevice = null;

  // Reset speed selector
  const speedSelect = document.getElementById('playbackSpeed');
  if (speedSelect) speedSelect.value = '1';
}

// Playback speed control for single-view player
function setPlaybackSpeed(rate) {
  rate = parseFloat(rate);
  if (videoElement) videoElement.playbackRate = rate;
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
// COMPILE RECORDING
// ====================

async function compileRecording(sessionId, button, force) {
  console.log(`[Compile] Starting compile for session: ${sessionId}, force: ${!!force}`);
  button.disabled = true;
  button.textContent = force ? 'Recompiling...' : 'Starting...';
  button.style.background = '#6c757d';

  try {
    const response = await fetch('/api/compile-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, force: !!force }),
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Compile request failed');
    }

    if (result.status === 'done') {
      button.textContent = 'Compiled!';
      button.style.background = '#4caf50';
      console.log('[Compile] Already compiled');
      setTimeout(() => loadRecordings(), 2000);
      return;
    }

    // Start polling for status
    button.textContent = 'Compiling...';
    button.style.background = '#2196f3';

    const pollInterval = setInterval(async () => {
      try {
        const statusResp = await fetch(`/api/compile-status?sessionId=${encodeURIComponent(sessionId)}`);
        const statusResult = await statusResp.json();
        console.log(`[Compile] Poll status:`, statusResult);

        if (!statusResult.success) return;

        // Update button with progress
        const devices = statusResult.devices || {};
        const parts = [];
        for (const [dt, info] of Object.entries(devices)) {
          if (info.status === 'compiling') parts.push(`${dt}: compiling ${info.chunks} chunks`);
          else if (info.status === 'queued') parts.push(`${dt}: queued (${info.chunks})`);
          else if (info.status === 'done') parts.push(`${dt}: done`);
          else if (info.status === 'error') parts.push(`${dt}: ERROR ${info.error || ''}`);
        }
        button.textContent = parts.length > 0 ? parts.join(' | ') : 'Compiling...';

        if (statusResult.status === 'done' || statusResult.status === 'error') {
          clearInterval(pollInterval);
          if (statusResult.status === 'done') {
            button.textContent = 'Compiled!';
            button.style.background = '#4caf50';
            console.log('[Compile] All done — refreshing recordings');
            setTimeout(() => loadRecordings(), 2000);
          } else {
            button.textContent = 'Error — click to retry';
            button.style.background = '#f44336';
            button.disabled = false;
            button.onclick = () => compileRecording(sessionId, button);
          }
        }
      } catch (pollErr) {
        console.error('[Compile] Poll error:', pollErr);
      }
    }, 5000); // Poll every 5 seconds

  } catch (error) {
    console.error('[Compile] Error:', error);
    button.textContent = 'Failed — click to retry';
    button.style.background = '#f44336';
    button.disabled = false;
    button.onclick = () => compileRecording(sessionId, button);
  }
}

// ====================
// MULTI-VIEW VIDEO PLAYER (Robust Implementation)
// ====================

// State management
const mvState = {
  sessionId: null,
  devices: {}, // deviceType -> { video, chunks, currentIdx, startTime, listeners }
  spotlight: 'main',
  isActive: false
};

// Clean up all event listeners for a device
function mvCleanupDevice(deviceType) {
  const device = mvState.devices[deviceType];
  if (!device) return;

  const video = device.video;
  if (video && device.listeners) {
    // Remove all tracked listeners
    for (const [event, handler] of Object.entries(device.listeners)) {
      video.removeEventListener(event, handler);
    }
  }
  device.listeners = {};
}

// Load and play a specific chunk
async function mvLoadChunk(deviceType, chunkIndex, retryCount = 0) {
  const device = mvState.devices[deviceType];
  if (!device || !device.chunks) {
    console.error(`[MVP][${deviceType}] No device or chunks`);
    return false;
  }

  if (chunkIndex >= device.chunks.length) {
    console.log(`[MVP][${deviceType}] All ${device.chunks.length} chunks finished`);
    return true;
  }

  const chunk = device.chunks[chunkIndex];
  const video = device.video;

  console.log(`[MVP][${deviceType}] Loading chunk ${chunkIndex + 1}/${device.chunks.length} (attempt ${retryCount + 1})`);
  console.log(`[MVP][${deviceType}] URL: ${chunk.downloadUrl}`);

  // Update state
  device.currentIdx = chunkIndex;

  // Clean up old listeners before setting up new ones
  mvCleanupDevice(deviceType);

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    // Timeout handler
    const timeoutId = setTimeout(() => {
      console.error(`[MVP][${deviceType}] Chunk ${chunkIndex + 1} load timeout (30s)`);
      if (retryCount < 2) {
        mvLoadChunk(deviceType, chunkIndex, retryCount + 1).then(safeResolve);
      } else {
        console.error(`[MVP][${deviceType}] Max retries, skipping to next chunk`);
        mvLoadChunk(deviceType, chunkIndex + 1, 0).then(safeResolve);
      }
    }, 30000);

    // Handler for when video data is ready
    const onCanPlay = () => {
      clearTimeout(timeoutId);
      console.log(`[MVP][${deviceType}] Chunk ${chunkIndex + 1} ready, playing...`);

      video.play()
        .then(() => console.log(`[MVP][${deviceType}] Chunk ${chunkIndex + 1} playing`))
        .catch(err => console.warn(`[MVP][${deviceType}] Play warning:`, err.message));

      safeResolve(true);
    };

    // Handler for when chunk ends - load next chunk
    const onEnded = () => {
      console.log(`[MVP][${deviceType}] Chunk ${chunkIndex + 1} ended`);
      mvLoadChunk(deviceType, chunkIndex + 1, 0);
    };

    // Handler for errors
    const onError = (e) => {
      clearTimeout(timeoutId);
      const errMsg = video.error?.message || 'Unknown error';
      console.error(`[MVP][${deviceType}] Chunk ${chunkIndex + 1} error: ${errMsg}`);

      if (retryCount < 2) {
        console.log(`[MVP][${deviceType}] Retrying in 2s...`);
        setTimeout(() => {
          mvLoadChunk(deviceType, chunkIndex, retryCount + 1).then(safeResolve);
        }, 2000);
      } else {
        console.log(`[MVP][${deviceType}] Max retries, skipping to next chunk`);
        mvLoadChunk(deviceType, chunkIndex + 1, 0).then(safeResolve);
      }
    };

    // Store listeners for cleanup
    device.listeners = {
      canplay: onCanPlay,
      ended: onEnded,
      error: onError
    };

    // Add listeners using addEventListener (not onended=)
    video.addEventListener('canplay', onCanPlay, { once: true });
    video.addEventListener('ended', onEnded, { once: true }); // once: true prevents listener stacking
    video.addEventListener('error', onError, { once: true });

    // Set source and load
    video.src = chunk.downloadUrl;
    video.load();
  });
}

// Initialize a device with its chunks
async function mvInitDevice(sessionId, deviceType) {
  const cap = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
  const box = document.getElementById(`mv${cap}`);
  const video = document.getElementById(`mv${cap}Video`);
  const label = box.querySelector('.mv-label');

  console.log(`[MVP][${deviceType}] Initializing...`);

  try {
    const resp = await fetch(`/api/session-chunks?sessionId=${encodeURIComponent(sessionId)}&deviceType=${encodeURIComponent(deviceType)}`);
    const data = await resp.json();

    console.log(`[MVP][${deviceType}] API response: ${data.chunks?.length || 0} chunks, combined=${data.hasCombinedVideo}`);

    if (!data.success || !data.chunks || data.chunks.length === 0) {
      box.classList.remove('loading');
      if (label) label.textContent = `${cap} (No recording)`;
      return;
    }

    // If we have a combined/FINAL video, play it directly as a single seekable file
    if (data.hasCombinedVideo) {
      const combinedChunk = data.chunks[0];
      mvState.devices[deviceType] = {
        video: video,
        chunks: data.chunks,
        currentIdx: 0,
        startTime: data.createdTime ? new Date(data.createdTime).getTime() : null,
        isCombined: true,
        listeners: {}
      };

      if (label) label.textContent = `${cap} (Combined)`;

      // Play directly — combined MP4 supports full seeking
      video.src = combinedChunk.downloadUrl;
      video.load();
      video.onloadeddata = () => {
        box.classList.remove('loading');
        video.play().catch(e => console.warn(`[MVP][${deviceType}] Autoplay blocked:`, e.message));
      };
      video.onerror = () => {
        box.classList.remove('loading');
        console.error(`[MVP][${deviceType}] Combined video failed to load — offering recompile`);
        if (label) label.textContent = `${cap} (Playback error — recompile recommended)`;
        // Show recompile overlay so user can recover
        const overlay = document.createElement('div');
        overlay.className = 'mv-compile-overlay';
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);z-index:5;color:white;text-align:center;padding:20px;';
        overlay.innerHTML = `
          <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
          <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Combined video failed to play</div>
          <div style="font-size:12px;color:#aaa;margin-bottom:16px;">The compiled video may be corrupted. Try recompiling.</div>
          <button onclick="mvTriggerCompile('${sessionId}', this)" style="background:#ff9800;color:white;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">Recompile (force)</button>
        `;
        // Override to use force=true for recompile
        overlay.querySelector('button').onclick = async function() {
          this.disabled = true;
          this.textContent = 'Recompiling...';
          this.style.background = '#6c757d';
          try {
            const response = await fetch('/api/compile-recording', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, force: true }),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message);
            this.textContent = 'Recompiling... (this may take a few minutes)';
            const pollId = setInterval(async () => {
              try {
                const sr = await fetch('/api/compile-status?sessionId=' + encodeURIComponent(sessionId));
                const sd = await sr.json();
                if (sd.status === 'done') {
                  clearInterval(pollId);
                  const email = document.getElementById('multiViewTitle').textContent.replace('Multi-View: ', '');
                  closeMultiView();
                  openMultiView(sessionId, email);
                } else if (sd.status === 'error') {
                  clearInterval(pollId);
                  this.textContent = 'Failed — click to retry';
                  this.style.background = '#f44336';
                  this.disabled = false;
                }
              } catch (e) { console.error('[MVP] Poll error:', e); }
            }, 5000);
          } catch (err) {
            this.textContent = 'Failed — click to retry';
            this.style.background = '#f44336';
            this.disabled = false;
          }
        };
        box.appendChild(overlay);
      };
      console.log(`[MVP][${deviceType}] Playing combined video directly`);
      return;
    }

    // Raw chunks only — don't try to play them (crashes).
    // Show a message and offer compilation.
    mvState.devices[deviceType] = {
      video: video,
      chunks: data.chunks,
      currentIdx: 0,
      startTime: data.createdTime ? new Date(data.createdTime).getTime() : null,
      isCombined: false,
      needsCompile: true,
      listeners: {}
    };

    box.classList.remove('loading');
    const chunkCount = data.chunks.length;
    if (label) label.textContent = `${cap} (${chunkCount} chunks — needs compilation)`;

    // Show overlay message instead of trying to play raw chunks
    const overlay = document.createElement('div');
    overlay.className = 'mv-compile-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);z-index:5;color:white;text-align:center;padding:20px;';
    overlay.innerHTML = `
      <div style="font-size:36px;margin-bottom:12px;">🎬</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;">${chunkCount} raw chunks found</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:16px;">Needs compilation into a single video for smooth playback</div>
      <button onclick="mvTriggerCompile('${sessionId}', this)" style="background:#ff9800;color:white;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">Compile Now</button>
      <div style="margin-top:16px;border-top:1px solid #444;padding-top:12px;">
        <button onclick="mvForcePlayRawChunks('${deviceType}')" style="background:transparent;color:#666;border:1px solid #555;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:11px;">Try playing raw chunks (may crash)</button>
      </div>
    `;
    box.appendChild(overlay);
    console.log(`[MVP][${deviceType}] Raw chunks — showing compile prompt`);

  } catch (err) {
    console.error(`[MVP][${deviceType}] Init error:`, err);
    box.classList.remove('loading');
    if (label) label.textContent = `${cap} (Error)`;
  }
}

// Trigger compilation from multi-view player
async function mvTriggerCompile(sessionId, button) {
  button.disabled = true;
  button.textContent = 'Compiling...';
  button.style.background = '#6c757d';

  try {
    const response = await fetch('/api/compile-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, force: false }),
    });
    const result = await response.json();

    if (!result.success) throw new Error(result.message);

    if (result.status === 'done') {
      button.textContent = 'Done! Reopening...';
      button.style.background = '#4caf50';
      // Reopen the multi-view to pick up compiled videos
      setTimeout(() => {
        const email = document.getElementById('multiViewTitle').textContent.replace('Multi-View: ', '');
        closeMultiView();
        openMultiView(sessionId, email);
      }, 1500);
      return;
    }

    // Poll for completion
    button.textContent = 'Compiling... (this may take a few minutes)';
    const pollId = setInterval(async () => {
      try {
        const statusResp = await fetch(`/api/compile-status?sessionId=${encodeURIComponent(sessionId)}`);
        const statusData = await statusResp.json();

        if (statusData.status === 'done') {
          clearInterval(pollId);
          button.textContent = 'Done! Reopening...';
          button.style.background = '#4caf50';
          setTimeout(() => {
            const email = document.getElementById('multiViewTitle').textContent.replace('Multi-View: ', '');
            closeMultiView();
            openMultiView(sessionId, email);
          }, 1500);
        } else if (statusData.status === 'error') {
          clearInterval(pollId);
          button.textContent = 'Compilation failed — click to retry';
          button.style.background = '#f44336';
          button.disabled = false;
          button.onclick = () => mvTriggerCompile(sessionId, button);
        } else {
          // Show progress
          const devices = statusData.devices || {};
          const parts = Object.entries(devices).map(([dt, info]) => {
            if (info.status === 'compiling') return `${dt}: compiling`;
            if (info.status === 'done') return `${dt}: done`;
            if (info.status === 'queued') return `${dt}: queued`;
            return `${dt}: ${info.status}`;
          });
          button.textContent = parts.join(' | ') || 'Compiling...';
        }
      } catch (e) {
        console.error('[MVP] Poll error:', e);
      }
    }, 5000);
  } catch (err) {
    console.error('[MVP] Compile trigger error:', err);
    button.textContent = 'Failed — click to retry';
    button.style.background = '#f44336';
    button.disabled = false;
    button.onclick = () => mvTriggerCompile(sessionId, button);
  }
}

// Force-play raw chunks in multi-view (escape hatch when compilation isn't available)
function mvForcePlayRawChunks(deviceType) {
  const cap = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
  const box = document.getElementById(`mv${cap}`);
  const device = mvState.devices[deviceType];
  if (!device || !device.chunks || device.chunks.length === 0) return;

  // Remove the compile overlay
  const overlay = box.querySelector('.mv-compile-overlay');
  if (overlay) overlay.remove();

  // Mark as no longer needing compile (so sync doesn't skip it)
  device.needsCompile = false;
  device.isCombined = false;

  const label = box.querySelector('.mv-label');
  if (label) label.textContent = `${cap} (${device.chunks.length} chunks — raw)`;

  // Start playing chunks sequentially
  console.log(`[MVP][${deviceType}] Force-playing ${device.chunks.length} raw chunks`);
  mvLoadChunk(deviceType, 0);
}

// Main entry point
async function openMultiView(sessionId, email) {
  console.log(`[MVP] ========================================`);
  console.log(`[MVP] Opening Multi-View Player`);
  console.log(`[MVP] Session: ${sessionId}`);
  console.log(`[MVP] Email: ${email}`);
  console.log(`[MVP] ========================================`);

  // Reset state
  for (const dt of Object.keys(mvState.devices)) {
    mvCleanupDevice(dt);
  }
  mvState.sessionId = sessionId;
  mvState.devices = {};
  mvState.spotlight = 'main';
  mvState.isActive = true;

  // Show modal
  const modal = document.getElementById('multiViewModal');
  document.getElementById('multiViewTitle').textContent = `Multi-View: ${email}`;
  modal.classList.add('active');
  document.getElementById('multiViewGrid').className = '';

  // Show loading state
  ['Main', 'Proctor', 'Screen'].forEach(type => {
    const box = document.getElementById(`mv${type}`);
    box.classList.add('loading');
    box.classList.remove('spotlight');
    const label = box.querySelector('.mv-label');
    if (label) label.textContent = `${type} - Loading...`;
  });

  // Initialize all devices in parallel
  await Promise.all(['main', 'proctor', 'screen'].map(dt => mvInitDevice(sessionId, dt)));

  // Log timing offsets
  const starts = Object.entries(mvState.devices)
    .filter(([, d]) => d.startTime)
    .map(([dt, d]) => [dt, d.startTime]);

  if (starts.length > 1) {
    const earliest = Math.min(...starts.map(([, t]) => t));
    console.log(`[MVP] Start time offsets:`);
    starts.forEach(([dt, t]) => {
      console.log(`[MVP]   ${dt}: +${((t - earliest) / 1000).toFixed(1)}s`);
    });
  }

  spotlightVideo('main');
  console.log(`[MVP] ========================================`);
  console.log(`[MVP] Initialization complete`);
  console.log(`[MVP] ========================================`);
}

function spotlightVideo(deviceType) {
  const grid = document.getElementById('multiViewGrid');
  grid.className = `spotlight-${deviceType}`;
  document.querySelectorAll('.mv-video-box').forEach(b => b.classList.remove('spotlight'));
  const cap = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
  document.getElementById(`mv${cap}`).classList.add('spotlight');
  mvState.spotlight = deviceType;
}

function playAllVideos() {
  console.log(`[MVP] Playing all videos`);
  for (const [dt, device] of Object.entries(mvState.devices)) {
    if (device.video && device.video.src) {
      device.video.play().catch(e => console.warn(`[MVP][${dt}] Play failed:`, e.message));
    }
  }
}

function pauseAllVideos() {
  console.log(`[MVP] Pausing all videos`);
  for (const device of Object.values(mvState.devices)) {
    if (device.video) device.video.pause();
  }
}

function syncAllVideos() {
  console.log(`[MVP] Syncing videos to ${mvState.spotlight}`);

  const refDevice = mvState.devices[mvState.spotlight];
  if (!refDevice || !refDevice.video) {
    console.error(`[MVP] No reference device`);
    return;
  }

  const refStart = refDevice.startTime;
  const refTime = refDevice.video.currentTime;

  for (const [dt, device] of Object.entries(mvState.devices)) {
    if (dt === mvState.spotlight || !device.video) continue;

    if (refStart && device.startTime) {
      // Real timestamp sync
      const offsetSec = (device.startTime - refStart) / 1000;
      const targetTime = refTime - offsetSec;

      if (targetTime >= 0) {
        device.video.currentTime = targetTime;
        console.log(`[MVP][${dt}] Synced to ${targetTime.toFixed(1)}s (offset: ${offsetSec.toFixed(1)}s)`);
      } else {
        device.video.currentTime = 0;
        device.video.pause();
        console.log(`[MVP][${dt}] Not started yet (offset: ${offsetSec.toFixed(1)}s)`);
      }
    } else {
      // Fallback
      device.video.currentTime = refTime;
      console.log(`[MVP][${dt}] Synced to ${refTime.toFixed(1)}s (no timestamp data)`);
    }
  }
}

function closeMultiView() {
  console.log(`[MVP] Closing`);
  mvState.isActive = false;

  document.getElementById('multiViewModal').classList.remove('active');

  for (const [dt, device] of Object.entries(mvState.devices)) {
    mvCleanupDevice(dt);
    if (device.video) {
      device.video.pause();
      device.video.src = '';
      device.video.onloadeddata = null;
      device.video.onerror = null;
    }
  }

  // Remove any compilation overlays
  document.querySelectorAll('.mv-compile-overlay').forEach(el => el.remove());

  mvState.devices = {};
}

// ====================
// UNIFIED TIMELINE & CONTROLS
// ====================

function _fmtTime(secs) {
  if (!isFinite(secs) || isNaN(secs)) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Get the total duration of the spotlighted device's video
function _mvTotalDuration() {
  const device = mvState.devices[mvState.spotlight];
  if (!device || !device.video) return 0;
  const d = device.video.duration;
  return isFinite(d) ? d : 0;
}

// Toggle play/pause for all videos
function mvTogglePlayPause() {
  const device = mvState.devices[mvState.spotlight];
  if (!device || !device.video) return;

  if (device.video.paused) {
    playAllVideos();
    document.getElementById('mvPlayPauseBtn').textContent = '⏸';
  } else {
    pauseAllVideos();
    document.getElementById('mvPlayPauseBtn').textContent = '▶';
  }
}

// Set playback speed for all videos
function mvSetSpeed(speed) {
  const rate = parseFloat(speed);
  for (const device of Object.values(mvState.devices)) {
    if (device.video) device.video.playbackRate = rate;
  }
  console.log(`[MVP] Playback speed set to ${rate}x`);
}

// Seek from click on timeline bar
function mvSeekFromClick(event) {
  const timeline = document.getElementById('mvTimeline');
  const rect = timeline.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

  const device = mvState.devices[mvState.spotlight];
  if (!device || !device.video) return;

  const total = _mvTotalDuration();
  if (total <= 0) return;

  const targetTime = pct * total;
  device.video.currentTime = targetTime;

  // Sync other devices to the new position
  _mvContinuousSync(targetTime);

  console.log(`[MVP] Seeked to ${_fmtTime(targetTime)} (${Math.round(pct * 100)}%)`);
}

// Show tooltip on timeline hover
function mvShowTooltip(event) {
  const timeline = document.getElementById('mvTimeline');
  const tooltip = document.getElementById('mvTooltip');
  const rect = timeline.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

  const total = _mvTotalDuration();
  if (total <= 0) { tooltip.style.display = 'none'; return; }

  const hoverTime = pct * total;
  tooltip.textContent = _fmtTime(hoverTime);
  tooltip.style.left = `${pct * 100}%`;
  tooltip.style.display = 'block';
}

function mvHideTooltip() {
  document.getElementById('mvTooltip').style.display = 'none';
}

// Render chunk boundary markers on the timeline
function _mvRenderChunkMarkers(deviceType) {
  const device = mvState.devices[deviceType];
  const container = document.getElementById('mvChunkMarkers');
  if (!container) return;
  container.innerHTML = '';

  if (!device || !device.chunks || device.chunks.length <= 1) return;

  // For combined video, no chunk markers needed
  if (device.isCombined) return;

  // Estimate chunk boundaries (30s each)
  const total = _mvTotalDuration();
  if (total <= 0) return;

  const estChunkDur = 30; // seconds
  const numChunks = device.chunks.length;
  for (let i = 1; i < numChunks; i++) {
    const pct = Math.min(100, (i * estChunkDur / total) * 100);
    const marker = document.createElement('div');
    marker.style.cssText = `position:absolute;left:${pct}%;top:0;width:1px;height:100%;background:rgba(255,255,255,0.2);`;
    container.appendChild(marker);
  }
}

// Continuous sync — keep slave devices aligned with the master
function _mvContinuousSync(masterTime) {
  const refDevice = mvState.devices[mvState.spotlight];
  if (!refDevice) return;

  const refStart = refDevice.startTime;
  const time = masterTime !== undefined ? masterTime : (refDevice.video ? refDevice.video.currentTime : 0);

  for (const [dt, device] of Object.entries(mvState.devices)) {
    if (dt === mvState.spotlight || !device.video || device.needsCompile) continue;

    let targetTime;
    if (refStart && device.startTime) {
      const offsetSec = (device.startTime - refStart) / 1000;
      targetTime = time - offsetSec;
    } else {
      targetTime = time;
    }

    if (targetTime < 0) {
      if (!device.video.paused) device.video.pause();
      continue;
    }

    // Only correct if drift > 0.5s to avoid constant micro-seeks
    const drift = Math.abs(device.video.currentTime - targetTime);
    if (drift > 0.5) {
      device.video.currentTime = targetTime;
    }

    // Match play state
    if (!refDevice.video.paused && device.video.paused && targetTime >= 0) {
      device.video.play().catch(() => {});
    } else if (refDevice.video.paused && !device.video.paused) {
      device.video.pause();
    }
  }
}

// Main update loop — timeline, time display, per-device bars, continuous sync
let _mvUpdateRAF = null;
function _mvUpdateLoop() {
  if (!mvState.isActive) { _mvUpdateRAF = null; return; }

  const device = mvState.devices[mvState.spotlight];
  if (device && device.video && !isNaN(device.video.currentTime)) {
    const t = device.video.currentTime;
    const total = _mvTotalDuration();
    const pct = total > 0 ? (t / total) * 100 : 0;

    // Update progress fill and playhead
    const fill = document.getElementById('mvProgressFill');
    const head = document.getElementById('mvPlayhead');
    if (fill) fill.style.width = `${pct}%`;
    if (head) head.style.left = `${pct}%`;

    // Update time display
    const timeEl = document.getElementById('mvTimeDisplay');
    if (timeEl) timeEl.textContent = `${_fmtTime(t)} / ${_fmtTime(total)}`;

    // Update play/pause button state
    const ppBtn = document.getElementById('mvPlayPauseBtn');
    if (ppBtn) ppBtn.textContent = device.video.paused ? '▶' : '⏸';

    // Continuous sync every frame
    _mvContinuousSync();
  }

  // Update per-device progress bars
  for (const [dt, dev] of Object.entries(mvState.devices)) {
    if (!dev.video || dev.needsCompile) continue;
    const bar = document.getElementById(`mvBar${dt.charAt(0).toUpperCase() + dt.slice(1)}`);
    if (bar) {
      const d = dev.video.duration;
      const pct = (isFinite(d) && d > 0) ? (dev.video.currentTime / d) * 100 : 0;
      bar.style.width = `${pct}%`;
    }
  }

  _mvUpdateRAF = requestAnimationFrame(_mvUpdateLoop);
}

// Start the update loop when multi-view opens
const _origOpenMultiView = openMultiView;
openMultiView = async function(sessionId, email) {
  await _origOpenMultiView(sessionId, email);

  // Start update loop
  if (_mvUpdateRAF) cancelAnimationFrame(_mvUpdateRAF);
  _mvUpdateRAF = requestAnimationFrame(_mvUpdateLoop);

  // Render chunk markers for the spotlighted device
  setTimeout(() => _mvRenderChunkMarkers(mvState.spotlight), 2000);

  // Add keyboard shortcuts
  document.addEventListener('keydown', _mvKeyHandler);
};

// Stop the update loop when multi-view closes
const _origCloseMultiView = closeMultiView;
closeMultiView = function() {
  if (_mvUpdateRAF) { cancelAnimationFrame(_mvUpdateRAF); _mvUpdateRAF = null; }
  document.removeEventListener('keydown', _mvKeyHandler);
  _origCloseMultiView();
};

// Keyboard shortcuts for the multi-view player
function _mvKeyHandler(e) {
  if (!mvState.isActive) return;
  const device = mvState.devices[mvState.spotlight];
  if (!device || !device.video) return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      mvTogglePlayPause();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      device.video.currentTime = Math.max(0, device.video.currentTime - (e.shiftKey ? 30 : 5));
      _mvContinuousSync();
      break;
    case 'ArrowRight':
      e.preventDefault();
      device.video.currentTime = Math.min(device.video.duration || 0, device.video.currentTime + (e.shiftKey ? 30 : 5));
      _mvContinuousSync();
      break;
  }
}

// Verification log at end of script
console.log(`[Admin] Script v${ADMIN_JS_VERSION} fully loaded`);
console.log('[Admin] switchTab function exists?', typeof switchTab !== 'undefined');
console.log('[Admin] window.switchTab exists?', typeof window.switchTab !== 'undefined');

// Check server version matches client version
fetch('/api/version').then(r => r.json()).then(v => {
  console.log(`[Admin] Server version: ${v.version} (${v.build})`);
  if (v.version !== ADMIN_JS_VERSION) {
    console.warn(`[Admin] VERSION MISMATCH! Client: ${ADMIN_JS_VERSION}, Server: ${v.version}. Hard refresh (Ctrl+Shift+R) recommended.`);
  }
}).catch(() => {});

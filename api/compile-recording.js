const { getDrive } = require('../utils/google-auth');
const { combineChunkFiles } = require('../utils/video-converter');
const fs = require('fs');
const path = require('path');

// ---- Status tracking (in-memory, with TTL) ----
const compileStatus = new Map();

// Expire completed/errored status entries after 1 hour
function cleanupStaleStatus() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [sessionId, entry] of compileStatus) {
    if ((entry.status === 'done' || entry.status === 'error') && entry.updatedAt && entry.updatedAt < oneHourAgo) {
      compileStatus.delete(sessionId);
      console.log(`[compile] Expired status entry: ${sessionId}`);
    }
  }
}
setInterval(cleanupStaleStatus, 10 * 60 * 1000); // Check every 10 minutes

// ---- Serial queue (one combine at a time to avoid OOM) ----
const compileQueue = [];
let compileRunning = false;

// ---- Startup recovery: ensure queue isn't stuck from a previous crash ----
// (compileRunning is always false at module load, so this is inherently safe)

// ---- Temp directory cleanup: remove stale work directories older than 1 hour ----
const TEMP_DIR = path.join(__dirname, '..', 'temp');
function cleanupStaleTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const entries = fs.readdirSync(TEMP_DIR);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const entry of entries) {
      if (!entry.startsWith('combine_') && !entry.startsWith('convert_')) continue;
      const fullPath = path.join(TEMP_DIR, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < oneHourAgo) {
          // Don't delete if a compilation is currently running — it might be using this dir
          if (compileRunning) {
            console.log(`[compile] Skipping cleanup of ${entry} — compilation in progress`);
            continue;
          }
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`[compile] Cleaned up stale temp dir: ${entry}`);
        }
      } catch (e) { /* ignore individual cleanup errors */ }
    }
  } catch (e) {
    console.warn('[compile] Temp cleanup error:', e.message);
  }
}
// Run cleanup on startup and every 30 minutes
cleanupStaleTempFiles();
setInterval(cleanupStaleTempFiles, 30 * 60 * 1000);

// Timeout scales with chunk count: 1 minute per chunk + 5 minute buffer, minimum 10 minutes
function getCompileTimeout(chunkCount) {
  return Math.max(10 * 60 * 1000, (chunkCount * 60 * 1000) + (5 * 60 * 1000));
}

async function processQueue() {
  if (compileRunning || compileQueue.length === 0) return;
  compileRunning = true;

  const job = compileQueue.shift();
  const { sessionId, deviceType, chunks, folderId, email, studentId } = job;

  console.log(`[compile] START ${sessionId}/${deviceType} (${chunks.length} chunks, ${compileQueue.length} queued)`);

  const status = compileStatus.get(sessionId);
  if (status) status.devices[deviceType].status = 'compiling';

  // Safety timeout scales with chunk count to prevent killing long compilations
  const timeoutMs = getCompileTimeout(chunks.length);
  console.log(`[compile] Timeout set to ${(timeoutMs / 60000).toFixed(0)} minutes for ${chunks.length} chunks`);
  const timeoutId = setTimeout(() => {
    console.error(`[compile] TIMEOUT ${sessionId}/${deviceType} after ${(timeoutMs / 1000).toFixed(0)}s — forcing queue advance`);
    if (status) {
      status.devices[deviceType].status = 'error';
      status.devices[deviceType].error = `Compilation timed out after ${(timeoutMs / 60000).toFixed(0)} minutes`;
    }
    compileRunning = false;
    processQueue();
  }, timeoutMs);

  try {
    const result = await combineChunkFiles(chunks, folderId, deviceType, email, studentId);
    clearTimeout(timeoutId);
    if (status) {
      if (result.success) {
        status.devices[deviceType].status = 'done';
        console.log(`[compile] DONE ${sessionId}/${deviceType}: ${result.mp4FileName}`);
      } else {
        status.devices[deviceType].status = 'error';
        status.devices[deviceType].error = result.error;
        console.error(`[compile] FAILED ${sessionId}/${deviceType}: ${result.error}`);
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[compile] ERROR ${sessionId}/${deviceType}:`, err);
    if (status) {
      status.devices[deviceType].status = 'error';
      status.devices[deviceType].error = err.message;
    }
  } finally {
    compileRunning = false;

    // Update overall status
    if (status) {
      const allDone = Object.values(status.devices).every(
        d => d.status === 'done' || d.status === 'error' || d.status === 'skipped'
      );
      if (allDone) {
        const anyError = Object.values(status.devices).some(d => d.status === 'error');
        status.status = anyError ? 'error' : 'done';
        status.updatedAt = Date.now();
        console.log(`[compile] ALL DONE for ${sessionId}: ${status.status}`);
      }
    }

    // Next job
    processQueue();
  }
}

// ---- Helper ----
async function listAllFiles(drive, query, fields) {
  const allFiles = [];
  let pageToken = null;
  do {
    const response = await drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    allFiles.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return allFiles;
}

// ---- POST /api/compile-recording ----
async function startCompile(req, res) {
  try {
    const { sessionId, force } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }

    // Already compiling?
    const existing = compileStatus.get(sessionId);
    if (existing && existing.status === 'compiling') {
      return res.json({ success: true, status: 'compiling', devices: existing.devices });
    }

    console.log(`[compile] Request to compile session: ${sessionId}`);

    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Find session folders across all student folders
    const studentFolders = await listAllFiles(
      drive,
      `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id, name'
    );

    const sessionFolderIds = [];
    let studentFolderName = null;
    for (const sf of studentFolders) {
      const sessions = await listAllFiles(
        drive,
        `'${sf.id}' in parents and name='${sessionId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        'id'
      );
      for (const s of sessions) {
        sessionFolderIds.push(s.id);
        if (!studentFolderName) studentFolderName = sf.name;
      }
    }

    if (sessionFolderIds.length === 0) {
      return res.status(404).json({ success: false, message: 'Session not found on Drive' });
    }

    // Get all files from all session folders
    const allFiles = [];
    for (const fid of sessionFolderIds) {
      const files = await listAllFiles(
        drive,
        `'${fid}' in parents and trashed=false`,
        'id, name, mimeType'
      );
      allFiles.push(...files);
    }

    const folderParts = (studentFolderName || '').split('_');
    const email = folderParts.slice(0, -1).join('_') || 'unknown';
    const studentId = folderParts[folderParts.length - 1] || 'unknown';
    const outputFolderId = sessionFolderIds[0];

    // Initialize status
    const status = {
      status: 'compiling',
      devices: {},
      updatedAt: Date.now(),
    };

    let jobsQueued = 0;

    for (const deviceType of ['main', 'proctor', 'screen']) {
      // Check for existing combined videos
      const existingCombined = allFiles.filter(f =>
        f.name.includes(`COMBINED_${deviceType}`)
      );
      // Only skip compilation for CONVERTED finals (seekable MP4), not raw FINAL WebMs
      const deviceAbbrev = deviceType[0];
      const hasFinal = allFiles.some(f =>
        f.name.includes(`_${deviceAbbrev}_FINAL_CONVERTED_`)
      );

      if (force && existingCombined.length > 0) {
        // Delete old COMBINED videos so we can re-compile
        for (const old of existingCombined) {
          console.log(`[compile] ${sessionId}/${deviceType}: deleting old COMBINED: ${old.name}`);
          try {
            await drive.files.delete({ fileId: old.id, supportsAllDrives: true });
          } catch (delErr) {
            console.error(`[compile] Failed to delete ${old.name}:`, delErr.message);
          }
        }
      } else if (existingCombined.length > 0 || hasFinal) {
        status.devices[deviceType] = { status: 'done', chunks: 0, note: 'already compiled' };
        console.log(`[compile] ${sessionId}/${deviceType}: already has combined/FINAL video`);
        continue;
      }

      // Find chunks
      const chunks = allFiles
        .filter(f => f.name.includes(`${deviceType}_chunk_`))
        .sort((a, b) => {
          const numA = parseInt(a.name.match(/chunk_(\d+)/)?.[1] || '0');
          const numB = parseInt(b.name.match(/chunk_(\d+)/)?.[1] || '0');
          return numA - numB;
        });

      if (chunks.length === 0) {
        status.devices[deviceType] = { status: 'skipped', chunks: 0 };
        continue;
      }

      status.devices[deviceType] = { status: 'queued', chunks: chunks.length };

      compileQueue.push({
        sessionId,
        deviceType,
        chunks: chunks.map(c => ({ id: c.id, name: c.name })),
        folderId: outputFolderId,
        email,
        studentId,
      });
      jobsQueued++;
    }

    compileStatus.set(sessionId, status);

    // Check if everything was already done
    const allDone = Object.values(status.devices).every(
      d => d.status === 'done' || d.status === 'skipped'
    );
    if (allDone) {
      status.status = 'done';
      return res.json({ success: true, status: 'done', devices: status.devices, message: 'Already compiled' });
    }

    // Start the queue
    processQueue();

    console.log(`[compile] Queued ${jobsQueued} combine jobs for ${sessionId}`);
    res.json({ success: true, status: 'compiling', devices: status.devices });
  } catch (error) {
    console.error('[compile] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ---- GET /api/compile-status ----
function getStatus(req, res) {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'sessionId required' });
  }
  const status = compileStatus.get(sessionId);
  if (!status) {
    return res.json({ success: true, status: 'not_started' });
  }
  res.json({ success: true, ...status });
}

// ---- triggerCompile(sessionId) — server-side compile trigger (no req/res needed) ----
// Used by auto-compile on session end. Reuses the same serial queue.
async function triggerCompile(sessionId) {
  console.log(`[auto-compile] Triggering compilation for session: ${sessionId}`);

  // Already compiling?
  const existing = compileStatus.get(sessionId);
  if (existing && existing.status === 'compiling') {
    console.log(`[auto-compile] Already compiling ${sessionId}, skipping`);
    return;
  }

  const drive = await getDrive();
  const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!mainFolderId) {
    console.error('[auto-compile] GOOGLE_DRIVE_FOLDER_ID not configured');
    return;
  }

  // Find session folders
  const studentFolders = await listAllFiles(
    drive,
    `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    'id, name'
  );

  const sessionFolderIds = [];
  let studentFolderName = null;
  for (const sf of studentFolders) {
    const sessions = await listAllFiles(
      drive,
      `'${sf.id}' in parents and name='${sessionId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id'
    );
    for (const s of sessions) {
      sessionFolderIds.push(s.id);
      if (!studentFolderName) studentFolderName = sf.name;
    }
  }

  if (sessionFolderIds.length === 0) {
    console.log(`[auto-compile] No session folder found for ${sessionId}`);
    return;
  }

  // Get all files
  const allFiles = [];
  for (const fid of sessionFolderIds) {
    const files = await listAllFiles(
      drive,
      `'${fid}' in parents and trashed=false`,
      'id, name, mimeType'
    );
    allFiles.push(...files);
  }

  const folderParts = (studentFolderName || '').split('_');
  const email = folderParts.slice(0, -1).join('_') || 'unknown';
  const studentId = folderParts[folderParts.length - 1] || 'unknown';
  const outputFolderId = sessionFolderIds[0];

  const status = { status: 'compiling', devices: {}, updatedAt: Date.now() };
  let jobsQueued = 0;

  for (const deviceType of ['main', 'proctor', 'screen']) {
    const existingCombined = allFiles.filter(f => f.name.includes(`COMBINED_${deviceType}`));
    const deviceAbbrev = deviceType[0];
    const hasFinal = allFiles.some(f => f.name.includes(`_${deviceAbbrev}_FINAL_CONVERTED_`));

    if (existingCombined.length > 0 || hasFinal) {
      status.devices[deviceType] = { status: 'done', chunks: 0, note: 'already compiled' };
      continue;
    }

    const chunks = allFiles
      .filter(f => f.name.includes(`${deviceType}_chunk_`))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/chunk_(\d+)/)?.[1] || '0');
        const numB = parseInt(b.name.match(/chunk_(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    if (chunks.length === 0) {
      status.devices[deviceType] = { status: 'skipped', chunks: 0 };
      continue;
    }

    status.devices[deviceType] = { status: 'queued', chunks: chunks.length };
    compileQueue.push({
      sessionId,
      deviceType,
      chunks: chunks.map(c => ({ id: c.id, name: c.name })),
      folderId: outputFolderId,
      email,
      studentId,
    });
    jobsQueued++;
  }

  compileStatus.set(sessionId, status);

  const allDone = Object.values(status.devices).every(d => d.status === 'done' || d.status === 'skipped');
  if (allDone) {
    status.status = 'done';
    console.log(`[auto-compile] ${sessionId}: already compiled`);
    return;
  }

  processQueue();
  console.log(`[auto-compile] Queued ${jobsQueued} jobs for ${sessionId}`);
}

module.exports = { startCompile, getStatus, triggerCompile };

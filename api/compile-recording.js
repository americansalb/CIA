const { getDrive } = require('../utils/google-auth');
const { combineChunkFiles } = require('../utils/video-converter');

// ---- Status tracking (in-memory) ----
const compileStatus = new Map();

// ---- Serial queue (one combine at a time to avoid OOM) ----
const compileQueue = [];
let compileRunning = false;

async function processQueue() {
  if (compileRunning || compileQueue.length === 0) return;
  compileRunning = true;

  const job = compileQueue.shift();
  const { sessionId, deviceType, chunks, folderId, email, studentId } = job;

  console.log(`[compile] START ${sessionId}/${deviceType} (${chunks.length} chunks, ${compileQueue.length} queued)`);

  const status = compileStatus.get(sessionId);
  if (status) status.devices[deviceType].status = 'compiling';

  try {
    const result = await combineChunkFiles(chunks, folderId, deviceType, email, studentId);
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
    const { sessionId } = req.body;
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
    };

    let jobsQueued = 0;

    for (const deviceType of ['main', 'proctor', 'screen']) {
      // Already have combined/FINAL?
      const hasCombined = allFiles.some(f =>
        f.name.includes(`COMBINED_${deviceType}`) ||
        f.name.includes(`_${deviceType}_FINAL_`)
      );

      if (hasCombined) {
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

module.exports = { startCompile, getStatus };

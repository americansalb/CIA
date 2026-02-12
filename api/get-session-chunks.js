const { getDrive } = require('../utils/google-auth');
const { combineChunkFiles } = require('../utils/video-converter');

// Serial combine queue — process one at a time to stay under memory limit
const combineInProgress = new Set();
const combineQueue = [];
let combineRunning = false;

async function processCombineQueue() {
  if (combineRunning || combineQueue.length === 0) return;
  combineRunning = true;

  const job = combineQueue.shift();
  const { key, chunkList, folderId, deviceType, email, studentId } = job;

  console.log(`[combine-queue] Starting: ${key} (${chunkList.length} chunks, ${combineQueue.length} queued behind)`);

  try {
    const result = await combineChunkFiles(chunkList, folderId, deviceType, email, studentId);
    if (result.success) {
      console.log(`[combine-queue] DONE: ${result.mp4FileName} (${result.chunksProcessed} chunks, fast=${result.fastMode})`);
    } else {
      console.error(`[combine-queue] FAILED: ${result.error}`);
    }
  } catch (err) {
    console.error(`[combine-queue] ERROR:`, err);
  } finally {
    combineInProgress.delete(key);
    combineRunning = false;
    // Process next in queue
    if (combineQueue.length > 0) {
      console.log(`[combine-queue] ${combineQueue.length} job(s) remaining, starting next...`);
      processCombineQueue();
    } else {
      console.log(`[combine-queue] All jobs complete`);
    }
  }
}

function queueCombine(key, chunkList, folderId, deviceType, email, studentId) {
  if (combineInProgress.has(key)) {
    console.log(`[combine-queue] Already queued/running: ${key}`);
    return;
  }
  combineInProgress.add(key);
  combineQueue.push({ key, chunkList, folderId, deviceType, email, studentId });
  console.log(`[combine-queue] Queued: ${key} (${chunkList.length} chunks, queue size: ${combineQueue.length})`);
  processCombineQueue();
}

// Helper to list ALL files with pagination
async function listAllFiles(drive, query, fields) {
  const allFiles = [];
  let pageToken = null;

  do {
    const response = await drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    allFiles.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

module.exports = async (req, res) => {
  const t0 = Date.now();
  const log = (msg) => console.log(`[session-chunks ${Date.now() - t0}ms] ${msg}`);

  try {
    const { sessionId, deviceType } = req.query;

    if (!sessionId || !deviceType) {
      return res.status(400).json({ success: false, message: 'Session ID and device type are required' });
    }

    log(`START sessionId=${sessionId} deviceType=${deviceType}`);

    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    log(`Listing student folders in ${mainFolderId}`);
    const studentFolders = await listAllFiles(
      drive,
      `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id, name'
    );
    log(`Found ${studentFolders.length} student folders`);

    // Search ALL student folders for this session
    const sessionFolderIds = [];
    let studentFolderName = null;
    for (const studentFolder of studentFolders) {
      const sessionFolders = await listAllFiles(
        drive,
        `'${studentFolder.id}' in parents and name='${sessionId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        'id'
      );
      for (const sf of sessionFolders) {
        sessionFolderIds.push(sf.id);
        if (!studentFolderName) studentFolderName = studentFolder.name;
      }
    }
    log(`Found ${sessionFolderIds.length} session folder(s) for ${sessionId} (student: ${studentFolderName})`);

    if (sessionFolderIds.length === 0) {
      log('Session NOT FOUND — returning 404');
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Fetch files from all matching session folders
    const allFiles = [];
    for (const folderId of sessionFolderIds) {
      const files = await listAllFiles(
        drive,
        `'${folderId}' in parents and trashed=false`,
        'id, name, webContentLink, webViewLink, mimeType, createdTime'
      );
      allFiles.push(...files);
    }
    log(`Found ${allFiles.length} total files: ${allFiles.map(f => f.name).join(', ')}`);

    // Check for COMBINED or FINAL videos
    const combinedVideos = allFiles.filter(f =>
      f.name.includes(`COMBINED_${deviceType}`) ||
      f.name.includes(`_${deviceType}_FINAL_`)
    );

    if (combinedVideos.length > 0) {
      combinedVideos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      const video = combinedVideos[0];
      log(`COMBINED/FINAL found: ${video.name} — returning single video`);
      return res.json({
        success: true,
        hasCombinedVideo: true,
        chunks: [{
          fileId: video.id,
          fileName: video.name,
          chunkNumber: 0,
          downloadUrl: `/api/stream-chunk?fileId=${video.id}`,
          mimeType: video.mimeType,
          isCombined: true,
        }],
      });
    }
    log(`No COMBINED/FINAL video found for ${deviceType}`);

    // Gather chunk files
    const chunks = allFiles
      .filter(f => f.name.includes(`${deviceType}_chunk_`))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/_chunk_(\d+)/)?.[1] || '0');
        const numB = parseInt(b.name.match(/_chunk_(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    if (chunks.length === 0) {
      log(`No chunks found for ${deviceType} — returning empty`);
      return res.json({ success: true, chunks: [] });
    }

    log(`Found ${chunks.length} chunks: ${chunks.map(c => c.name).join(', ')}`);

    // Build chunk URLs for immediate playback
    const chunksWithUrls = chunks.map(chunk => {
      const match = chunk.name.match(/_chunk_(\d+)/);
      return {
        fileId: chunk.id,
        fileName: chunk.name,
        chunkNumber: match ? parseInt(match[1]) : 0,
        downloadUrl: `/api/stream-chunk?fileId=${chunk.id}`,
        mimeType: chunk.mimeType,
      };
    });

    // Queue background combine (serial, one at a time to stay within memory)
    const combineKey = `${sessionId}_${deviceType}`;
    const folderParts = (studentFolderName || '').split('_');
    const combineEmail = folderParts.slice(0, -1).join('_') || 'unknown';
    const combineStudentId = folderParts[folderParts.length - 1] || 'unknown';

    log(`Queuing background combine for ${chunks.length} chunks (queue: ${combineQueue.length}, running: ${combineRunning})`);
    queueCombine(
      combineKey,
      chunks.map(c => ({ id: c.id, name: c.name })),
      sessionFolderIds[0],
      deviceType,
      combineEmail,
      combineStudentId
    );

    // Return chunks immediately — don't wait for combine
    log(`Returning ${chunksWithUrls.length} chunks for immediate playback`);
    res.json({
      success: true,
      hasCombinedVideo: false,
      combiningInBackground: true,
      chunks: chunksWithUrls,
    });
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error('Get session chunks error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chunks: ' + error.message });
  }
};

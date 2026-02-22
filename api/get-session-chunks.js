const { getDrive } = require('../utils/google-auth');

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
    const { sessionId, deviceType, raw } = req.query;

    if (!sessionId || !deviceType) {
      return res.status(400).json({ success: false, message: 'Session ID and device type are required' });
    }

    const forceRaw = raw === 'true'; // Skip combined video detection

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
    for (const studentFolder of studentFolders) {
      const sessionFolders = await listAllFiles(
        drive,
        `'${studentFolder.id}' in parents and name='${sessionId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        'id'
      );
      for (const sf of sessionFolders) {
        sessionFolderIds.push(sf.id);
      }
    }
    log(`Found ${sessionFolderIds.length} session folder(s)`);

    if (sessionFolderIds.length === 0) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Fetch files from all matching session folders
    const allFiles = [];
    for (const folderId of sessionFolderIds) {
      const files = await listAllFiles(
        drive,
        `'${folderId}' in parents and trashed=false`,
        'id, name, mimeType, createdTime'
      );
      allFiles.push(...files);
    }
    log(`Found ${allFiles.length} total files`);

    // Look for properly compiled videos only:
    // - COMBINED_* = FFmpeg concat output (seekable MP4)
    // - _FINAL_CONVERTED_ = FFmpeg WebM-to-MP4 conversion (seekable MP4)
    // NOTE: Raw _FINAL_ WebM blobs from MediaRecorder are NOT seekable
    // and will stall after the first buffered segment. Do NOT treat them
    // as combined videos — they need compilation first.
    const deviceAbbrev = deviceType[0]; // main->m, proctor->p, screen->s
    const combinedVideos = allFiles.filter(f =>
      f.name.includes(`COMBINED_${deviceType}`) ||
      f.name.includes(`_${deviceAbbrev}_FINAL_CONVERTED_`)
    );

    if (combinedVideos.length > 0 && !forceRaw) {
      combinedVideos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      const video = combinedVideos[0];
      log(`Found combined/FINAL: ${video.name}`);
      return res.json({
        success: true,
        hasCombinedVideo: true,
        createdTime: video.createdTime,
        chunks: [{
          fileId: video.id,
          fileName: video.name,
          chunkNumber: 0,
          downloadUrl: `/api/stream-chunk?fileId=${video.id}`,
          mimeType: video.mimeType,
          createdTime: video.createdTime,
          isCombined: true,
        }],
      });
    }

    // No combined video — return raw chunks for sequential playback
    const rawChunks = allFiles
      .filter(f => f.name.includes(`${deviceType}_chunk_`))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/chunk_(\d+)/)?.[1] || '0');
        const numB = parseInt(b.name.match(/chunk_(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    if (rawChunks.length > 0) {
      log(`Returning ${rawChunks.length} raw chunks for sequential playback`);
      return res.json({
        success: true,
        hasCombinedVideo: false,
        createdTime: rawChunks[0].createdTime,
        chunks: rawChunks.map((f, i) => ({
          fileId: f.id,
          fileName: f.name,
          chunkNumber: i,
          downloadUrl: `/api/stream-chunk?fileId=${f.id}`,
          mimeType: f.mimeType,
          createdTime: f.createdTime,
          isCombined: false,
        })),
      });
    }

    log(`No video found for ${deviceType}`);
    res.json({
      success: true,
      hasCombinedVideo: false,
      chunkCount: 0,
      chunks: [],
    });
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error('Get session chunks error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chunks: ' + error.message });
  }
};

const { getDrive } = require('../utils/google-auth');
const { combineChunkFiles } = require('../utils/video-converter');

// Track in-progress combines to avoid duplicate work
const combineInProgress = new Map();

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
  try {
    const { sessionId, deviceType } = req.query;

    if (!sessionId || !deviceType) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and device type are required',
      });
    }

    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Get all student folders
    const studentFolders = await listAllFiles(
      drive,
      `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id, name'
    );

    // Search ALL student folders (including duplicates from race conditions)
    // and collect all matching session folder IDs + the student folder name
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

    if (sessionFolderIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    // Fetch files from ALL matching session folders (merging duplicates)
    const allFiles = [];
    for (const folderId of sessionFolderIds) {
      const files = await listAllFiles(
        drive,
        `'${folderId}' in parents and trashed=false`,
        'id, name, webContentLink, webViewLink, mimeType, createdTime'
      );
      allFiles.push(...files);
    }

    // Check for COMBINED or FINAL videos (these take priority)
    // FINAL filenames are: email_studentid_test_{deviceType}_FINAL_timestamp.ext
    // COMBINED filenames are: COMBINED_{deviceType}.ext or email_studentid_COMBINED_{deviceType}_timestamp.mp4
    const combinedVideos = allFiles.filter(f =>
      f.name.includes(`COMBINED_${deviceType}`) ||
      f.name.includes(`_${deviceType}_FINAL_`)
    );

    if (combinedVideos.length > 0) {
      // Return the most recent combined/final video
      combinedVideos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      const video = combinedVideos[0];
      console.log(`[get-session-chunks] Found combined/final video: ${video.name}`);
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

    // No combined video — gather chunk files for this device type
    const chunks = allFiles
      .filter(f => f.name.includes(`${deviceType}_chunk_`))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/_chunk_(\d+)/)?.[1] || '0');
        const numB = parseInt(b.name.match(/_chunk_(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    if (chunks.length === 0) {
      return res.json({ success: true, chunks: [] });
    }

    // Auto-combine chunks into a single seekable video
    console.log(`[get-session-chunks] Auto-combining ${chunks.length} ${deviceType} chunks for session ${sessionId}`);

    // Parse student info from folder name
    const folderParts = (studentFolderName || '').split('_');
    const email = folderParts.slice(0, -1).join('_') || 'unknown';
    const studentId = folderParts[folderParts.length - 1] || 'unknown';

    // Prevent duplicate combines for the same session+device
    const combineKey = `${sessionId}_${deviceType}`;
    let combinePromise = combineInProgress.get(combineKey);

    if (!combinePromise) {
      combinePromise = combineChunkFiles(
        chunks.map(c => ({ id: c.id, name: c.name })),
        sessionFolderIds[0],
        deviceType,
        email,
        studentId
      ).finally(() => combineInProgress.delete(combineKey));

      combineInProgress.set(combineKey, combinePromise);
    }

    // Allow up to 10 minutes for combining
    req.setTimeout(600000);

    const combineResult = await combinePromise;

    if (combineResult.success) {
      console.log(`[get-session-chunks] Auto-combine succeeded: ${combineResult.mp4FileName}`);
      return res.json({
        success: true,
        hasCombinedVideo: true,
        chunks: [{
          fileId: combineResult.mp4FileId,
          fileName: combineResult.mp4FileName,
          chunkNumber: 0,
          downloadUrl: `/api/stream-chunk?fileId=${combineResult.mp4FileId}`,
          mimeType: 'video/mp4',
          isCombined: true,
        }],
      });
    }

    // Combine failed — fall back to first chunk only (better than nothing)
    console.error(`[get-session-chunks] Auto-combine failed: ${combineResult.error}`);
    const firstChunk = chunks[0];
    res.json({
      success: true,
      hasCombinedVideo: false,
      chunks: [{
        fileId: firstChunk.id,
        fileName: firstChunk.name,
        chunkNumber: 0,
        downloadUrl: `/api/stream-chunk?fileId=${firstChunk.id}`,
        mimeType: firstChunk.mimeType,
      }],
    });
  } catch (error) {
    console.error('Get session chunks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chunks',
    });
  }
};

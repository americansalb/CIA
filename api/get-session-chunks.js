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
    // and collect all matching session folder IDs
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
    // COMBINED filenames are: COMBINED_{deviceType}.ext
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

    // No combined video, get all chunk files for this session and device
    const chunks = allFiles.filter(f => f.name.includes(`${deviceType}_chunk_`));

    console.log(`[get-session-chunks] Found ${chunks.length} chunks for session ${sessionId}, device ${deviceType}`);

    if (chunks.length === 0) {
      console.log(`[get-session-chunks] No chunks found for session ${sessionId}`);
      return res.json({
        success: true,
        chunks: [],
      });
    }

    // Sort chunks by number
    chunks.sort((a, b) => {
      const matchA = a.name.match(/_chunk_(\d+)/);
      const matchB = b.name.match(/_chunk_(\d+)/);
      if (!matchA || !matchB) {
        console.warn(`[get-session-chunks] Invalid chunk filename format: ${a.name} or ${b.name}`);
        return 0;
      }
      const numA = parseInt(matchA[1]);
      const numB = parseInt(matchB[1]);
      return numA - numB;
    });

    // Generate download URLs using our proxy endpoint
    const chunksWithUrls = chunks.map(chunk => {
      const match = chunk.name.match(/_chunk_(\d+)/);
      if (!match) {
        console.warn(`[get-session-chunks] Skipping invalid chunk filename: ${chunk.name}`);
        return null;
      }
      return {
        fileId: chunk.id,
        fileName: chunk.name,
        chunkNumber: parseInt(match[1]),
        downloadUrl: `/api/stream-chunk?fileId=${chunk.id}`,
        mimeType: chunk.mimeType,
      };
    }).filter(chunk => chunk !== null);

    res.json({
      success: true,
      hasCombinedVideo: false,
      chunks: chunksWithUrls,
    });
  } catch (error) {
    console.error('Get session chunks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chunks',
    });
  }
};

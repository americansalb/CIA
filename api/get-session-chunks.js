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

    // Look for COMBINED or FINAL videos only
    const combinedVideos = allFiles.filter(f =>
      f.name.includes(`COMBINED_${deviceType}`) ||
      f.name.includes(`_${deviceType}_FINAL_`)
    );

    if (combinedVideos.length > 0) {
      combinedVideos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      const video = combinedVideos[0];
      log(`Found combined/FINAL: ${video.name}`);
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

    // No combined video — return empty (user needs to compile first)
    const chunkCount = allFiles.filter(f => f.name.includes(`${deviceType}_chunk_`)).length;
    log(`No combined video. ${chunkCount} uncompiled chunks for ${deviceType}.`);

    res.json({
      success: true,
      hasCombinedVideo: false,
      chunkCount,
      chunks: [],
    });
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error('Get session chunks error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chunks: ' + error.message });
  }
};

const { getDrive } = require('../utils/google-auth');

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
    const studentFoldersResponse = await drive.files.list({
      q: `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    // Search for session folder in all student folders
    let sessionFolderId = null;
    for (const studentFolder of studentFoldersResponse.data.files || []) {
      const sessionFoldersResponse = await drive.files.list({
        q: `'${studentFolder.id}' in parents and name='${sessionId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (sessionFoldersResponse.data.files && sessionFoldersResponse.data.files.length > 0) {
        sessionFolderId = sessionFoldersResponse.data.files[0].id;
        break;
      }
    }

    if (!sessionFolderId) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    // First, check for COMBINED or FINAL videos (these take priority)
    const combinedResponse = await drive.files.list({
      q: `'${sessionFolderId}' in parents and (name contains 'COMBINED_${deviceType}' or name contains 'FINAL_${deviceType}') and trashed=false`,
      fields: 'files(id, name, webContentLink, webViewLink, mimeType, createdTime)',
      orderBy: 'createdTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const combinedVideos = combinedResponse.data.files || [];

    if (combinedVideos.length > 0) {
      // Return the most recent combined/final video
      const video = combinedVideos[0];
      console.log(`[get-session-chunks] Found combined video: ${video.name}`);
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
    const filesResponse = await drive.files.list({
      q: `'${sessionFolderId}' in parents and name contains '${deviceType}_chunk_' and trashed=false`,
      fields: 'files(id, name, webContentLink, webViewLink, mimeType)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const chunks = filesResponse.data.files || [];

    console.log(`[get-session-chunks] Found ${chunks.length} chunks for session ${sessionId}, device ${deviceType}`);

    if (chunks.length === 0) {
      console.log(`[get-session-chunks] No chunks found in folder ${sessionFolderId}`);
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

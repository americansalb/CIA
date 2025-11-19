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

    // Get all chunk files for this session and device
    const filesResponse = await drive.files.list({
      q: `'${sessionFolderId}' in parents and name contains '${deviceType}_chunk_' and trashed=false`,
      fields: 'files(id, name, webContentLink, webViewLink, mimeType)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const chunks = filesResponse.data.files || [];

    // Sort chunks by number
    chunks.sort((a, b) => {
      const numA = parseInt(a.name.match(/_chunk_(\d+)/)[1]);
      const numB = parseInt(b.name.match(/_chunk_(\d+)/)[1]);
      return numA - numB;
    });

    // Generate download URLs
    const chunksWithUrls = chunks.map(chunk => ({
      fileId: chunk.id,
      fileName: chunk.name,
      chunkNumber: parseInt(chunk.name.match(/_chunk_(\d+)/)[1]),
      downloadUrl: `https://www.googleapis.com/drive/v3/files/${chunk.id}?alt=media`,
      mimeType: chunk.mimeType,
    }));

    res.json({
      success: true,
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

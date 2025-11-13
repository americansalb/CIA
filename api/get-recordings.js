const { getDrive } = require('../utils/google-auth');

module.exports = async (req, res) => {
  try {
    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Get all student folders
    const studentFoldersResponse = await drive.files.list({
      q: `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
    });

    const recordings = [];

    // For each student folder, get session folders
    for (const studentFolder of studentFoldersResponse.data.files || []) {
      const sessionFoldersResponse = await drive.files.list({
        q: `'${studentFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
      });

      // For each session, get metadata and videos
      for (const sessionFolder of sessionFoldersResponse.data.files || []) {
        const filesResponse = await drive.files.list({
          q: `'${sessionFolder.id}' in parents and trashed=false`,
          fields: 'files(id, name, createdTime, webViewLink, mimeType)',
        });

        const files = filesResponse.data.files || [];
        const metadataFile = files.find(f => f.name.endsWith('_metadata.json'));
        const videoFiles = files.filter(f => f.name.includes('_FINAL_') && f.mimeType === 'video/webm');

        if (metadataFile) {
          // Download metadata
          const metadataResponse = await drive.files.get({
            fileId: metadataFile.id,
            alt: 'media',
          });

          const metadata = metadataResponse.data;

          recordings.push({
            ...metadata,
            studentFolder: studentFolder.name,
            sessionFolder: sessionFolder.name,
            videos: videoFiles.map(v => ({
              fileId: v.id,
              fileName: v.name,
              webViewLink: v.webViewLink,
              deviceType: v.name.includes('_main_') ? 'main' : 'proctor',
            })),
          });
        }
      }
    }

    res.json({
      success: true,
      recordings,
    });
  } catch (error) {
    console.error('Get recordings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings',
    });
  }
};

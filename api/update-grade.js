const { getDrive } = require('../utils/google-auth');

module.exports = async (req, res) => {
  try {
    const { sessionId, status, notes, gradedBy } = req.body;

    if (!sessionId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and status are required',
      });
    }

    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Find the metadata file for this session
    const query = `name contains '${sessionId}' and name contains 'metadata.json' and '${mainFolderId}' in parents and trashed=false`;

    // Search recursively through folders
    const searchResponse = await drive.files.list({
      q: `name contains 'metadata.json' and trashed=false`,
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });

    const metadataFiles = searchResponse.data.files || [];
    let metadataFileId = null;

    // Find the correct metadata file by checking session ID in filename or content
    for (const file of metadataFiles) {
      if (file.name.includes(sessionId)) {
        metadataFileId = file.id;
        break;
      }
    }

    if (!metadataFileId) {
      return res.status(404).json({
        success: false,
        message: 'Recording metadata not found',
      });
    }

    // Get current metadata
    const metadataResponse = await drive.files.get({
      fileId: metadataFileId,
      alt: 'media',
    });

    const metadata = metadataResponse.data;

    // Update metadata
    metadata.status = status;
    metadata.notes = notes || metadata.notes;
    metadata.gradedBy = gradedBy;
    metadata.gradedAt = new Date().toISOString();

    // Upload updated metadata
    const { Readable } = require('stream');
    const updatedBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
    const bufferStream = new Readable();
    bufferStream.push(updatedBuffer);
    bufferStream.push(null);

    await drive.files.update({
      fileId: metadataFileId,
      media: {
        mimeType: 'application/json',
        body: bufferStream,
      },
    });

    res.json({
      success: true,
      message: 'Grade updated successfully',
    });
  } catch (error) {
    console.error('Update grade error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update grade',
    });
  }
};

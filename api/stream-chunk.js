const { getDrive } = require('../utils/google-auth');

module.exports = async (req, res) => {
  try {
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'File ID is required',
      });
    }

    const drive = await getDrive();

    // Get file metadata to set proper content type
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'mimeType, size',
      supportsAllDrives: true,
    });

    const mimeType = fileMetadata.data.mimeType || 'video/webm';
    const fileSize = parseInt(fileMetadata.data.size, 10) || null;

    // Handle range requests for video seeking
    const range = req.headers.range;

    if (range && fileSize) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      });

      // Stream the requested range
      const driveResponse = await drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true,
      }, {
        responseType: 'stream',
        headers: {
          'Range': `bytes=${start}-${end}`,
        },
      });

      driveResponse.data.on('error', (err) => {
        console.error('Drive stream error (range):', err.message);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      driveResponse.data.pipe(res);
    } else {
      // Stream entire file
      const headers = {
        'Content-Type': mimeType,
        'Accept-Ranges': fileSize ? 'bytes' : 'none',
        'Cache-Control': 'public, max-age=3600',
      };
      if (fileSize) headers['Content-Length'] = fileSize;

      res.writeHead(200, headers);

      const driveResponse = await drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true,
      }, {
        responseType: 'stream',
      });

      driveResponse.data.on('error', (err) => {
        console.error('Drive stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      driveResponse.data.pipe(res);
    }
  } catch (error) {
    console.error('Stream chunk error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream video chunk',
    });
  }
};

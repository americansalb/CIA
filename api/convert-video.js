const { queueConversion, convertToSeekableMp4 } = require('../utils/video-converter');

module.exports = async (req, res) => {
  try {
    const { fileId, folderId, fileName, immediate } = req.body;

    if (!fileId || !folderId || !fileName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fileId, folderId, fileName',
      });
    }

    // Check if it's a webm file
    if (!fileName.toLowerCase().endsWith('.webm')) {
      return res.status(400).json({
        success: false,
        message: 'Only webm files can be converted',
      });
    }

    console.log(`Manual conversion requested for: ${fileName}`);

    if (immediate) {
      // Wait for conversion to complete (for single file conversion)
      const result = await convertToSeekableMp4(fileId, folderId, fileName);

      if (result.success) {
        res.json({
          success: true,
          message: 'Video converted successfully',
          mp4FileId: result.mp4FileId,
          mp4FileName: result.mp4FileName,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Conversion failed: ' + result.error,
        });
      }
    } else {
      // Queue for background conversion (fire and forget)
      queueConversion(fileId, folderId, fileName);

      res.json({
        success: true,
        message: 'Conversion queued successfully. The MP4 will appear in Google Drive shortly.',
      });
    }
  } catch (error) {
    console.error('Convert video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert video: ' + error.message,
    });
  }
};

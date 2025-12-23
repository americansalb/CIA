const { combineChunks, queueChunkCombine } = require('../utils/video-converter');

module.exports = async (req, res) => {
  try {
    const { sessionFolderId, deviceType, email, studentId, immediate } = req.body;

    if (!sessionFolderId || !deviceType || !email || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sessionFolderId, deviceType, email, studentId',
      });
    }

    // Validate device type
    if (!['main', 'proctor'].includes(deviceType)) {
      return res.status(400).json({
        success: false,
        message: 'deviceType must be "main" or "proctor"',
      });
    }

    console.log(`Chunk combination requested for: ${email} | ${deviceType} device`);

    if (immediate) {
      // Wait for combination to complete
      const result = await combineChunks(sessionFolderId, deviceType, email, studentId);

      if (result.success) {
        res.json({
          success: true,
          message: `Combined ${result.chunksProcessed} chunks into single video`,
          mp4FileId: result.mp4FileId,
          mp4FileName: result.mp4FileName,
          webViewLink: result.webViewLink,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Combination failed: ' + result.error,
        });
      }
    } else {
      // Queue for background processing (fire and forget)
      queueChunkCombine(sessionFolderId, deviceType, email, studentId);

      res.json({
        success: true,
        message: 'Chunk combination queued. The combined MP4 will appear in Google Drive shortly.',
      });
    }
  } catch (error) {
    console.error('Combine chunks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to combine chunks: ' + error.message,
    });
  }
};

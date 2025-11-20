const { saveTestSegments } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { testName, segments, instructionsAudioUrl, warmupAudioUrl } = req.body;

    if (!testName || !segments || !Array.isArray(segments)) {
      return res.status(400).json({
        success: false,
        message: 'Test name and segments array are required',
      });
    }

    // Validate URLs
    for (const url of segments) {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return res.status(400).json({
          success: false,
          message: 'All segments must be valid URLs',
        });
      }
    }

    // Validate optional URLs if provided
    if (instructionsAudioUrl && !instructionsAudioUrl.startsWith('http')) {
      return res.status(400).json({
        success: false,
        message: 'Instructions audio URL must be a valid URL',
      });
    }

    if (warmupAudioUrl && !warmupAudioUrl.startsWith('http')) {
      return res.status(400).json({
        success: false,
        message: 'Warmup audio URL must be a valid URL',
      });
    }

    await saveTestSegments(testName, segments, instructionsAudioUrl, warmupAudioUrl);

    res.json({
      success: true,
      message: 'Test saved successfully',
    });
  } catch (error) {
    console.error('Save test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save test',
    });
  }
};

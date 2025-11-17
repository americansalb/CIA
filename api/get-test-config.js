const { getTestConfig } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { testName } = req.query;

    if (!testName) {
      return res.status(400).json({
        success: false,
        message: 'Test name is required',
      });
    }

    const config = await getTestConfig(testName);

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Get test config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test configuration',
    });
  }
};

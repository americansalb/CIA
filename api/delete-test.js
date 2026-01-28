const { deleteTest } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { testName } = req.body;

    if (!testName) {
      return res.status(400).json({
        success: false,
        message: 'Test name is required',
      });
    }

    // Prevent deleting special config
    if (testName === '_UNIVERSAL_INSTRUCTIONS') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete universal instructions configuration',
      });
    }

    await deleteTest(testName);

    res.json({
      success: true,
      message: 'Test deleted successfully',
    });
  } catch (error) {
    console.error('Delete test error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete test',
    });
  }
};

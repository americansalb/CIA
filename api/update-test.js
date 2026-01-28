const { updateTestExternalName } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { testName, externalName } = req.body;

    if (!testName) {
      return res.status(400).json({
        success: false,
        message: 'Test name is required',
      });
    }

    if (!externalName || !externalName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'External name is required',
      });
    }

    await updateTestExternalName(testName, externalName.trim());

    res.json({
      success: true,
      message: 'Test updated successfully',
    });
  } catch (error) {
    console.error('Update test error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update test',
    });
  }
};

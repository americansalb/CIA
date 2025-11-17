const { getAllTests } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const tests = await getAllTests();

    res.json({
      success: true,
      tests,
    });
  } catch (error) {
    console.error('Get tests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tests',
    });
  }
};

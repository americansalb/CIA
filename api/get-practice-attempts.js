const { getPracticeAttempts } = require('../utils/redis-client');

module.exports = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const attempts = await getPracticeAttempts(limit);

    res.json({
      success: true,
      attempts
    });
  } catch (error) {
    console.error('Error getting practice attempts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get practice attempts'
    });
  }
};

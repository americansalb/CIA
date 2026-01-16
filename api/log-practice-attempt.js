const { logPracticeAttempt } = require('../utils/redis-client');

module.exports = async (req, res) => {
  try {
    const { email, studentId, testId, testName, action } = req.body;

    if (!email || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: email, studentId'
      });
    }

    const attempt = await logPracticeAttempt({
      email,
      studentId,
      testId: testId || 'unknown',
      testName: testName || 'Unknown Test',
      action: action || 'started',
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });

    console.log(`Practice attempt logged: ${email} (${studentId}) - ${action}`);

    res.json({
      success: true,
      attempt
    });
  } catch (error) {
    console.error('Error logging practice attempt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log practice attempt'
    });
  }
};

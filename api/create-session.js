const { v4: uuidv4 } = require('uuid');

// In-memory session storage (use Redis or database in production)
const sessions = new Map();

module.exports = (req, res) => {
  try {
    const { email, studentId, permittedTest } = req.body;

    if (!email || !studentId || !permittedTest) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const sessionId = uuidv4();
    const proctorPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit PIN

    const session = {
      sessionId,
      proctorPin,
      email,
      studentId,
      permittedTest,
      mainDeviceConnected: true,
      proctorDeviceConnected: false,
      createdAt: new Date().toISOString(),
      interventions: [],
      chunks: {
        main: [],
        proctor: [],
      },
    };

    sessions.set(sessionId, session);

    // Clean up session after 3 hours
    setTimeout(() => {
      sessions.delete(sessionId);
    }, 3 * 60 * 60 * 1000);

    res.json({
      success: true,
      sessionId,
      proctorPin,
      proctorUrl: `/proctor?session=${sessionId}`,
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session',
    });
  }
};

module.exports.sessions = sessions;

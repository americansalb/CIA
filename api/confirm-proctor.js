const { sessions } = require('./create-session');

module.exports = (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    // NOW mark proctor as actually connected and recording
    session.proctorDeviceConnected = true;
    console.log(`Proctor recording confirmed for session ${sessionId}`);

    res.json({
      success: true,
      message: 'Proctor recording confirmed',
    });
  } catch (error) {
    console.error('Proctor confirm error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm proctor',
    });
  }
};

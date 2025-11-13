const { sessions } = require('./create-session');

module.exports = (req, res) => {
  try {
    const { sessionId } = req.params;

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
        message: 'Session not found or expired',
      });
    }

    res.json({
      success: true,
      mainDeviceConnected: session.mainDeviceConnected,
      proctorDeviceConnected: session.proctorDeviceConnected,
      interventionCount: session.interventions.length,
    });
  } catch (error) {
    console.error('Session status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session status',
    });
  }
};

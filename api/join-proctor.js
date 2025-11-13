const { sessions } = require('./create-session');

module.exports = (req, res) => {
  try {
    const { sessionId, pin } = req.body;

    if (!sessionId || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and PIN are required',
      });
    }

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or expired',
      });
    }

    if (session.proctorPin !== pin) {
      return res.status(403).json({
        success: false,
        message: 'Invalid PIN',
      });
    }

    session.proctorDeviceConnected = true;

    res.json({
      success: true,
      message: 'Proctor device connected',
      studentInfo: {
        email: session.email,
        studentId: session.studentId,
      },
    });
  } catch (error) {
    console.error('Proctor join error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join proctor session',
    });
  }
};

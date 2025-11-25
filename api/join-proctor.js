const { sessions } = require('./create-session');

module.exports = (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'PIN is required',
      });
    }

    // Find session by PIN (search all active sessions)
    let matchedSession = null;
    let matchedSessionId = null;

    for (const [sessionId, session] of sessions.entries()) {
      if (session.proctorPin === pin) {
        matchedSession = session;
        matchedSessionId = sessionId;
        break;
      }
    }

    if (!matchedSession) {
      return res.status(404).json({
        success: false,
        message: 'Invalid PIN or session expired',
      });
    }

    // NOTE: Don't set proctorDeviceConnected yet - wait for recording to actually start
    // This prevents main device from thinking proctor is ready before user clicks checkmark
    // Connection is confirmed in a separate endpoint after recording starts

    res.json({
      success: true,
      message: 'PIN verified - setup proctor camera',
      sessionId: matchedSessionId, // Return session ID for recording purposes
      studentInfo: {
        email: matchedSession.email,
        studentId: matchedSession.studentId,
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

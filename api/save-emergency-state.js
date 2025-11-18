// Emergency state saving endpoint (for beforeunload)
// This receives state data via sendBeacon when user tries to close during test

const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
  try {
    // sendBeacon sends data as blob, need to parse it
    let state;

    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      state = req.body;
    } else {
      // Handle raw body
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks).toString();
          state = JSON.parse(body);

          // Log emergency state
          console.log('Emergency state received:', {
            sessionId: state.sessionId,
            studentId: state.studentId,
            email: state.email,
            timestamp: new Date(state.timestamp).toISOString(),
          });

          // Save to emergency log file
          const emergencyLogPath = path.join(__dirname, '..', 'logs', 'emergency-states.log');
          const logEntry = `${new Date().toISOString()} - ${JSON.stringify(state)}\n`;

          // Ensure logs directory exists
          await fs.mkdir(path.join(__dirname, '..', 'logs'), { recursive: true });
          await fs.appendFile(emergencyLogPath, logEntry);

          res.json({ success: true, message: 'Emergency state saved' });
        } catch (error) {
          console.error('Error parsing emergency state:', error);
          res.status(400).json({ success: false, message: 'Invalid data' });
        }
      });

      return; // Don't send response yet
    }

    // If we got here with parsed body
    console.log('Emergency state received:', {
      sessionId: state.sessionId,
      studentId: state.studentId,
      email: state.email,
      timestamp: new Date(state.timestamp).toISOString(),
    });

    // Save to emergency log file
    const emergencyLogPath = path.join(__dirname, '..', 'logs', 'emergency-states.log');
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(state)}\n`;

    // Ensure logs directory exists
    await fs.mkdir(path.join(__dirname, '..', 'logs'), { recursive: true });
    await fs.appendFile(emergencyLogPath, logEntry);

    res.json({ success: true, message: 'Emergency state saved' });
  } catch (error) {
    console.error('Emergency state save error:', error);
    res.status(500).json({ success: false, message: 'Failed to save emergency state' });
  }
};

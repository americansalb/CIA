// Client-side error logging endpoint
module.exports = (req, res) => {
  const { level, message, stack, url, userAgent, sessionId, timestamp } = req.body;

  const logPrefix = `[CLIENT ${level?.toUpperCase() || 'ERROR'}]`;
  const logMessage = `${logPrefix} ${sessionId || 'NO_SESSION'} - ${message}`;

  // Log to console with appropriate level
  if (level === 'error') {
    console.error(logMessage);
    if (stack) console.error('Stack:', stack);
  } else if (level === 'warn') {
    console.warn(logMessage);
  } else {
    console.log(logMessage);
  }

  // Log additional context
  if (url) console.log('  URL:', url);
  if (userAgent) console.log('  User Agent:', userAgent);

  res.json({ success: true });
};

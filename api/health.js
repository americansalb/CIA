// Health check endpoint for recording heartbeat
module.exports = (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: Date.now() });
};

const { isAdmin } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Check password first
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({
        success: false,
        message: 'Admin password not configured',
      });
    }

    if (password !== adminPassword) {
      return res.status(403).json({
        success: false,
        message: 'Invalid password',
      });
    }

    // Then check if email is in admin whitelist
    const adminStatus = await isAdmin(email);

    if (!adminStatus) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not authorized as an administrator.',
      });
    }

    res.json({
      success: true,
      message: 'Admin access granted',
    });
  } catch (error) {
    console.error('Admin validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin validation',
    });
  }
};

const { isAdmin } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

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

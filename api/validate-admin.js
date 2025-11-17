const { validateAdmin } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Check email and password against Admin sheet
    const isValid = await validateAdmin(email, password);

    if (!isValid) {
      return res.status(403).json({
        success: false,
        message: 'Invalid email or password',
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

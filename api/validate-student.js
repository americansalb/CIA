const { getStudentRecord } = require('../utils/sheets-helper');

module.exports = async (req, res) => {
  try {
    const { email, studentId } = req.body;

    if (!email || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Email and Student ID are required',
      });
    }

    const student = await getStudentRecord(email, studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'No record found for this email and student ID combination',
      });
    }

    res.json({
      success: true,
      student: {
        email: student.email,
        studentId: student.studentId,
        permittedTest: student.permittedTest,
        attempts: student.attempts,
      },
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
    });
  }
};

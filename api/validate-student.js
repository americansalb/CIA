const { getStudentRecord, getAllTests } = require('../utils/sheets-helper');

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

    // Log student login for debugging
    const isTestMode = student.email.toLowerCase().trim() === 'monkey@aalb.org';
    console.log(`Student login: ${student.email} (ID: ${student.studentId}) - Test mode: ${isTestMode}`);

    // Get external names for tests
    let testExternalNames = {};
    try {
      const allTests = await getAllTests();
      allTests.forEach(test => {
        testExternalNames[test.name] = test.externalName || test.name;
      });
    } catch (err) {
      console.error('Error fetching test external names:', err);
      // Continue without external names
    }

    // Build permitted tests with external names
    const permittedTestsWithNames = (student.permittedTests || []).map(testName => ({
      name: testName, // Internal name (for API calls)
      displayName: testExternalNames[testName] || testName, // External name (for display)
    }));

    res.json({
      success: true,
      student: {
        email: student.email,
        studentId: student.studentId,
        permittedTests: student.permittedTests || [], // Array of internal names (backward compat)
        permittedTestsWithNames, // Array with both internal and display names
        permittedTest: student.permittedTest, // Backward compatibility: first test or null
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

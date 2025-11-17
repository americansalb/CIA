const { getSheets } = require('./google-auth');

async function getStudentRecord(email, studentId) {
  try {
    const sheets = await getSheets();
    const range = process.env.STUDENTS_SHEET_RANGE || 'Students!A:D';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return null;
    }

    // Skip header row, find matching student
    for (let i = 1; i < rows.length; i++) {
      const [rowEmail, rowStudentId, permittedTest, attempts] = rows[i];

      if (rowEmail?.toLowerCase() === email.toLowerCase() &&
          rowStudentId === studentId) {
        return {
          email: rowEmail,
          studentId: rowStudentId,
          permittedTest: permittedTest,
          attempts: attempts,
          rowIndex: i + 1 // 1-indexed for Google Sheets
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching student record:', error);
    throw error;
  }
}

async function validateAdmin(email, password) {
  try {
    const sheets = await getSheets();
    const range = process.env.ADMIN_SHEET_RANGE || 'Admin!A:B';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return false;
    }

    // Check if email and password match
    for (let i = 1; i < rows.length; i++) {
      const [rowEmail, rowPassword] = rows[i];

      if (rowEmail?.toLowerCase() === email.toLowerCase() &&
          rowPassword === password) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error validating admin:', error);
    throw error;
  }
}

module.exports = {
  getStudentRecord,
  validateAdmin,
};

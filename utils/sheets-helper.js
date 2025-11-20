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
    const range = process.env.ADMIN_SHEET_RANGE || 'Admins!A:B';

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

async function getAllTests() {
  try {
    const sheets = await getSheets();
    const allTests = new Set();

    // Get configured tests from Tests sheet FIRST (primary source of truth)
    const testsRange = process.env.TESTS_SHEET_RANGE || 'Tests!A:D';
    const testConfigs = {};

    try {
      const testsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: testsRange,
      });

      const testRows = testsResponse.data.values || [];

      // Parse test configurations
      for (let i = 1; i < testRows.length; i++) {
        const [testName, segmentNum, audioUrl, status] = testRows[i];
        if (testName) {
          allTests.add(testName);
          if (!testConfigs[testName]) {
            testConfigs[testName] = [];
          }
          testConfigs[testName].push({
            segmentNumber: parseInt(segmentNum),
            audioUrl,
            status: status || 'active',
          });
        }
      }
    } catch (error) {
      // Tests sheet doesn't exist yet
      console.log('Tests sheet not found, checking Students sheet only');
    }

    // Also get tests from Students sheet (tests that are assigned but maybe not configured yet)
    const studentsRange = process.env.STUDENTS_SHEET_RANGE || 'Students!A:D';
    try {
      const studentsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: studentsRange,
      });

      const studentRows = studentsResponse.data.values || [];

      // Skip header, get unique test names
      for (let i = 1; i < studentRows.length; i++) {
        const [, , permittedTest] = studentRows[i];
        if (permittedTest) {
          allTests.add(permittedTest);
        }
      }
    } catch (error) {
      console.log('Students sheet not found');
    }

    // Return all tests (configured and unassigned)
    return Array.from(allTests).map(name => ({
      name,
      configured: !!testConfigs[name],
      segmentCount: testConfigs[name]?.length || 0,
      segments: testConfigs[name] || [],
    }));
  } catch (error) {
    console.error('Error getting all tests:', error);
    throw error;
  }
}

async function getTestConfig(testName) {
  try {
    const sheets = await getSheets();
    const range = process.env.TESTS_SHEET_RANGE || 'Tests!A:F';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: range,
    });

    const rows = response.data.values || [];
    const segments = [];
    let instructionsAudioUrl = '';
    let warmupAudioUrl = '';

    for (let i = 1; i < rows.length; i++) {
      const [name, segmentNum, audioUrl, status, instructions, warmup] = rows[i];
      if (name === testName && status === 'active') {
        segments.push({
          segmentNumber: parseInt(segmentNum),
          audioUrl,
        });
        // Read instructions and warmup URLs from any row (they're duplicated across all segments)
        if (!instructionsAudioUrl && instructions) {
          instructionsAudioUrl = instructions;
        }
        if (!warmupAudioUrl && warmup) {
          warmupAudioUrl = warmup;
        }
      }
    }

    // Sort by segment number
    segments.sort((a, b) => a.segmentNumber - b.segmentNumber);

    return {
      testName,
      segments: segments.map(s => s.audioUrl),
      instructionsAudioUrl: instructionsAudioUrl || '',
      warmupAudioUrl: warmupAudioUrl || '',
    };
  } catch (error) {
    console.error('Error getting test config:', error);
    throw error;
  }
}

async function saveTestSegments(testName, segments, instructionsAudioUrl = '', warmupAudioUrl = '') {
  try {
    const sheets = await getSheets();
    const range = process.env.TESTS_SHEET_RANGE || 'Tests!A:F';

    // First, get existing data to preserve other tests
    let existingRows = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: range,
      });
      existingRows = response.data.values || [];
    } catch (error) {
      // Sheet doesn't exist, will create with headers
      existingRows = [];
    }

    // Ensure headers exist (if sheet is empty or doesn't have headers)
    if (existingRows.length === 0) {
      existingRows = [['Test_Name', 'Segment_Number', 'Audio_URL', 'Status', 'Instructions_Audio_URL', 'Warmup_Audio_URL']];
    }

    // Remove old entries for this test
    const filteredRows = existingRows.filter((row, index) => {
      if (index === 0) return true; // Keep header
      return row[0] !== testName;
    });

    // Add new segments
    segments.forEach((url, index) => {
      filteredRows.push([
        testName,
        (index + 1).toString(),
        url,
        'active',
        instructionsAudioUrl || '',
        warmupAudioUrl || '',
      ]);
    });

    // Write back to sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: {
        values: filteredRows,
      },
    });

    return true;
  } catch (error) {
    console.error('Error saving test segments:', error);
    throw error;
  }
}

module.exports = {
  getStudentRecord,
  validateAdmin,
  getAllTests,
  getTestConfig,
  saveTestSegments,
};

const { getSheets } = require('./google-auth');

async function getStudentRecord(email, studentId) {
  try {
    const sheets = await getSheets();
    // Extended range to support multiple permitted tests (columns C-G) and attempts (column H)
    const range = process.env.STUDENTS_SHEET_RANGE || 'Students!A:H';

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
      const row = rows[i];
      const rowEmail = row[0];       // Column A: Email
      const rowStudentId = row[1];   // Column B: Student_ID
      // Columns C-G (indices 2-6): Permitted Tests
      const permittedTest1 = row[2]; // Column C
      const permittedTest2 = row[3]; // Column D
      const permittedTest3 = row[4]; // Column E
      const permittedTest4 = row[5]; // Column F
      const permittedTest5 = row[6]; // Column G
      const attempts = row[7];       // Column H: Attempt #

      if (rowEmail?.toLowerCase() === email.toLowerCase() &&
          rowStudentId === studentId) {

        // Collect all non-empty permitted tests into an array
        const permittedTests = [
          permittedTest1,
          permittedTest2,
          permittedTest3,
          permittedTest4,
          permittedTest5
        ].filter(test => test && test.trim() !== '');

        return {
          email: rowEmail,
          studentId: rowStudentId,
          permittedTests: permittedTests, // Array of permitted tests
          permittedTest: permittedTests[0] || null, // Backward compatibility: first test
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
    // Scan columns C-G (indices 2-6) for permitted tests
    const studentsRange = 'Students!A:H';
    try {
      const studentsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: studentsRange,
      });

      const studentRows = studentsResponse.data.values || [];

      // Skip header, get unique test names from all permitted test columns (C-G)
      for (let i = 1; i < studentRows.length; i++) {
        const row = studentRows[i];
        // Check columns C through G (indices 2-6) for permitted tests
        for (let col = 2; col <= 6; col++) {
          const permittedTest = row[col];
          if (permittedTest && permittedTest.trim() !== '') {
            allTests.add(permittedTest);
          }
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

    // ALSO load universal instructions and warmup from _UNIVERSAL_INSTRUCTIONS
    let universalInstructionsUrl = '';
    let universalWarmupSegments = [];

    for (let i = 1; i < rows.length; i++) {
      const [name, segmentNum, audioUrl, status, instructions, warmup] = rows[i];

      // Load universal instructions and warmup
      if (name === '_UNIVERSAL_INSTRUCTIONS' && status === 'active') {
        if (!universalInstructionsUrl && audioUrl) {
          universalInstructionsUrl = audioUrl;
        }
        if (warmup) {
          try {
            const parsed = JSON.parse(warmup);
            if (Array.isArray(parsed)) {
              universalWarmupSegments = parsed;
            }
          } catch (e) {
            // Not JSON, treat as single URL
            if (warmup.trim()) {
              universalWarmupSegments = [warmup];
            }
          }
        }
      }

      // Load test segments
      if (name === testName && status === 'active') {
        segments.push({
          segmentNumber: parseInt(segmentNum),
          audioUrl,
        });
        // Read instructions and warmup URLs from test row (for backward compatibility)
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

    // Parse warmup segments from test row (backward compatibility)
    let warmupSegments = [];
    if (warmupAudioUrl) {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(warmupAudioUrl);
        if (Array.isArray(parsed)) {
          warmupSegments = parsed;
          warmupAudioUrl = ''; // Clear single URL if we have segments
        }
      } catch (e) {
        // Not JSON, treat as single URL (backward compatibility)
        warmupSegments = [];
      }
    }

    // PRIORITY: Universal instructions/warmup override test-specific ones
    const finalInstructionsUrl = universalInstructionsUrl || instructionsAudioUrl;
    const finalWarmupSegments = universalWarmupSegments.length > 0 ? universalWarmupSegments : warmupSegments;
    const finalWarmupUrl = finalWarmupSegments.length === 0 ? warmupAudioUrl : '';

    console.log(`getTestConfig(${testName}): Found ${finalWarmupSegments.length} warmup segments from universal instructions`);

    return {
      testName,
      segments: segments.map(s => s.audioUrl),
      instructionsAudioUrl: finalInstructionsUrl || '',
      warmupAudioUrl: finalWarmupUrl || '',
      warmupSegments: finalWarmupSegments,
      universalInstructionsUrl: finalInstructionsUrl || '',
    };
  } catch (error) {
    console.error('Error getting test config:', error);
    throw error;
  }
}

async function saveTestSegments(testName, segments, instructionsAudioUrl = '', warmupAudioUrl = '', warmupSegments = []) {
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

    // If warmup segments provided, store as JSON array
    let warmupValue = warmupAudioUrl || '';
    if (warmupSegments && warmupSegments.length > 0) {
      warmupValue = JSON.stringify(warmupSegments);
    }

    // Add new segments
    if (segments.length > 0) {
      segments.forEach((url, index) => {
        filteredRows.push([
          testName,
          (index + 1).toString(),
          url,
          'active',
          instructionsAudioUrl || '',
          warmupValue,
        ]);
      });
    } else if (warmupSegments.length > 0 || instructionsAudioUrl) {
      // If there are only warmup segments or instructions with no test segments,
      // still create a row to store them in the database
      filteredRows.push([
        testName,
        '1',
        instructionsAudioUrl || '',
        'active',
        '',
        warmupValue,
      ]);
    }

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

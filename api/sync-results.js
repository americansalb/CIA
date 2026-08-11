// Rebuild the "Results" tab of the assessment spreadsheet from Drive.
//
// Grades are stored in a metadata.json file inside each attempt's Drive folder.
// That makes a single attempt easy to read and every attempt together
// impossible, so this walks the same folders the admin panel reads and writes
// one row per attempt into the spreadsheet the app already uses for Students,
// Admins and Tests.
//
// The rebuild is a full rewrite, so it doubles as the backfill for attempts
// recorded before this existed. Running it twice changes nothing.

const { collectRecordings } = require('./get-recordings');
const { writeResults, RESULTS_SHEET_NAME } = require('../utils/sheets-helper');

async function syncResults() {
  const recordings = await collectRecordings();
  const count = await writeResults(recordings);
  return { count, sheetName: RESULTS_SHEET_NAME };
}

module.exports = async (req, res) => {
  try {
    const { count, sheetName } = await syncResults();

    res.json({
      success: true,
      count,
      sheetName,
      sheetUrl: process.env.GOOGLE_SHEET_ID
        ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`
        : null,
      message: `Wrote ${count} attempt${count === 1 ? '' : 's'} to the ${sheetName} tab.`,
    });
  } catch (error) {
    console.error('Sync results error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to write results to the spreadsheet.',
    });
  }
};

module.exports.syncResults = syncResults;

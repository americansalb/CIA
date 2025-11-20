# WARMUP FEATURE - QUICK FIX GUIDE

## THE PROBLEM IN 30 SECONDS

Admin saves 6 warmup segments WITHOUT an instructions URL.

**What happens:**
1. Admin clicks "Save Universal Settings"
2. Code creates request with: `segments = []` (empty), `warmupSegments = [url1...url6]`
3. saveTestSegments() loops through `segments.forEach()` - but segments is empty
4. forEach never executes - NO ROWS added to Google Sheets
5. Warmup segments are LOST
6. Student logs in → no warmup found → shows "Warmup not configured" alert

---

## THE FIX (ONE FILE, 9 LINES)

**File:** `/home/user/CIA/utils/sheets-helper.js`  
**Function:** `saveTestSegments()`  
**Lines:** 278-287

### CHANGE FROM THIS:
```javascript
    // Add new segments
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
```

### CHANGE TO THIS:
```javascript
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
    } else if (warmupSegments.length > 0) {
      // If there are only warmup segments with no test/instruction segments,
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
```

---

## WHY THIS FIX WORKS

The fix adds a conditional check:

1. **If segments.length > 0** → Use original code (handles instructions + test segments)
2. **Else if warmupSegments.length > 0** → Create ONE row just to store warmup

This ensures that at least one database row is created so the warmup JSON can be saved in column F.

When getTestConfig() runs later, it will:
- Find the _UNIVERSAL_INSTRUCTIONS row
- Extract the warmup JSON from column F
- Load it into testConfig.warmupSegments
- Student sees warmup!

---

## TESTING THE FIX

1. **Before fix:**
   - Admin saves warmup without instructions
   - Google Sheets shows NO new row
   - Student logs in
   - Browser console: "✗ No warmup found in universal config!"
   - Warmup button shows: "Warmup not configured"

2. **After fix:**
   - Admin saves warmup without instructions
   - Google Sheets shows ONE _UNIVERSAL_INSTRUCTIONS row
   - Row has JSON array in column F: `["url1","url2","url3","url4","url5","url6"]`
   - Student logs in
   - Browser console: "✓ Loaded 6 warmup segments into testConfig"
   - Click "Start Warmup" → plays warmup segments
   - After warmup → click "Proceed to Test" → plays test segments

---

## RELATED ISSUES (OPTIONAL CLEANUP)

These don't break the feature but should be addressed:

**BUG #2:** Admin UI allows saving without instructions URL  
**File:** test-manager.js, line 421-428  
**Issue:** UI asks for confirmation but doesn't prevent save  
**Status:** With our fix, this is now valid (warmup-only is OK)

**BUG #3-6:** Naming inconsistencies and dead code  
**Status:** Low priority, fix #1 makes these non-blocking

---

## CRITICAL PATHS

The data flows through these functions. Make sure they're correct:

```
ADMIN SAVES:
test-manager.js::saveUniversalInstructions()
    ↓
api/save-test.js (validates warmupSegments)
    ↓
sheets-helper.js::saveTestSegments() ← FIX APPLIED HERE
    ↓
Google Sheets (column F has JSON array)

STUDENT LOADS:
app.js::login() 
    ↓
api/get-test-config.js
    ↓
sheets-helper.js::getTestConfig() (parses JSON from column F)
    ↓
testConfig.warmupSegments = [url1, url2, url3...]

STUDENT RUNS:
app.js::startWarmup()
    ↓
app.js::loadWarmup() (uses testConfig.warmupSegments)
    ↓
app.js::loadSegment() (plays each warmup URL)
```

All these functions are working CORRECTLY. Only saveTestSegments() had the bug.

---

## DEPLOYMENT

1. Apply the 9-line fix to sheets-helper.js
2. Commit the change
3. Deploy
4. Test with admin account:
   - Upload warmup audio
   - Split into segments
   - Save WITHOUT instructions URL
   - Check Google Sheets
   - Have student login and try warmup

No database migration needed. No API changes. Just one function fix.


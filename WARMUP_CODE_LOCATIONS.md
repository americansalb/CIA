# WARMUP FEATURE - CODE LOCATION REFERENCE

## FILE MAP & FLOW SUMMARY

```
┌─ ADMIN PANEL ─────────────────────────────────────┐
│  public/js/test-manager.js                         │
│  ├─ editUniversalInstructions() [L241]            │
│  ├─ saveUniversalInstructions() [L421]            │
│  ├─ openWarmupAudioSplitter() [L488]              │
│  ├─ processAndUpload() [L824]                     │
│  └─ renderUniversalInstructionsEditor() [L294]    │
│                                                    │
│  Sends to API: /api/save-test                     │
└────────────────────────────────────────────────────┘
                      ↓
┌─ API LAYER ───────────────────────────────────────┐
│  api/save-test.js                                 │
│  └─ POST handler [L1]                             │
│     Calls: sheets-helper.js::saveTestSegments()   │
│                                                    │
│  api/get-test-config.js                           │
│  └─ GET handler [L1]                              │
│     Calls: sheets-helper.js::getTestConfig()      │
└────────────────────────────────────────────────────┘
                      ↓
┌─ DATABASE LAYER ──────────────────────────────────┐
│  utils/sheets-helper.js                           │
│  ├─ saveTestSegments() [L242] ← BUG HERE!         │
│  ├─ getTestConfig() [L144]                        │
│  ├─ getAllTests() [L73]                           │
│  └─ getStudentRecord() [L3]                       │
│                                                    │
│  Reads/writes: Google Sheets                      │
│  Range: Tests!A:F                                 │
│  Columns: A=Name, B=Segment#, C=URL, D=Status,   │
│           E=Instructions, F=Warmup(JSON)          │
└────────────────────────────────────────────────────┘
                      ↓
┌─ GOOGLE SHEETS ───────────────────────────────────┐
│  Tests sheet                                       │
│  Row format:                                       │
│  [TestName|SegNum|AudioURL|Status|InstrURL|Warmup]│
│                                                    │
│  Example data for warmup:                         │
│  _UNIVERSAL_INSTRUCTIONS | 1 | instrUrl | active |│
│      | ["url1","url2","url3","url4","url5","url6"]│
└────────────────────────────────────────────────────┘
                      ↓
┌─ STUDENT CLIENT ──────────────────────────────────┐
│  public/js/app.js                                 │
│  ├─ loginForm handler [L82]                       │
│  │  └─ Fetches test config + universal config     │
│  │     Stores in: testConfig.warmupSegments       │
│  ├─ startWarmup() [L1624]                         │
│  │  └─ Checks testConfig.warmupSegments           │
│  ├─ loadWarmup() [L1670]                          │
│  │  └─ Loads warmupSegments into testConfig.seg.. │
│  └─ loadSegment() [L904]                          │
│     └─ Plays audio segment [L923]                 │
└────────────────────────────────────────────────────┘
```

---

## THE CRITICAL BUG - EXACT LOCATION

**File:** `/home/user/CIA/utils/sheets-helper.js`  
**Function:** `saveTestSegments()`  
**Lines:** 278-287

**Current (BROKEN):**
```javascript
277│   // Add new segments
278│   segments.forEach((url, index) => {
279│     filteredRows.push([
280│       testName,
281│       (index + 1).toString(),
282│       url,
283│       'active',
284│       instructionsAudioUrl || '',
285│       warmupValue,
286│     ]);
287│   });
```

**The Problem:**
When `segments` array is empty, the forEach loop never executes, so no rows are added to `filteredRows`, and no data is written to Google Sheets.

**Fixed (CORRECT):**
```javascript
277│   // Add new segments
278│   if (segments.length > 0) {
279│     segments.forEach((url, index) => {
280│       filteredRows.push([
281│         testName,
282│         (index + 1).toString(),
283│         url,
284│         'active',
285│         instructionsAudioUrl || '',
286│         warmupValue,
287│       ]);
288│     });
289│   } else if (warmupSegments.length > 0) {
290│     // If there are only warmup segments with no test/instruction segments,
291│     // still create a row to store them in the database
292│     filteredRows.push([
293│       testName,
294│       '1',
295│       instructionsAudioUrl || '',
296│       'active',
297│       '',
298│       warmupValue,
299│     ]);
300│   }
```

---

## CALL STACK - HOW BUG HAPPENS

### 1. ADMIN SAVES WARMUP
**File:** `public/js/test-manager.js`  
**Function:** `saveUniversalInstructions()` [Line 421]

```javascript
421│ async function saveUniversalInstructions() {
422│   const url = testSegments[0]?.trim();  // Admin didn't enter instructions
423│
424│   if (!url) {
425│     const confirmDelete = confirm('No instructions URL provided...');
426│     if (!confirmDelete) return;
427│   }
428│
429│   if (url && !url.startsWith('http')) {
430│     alert('Instructions URL must start with http:// or https://');
431│     return;
432│   }
433│
434│   // Validate warmup segments - filter out empty ones
435│   const validWarmupSegments = warmupSegments.filter(s => s && s.trim());
436│
437│   // Validate each warmup segment URL
438│   for (const segment of validWarmupSegments) {
439│     if (!segment.startsWith('http')) {
440│       alert('All warmup segment URLs must start with http:// or https://');
441│       return;
442│     }
443│   }
444│
445│   try {
446│     const config = {
447│       testName: '_UNIVERSAL_INSTRUCTIONS',
448│       segments: url ? [url] : [],  // ← EMPTY ARRAY if no instructions!
449│       // warmupSegments: validWarmupSegments  // ← Has 6 URLs
450│     };
451│
452│     // Add warmup segments if any valid ones exist
453│     if (validWarmupSegments.length > 0) {
454│       config.warmupSegments = validWarmupSegments;
455│     }
456│
457│     const response = await fetch('/api/save-test', {
458│       method: 'POST',
459│       headers: { 'Content-Type': 'application/json' },
460│       body: JSON.stringify(config),
461│     });
462│     // ...
463│   }
464│ }
```

### 2. API RECEIVES REQUEST
**File:** `api/save-test.js`  
**Lines:** 1-42

```javascript
 1│ const { saveTestSegments } = require('../utils/sheets-helper');
 2│
 3│ module.exports = async (req, res) => {
 4│   try {
 5│     const { testName, segments, instructionsAudioUrl, warmupAudioUrl, warmupSegments } = req.body;
 6│
 7│     if (!testName || !segments || !Array.isArray(segments)) {
 8│       return res.status(400).json({
 9│         success: false,
 9│         message: 'Test name and segments array are required',
10│       });
11│     }
12│
13│     // Validate URLs
14│     for (const url of segments) {
15│       if (!url || typeof url !== 'string' || !url.startsWith('http')) {
16│         return res.status(400).json({
17│           success: false,
18│           message: 'All segments must be valid URLs',
19│         });
20│       }
21│     }
22│
23│     // For _UNIVERSAL_INSTRUCTIONS, allow optional warmup segments
24│     if (testName === '_UNIVERSAL_INSTRUCTIONS') {
25│       // Validate optional warmup segments if provided
26│       if (warmupSegments && Array.isArray(warmupSegments)) {
27│         for (const url of warmupSegments) {
28│           if (!url || typeof url !== 'string' || !url.startsWith('http')) {
29│             return res.status(400).json({
30│               success: false,
31│               message: 'All warmup segments must be valid URLs',
32│             });
33│           }
34│         }
35│       }
36│
37│       // ← CRITICAL: Calls saveTestSegments with segments = [] and warmupSegments = [url1...url6]
38│       await saveTestSegments(testName, segments, '', '', warmupSegments || []);
39│   } else {
40│       // Regular tests don't have warmup/instructions
41│       await saveTestSegments(testName, segments);
42│     }
43│   }
44│ };
```

**KEY LINE 38:** saveTestSegments is called with:
- testName = '_UNIVERSAL_INSTRUCTIONS'
- segments = [] (empty because admin didn't provide instructions URL)
- warmupSegments = ['url1', 'url2', 'url3', 'url4', 'url5', 'url6']

### 3. DATABASE SAVE (THE BUG)
**File:** `utils/sheets-helper.js`  
**Function:** `saveTestSegments()` [Line 242]

```javascript
242│ async function saveTestSegments(testName, segments, instructionsAudioUrl = '', warmupAudioUrl = '', warmupSegments = []) {
243│   try {
244│     const sheets = await getSheets();
245│     const range = process.env.TESTS_SHEET_RANGE || 'Tests!A:F';
246│
247│     // First, get existing data to preserve other tests
248│     let existingRows = [];
249│     try {
250│       const response = await sheets.spreadsheets.values.get({
251│         spreadsheetId: process.env.GOOGLE_SHEET_ID,
252│         range: range,
253│       });
254│       existingRows = response.data.values || [];
255│     } catch (error) {
256│       // Sheet doesn't exist, will create with headers
257│       existingRows = [];
258│     }
259│
260│     // Ensure headers exist (if sheet is empty or doesn't have headers)
261│     if (existingRows.length === 0) {
262│       existingRows = [['Test_Name', 'Segment_Number', 'Audio_URL', 'Status', 'Instructions_Audio_URL', 'Warmup_Audio_URL']];
263│     }
264│
265│     // Remove old entries for this test
266│     const filteredRows = existingRows.filter((row, index) => {
267│       if (index === 0) return true; // Keep header
268│       return row[0] !== testName;
269│     });
270│
271│     // If warmup segments provided, store as JSON array
272│     let warmupValue = warmupAudioUrl || '';
273│     if (warmupSegments && warmupSegments.length > 0) {
274│       warmupValue = JSON.stringify(warmupSegments);  // ← "["url1","url2",...]"
275│     }
276│
277│     // Add new segments  ← ← ← BUG LOCATION
278│     segments.forEach((url, index) => {
279│       filteredRows.push([
280│         testName,
281│         (index + 1).toString(),
282│         url,
283│         'active',
284│         instructionsAudioUrl || '',
285│         warmupValue,
286│       ]);
287│     });
288│     // ← forEach never executes because segments.length === 0!
289│     // ← filteredRows never gets updated!
290│
291│     // Write back to sheet
292│     await sheets.spreadsheets.values.update({
293│       spreadsheetId: process.env.GOOGLE_SHEET_ID,
294│       range: range,
295│       valueInputOption: 'RAW',
296│       resource: {
297│         values: filteredRows,  // ← Still has only old data!
298│       },
299│     });
300│
301│     return true;
302│   } catch (error) {
303│     console.error('Error saving test segments:', error);
304│     throw error;
305│   }
306│ }
```

**THE BUG EXPLAINED:**
- Line 273: `warmupValue = JSON.stringify([...])` = `'["url1","url2",...]'`
- Line 278: `segments.forEach()` - segments is empty array `[]`
- forEach never executes (no iterations of empty array)
- filteredRows never gets updated with the new row
- Line 292: `sheets.spreadsheets.values.update()` writes the old data (without the warmup)
- Google Sheets is NOT updated

### 4. STUDENT LOADS & SEES NOTHING
**File:** `public/js/app.js`  
**Lines:** 82-175 (loginForm handler)

```javascript
124│   // Load test configuration from Google Sheets
125│   const testConfigResponse = await fetch(`/api/test-config?testName=${encodeURIComponent(studentData.permittedTest)}`);
126│   const testConfigResult = await testConfigResponse.json();
127│
128│   if (!testConfigResult.success || !testConfigResult.config || testConfigResult.config.segments.length === 0) {
129│     throw new Error(`Test "${studentData.permittedTest}" has not been configured yet...`);
130│   }
131│
132│   testConfig = testConfigResult.config;
133│
134│   // Load universal instructions config (but don't show yet)
135│   const universalResponse = await fetch('/api/test-config?testName=_UNIVERSAL_INSTRUCTIONS');
136│   const universalResult = await universalResponse.json();
137│
138│   console.log('universalResult:', universalResult);
139│   console.log('universalResult.config.warmupSegments:', universalResult.config?.warmupSegments);
140│   console.log('universalResult.config.warmupAudioUrl:', universalResult.config?.warmupAudioUrl);
141│
142│   // Store warmup segments/URL if available
143│   if (universalResult.success && universalResult.config) {
144│     if (universalResult.config.warmupSegments && universalResult.config.warmupSegments.length > 0) {
145│       testConfig.warmupSegments = universalResult.config.warmupSegments;
146│       console.log('✓ Loaded', testConfig.warmupSegments.length, 'warmup segments into testConfig:', testConfig.warmupSegments);
147│     } else if (universalResult.config.warmupAudioUrl) {
148│       testConfig.warmupAudioUrl = universalResult.config.warmupAudioUrl;
149│       console.log('✓ Loaded warmup URL into testConfig:', testConfig.warmupAudioUrl);
150│     } else {
151│       console.warn('✗ No warmup found in universal config!');  ← STUDENT SEES THIS
152│     }
153│   }
```

**THE RESULT:**
- Line 135: Fetches _UNIVERSAL_INSTRUCTIONS config from database
- Line 144: Checks if warmupSegments exists and has length > 0
- But warmupSegments = [] (because no row was saved due to bug)
- Line 151: Logs "No warmup found in universal config!"
- testConfig.warmupSegments is NEVER SET

### 5. WARMUP BUTTON FAILS
**File:** `public/js/app.js`  
**Function:** `startWarmup()` [Line 1624]

```javascript
1624│ function startWarmup() {
1625│   console.log('=== startWarmup() called ===');
1626│   console.log('testConfig:', testConfig);
1627│   console.log('testConfig.warmupSegments:', testConfig?.warmupSegments);
1628│   console.log('testConfig.warmupAudioUrl:', testConfig?.warmupAudioUrl);
1629│
1630│   // Check if warmup is configured (either segments or single URL)
1631│   const hasWarmupSegments = testConfig?.warmupSegments?.length > 0;
1632│   const hasWarmupUrl = testConfig?.warmupAudioUrl;
1633│
1634│   console.log('hasWarmupSegments:', hasWarmupSegments);
1635│   console.log('hasWarmupUrl:', hasWarmupUrl);
1636│
1637│   if (!testConfig || (!hasWarmupSegments && !hasWarmupUrl)) {
1638│     console.error('✗ NO WARMUP FOUND - showing alert');
1639│     alert('Warmup audio has not been configured. Skipping to actual test.');
1639│     skipToTest();
1641│     return;
1642│   }
```

**THE ALERT:**
- Line 1631: `hasWarmupSegments = undefined?.length > 0 = false`
- Line 1632: `hasWarmupUrl = undefined = falsy`
- Line 1637: Both false → condition is TRUE
- Line 1638: ALERT SHOWN!

---

## DATABASE LAYER - READING

**File:** `utils/sheets-helper.js`  
**Function:** `getTestConfig()` [Line 144]

```javascript
144│ async function getTestConfig(testName) {
145│   try {
146│     const sheets = await getSheets();
147│     const range = process.env.TESTS_SHEET_RANGE || 'Tests!A:F';
148│
149│     const response = await sheets.spreadsheets.values.get({
150│       spreadsheetId: process.env.GOOGLE_SHEET_ID,
151│       range: range,
152│     });
153│
154│     const rows = response.data.values || [];
155│     const segments = [];
156│     let instructionsAudioUrl = '';
157│     let warmupAudioUrl = '';
158│
159│     // ALSO load universal instructions and warmup from _UNIVERSAL_INSTRUCTIONS
160│     let universalInstructionsUrl = '';
161│     let universalWarmupSegments = [];
162│
163│     for (let i = 1; i < rows.length; i++) {
164│       const [name, segmentNum, audioUrl, status, instructions, warmup] = rows[i];
165│
166│       // Load universal instructions and warmup
167│       if (name === '_UNIVERSAL_INSTRUCTIONS' && status === 'active') {
168│         if (!universalInstructionsUrl && audioUrl) {
169│           universalInstructionsUrl = audioUrl;
170│         }
171│         if (warmup) {
172│           try {
173│             const parsed = JSON.parse(warmup);  // ← Parses: ["url1","url2",...]
174│             if (Array.isArray(parsed)) {
175│               universalWarmupSegments = parsed;  // ← Gets: [url1, url2, url3...]
176│             }
177│           } catch (e) {
178│             // Not JSON, treat as single URL
179│             if (warmup.trim()) {
180│               universalWarmupSegments = [warmup];
181│             }
182│           }
183│         }
184│       }
```

**IF THE ROW WAS SAVED (with our fix):**
- Line 167: Finds _UNIVERSAL_INSTRUCTIONS row
- Line 171: warmup column has: `'["url1","url2","url3","url4","url5","url6"]'`
- Line 173: JSON.parse succeeds → array
- Line 175: universalWarmupSegments = [url1, url2, url3, url4, url5, url6] ✓

**IF THE ROW WAS NOT SAVED (current bug):**
- Line 167: No row found → skips entire if block
- universalWarmupSegments remains [] (empty)

---

## SUMMARY OF ALL WARMUP REFERENCES

| Function | File | Line | Purpose |
|----------|------|------|---------|
| editUniversalInstructions | test-manager.js | 241 | Load existing config for editing |
| saveUniversalInstructions | test-manager.js | 421 | Save instructions + warmup ← BUG ORIGIN |
| openWarmupAudioSplitter | test-manager.js | 488 | Open UI to split audio |
| processAndUpload | test-manager.js | 824 | Upload split segments |
| saveTestSegments | sheets-helper.js | 242 | Write to Google Sheets ← BUG HERE |
| getTestConfig | sheets-helper.js | 144 | Read from Google Sheets |
| startWarmup | app.js | 1624 | Start warmup mode |
| loadWarmup | app.js | 1670 | Load warmup segments |
| loadSegment | app.js | 904 | Play a segment |

All functions are working correctly EXCEPT saveTestSegments() which has the empty segments issue.


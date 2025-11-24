# CIA Platform - Technical Architecture & Roadmap

**Last Updated:** November 24, 2025
**Purpose:** Technical reference for development, debugging, and optimization

---

## **System Architecture Overview**

### **Tech Stack:**

**Frontend:**
- Vanilla JavaScript (no framework)
- HTML5 + CSS3
- WebRTC (video streaming)
- Socket.io client (real-time communication)
- TensorFlow.js + MediaPipe (face detection)
- Simple-peer (WebRTC connections)
- QRCode.js (proctor device connection)

**Backend:**
- Node.js v18+
- Express.js v4.18.2
- Socket.io v4.7.2 (WebSocket server)
- Google APIs (Drive + Sheets)
- Formidable (file uploads)
- UUID (session IDs)

**Storage:**
- Google Sheets (student roster, test config, admin auth)
- Google Drive (video recordings, metadata)
- IndexedDB (local backup for chunks)
- In-memory Map (session state) ⚠️ **PROBLEM: Not persistent**

**CDN:**
- Bunny.net (audio segment delivery)

**Processing:**
- FFmpeg (server-side audio splitting)

---

## **Application Flow**

### **1. Student Authentication**
```
Student enters email + ID
  ↓
POST /api/validate-student
  ↓
Query Google Sheets (Students tab)
  ↓
Check: email, studentId, variant, attempts remaining
  ↓
Return: testName, maxAttempts, attemptsUsed
```

**Files:**
- `public/index.html` (login form)
- `server.js` (POST /api/validate-student handler)
- `utils/sheets-helper.js` (getStudentInfo function)

### **2. Session Creation**
```
Student clicks "Start Test"
  ↓
POST /api/create-session
  ↓
Generate UUID session ID
  ↓
Generate 6-digit PIN
  ↓
Store in sessionsMap (in-memory)
  ↓
Return: sessionId, pin, qrCodeUrl
```

**Files:**
- `public/js/app.js` (startTest function)
- `server.js` (POST /api/create-session handler)
- Uses: uuid library, qrcode library

**Session Object Structure:**
```javascript
{
  sessionId: 'uuid-string',
  pin: '123456',
  studentEmail: 'student@example.com',
  studentId: 'ABC123',
  testName: 'Test_A1',
  mainStream: null,        // Will hold MediaStream
  proctorStream: null,     // Will hold MediaStream
  proctorConnected: false,
  createdAt: timestamp
}
```

### **3. Camera Setup (Main Device)**
```
Student on page 2
  ↓
getUserMedia({video: true, audio: true})
  ↓
Display video in #videoPreview
  ↓
Start face detection (TensorFlow.js)
  ↓
Check: face centered, not cut off, lighting OK
  ↓
Button enabled when quality checks pass
```

**Files:**
- `public/js/app.js` (setupCamera function, lines ~343-400)
- `public/js/app.js` (startFaceDetection function, lines ~401-520)
- TensorFlow.js models loaded from CDN

**Face Detection Logic:**
```javascript
// Check if face is cut off by edges
const cutoff = checkFaceCutoff(keypoints, videoWidth, videoHeight)

// Check horizontal centering (±25% tolerance)
const centered = Math.abs(faceCenter.x - videoWidth/2) < videoWidth * 0.25

// Check vertical position (upper-middle for shoulders)
const verticalOK = faceCenter.y > videoHeight * 0.15 &&
                   faceCenter.y < videoHeight * 0.60

// Check lighting (70-220 brightness range)
const lighting = calculateAverageBrightness(videoElement)
const lightingOK = lighting >= 70 && lighting <= 220
```

### **4. Proctor Device Connection**
```
Main device shows PIN + QR code
  ↓
Proctor device scans QR or enters PIN
  ↓
POST /api/join-proctor
  ↓
Look up session by PIN
  ↓
Set proctorConnected = true
  ↓
Both devices establish WebRTC peer connection via Socket.io signaling
  ↓
POST /api/confirm-proctor (after position confirmed)
```

**Files:**
- `public/proctor.html` (proctor device interface)
- `public/js/proctor.js` (proctor device logic)
- `server.js` (POST /api/join-proctor, POST /api/confirm-proctor)

**WebRTC Signaling Flow:**
```
Main device: Creates SimplePeer initiator
  ↓
Emits 'signal' event via Socket.io
  ↓
Server forwards to proctor device
  ↓
Proctor device: Creates SimplePeer non-initiator
  ↓
Receives signal, sends answer back
  ↓
Server forwards to main device
  ↓
WebRTC connection established (peer-to-peer)
  ↓
Main device sends MediaStream to proctor
```

### **5. Screen Sharing**
```
Page 2.5 (screen share request)
  ↓
getDisplayMedia({video: {displaySurface: 'monitor'}})
  ↓
Check: settings.displaySurface === 'monitor'
  ↓
If window/tab: Reject and force retry (max 5 attempts)
  ↓
Store screenStream globally
```

**Files:**
- `public/js/app.js` (requestScreenShareAndContinue function, lines ~545-628)

**Security Check:**
```javascript
const videoTrack = screenStream.getVideoTracks()[0];
const settings = videoTrack.getSettings();

if (settings.displaySurface === 'monitor') {
  // ✓ Entire screen - allow
} else {
  // ✗ Window or tab - reject
  screenStream.getTracks().forEach(track => track.stop());
  // Force retry
}
```

### **6. Test Configuration Loading**
```
Student authenticated with testName = 'Test_A1'
  ↓
GET /api/test-config?name=Test_A1
  ↓
Query Google Sheets (Tests tab)
  ↓
Parse: segments (array of URLs), instructions, warmup
  ↓
Also load _UNIVERSAL_INSTRUCTIONS for warmup
  ↓
Return: testConfig object
```

**Files:**
- `server.js` (GET /api/test-config handler)
- `utils/sheets-helper.js` (getTestConfig function, lines ~132-226)

**testConfig Object:**
```javascript
{
  testName: 'Test_A1',
  segments: [
    'https://cdn.bunny.net/segment1.mp3',
    'https://cdn.bunny.net/segment2.mp3',
    // ... more segments
  ],
  instructionsAudioUrl: 'https://cdn.bunny.net/instructions.mp3',
  warmupSegments: [
    'https://cdn.bunny.net/warmup1.mp3',
    'https://cdn.bunny.net/warmup2.mp3',
    // ... warmup segments from _UNIVERSAL_INSTRUCTIONS
  ],
  universalInstructionsUrl: 'https://cdn.bunny.net/universal_instructions.mp4'
}
```

### **7. Pre-Session & Warmup**
```
Page 5 loads (test interface)
  ↓
Check: testConfig.warmupSegments exists?
  ↓
YES: Start warmup mode
  ↓
  Show pre-session modal (60 seconds)
  ↓
  Swap testConfig.segments with warmupSegments temporarily
  ↓
  Load segment 0, play when user clicks
  ↓
  After all warmup segments: Show warmup completion modal
  ↓
  User clicks "Start Actual Test"
  ↓
  Reset interventionCount to 0
  ↓
  Restore original testConfig.segments
  ↓
  Show pre-session overlay (60 seconds for actual test)
  ↓
NO: Skip to actual test pre-session
```

**Files:**
- `public/js/app.js` (lines ~640-699: page5 initialization)
- `public/js/app.js` (lines ~1805-1900: warmup completion and transition)
- `public/index.html` (lines ~322-382: pre-session modal and warmup completion modal)

**Key Variables:**
```javascript
let isWarmupMode = false;           // Currently in warmup?
let originalSegments = [];          // Backup of actual test segments
let warmupSegmentsBackup = [];      // Backup of warmup segments
let interventionCount = 0;          // Resets to 0 when actual test starts
```

### **8. Recording System**
```
Page 5 loads
  ↓
Create 3 MediaRecorder instances:
  1. Main camera (video + audio)
  2. Proctor camera (video only)
  3. Screen share (video only)
  ↓
Start all recorders with timeslice: 60000ms (1-minute chunks)
  ↓
On dataavailable event (every 60 seconds):
  ↓
  Save chunk to IndexedDB (backup)
  ↓
  Upload chunk to Google Drive via POST /api/upload-chunk
  ↓
When test ends:
  ↓
  Stop all recorders
  ↓
  Upload any remaining chunks
  ↓
  Compile final video on client side
  ↓
  Upload final video via POST /api/upload-final
  ↓
  Upload metadata JSON
```

**Files:**
- `public/js/app.js` (lines ~700-810: recording initialization)
- `public/js/recording-manager.js` (RecordingManager class)
- `server.js` (POST /api/upload-chunk, POST /api/upload-final handlers)
- `utils/drive-helper.js` (uploadVideoChunk, uploadFinalVideo functions)

**Recording Settings:**
```javascript
const options = {
  mimeType: 'video/webm;codecs=vp8,opus', // or video/mp4 for Safari
  videoBitsPerSecond: 2000000,  // 2 Mbps (smooth HD)
  audioBitsPerSecond: 192000    // 192 kbps (excellent for transcription)
};
```

**Chunk Upload Flow:**
```javascript
recorder.ondataavailable = async (event) => {
  const chunk = event.data;
  const chunkIndex = chunkCounter++;

  // 1. Save to IndexedDB (local backup)
  await saveChunkToIndexedDB(chunk, chunkIndex);

  // 2. Upload to Google Drive
  const formData = new FormData();
  formData.append('chunk', chunk);
  formData.append('sessionId', sessionId);
  formData.append('streamType', 'main'); // or 'proctor'
  formData.append('chunkIndex', chunkIndex);

  const response = await fetch('/api/upload-chunk', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    // Retry logic with exponential backoff
    retryQueue.push({chunk, chunkIndex, retries: 0});
  }
};
```

**Google Drive Folder Structure:**
```
CIA_Recordings/
├── student@example.com_ABC123/
│   └── session-uuid-1234/
│       ├── main_chunk_0.webm
│       ├── main_chunk_1.webm
│       ├── main_chunk_2.webm
│       ├── proctor_chunk_0.webm
│       ├── proctor_chunk_1.webm
│       ├── student@example.com_ABC123_Test_A1_main_FINAL.webm
│       ├── student@example.com_ABC123_Test_A1_proctor_FINAL.webm
│       └── student@example.com_ABC123_main_metadata.json
```

### **9. Test Execution**
```
Test starts (after pre-session timer)
  ↓
Load segment 0
  ↓
audioPlayer.src = testConfig.segments[currentSegment]
  ↓
User clicks play (or auto-play if enabled)
  ↓
Audio plays
  ↓
User responds verbally (being recorded)
  ↓
Audio ends → Continue button enabled
  ↓
User clicks Continue → currentSegment++
  ↓
Repeat until all segments complete
  ↓
Show completion modal
  ↓
Stop recording, upload final video
```

**Files:**
- `public/js/app.js` (loadSegment function, lines ~1680-1780)
- `public/js/app.js` (handleContinue function, lines ~1900-2000)

**Key Logic:**
```javascript
function loadSegment(index) {
  if (index >= testConfig.segments.length) {
    // Test complete
    showCompletionModal();
    return;
  }

  currentSegment = index;
  const audioUrl = testConfig.segments[index];

  audioPlayer.src = audioUrl;
  audioPlayer.load();

  // Update UI
  document.getElementById('segmentInfo').textContent =
    `Segment ${index + 1} of ${testConfig.segments.length}`;

  // Disable continue button until audio ends
  continueBtn.disabled = true;

  audioPlayer.onended = () => {
    continueBtn.disabled = false;
  };
}
```

### **10. Intervention System**
```
User clicks "Request Intervention"
  ↓
Show intervention modal (must record 15 seconds first)
  ↓
Start 15-second intervention recording
  ↓
After 15 seconds: Show action buttons
  ↓
User selects: Repeat / Research / Continue
  ↓
interventionCount++
  ↓
Update display: "X of 10 interventions used"
  ↓
If Repeat: Reload current segment
If Research: Start 90-second timer, pause test
If Continue: Just move to next segment
```

**Files:**
- `public/js/app.js` (requestIntervention function, lines ~1500-1600)
- `public/js/app.js` (handleInterventionAction function, lines ~1600-1680)
- `public/index.html` (intervention modal, lines ~270-315)

**Intervention Recording:**
```javascript
// Start intervention recorder (15 seconds)
const interventionRecorder = new MediaRecorder(mainStream, {
  mimeType: 'audio/webm',
  audioBitsPerSecond: 128000
});

const chunks = [];
interventionRecorder.ondataavailable = (e) => chunks.push(e.data);

interventionRecorder.onstop = async () => {
  const blob = new Blob(chunks, {type: 'audio/webm'});

  // Upload intervention recording
  const formData = new FormData();
  formData.append('intervention', blob);
  formData.append('timestamp', Date.now());
  formData.append('action', selectedAction); // repeat/research/continue

  await fetch('/api/upload-intervention', {method: 'POST', body: formData});
};

interventionRecorder.start();
setTimeout(() => interventionRecorder.stop(), 15000);
```

**Critical Bug Fixed:** Interventions were carrying over from warmup to actual test. Now `interventionCount` is reset to 0 and `updateInterventionDisplay()` is called when transitioning from warmup to actual test (line ~1886).

### **11. Live Monitoring (Admin)**
```
Admin logs in
  ↓
Navigate to Live Monitoring tab
  ↓
Fetch active sessions via Socket.io
  ↓
Display list of ongoing tests
  ↓
Admin clicks "Monitor" on a session
  ↓
Establish WebRTC connection with student
  ↓
Receive both video streams (main + proctor)
  ↓
Display side-by-side in admin dashboard
```

**Files:**
- `public/admin.html` (admin dashboard)
- `public/js/admin.js` (live monitoring logic)
- `server.js` (Socket.io event handlers)

**Socket.io Events:**
```javascript
// Server emits to admin
socket.emit('active-sessions', sessionsArray);

// Admin requests to monitor
socket.emit('monitor-session', {sessionId});

// Server establishes WebRTC signaling between admin and student
socket.on('signal', ({to, from, signal}) => {
  io.to(to).emit('signal', {from, signal});
});
```

### **12. Recordings Review (Admin)**
```
Admin navigates to Recordings tab
  ↓
GET /api/recordings
  ↓
Query Google Drive for CIA_Recordings folder
  ↓
List all session folders with metadata
  ↓
Display in table with filters
  ↓
Admin clicks "View" on a recording
  ↓
GET /api/stream-chunk?sessionId=X&streamType=main&chunkIndex=0
  ↓
Stream video chunk to browser
  ↓
Admin can navigate chunks, view metadata, add grades
```

**Files:**
- `public/js/admin.js` (recordings tab logic)
- `server.js` (GET /api/recordings, GET /api/stream-chunk handlers)
- `utils/drive-helper.js` (listRecordings, streamChunk functions)

---

## **Current Architecture Issues**

### **CRITICAL: In-Memory Session Storage**

**Problem:**
```javascript
// server.js
const sessionsMap = new Map();
```

Sessions stored in memory are lost when server restarts. Student loses their session mid-test.

**Solution Options:**

**Option 1: Redis (Recommended)**
```javascript
const redis = require('redis');
const client = redis.createClient({url: process.env.REDIS_URL});

// Store session
await client.set(`session:${sessionId}`, JSON.stringify(sessionData), {
  EX: 10800  // Expire after 3 hours
});

// Retrieve session
const data = await client.get(`session:${sessionId}`);
const session = JSON.parse(data);
```

**Option 2: PostgreSQL**
```javascript
// Create sessions table
CREATE TABLE sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  pin VARCHAR(6),
  student_email VARCHAR(255),
  student_id VARCHAR(100),
  test_name VARCHAR(255),
  proctor_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

// Store session
await db.query(
  'INSERT INTO sessions (session_id, pin, student_email, ...) VALUES ($1, $2, $3, ...)',
  [sessionId, pin, email, ...]
);
```

**Option 3: Google Sheets (Quick Fix)**
```javascript
// Add Sessions tab to spreadsheet
// Columns: SessionID, PIN, Email, StudentID, TestName, ProctorConnected, CreatedAt

async function saveSession(sessionData) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Sessions!A:G',
    valueInputOption: 'RAW',
    resource: {
      values: [[
        sessionData.sessionId,
        sessionData.pin,
        sessionData.studentEmail,
        // ... etc
      ]]
    }
  });
}
```

**Recommendation:** Start with Redis (free tier on Railway/Upstash), migrate to PostgreSQL later for full relational model.

---

### **ISSUE: No Error Tracking**

**Problem:** When bugs happen in production, you have no visibility.

**Solution: Add Sentry**
```bash
npm install @sentry/node @sentry/integrations
```

```javascript
// server.js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0
});

// Add error handler
app.use(Sentry.Handlers.errorHandler());
```

**Client-side:**
```javascript
// app.js
Sentry.init({
  dsn: process.env.SENTRY_DSN_CLIENT,
  integrations: [new Sentry.BrowserTracing()],
  tracesSampleRate: 1.0
});
```

---

### **ISSUE: No Automated Tests**

**Problem:** Changes might break existing functionality.

**Solution: Add Basic Tests**

**Install:**
```bash
npm install --save-dev jest supertest
```

**Example API test:**
```javascript
// tests/api.test.js
const request = require('supertest');
const app = require('../server');

describe('POST /api/validate-student', () => {
  it('should validate correct credentials', async () => {
    const res = await request(app)
      .post('/api/validate-student')
      .send({
        email: 'test@example.com',
        studentId: 'ABC123'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/api/validate-student')
      .send({
        email: 'fake@example.com',
        studentId: 'INVALID'
      });

    expect(res.statusCode).toBe(401);
  });
});
```

**Run tests:**
```bash
npm test
```

---

### **ISSUE: Large Bundle Size (TensorFlow.js)**

**Problem:** TensorFlow.js models are heavy (~15MB), slow page load.

**Current:**
```html
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/face-detection"></script>
```

**Solutions:**

**Option 1: Lazy Load (Only on Camera Setup Page)**
```javascript
// Only load TensorFlow when user reaches page 2
async function loadFaceDetection() {
  if (!window.faceDetection) {
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/face-detection');
  }
}
```

**Option 2: Use Lighter Alternative**
Replace TensorFlow with face-api.js (smaller, ~5MB):
```javascript
import * as faceapi from 'face-api.js';

await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
const detection = await faceapi.detectSingleFace(video,
  new faceapi.TinyFaceDetectorOptions()
);
```

**Option 3: Server-Side Detection**
Send video frames to server, run face detection there. Con: privacy concerns, latency.

---

### **ISSUE: No Rate Limiting**

**Problem:** API endpoints can be abused (DOS, brute force).

**Solution: Add express-rate-limit**
```bash
npm install express-rate-limit
```

```javascript
// server.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

app.use('/api/', limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 minutes
});

app.post('/api/validate-student', authLimiter, async (req, res) => {
  // ... auth logic
});
```

---

### **ISSUE: No Database Backups**

**Problem:** Google Sheets/Drive could lose data.

**Solution: Automated Backups**
```javascript
// utils/backup.js
const cron = require('node-cron');

// Backup Google Sheets daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  const data = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID
  });

  // Save to backup location (S3, another Drive folder, etc.)
  await uploadBackup(data);

  console.log('Backup completed:', new Date());
});
```

---

## **Performance Optimizations**

### **1. Reduce Recording Chunk Size for Mobile**

**Current:** 60-second chunks
**Problem:** Mobile has limited memory

**Solution: Adaptive chunk size**
```javascript
// Detect mobile
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
const chunkDuration = isMobile ? 30000 : 60000; // 30s mobile, 60s desktop

recorder.start(chunkDuration);
```

### **2. Compress Video Chunks Before Upload**

**Problem:** 1-minute 1080p video = 15-20MB, slow upload on poor connections

**Solution: Client-side compression**
```javascript
// Reduce bitrate on slow connections
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const effectiveType = connection?.effectiveType;

let videoBitsPerSecond = 2000000; // 2 Mbps default

if (effectiveType === '3g' || effectiveType === '2g') {
  videoBitsPerSecond = 500000; // 500 kbps for slow connections
}

const options = {
  mimeType: 'video/webm;codecs=vp8,opus',
  videoBitsPerSecond,
  audioBitsPerSecond: 128000
};
```

### **3. IndexedDB Cleanup**

**Problem:** Local storage fills up with old chunks

**Solution: Auto-cleanup after successful upload**
```javascript
// After confirming chunk uploaded to Drive
async function cleanupOldChunks(sessionId) {
  const db = await openIndexedDB();
  const tx = db.transaction('chunks', 'readwrite');
  const store = tx.objectStore('chunks');

  // Delete chunks older than 24 hours
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const chunks = await store.getAll();

  for (const chunk of chunks) {
    if (chunk.timestamp < cutoff) {
      await store.delete(chunk.id);
    }
  }
}
```

### **4. Lazy Load Admin Dashboard Assets**

**Problem:** Admin page loads heavy Chart.js, analytics libraries even if not used

**Solution: Code splitting**
```javascript
// Only load charts when user clicks Analytics tab
async function loadAnalytics() {
  const Chart = await import('chart.js');
  const data = await fetch('/api/analytics').then(r => r.json());
  renderChart(Chart, data);
}
```

---

## **Security Improvements**

### **1. Input Validation**

**Problem:** No validation on user inputs

**Solution: Add validation middleware**
```bash
npm install express-validator
```

```javascript
const { body, validationResult } = require('express-validator');

app.post('/api/validate-student', [
  body('email').isEmail().normalizeEmail(),
  body('studentId').isAlphanumeric().trim().isLength({min: 3, max: 20})
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  // ... proceed with validation
});
```

### **2. CORS Configuration**

**Current:** Wide-open CORS
```javascript
app.use(cors());
```

**Better: Restrict origins**
```javascript
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS.split(','), // 'https://yourapp.com,https://admin.yourapp.com'
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

### **3. Helmet Security Headers**

**Problem:** Missing security headers

**Solution:**
```bash
npm install helmet
```

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://cdn.bunny.net"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'", "https://cdn.bunny.net", "blob:"],
    }
  }
}));
```

### **4. Sanitize File Names**

**Problem:** User input (email, student ID) used in file paths

**Solution: Sanitize**
```javascript
function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9_\-@.]/gi, '_');
}

const folderName = `${sanitizeFilename(email)}_${sanitizeFilename(studentId)}`;
```

---

## **Code Quality Improvements**

### **1. Extract Recording Logic to Module**

**Current:** All recording code in app.js (1000+ lines)

**Better: Separate module**
```javascript
// public/js/recording-manager.js
export class RecordingManager {
  constructor(mainStream, proctorStream, screenStream) {
    this.mainStream = mainStream;
    this.proctorStream = proctorStream;
    this.screenStream = screenStream;
    this.recorders = [];
    this.chunks = {main: [], proctor: [], screen: []};
  }

  async startRecording() {
    // ... recording logic
  }

  async stopRecording() {
    // ... stop and upload
  }

  async uploadChunk(type, chunk, index) {
    // ... upload logic with retry
  }
}

// Usage in app.js
import { RecordingManager } from './recording-manager.js';

const manager = new RecordingManager(mainStream, proctorStream, screenStream);
await manager.startRecording();
```

### **2. Use Environment Variables Properly**

**Current:** Hardcoded values scattered throughout

**Better: Centralized config**
```javascript
// config/index.js
module.exports = {
  bunny: {
    apiKey: process.env.BUNNY_API_KEY,
    storageZone: process.env.BUNNY_STORAGE_ZONE,
    pullZone: process.env.BUNNY_PULL_ZONE,
    region: process.env.BUNNY_REGION || 'de'
  },
  google: {
    spreadsheetId: process.env.SPREADSHEET_ID,
    serviceAccount: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  },
  recording: {
    chunkDuration: 60000,
    videoBitrate: 2000000,
    audioBitrate: 192000
  },
  session: {
    timeout: 3 * 60 * 60 * 1000, // 3 hours
    pinLength: 6
  }
};
```

### **3. Add JSDoc Comments**

**Problem:** No documentation for complex functions

**Solution:**
```javascript
/**
 * Validates face position and quality for proctoring
 * @param {Array} keypoints - Face detection keypoints from TensorFlow
 * @param {number} videoWidth - Video element width in pixels
 * @param {number} videoHeight - Video element height in pixels
 * @returns {Object} Validation result with ok (boolean) and reason (string)
 */
function validateFacePosition(keypoints, videoWidth, videoHeight) {
  // Check if face is cut off
  const cutoff = checkFaceCutoff(keypoints, videoWidth, videoHeight);
  if (cutoff) {
    return {ok: false, reason: 'Face is cut off at edges'};
  }

  // ... more checks

  return {ok: true, reason: 'Face position acceptable'};
}
```

---

## **Feature Additions**

### **1. Stripe Integration (Self-Service Signup)**

**Goal:** Let customers sign up and pay without manual intervention

**Files to Create:**
- `routes/billing.js` - Stripe webhook handlers
- `public/pricing.html` - Pricing page
- `public/checkout.html` - Stripe Checkout

**Implementation:**
```javascript
// server.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/create-checkout', async (req, res) => {
  const {plan} = req.body; // 'starter', 'professional', 'enterprise'

  const prices = {
    starter: 'price_xxx', // Stripe price ID
    professional: 'price_yyy',
    enterprise: 'price_zzz'
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price: prices[plan],
      quantity: 1
    }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/pricing`
  });

  res.json({url: session.url});
});

// Webhook to handle successful payment
app.post('/api/stripe-webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Create account for customer
    await createCustomerAccount(session);
  }

  res.json({received: true});
});
```

### **2. Usage Analytics Dashboard**

**Goal:** Show customers how much they're using

**Implementation:**
```javascript
// Track test completions
async function logTestCompletion(email, testName, duration) {
  // Add to Analytics sheet or database
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Analytics!A:E',
    valueInputOption: 'RAW',
    resource: {
      values: [[
        new Date().toISOString(),
        email,
        testName,
        duration,
        'completed'
      ]]
    }
  });
}

// API endpoint for customer dashboard
app.get('/api/usage-stats', authenticateCustomer, async (req, res) => {
  const {customerEmail} = req.user;

  // Query analytics
  const stats = await getUsageStats(customerEmail);

  res.json({
    testsThisMonth: stats.count,
    averageDuration: stats.avgDuration,
    completionRate: stats.completionRate,
    peakHours: stats.peakHours
  });
});
```

### **3. Email Notifications**

**Goal:** Notify admins when tests are completed

**Implementation:**
```bash
npm install nodemailer
```

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function notifyTestCompleted(studentEmail, testName, recordingUrl) {
  await transporter.sendMail({
    from: '"CIA Platform" <noreply@yourapp.com>',
    to: process.env.ADMIN_EMAIL,
    subject: `Test Completed: ${testName}`,
    html: `
      <p>Student ${studentEmail} has completed ${testName}.</p>
      <p><a href="${recordingUrl}">View Recording</a></p>
    `
  });
}
```

---

## **Deployment Checklist**

### **Before Going to Production:**

- [ ] Set up Redis/PostgreSQL for session storage
- [ ] Add Sentry error tracking
- [ ] Configure rate limiting
- [ ] Set up HTTPS (automatic on Render/Vercel)
- [ ] Add Helmet security headers
- [ ] Configure CORS properly
- [ ] Set up automated backups
- [ ] Add health check endpoint monitoring
- [ ] Configure environment variables properly
- [ ] Set up logging (Winston or Pino)
- [ ] Add database connection pooling
- [ ] Test on multiple browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Load test with 50+ concurrent users
- [ ] Set up DNS and custom domain
- [ ] Configure CDN for static assets
- [ ] Add Google Analytics or privacy-friendly alternative
- [ ] Create status page (status.yourapp.com)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)

---

## **Known Browser Compatibility**

### **Works:**
✅ Chrome 90+ (desktop)
✅ Firefox 88+ (desktop)
✅ Safari 14+ (desktop)
✅ Edge 90+ (desktop)
✅ Chrome 90+ (Android)
✅ Safari 14+ (iOS)

### **Issues:**
⚠️ Safari requires MP4 for MediaRecorder (WebM not supported)
⚠️ iOS Safari requires user interaction before playing audio
⚠️ Firefox mobile has WebRTC quirks (peer connection delays)

### **Not Tested:**
❓ Opera
❓ Samsung Internet
❓ UC Browser

---

## **File Structure Reference**

```
CIA/
├── public/
│   ├── index.html              # Student login + test interface
│   ├── admin.html              # Admin dashboard
│   ├── proctor.html            # Proctor device interface
│   ├── css/
│   │   └── styles.css          # Main stylesheet
│   └── js/
│       ├── app.js              # Main student-side logic (2000+ lines)
│       ├── admin.js            # Admin dashboard logic
│       ├── proctor.js          # Proctor device logic
│       └── recording-manager.js # Recording utilities
│
├── utils/
│   ├── sheets-helper.js        # Google Sheets API wrapper
│   ├── drive-helper.js         # Google Drive API wrapper
│   └── bunny-helper.js         # Bunny.net CDN API
│
├── server.js                   # Main Express server
├── package.json                # Dependencies
├── .env                        # Environment variables (not in git)
└── README.md                   # Setup instructions
```

---

## **Environment Variables**

```bash
# Google Cloud
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
SPREADSHEET_ID=your_spreadsheet_id

# Bunny.net CDN
BUNNY_API_KEY=your_bunny_api_key
BUNNY_STORAGE_ZONE=your-storage-zone
BUNNY_PULL_ZONE=your-pull-zone
BUNNY_REGION=de

# Server
PORT=3000
NODE_ENV=production

# Optional: Redis (for session storage)
REDIS_URL=redis://localhost:6379

# Optional: Sentry (for error tracking)
SENTRY_DSN=https://xxx@sentry.io/yyy

# Optional: Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Optional: Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_password
```

---

## **Common Debugging Issues**

### **Issue: "Session not found"**
**Cause:** Server restarted, sessions lost from memory
**Fix:** Implement Redis/PostgreSQL session storage

### **Issue: Face detection not loading**
**Cause:** TensorFlow.js models blocked by adblocker or CSP
**Fix:** Self-host models or whitelist CDN in CSP headers

### **Issue: Recording stops mid-test**
**Cause:** Mobile device memory limit exceeded
**Fix:** Reduce chunk duration on mobile, lower bitrate

### **Issue: Proctor device can't connect**
**Cause:** WebRTC blocked by firewall/corporate network
**Fix:** Add TURN server for relay (coturn or Twilio)

### **Issue: Chunks not uploading**
**Cause:** Google Drive API rate limits or quota exceeded
**Fix:** Implement exponential backoff, upgrade Drive storage

### **Issue: Screen share not working**
**Cause:** Browser doesn't support getDisplayMedia (old version)
**Fix:** Show error with browser upgrade instructions

### **Issue: Audio segments not playing**
**Cause:** Bunny.net CDN URL incorrect or CORS misconfigured
**Fix:** Check Bunny.net pull zone settings, enable CORS

---

## **Next Steps for Optimization**

1. **Session Persistence** - Migrate to Redis (highest priority)
2. **Error Tracking** - Add Sentry
3. **Code Splitting** - Extract RecordingManager, FaceDetection modules
4. **Testing** - Add unit tests for critical paths
5. **Performance** - Lazy load TensorFlow, optimize bundle size
6. **Security** - Add rate limiting, input validation, Helmet
7. **Monitoring** - Set up uptime checks, logging
8. **Documentation** - Add JSDoc comments, API docs

---

**This is your technical reference. Save it, share it with future Claude sessions, and use it to guide development.**

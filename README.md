# CIA - Consecutive Interpreting Assessment

A comprehensive web application for conducting and grading consecutive interpreting assessments with dual-camera proctoring.

## Features

- **Student Authentication**: Login with email + student ID
- **Dual Recording**: Main device + proctor device (second camera angle)
- **Data Loss Prevention**: Automatic 1-minute chunk uploads to Google Drive
- **Intervention System**:
  - Request repetitions (5 available)
  - Request research pauses (90 seconds each)
  - Maximum 10 interventions per test (5 without penalty)
- **Admin Panel**: View and grade all recordings
- **35-Minute Test Limit**: Automatic timeout protection

## Setup Instructions

### 1. Google Cloud Setup

#### Create Service Account
1. Go to Google Cloud Console
2. Create a service account
3. Download the JSON key file
4. Extract `client_email` and `private_key` for the `.env` file

#### Google Drive Setup
1. Share the target folder with the service account email
2. Get the folder ID from the URL
3. Add to `.env` as `GOOGLE_DRIVE_FOLDER_ID`

#### Google Sheets Setup
Create two sheets:

**Sheet 1: Students**
```
| Email                  | Student_ID | Permitted Test | Attempt # |
|------------------------|------------|----------------|-----------|
| john@example.com       | 12345      | Test_A1        | 1         |
| jane@example.com       | 67890      | Test_A2        | 1 2       |
```

**Sheet 2: Admins**
```
| Email                  |
|------------------------|
| admin@example.com      |
| grader@example.com     |
```

Share both sheets with your service account email (view access).

### 2. Environment Variables

Create a `.env` file:

```env
# Google Service Account
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=your-folder-id-here

# Google Sheets
GOOGLE_SHEET_ID=your-sheet-id-here
STUDENTS_SHEET_RANGE=Students!A:D
ADMIN_SHEET_RANGE=Admins!A:A

# Server
PORT=3000
NODE_ENV=production
```

### 3. Audio Content Setup (Bunny.net)

1. Sign up for Bunny.net CDN
2. Create a storage zone
3. Upload your test audio files organized by test variant:
   ```
   /cia/
     /test_a1/
       segment_001.mp3
       segment_002.mp3
       ...
     /test_a2/
       segment_001.mp3
       ...
   ```
4. Get the public CDN URLs
5. Update `/public/js/app.js` - find the `TEST_CONFIGS` object and add your URLs:

```javascript
const TEST_CONFIGS = {
  'Test_A1': {
    segments: [
      'https://your-zone.b-cdn.net/cia/test_a1/segment_001.mp3',
      'https://your-zone.b-cdn.net/cia/test_a1/segment_002.mp3',
      // ... more segments
    ]
  },
  // ... more test variants
};
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Locally

```bash
npm start
```

Visit:
- Main app: http://localhost:3000
- Admin panel: http://localhost:3000/admin
- Proctor join: http://localhost:3000/proctor

## Deployment to Render

### 1. Create a Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: cia-assessment
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Choose based on expected usage

### 2. Add Environment Variables

In Render dashboard, add all variables from your `.env` file.

**Important**: For `GOOGLE_PRIVATE_KEY`, replace literal `\n` with actual newlines, or keep as a single line with `\\n`.

### 3. Deploy

Render will automatically deploy when you push to your repository.

## Usage

### For Students

1. Navigate to the main URL
2. Enter email and student ID
3. Follow instructions for proctor device setup
4. Scan QR code or enter PIN on second device
5. Grant camera/microphone permissions
6. Complete the assessment
7. Recordings automatically upload

### For Proctors (Second Device)

1. Visit `/proctor` or scan QR code
2. Enter session ID and PIN
3. Position camera to view test-taker
4. Keep device active during entire test

### For Administrators

1. Navigate to `/admin`
2. Login with authorized email
3. View all recordings with metadata
4. Watch recordings via Google Drive links
5. Review intervention usage
6. Assign grades and notes

## Technical Details

### Recording System

- **Video Quality**: 100 kbps (low quality to save bandwidth)
- **Audio Quality**: 192 kbps (high quality for transcription)
- **Codec**: VP8/Opus in WebM container
- **Chunk Size**: 1 minute (automatic upload)
- **Final Upload**: Complete recording at end
- **Dual Streams**: Main device + proctor device (both recorded separately)

### Intervention Protocol

Students must verbally state their intervention before selecting an action. This ensures proper professional protocol:

1. Click "Request Intervention"
2. Record intervention (15 seconds)
3. Choose action:
   - **Repeat**: Replay current segment (counts against 5 repetitions)
   - **Research**: 90-second pause for terminology lookup
   - **Continue**: Already handled verbally

### Data Storage

All data stored in Google Drive:
```
CIA_Recordings/
  Email_StudentID/
    SessionID/
      chunks/
        main_chunk_1.webm
        main_chunk_2.webm
        proctor_chunk_1.webm
        ...
      Email_StudentID_Test_main_FINAL_timestamp.webm
      Email_StudentID_Test_proctor_FINAL_timestamp.webm
      Email_StudentID_main_metadata.json
```

## Support

For issues or questions, contact your system administrator.

## License

Proprietary - All rights reserved

# CIA Assessment - Complete Setup Guide

## Step-by-Step Setup

### Step 1: Google Cloud Setup

#### 1.1 Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Note the project ID

#### 1.2 Enable Required APIs
1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for and enable:
   - Google Drive API
   - Google Sheets API

#### 1.3 Create Service Account
1. Go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Name: `cia-uploader`
4. Grant role: "Editor" (or custom role with Drive and Sheets access)
5. Click "Done"
6. Click on the service account email
7. Go to "Keys" tab
8. Click "Add Key" > "Create New Key"
9. Choose "JSON" format
10. Download the key file
11. Open the JSON file and extract:
    - `client_email`
    - `private_key`

### Step 2: Google Drive Setup

#### 2.1 Create Main Folder
1. Go to [Google Drive](https://drive.google.com)
2. Create a folder named "CIA_Recordings"
3. Right-click > "Share"
4. Add the service account email (from Step 1.3)
5. Grant "Editor" access
6. Get the folder ID from the URL:
   ```
   https://drive.google.com/drive/u/0/folders/1YEhEnrhjPbPUJvfpbrI2fRDLyHnrlBcm
                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                            This is your folder ID
   ```

### Step 3: Google Sheets Setup

#### 3.1 Create the Spreadsheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet named "CIA Students & Admins"
3. Create two sheets within this spreadsheet

#### 3.2 Sheet 1: Students
Create the following structure:

| Email                | Student_ID | Permitted Test | Attempt # |
|----------------------|------------|----------------|-----------|
| john@example.com     | 12345      | Test_A1        | 1         |
| jane@example.com     | 67890      | Test_A1        | 1 2       |
| bob@example.com      | 11111      | Test_A2        | 1 2 3     |

**Column Descriptions:**
- **Email**: Student's email address (must match login)
- **Student_ID**: Student ID number (must match login)
- **Permitted Test**: Test variant they should take (Test_A1, Test_A2, etc.)
- **Attempt #**: Which attempts they're allowed (1, 1 2, or 1 2 3)

#### 3.3 Sheet 2: Admins
Create the following structure:

| Email                |
|----------------------|
| admin@example.com    |
| grader@example.com   |

**Column Descriptions:**
- **Email**: Email address of authorized administrators

#### 3.4 Share the Spreadsheet
1. Click "Share" button
2. Add the service account email
3. Grant "Viewer" access
4. Get the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1/edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          This is your spreadsheet ID
   ```

### Step 4: Bunny.net CDN Setup

#### 4.1 Create Bunny.net Account
1. Sign up at [Bunny.net](https://bunny.net)
2. Choose a plan (even the cheapest plan works great)

#### 4.2 Create Storage Zone
1. Go to "Storage" > "Add Storage Zone"
2. Name it (e.g., "cia-audio")
3. Choose a region close to your users
4. Enable "CDN" option

#### 4.3 Upload Audio Files
1. Create folder structure:
   ```
   /cia/
     /test_a1/
       segment_001.mp3
       segment_002.mp3
       segment_003.mp3
     /test_a2/
       segment_001.mp3
       segment_002.mp3
   ```
2. Upload your audio files

#### 4.4 Get CDN URLs
1. Go to your storage zone settings
2. Find the "CDN URL" (e.g., `https://yourzone.b-cdn.net`)
3. Test access: `https://yourzone.b-cdn.net/cia/test_a1/segment_001.mp3`

### Step 5: Configure the Application

#### 5.1 Create .env File
Create a file named `.env` in the project root:

```env
# Google Service Account (from Step 1.3)
GOOGLE_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourActualPrivateKeyHere\n-----END PRIVATE KEY-----\n"

# Google Drive (from Step 2.1)
GOOGLE_DRIVE_FOLDER_ID=1YEhEnrhjPbPUJvfpbrI2fRDLyHnrlBcm

# Google Sheets (from Step 3.4)
GOOGLE_SHEET_ID=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1
STUDENTS_SHEET_RANGE=Students!A:D
ADMIN_SHEET_RANGE=Admins!A:A

# Server
PORT=3000
NODE_ENV=production
```

**Important**: The private key must be on a single line with `\n` for newlines.

#### 5.2 Update Test Configuration
1. Open `/public/js/app.js`
2. Find the `TEST_CONFIGS` object (around line 15)
3. Replace with your Bunny.net URLs:

```javascript
const TEST_CONFIGS = {
  'Test_A1': {
    segments: [
      'https://yourzone.b-cdn.net/cia/test_a1/segment_001.mp3',
      'https://yourzone.b-cdn.net/cia/test_a1/segment_002.mp3',
      'https://yourzone.b-cdn.net/cia/test_a1/segment_003.mp3',
    ]
  },
  'Test_A2': {
    segments: [
      'https://yourzone.b-cdn.net/cia/test_a2/segment_001.mp3',
      'https://yourzone.b-cdn.net/cia/test_a2/segment_002.mp3',
    ]
  },
};
```

### Step 6: Local Testing

```bash
# Install dependencies
npm install

# Start the server
npm start

# Visit in browser
# Main app: http://localhost:3000
# Admin: http://localhost:3000/admin
# Proctor: http://localhost:3000/proctor
```

### Step 7: Deploy to Render

#### 7.1 Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/CIA.git
git push -u origin main
```

#### 7.2 Create Render Service
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" > "Web Service"
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` configuration

#### 7.3 Add Environment Variables in Render
Go to "Environment" and add:

```
GOOGLE_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYourKey...\n-----END PRIVATE KEY-----\n
GOOGLE_DRIVE_FOLDER_ID=1YEhEnrhjPbPUJvfpbrI2fRDLyHnrlBcm
GOOGLE_SHEET_ID=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1
STUDENTS_SHEET_RANGE=Students!A:D
ADMIN_SHEET_RANGE=Admins!A:A
NODE_ENV=production
```

#### 7.4 Deploy
1. Click "Create Web Service"
2. Render will build and deploy automatically
3. You'll get a URL like: `https://cia-assessment.onrender.com`

### Step 8: Test the Deployment

1. **Test Student Flow:**
   - Visit your Render URL
   - Login with a test student (from your Google Sheet)
   - Set up proctor device on phone
   - Grant permissions
   - Complete a short test

2. **Test Admin Panel:**
   - Visit `https://your-url.onrender.com/admin`
   - Login with admin email (from your Google Sheet)
   - Verify recordings appear
   - Test grading functionality

3. **Check Google Drive:**
   - Verify folders and recordings are created
   - Check that chunks are uploading
   - Confirm final videos are present

## Troubleshooting

### "Invalid credentials" error
- Check that GOOGLE_PRIVATE_KEY has `\n` for newlines
- Verify the service account has correct permissions
- Ensure APIs are enabled in Google Cloud

### "Session not found" for proctor
- Check that main device created session first
- Verify PIN is entered correctly
- Try refreshing the proctor page

### Videos not uploading
- Check service account has Editor access to Drive folder
- Verify GOOGLE_DRIVE_FOLDER_ID is correct
- Check browser console for errors

### Audio not playing
- Verify Bunny.net URLs are public and accessible
- Check CORS settings on Bunny.net
- Test URLs directly in browser

### "Not authorized" for admin
- Check admin email is listed in Admins sheet
- Verify ADMIN_SHEET_RANGE is correct
- Case-sensitive email matching

## Support

For additional help, refer to:
- [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk)
- [Google Sheets API Documentation](https://developers.google.com/sheets/api/guides/concepts)
- [Render Documentation](https://render.com/docs)
- [Bunny.net Documentation](https://docs.bunny.net)

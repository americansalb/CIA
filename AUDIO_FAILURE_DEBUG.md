# Audio Failure Debugging Guide

## **THE PROBLEM**

Audio segments are failing to load with error:
```
NotSupportedError: Failed to load because no supported source was found.
```

**Example failed URL:**
```
https://CIApull.b-cdn.net/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/segment_1.mp3
```

---

## **ROOT CAUSE**

The audio files **do not exist** at the Bunny.net CDN URLs being generated.

This can be caused by:
1. Files were never uploaded to Bunny.net
2. Folder/file names don't match what's in Google Sheets
3. Bunny.net CDN URL is wrong in `.env`
4. CORS headers not configured on Bunny.net

---

## **HOW TO FIX**

### **Step 1: Verify Bunny.net Configuration**

Check your `.env` file on Render:
```bash
BUNNY_CDN_URL=https://ciapull.b-cdn.net
BUNNY_STORAGE_ZONE=your-storage-zone
BUNNY_API_KEY=your-api-key
```

**The CDN URL in the failed request is:**
```
https://CIApull.b-cdn.net/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/segment_1.mp3
```

**Is this correct?** Check:
- Domain: `CIApull.b-cdn.net` - Does this match your Pull Zone?
- Path: `/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/` - Does this folder exist?

### **Step 2: Check Bunny.net Storage Browser**

1. Log in to Bunny.net dashboard
2. Go to **Storage** → Your Storage Zone
3. Navigate to `/cia/` folder
4. Look for `_WARMUP__UNIVERSAL_INSTRUCTIONS` folder
5. Verify `segment_1.mp3` exists

**If folder/files don't exist:** You need to upload them using the Admin panel audio splitting feature.

### **Step 3: Test URL Directly**

Open this URL in your browser:
```
https://CIApull.b-cdn.net/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/segment_1.mp3
```

**If you see "File not found" or 404:** Files are not uploaded correctly.

**If download starts:** CDN works, but CORS might be the issue.

### **Step 4: Configure CORS on Bunny.net**

If files load directly but fail in app:

1. Go to Bunny.net dashboard
2. Navigate to **Pull Zone** settings
3. Find **CORS** section
4. Add allowed origins:
   ```
   https://cia-h90h.onrender.com
   https://*.onrender.com
   http://localhost:3000
   ```
5. Enable:
   - `Access-Control-Allow-Origin: *` (or specific domains)
   - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
6. Click **Save**

### **Step 5: Verify Google Sheets Has Correct URLs**

1. Open your Google Sheets
2. Go to **Tests** tab
3. Find `_UNIVERSAL_INSTRUCTIONS` row
4. Check the **Warmup** column

**Should contain JSON array:**
```json
[
  "https://ciapull.b-cdn.net/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/segment_1.mp3",
  "https://ciapull.b-cdn.net/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/segment_2.mp3",
  "..."
]
```

**Verify:**
- URLs match your actual Bunny.net Pull Zone domain
- Folder names match actual uploaded folders
- No typos or extra spaces

---

## **TESTING AFTER FIX**

After you've fixed the Bunny.net configuration:

1. **Hard refresh** your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Open browser console (F12)
3. Start a test
4. Watch for these logs:

**SUCCESS:**
```
✓ Audio segment 1 loaded successfully (duration: 45.2s)
```

**STILL FAILING:**
```
[CLIENT ERROR] 66b62e3c... - [AUDIO_LOAD] Failed to load audio segment 1/6 - URL: https://...
```

---

## **NEW ERROR LOGGING (Just Added)**

After Render deploys the latest code, you'll see detailed errors in Render logs:

**When audio fails to load:**
```
[CLIENT ERROR] session-id - [AUDIO_LOAD] Failed to load audio segment 1/6 -
URL: https://CIApull.b-cdn.net/cia/_WARMUP__UNIVERSAL_INSTRUCTIONS/segment_1.mp3,
Error code: 4,
Message: MEDIA_ELEMENT_ERROR: Format error
```

**Error codes mean:**
- `1` = MEDIA_ERR_ABORTED (user aborted)
- `2` = MEDIA_ERR_NETWORK (network error)
- `3` = MEDIA_ERR_DECODE (can't decode file)
- `4` = MEDIA_ERR_SRC_NOT_SUPPORTED (file not found or wrong format)

**Code 4 = File doesn't exist or CORS blocking it**

---

## **QUICK CHECKLIST**

- [ ] Bunny.net Pull Zone domain matches URLs in Google Sheets
- [ ] Files actually uploaded to Bunny.net storage
- [ ] Folder names match exactly (including underscores)
- [ ] CORS configured on Bunny.net Pull Zone
- [ ] URLs in Google Sheets are correct (no typos)
- [ ] Hard refresh browser after fixing

---

## **IF STILL NOT WORKING**

Share the **new error logs from Render** (after it deploys). They'll show:
- Exact URL that's failing
- Error code
- Session ID
- Timestamp

This will pinpoint exactly what's wrong.

---

## **HOW TO UPLOAD AUDIO TO BUNNY.NET**

If you need to upload warmup audio:

1. Go to Admin panel: `https://cia-h90h.onrender.com/admin`
2. Click **Test Configuration** tab
3. Upload your warmup audio file
4. Use the waveform editor to mark segment splits
5. Click **"Split & Upload to CDN"**
6. System will:
   - Split audio using FFmpeg
   - Upload segments to Bunny.net
   - Save URLs to Google Sheets automatically

**The system generates the folder name from test name**, so make sure test name in Google Sheets matches the uploaded folder.

---

## **EXPECTED BEHAVIOR**

**When working correctly:**
1. Student starts test
2. Browser loads: `https://ciapull.b-cdn.net/cia/TESTNAME/segment_1.mp3`
3. Console shows: `✓ Audio segment 1 loaded successfully (duration: 45s)`
4. Audio plays automatically
5. After audio ends, "Continue" button enables

**When failing:**
1. Student starts test
2. Browser tries to load: `https://CIApull.b-cdn.net/cia/TESTNAME/segment_1.mp3`
3. Console shows: `Audio playback error: NotSupportedError`
4. Alert appears: "❌ Audio Failed to Load"
5. Render logs show: `[CLIENT ERROR] ... [AUDIO_LOAD] Failed to load...`

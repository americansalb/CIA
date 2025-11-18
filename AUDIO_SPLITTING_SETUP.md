# Audio Splitting & Bunny.net Upload Setup

This guide explains how to set up the audio splitting feature that allows admins to upload full audio files and split them visually using a waveform editor.

## 🎯 What This Feature Does

Instead of manually splitting audio files and uploading each segment separately, you can:

1. Upload ONE full audio file in the admin panel
2. See a visual waveform of the entire audio
3. Click on the waveform to place markers where you want segments to split
4. System automatically:
   - Splits the audio at your markers using FFmpeg
   - Uploads each segment to Bunny.net CDN
   - Populates your test with the CDN URLs

## 📋 Prerequisites

### 1. FFmpeg Installation

The server needs FFmpeg to split audio files.

**On Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**On macOS:**
```bash
brew install ffmpeg
```

**On Windows:**
- Download from https://ffmpeg.org/download.html
- Add to PATH

**Verify installation:**
```bash
ffmpeg -version
```

### 2. Bunny.net Account

You need a Bunny.net account with a Storage Zone and Pull Zone configured.

1. Sign up at https://bunny.net
2. Create a Storage Zone:
   - Go to Storage → Add Storage Zone
   - Choose a region (e.g., `de` for Germany, `ny` for New York)
   - Note the storage zone name
3. Create a Pull Zone (CDN):
   - Go to CDN → Add Pull Zone
   - Link it to your Storage Zone
   - Note the CDN URL (e.g., `https://yourname.b-cdn.net`)
4. Get your API key:
   - Go to Account → API
   - Copy your Storage API Key

## ⚙️ Configuration

Add these environment variables to your `.env` file (or Render dashboard):

```env
# Bunny.net CDN Configuration
BUNNY_STORAGE_ZONE=your-storage-zone-name
BUNNY_API_KEY=your-bunny-storage-api-key-here
BUNNY_CDN_URL=https://your-cdn-url.b-cdn.net
BUNNY_REGION=de
```

### Environment Variable Details:

- **BUNNY_STORAGE_ZONE**: Your Bunny.net storage zone name (e.g., `cia-audio-files`)
- **BUNNY_API_KEY**: Your Bunny.net Storage API Key (NOT the Account API Key)
- **BUNNY_CDN_URL**: Your Pull Zone URL (e.g., `https://cia-cdn.b-cdn.net`)
- **BUNNY_REGION**: Storage region code (optional, defaults to `de`)
  - `de` = Germany (Frankfurt)
  - `ny` = New York
  - `la` = Los Angeles
  - `sg` = Singapore
  - `uk` = United Kingdom

## 🚀 Usage

1. **Go to Admin Panel** → Navigate to `/admin` and login
2. **Click "Manage Tests"** → Select a test or create new one
3. **Click "🎵 Upload & Split Audio"** button
4. **Upload your audio file** → Supports MP3, WAV, M4A, etc.
5. **View the waveform** → Your audio appears as a visual waveform
6. **Place segment markers:**
   - Click anywhere on the waveform to add a marker
   - Markers appear as red vertical lines
   - Each marker splits the audio at that timestamp
   - Use the **Play** button to listen and find exact split points
   - Use **Clear Markers** to remove all markers and start over
7. **Review segments:**
   - The "Segment Preview" section shows all segments with timestamps
   - Example: `Segment 1: 0:00 - 2:35 (2:35)`
8. **Click "🚀 Split & Upload to Bunny.net"**
9. **Wait for processing:**
   - System splits audio using FFmpeg
   - Each segment uploads to Bunny.net
   - CDN URLs automatically populate your test
10. **Click "💾 Save Test"** to finalize

## 📁 How Audio is Organized on Bunny.net

Files are uploaded to:
```
/cia/{testName}/segment_1.mp3
/cia/{testName}/segment_2.mp3
/cia/{testName}/segment_3.mp3
...
```

CDN URLs will look like:
```
https://your-cdn.b-cdn.net/cia/Test_A1/segment_1.mp3
https://your-cdn.b-cdn.net/cia/Test_A1/segment_2.mp3
```

## 🛠️ Troubleshooting

### "FFmpeg is not installed on the server"
- Install FFmpeg (see prerequisites above)
- Restart your server after installation
- Verify with `ffmpeg -version`

### "Bunny.net credentials not configured"
- Check that all 3 required env vars are set: `BUNNY_STORAGE_ZONE`, `BUNNY_API_KEY`, `BUNNY_CDN_URL`
- Make sure you're using the **Storage API Key**, not Account API Key
- Restart server after adding variables

### Upload fails with 401 Unauthorized
- Verify your `BUNNY_API_KEY` is correct
- Check you're using the Storage API Key from Account → API

### Segments play but have wrong timestamps
- Clear markers and re-place them more carefully
- Use the Play button to verify exact locations
- Markers should be placed at silence between speech segments

### Audio quality issues
- Segments are encoded at 192kbps MP3 (high quality)
- Original file quality affects output
- Upload high-quality source files (preferably 320kbps or WAV)

## 💡 Tips

- **Listen before splitting**: Use the Play/Pause button to find natural break points
- **Mark at silences**: Place markers during pauses between speech
- **Test with small file first**: Upload a short test audio to verify setup
- **Use descriptive test names**: Use names like `Test_A1`, `Test_B2` for organization
- **Keep segments reasonable**: Aim for 1-3 minute segments for best student experience

## 🔐 Security Notes

- Keep your Bunny.net API key secret
- Never commit `.env` file to git
- Use environment variables in production (Render dashboard)
- Files are publicly accessible via CDN URL once uploaded

## 📊 Cost Considerations

Bunny.net pricing (as of 2024):
- Storage: ~$0.01 per GB/month
- CDN Traffic: ~$0.01 per GB

Example: 100 audio tests × 10 segments × 2MB = ~2GB storage = $0.02/month

## 🆘 Support

For issues with:
- **FFmpeg**: Check FFmpeg documentation or installation guides
- **Bunny.net**: Contact Bunny.net support or check their docs
- **CIA Application**: Check application logs or contact your developer

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { downloadFile, uploadFile, deleteFile } = require('./drive-helper');

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Convert a webm file to mp4 with proper keyframes for seeking
 * This runs in the background after the user has received their response
 */
async function convertToSeekableMp4(webmFileId, sessionFolderId, originalFileName) {
  const conversionId = `convert_${Date.now()}`;
  console.log(`[${conversionId}] Starting background conversion for: ${originalFileName}`);

  const webmPath = path.join(TEMP_DIR, `${conversionId}_input.webm`);
  const mp4Path = path.join(TEMP_DIR, `${conversionId}_output.mp4`);

  try {
    // Step 1: Download webm from Google Drive
    console.log(`[${conversionId}] Downloading webm from Google Drive...`);
    await downloadFile(webmFileId, webmPath);
    console.log(`[${conversionId}] Download complete`);

    // Step 2: Convert to MP4 with proper keyframes
    console.log(`[${conversionId}] Converting to MP4...`);
    await new Promise((resolve, reject) => {
      ffmpeg(webmPath)
        .outputOptions([
          '-c:v libx264',      // H.264 video codec (widely supported)
          '-preset fast',       // Faster encoding (good balance)
          '-crf 23',           // Quality (lower = better, 23 is default)
          '-c:a aac',          // AAC audio codec
          '-b:a 128k',         // Audio bitrate
          '-movflags +faststart', // Enable fast start for web playback (key for seeking!)
          '-g 30',             // Keyframe every 30 frames (1 second at 30fps)
          '-keyint_min 30',    // Minimum keyframe interval
        ])
        .output(mp4Path)
        .on('start', (cmd) => {
          console.log(`[${conversionId}] FFmpeg started: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[${conversionId}] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`[${conversionId}] Conversion complete`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[${conversionId}] FFmpeg error:`, err);
          reject(err);
        })
        .run();
    });

    // Step 3: Upload MP4 to Google Drive
    console.log(`[${conversionId}] Uploading MP4 to Google Drive...`);
    const mp4FileName = originalFileName.replace('.webm', '.mp4').replace('_FINAL_', '_FINAL_CONVERTED_');
    const uploadResult = await uploadFile(mp4Path, mp4FileName, sessionFolderId, 'video/mp4');
    console.log(`[${conversionId}] ✓ MP4 uploaded: ${uploadResult.fileId}`);

    // Step 4: Clean up temp files
    try {
      fs.unlinkSync(webmPath);
      fs.unlinkSync(mp4Path);
    } catch (cleanupErr) {
      console.warn(`[${conversionId}] Cleanup warning:`, cleanupErr.message);
    }

    // Step 5: Optionally delete original webm (uncomment if you want to save space)
    // console.log(`[${conversionId}] Deleting original webm...`);
    // await deleteFile(webmFileId);
    // console.log(`[${conversionId}] Original webm deleted`);

    console.log(`[${conversionId}] ✓ Background conversion completed successfully`);
    return {
      success: true,
      mp4FileId: uploadResult.fileId,
      mp4FileName: mp4FileName,
    };

  } catch (error) {
    console.error(`[${conversionId}] ✗ Background conversion failed:`, error);

    // Clean up temp files on error
    try {
      if (fs.existsSync(webmPath)) fs.unlinkSync(webmPath);
      if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Queue a video for background conversion
 * This is fire-and-forget - doesn't block the caller
 */
function queueConversion(webmFileId, sessionFolderId, originalFileName) {
  // Run conversion in background (don't await)
  setImmediate(() => {
    convertToSeekableMp4(webmFileId, sessionFolderId, originalFileName)
      .then((result) => {
        if (result.success) {
          console.log(`✓ Background conversion succeeded: ${result.mp4FileName}`);
        } else {
          console.error(`✗ Background conversion failed: ${result.error}`);
        }
      })
      .catch((err) => {
        console.error('✗ Background conversion error:', err);
      });
  });
}

module.exports = {
  convertToSeekableMp4,
  queueConversion,
};

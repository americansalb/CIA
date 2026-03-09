const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { downloadFile, uploadFile, deleteFile } = require('./drive-helper');
const { getDrive } = require('./google-auth');

// Point fluent-ffmpeg at the bundled binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Minimum free disk space required to start compilation (500 MB)
const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024;

/**
 * Check available disk space on the temp directory's drive.
 * Returns free bytes or null if unable to determine.
 */
function getFreeDiskSpace() {
  try {
    if (process.platform === 'win32') {
      const drive = path.resolve(TEMP_DIR).substring(0, 2);
      const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /format:value`, { encoding: 'utf8' });
      const match = output.match(/FreeSpace=(\d+)/);
      return match ? parseInt(match[1]) : null;
    } else {
      const output = execSync(`df -B1 "${TEMP_DIR}" | tail -1 | awk '{print $4}'`, { encoding: 'utf8' });
      return parseInt(output.trim()) || null;
    }
  } catch (e) {
    console.warn('[video-converter] Could not check disk space:', e.message);
    return null; // Proceed anyway if we can't check
  }
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

/**
 * Combine chunks from an incomplete recording into a single video
 * Downloads all chunks, concatenates them, converts to MP4, and uploads
 */
async function combineChunks(sessionFolderId, deviceType, studentEmail, studentId) {
  const combineId = `combine_${Date.now()}`;
  console.log(`[${combineId}] Starting chunk combination for ${deviceType} device`);

  const workDir = path.join(TEMP_DIR, combineId);
  fs.mkdirSync(workDir, { recursive: true });

  const chunkFiles = [];
  const concatListPath = path.join(workDir, 'concat_list.txt');
  const outputPath = path.join(workDir, 'combined_output.mp4');

  try {
    // Pre-check: ensure enough disk space
    const freeSpace = getFreeDiskSpace();
    if (freeSpace !== null && freeSpace < MIN_FREE_DISK_BYTES) {
      const freeMB = (freeSpace / 1024 / 1024).toFixed(0);
      console.error(`[${combineId}] Insufficient disk space: ${freeMB}MB free`);
      return { success: false, error: `Insufficient disk space (${freeMB}MB free). Need at least 500MB.` };
    }

    // Step 1: Get all chunk files from the session folder
    const drive = await getDrive();
    const filesResponse = await drive.files.list({
      q: `'${sessionFolderId}' in parents and name contains '${deviceType}_chunk_' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const chunks = filesResponse.data.files || [];
    if (chunks.length === 0) {
      return {
        success: false,
        error: `No ${deviceType} chunks found in session folder`,
      };
    }

    // Sort chunks by chunk number (extract number from name like "main_chunk_001.webm")
    chunks.sort((a, b) => {
      const numA = parseInt(a.name.match(/chunk_(\d+)/)?.[1] || '0');
      const numB = parseInt(b.name.match(/chunk_(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    console.log(`[${combineId}] Found ${chunks.length} chunks to combine`);

    // Step 2: Download all chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkPath = path.join(workDir, `chunk_${String(i).padStart(4, '0')}.webm`);
      console.log(`[${combineId}] Downloading chunk ${i + 1}/${chunks.length}: ${chunk.name}`);
      await downloadFile(chunk.id, chunkPath);
      chunkFiles.push(chunkPath);
    }

    console.log(`[${combineId}] All chunks downloaded, starting two-pass transcode...`);

    // PASS 1: Transcode each chunk individually to MPEG-TS (low memory)
    const tsFiles = [];
    console.log(`[${combineId}] Pass 1: Transcoding ${chunkFiles.length} chunks to TS...`);
    const pass1Start = Date.now();
    for (let i = 0; i < chunkFiles.length; i++) {
      const tsPath = path.join(workDir, `chunk_${String(i).padStart(4, '0')}.ts`);
      await transcodeChunkToTS(chunkFiles[i], tsPath, combineId, i, chunkFiles.length);
      tsFiles.push(tsPath);
      // Delete original chunk to free disk space
      try { fs.unlinkSync(chunkFiles[i]); } catch (e) { /* ignore */ }
    }
    console.log(`[${combineId}] Pass 1 done in ${((Date.now() - pass1Start) / 1000).toFixed(1)}s`);

    // PASS 2: Concatenate TS files with stream copy to MP4
    const concatContent = tsFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    console.log(`[${combineId}] Pass 2: Concatenating TS files to MP4...`);
    const pass2Start = Date.now();
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',
          '-movflags +faststart',
          '-avoid_negative_ts make_zero',
        ])
        .output(outputPath)
        .on('start', () => console.log(`[${combineId}] Pass 2 FFmpeg started`))
        .on('end', () => {
          console.log(`[${combineId}] Pass 2 done in ${((Date.now() - pass2Start) / 1000).toFixed(1)}s`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[${combineId}] Pass 2 FFmpeg error:`, err);
          reject(err);
        })
        .run();
    });

    // Step 5: Upload combined video to Google Drive
    console.log(`[${combineId}] Uploading combined video...`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mp4FileName = `${studentEmail}_${studentId}_COMBINED_${deviceType}_${timestamp}.mp4`;
    const uploadResult = await uploadFile(outputPath, mp4FileName, sessionFolderId, 'video/mp4');
    console.log(`[${combineId}] ✓ Combined video uploaded: ${uploadResult.fileId}`);

    // Step 6: Cleanup temp files
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[${combineId}] Cleanup warning:`, cleanupErr.message);
    }

    console.log(`[${combineId}] ✓ Chunk combination completed successfully`);
    return {
      success: true,
      mp4FileId: uploadResult.fileId,
      mp4FileName: mp4FileName,
      webViewLink: uploadResult.webViewLink,
      chunksProcessed: chunks.length,
    };

  } catch (error) {
    console.error(`[${combineId}] ✗ Chunk combination failed:`, error);

    // Cleanup on error
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
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
 * Transcode a single chunk to MPEG-TS format.
 * Each chunk is processed individually to keep memory usage low.
 */
function transcodeChunkToTS(inputPath, outputPath, combineId, index, total) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 26',
        '-vf', 'scale=-2:720',           // 720p — clear enough for identity verification
        '-c:a aac',
        '-b:a 96k',
        '-ac 1',
        '-r 24',
        '-threads 1',
        '-x264-params', 'rc-lookahead=0:ref=1:bframes=0',
        '-f mpegts',
      ])
      .output(outputPath)
      .on('start', () => {
        if (index % 10 === 0 || index === total - 1) {
          console.log(`[${combineId}] Transcoding chunk ${index + 1}/${total} to TS`);
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => {
        console.error(`[${combineId}] Chunk ${index + 1} transcode error:`, err.message);
        reject(err);
      })
      .run();
  });
}

/**
 * Combine pre-identified chunk files into a single video.
 * Uses a two-pass approach to prevent memory exhaustion:
 *   Pass 1: Transcode each chunk individually to MPEG-TS (low memory per chunk)
 *   Pass 2: Concatenate TS files with stream copy to MP4 (fast, no re-encoding)
 */
async function combineChunkFiles(chunkList, outputFolderId, deviceType, studentEmail, studentId) {
  const combineId = `combine_${Date.now()}`;
  console.log(`[${combineId}] Starting two-pass chunk combination for ${deviceType} (${chunkList.length} chunks)`);

  const workDir = path.join(TEMP_DIR, combineId);
  fs.mkdirSync(workDir, { recursive: true });

  const localFiles = [];
  const tsFiles = [];

  try {
    // Pre-check: ensure enough disk space before starting
    const freeSpace = getFreeDiskSpace();
    if (freeSpace !== null && freeSpace < MIN_FREE_DISK_BYTES) {
      const freeMB = (freeSpace / 1024 / 1024).toFixed(0);
      console.error(`[${combineId}] Insufficient disk space: ${freeMB}MB free, need ${MIN_FREE_DISK_BYTES / 1024 / 1024}MB`);
      return { success: false, error: `Insufficient disk space (${freeMB}MB free). Need at least 500MB.` };
    }

    // Sort chunks by number
    chunkList.sort((a, b) => {
      const numA = parseInt(a.name.match(/chunk_(\d+)/)?.[1] || '0');
      const numB = parseInt(b.name.match(/chunk_(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    // Download all chunks
    const dlStart = Date.now();
    for (let i = 0; i < chunkList.length; i++) {
      const chunk = chunkList[i];
      const ext = chunk.name.endsWith('.mp4') ? 'mp4' : 'webm';
      const chunkPath = path.join(workDir, `chunk_${String(i).padStart(4, '0')}.${ext}`);
      if (i % 10 === 0 || i === chunkList.length - 1) {
        console.log(`[${combineId}] Downloading chunk ${i + 1}/${chunkList.length}: ${chunk.name}`);
      }
      await downloadFile(chunk.id, chunkPath);
      localFiles.push(chunkPath);
    }
    console.log(`[${combineId}] All ${chunkList.length} chunks downloaded in ${((Date.now() - dlStart) / 1000).toFixed(1)}s`);

    // PASS 1: Transcode each chunk individually to MPEG-TS
    // This keeps memory low because only one chunk is being processed at a time
    console.log(`[${combineId}] Pass 1: Transcoding each chunk to MPEG-TS...`);
    const pass1Start = Date.now();
    for (let i = 0; i < localFiles.length; i++) {
      const tsPath = path.join(workDir, `chunk_${String(i).padStart(4, '0')}.ts`);
      await transcodeChunkToTS(localFiles[i], tsPath, combineId, i, localFiles.length);
      tsFiles.push(tsPath);

      // Delete the original chunk after transcoding to free disk space
      try { fs.unlinkSync(localFiles[i]); } catch (e) { /* ignore */ }
    }
    console.log(`[${combineId}] Pass 1 done in ${((Date.now() - pass1Start) / 1000).toFixed(1)}s`);

    // PASS 2: Concatenate TS files with stream copy (fast, no re-encoding, low memory)
    const concatListPath = path.join(workDir, 'concat_list.txt');
    const concatContent = tsFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const outputPath = path.join(workDir, 'combined_output.mp4');
    console.log(`[${combineId}] Pass 2: Concatenating ${tsFiles.length} TS files to MP4...`);
    const pass2Start = Date.now();
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',                      // Stream copy — no re-encoding needed
          '-movflags +faststart',         // Enable seeking from start for web playback
          '-avoid_negative_ts make_zero',
        ])
        .output(outputPath)
        .on('start', () => console.log(`[${combineId}] Pass 2 FFmpeg started`))
        .on('end', () => {
          console.log(`[${combineId}] Pass 2 done in ${((Date.now() - pass2Start) / 1000).toFixed(1)}s`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[${combineId}] Pass 2 FFmpeg error:`, err);
          reject(err);
        })
        .run();
    });

    // Upload combined MP4
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outFileName = `${studentEmail}_${studentId}_COMBINED_${deviceType}_${timestamp}.mp4`;
    console.log(`[${combineId}] Uploading combined video (${outFileName})...`);
    const uploadResult = await uploadFile(outputPath, outFileName, outputFolderId, 'video/mp4');
    console.log(`[${combineId}] Combined video uploaded: ${uploadResult.fileId}`);

    // Cleanup
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }

    return {
      success: true,
      mp4FileId: uploadResult.fileId,
      mp4FileName: outFileName,
      webViewLink: uploadResult.webViewLink,
      chunksProcessed: chunkList.length,
    };
  } catch (error) {
    console.error(`[${combineId}] Chunk combination failed:`, error);
    try { if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    return { success: false, error: error.message };
  }
}

/**
 * Queue chunk combination for background processing
 */
function queueChunkCombine(sessionFolderId, deviceType, studentEmail, studentId) {
  setImmediate(() => {
    combineChunks(sessionFolderId, deviceType, studentEmail, studentId)
      .then((result) => {
        if (result.success) {
          console.log(`✓ Background chunk combination succeeded: ${result.mp4FileName}`);
        } else {
          console.error(`✗ Background chunk combination failed: ${result.error}`);
        }
      })
      .catch((err) => {
        console.error('✗ Background chunk combination error:', err);
      });
  });
}

module.exports = {
  convertToSeekableMp4,
  queueConversion,
  combineChunks,
  combineChunkFiles,
  queueChunkCombine,
};

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');

const execPromise = promisify(exec);

// Helper to download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

module.exports = async (req, res) => {
  try {
    const { audioUrl, testName, markers } = req.body;

    if (!audioUrl) {
      return res.status(400).json({
        success: false,
        message: 'No audio URL provided',
      });
    }

    if (!testName) {
      return res.status(400).json({
        success: false,
        message: 'No test name provided',
      });
    }

    // Check if FFmpeg is available
    try {
      await execPromise('ffmpeg -version');
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'FFmpeg is not installed on the server. Please install FFmpeg to use audio splitting.',
      });
    }

    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download audio file from Bunny.net
    const audioFileName = audioUrl.split('/').pop() || 'audio.mp3';
    const audioFilePath = path.join(tempDir, `download_${Date.now()}_${audioFileName}`);

    console.log(`Downloading audio from ${audioUrl}...`);
    await downloadFile(audioUrl, audioFilePath);
    console.log(`Audio downloaded to ${audioFilePath}`);

    // Split audio into segments
    const segments = [];
    const segmentFiles = [];

    // Create segments based on markers
    let startTime = 0;
    const timestamps = [...markers, null]; // Add null to handle last segment

    for (let i = 0; i < timestamps.length; i++) {
      const endTime = timestamps[i];
      const segmentPath = path.join(tempDir, `${testName}_segment_${i + 1}.mp3`);

      // Build FFmpeg command
      let ffmpegCmd;
      if (endTime === null) {
        // Last segment - no end time
        ffmpegCmd = `ffmpeg -i "${audioFilePath}" -ss ${startTime} -acodec libmp3lame -ab 192k "${segmentPath}"`;
      } else {
        const duration = endTime - startTime;
        ffmpegCmd = `ffmpeg -i "${audioFilePath}" -ss ${startTime} -t ${duration} -acodec libmp3lame -ab 192k "${segmentPath}"`;
      }

      // Execute FFmpeg
      await execPromise(ffmpegCmd);

      segmentFiles.push(segmentPath);
      segments.push({
        number: i + 1,
        path: segmentPath,
        start: startTime,
        end: endTime || 'end',
      });

      if (endTime !== null) {
        startTime = endTime;
      }
    }

    // Upload segments to Bunny.net
    const bunnyStorageZone = process.env.BUNNY_STORAGE_ZONE;
    const bunnyApiKey = process.env.BUNNY_API_KEY;
    const bunnyRegion = process.env.BUNNY_REGION || 'de'; // Default to Germany region
    const bunnyCdnUrl = process.env.BUNNY_CDN_URL;

    if (!bunnyStorageZone || !bunnyApiKey || !bunnyCdnUrl) {
      // If Bunny.net not configured, clean up and return error
      console.warn('Bunny.net credentials not configured. Skipping upload.');

      // Clean up downloaded file and segments
      fs.unlinkSync(audioFilePath);
      segmentFiles.forEach(file => fs.unlinkSync(file));

      return res.json({
        success: false,
        message: 'Bunny.net credentials not configured in environment variables. Please add BUNNY_STORAGE_ZONE, BUNNY_API_KEY, and BUNNY_CDN_URL to your environment.',
      });
    }

    const segmentUrls = [];

    // Upload each segment to Bunny.net
    for (const segment of segments) {
      const fileName = `cia/${testName}/segment_${segment.number}.mp3`;
      const fileData = fs.readFileSync(segment.path);

      // Upload to Bunny.net Storage using fetch (Node 18+) or https module
      // Use regional endpoint if region is specified
      const storageEndpoint = bunnyRegion && bunnyRegion !== 'de'
        ? `https://${bunnyRegion}.storage.bunnycdn.com`
        : 'https://storage.bunnycdn.com';
      const uploadUrl = `${storageEndpoint}/${bunnyStorageZone}/${fileName}`;

      try {
        // Try using built-in fetch if available (Node 18+)
        if (typeof fetch !== 'undefined') {
          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'AccessKey': bunnyApiKey,
              'Content-Type': 'audio/mpeg',
            },
            body: fileData,
          });

          if (!uploadResponse.ok) {
            throw new Error(`HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`);
          }
        } else {
          // Fallback to https module
          await new Promise((resolve, reject) => {
            const options = {
              method: 'PUT',
              headers: {
                'AccessKey': bunnyApiKey,
                'Content-Type': 'audio/mpeg',
                'Content-Length': fileData.length,
              },
            };

            const req = https.request(uploadUrl, options, (res) => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`HTTP ${res.statusCode}`));
              }
            });

            req.on('error', reject);
            req.write(fileData);
            req.end();
          });
        }
      } catch (error) {
        throw new Error(`Failed to upload segment ${segment.number} to Bunny.net: ${error.message}`);
      }

      // Construct CDN URL
      const cdnUrl = `${bunnyCdnUrl}/cia/${testName}/segment_${segment.number}.mp3`;
      segmentUrls.push(cdnUrl);

      // Clean up segment file
      fs.unlinkSync(segment.path);
    }

    // Clean up downloaded audio file
    fs.unlinkSync(audioFilePath);

    res.json({
      success: true,
      segmentUrls,
      message: `Successfully created ${segmentUrls.length} segments`,
    });

  } catch (error) {
    console.error('Error in split-and-upload:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing audio',
    });
  }
};

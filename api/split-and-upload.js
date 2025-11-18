const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');

const execPromise = promisify(exec);

module.exports = async (req, res) => {
  const form = formidable({
    uploadDir: path.join(__dirname, '../temp'),
    keepExtensions: true,
  });

  try {
    // Parse the form data
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const audioFile = files.audio[0];
    const testName = fields.testName[0];
    const markers = JSON.parse(fields.markers[0]);

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided',
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
        ffmpegCmd = `ffmpeg -i "${audioFile.filepath}" -ss ${startTime} -acodec libmp3lame -ab 192k "${segmentPath}"`;
      } else {
        const duration = endTime - startTime;
        ffmpegCmd = `ffmpeg -i "${audioFile.filepath}" -ss ${startTime} -t ${duration} -acodec libmp3lame -ab 192k "${segmentPath}"`;
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
      // If Bunny.net not configured, just return local temp URLs
      console.warn('Bunny.net credentials not configured. Skipping upload.');

      // Clean up original file
      fs.unlinkSync(audioFile.filepath);

      return res.json({
        success: false,
        message: 'Bunny.net credentials not configured in environment variables. Please add BUNNY_STORAGE_ZONE, BUNNY_API_KEY, and BUNNY_CDN_URL to your environment.',
      });
    }

    const segmentUrls = [];

    for (const segment of segments) {
      const fileName = `cia/${testName}/segment_${segment.number}.mp3`;
      const fileData = fs.readFileSync(segment.path);

      // Upload to Bunny.net Storage
      const uploadUrl = `https://storage.bunnycdn.com/${bunnyStorageZone}/${fileName}`;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': bunnyApiKey,
          'Content-Type': 'audio/mpeg',
        },
        body: fileData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload segment ${segment.number} to Bunny.net: ${uploadResponse.statusText}`);
      }

      // Construct CDN URL
      const cdnUrl = `${bunnyCdnUrl}/cia/${testName}/segment_${segment.number}.mp3`;
      segmentUrls.push(cdnUrl);

      // Clean up segment file
      fs.unlinkSync(segment.path);
    }

    // Clean up original file
    fs.unlinkSync(audioFile.filepath);

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

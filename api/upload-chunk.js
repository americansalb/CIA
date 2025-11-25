const formidable = require('formidable');
const fs = require('fs');
const { findOrCreateFolder, uploadBuffer } = require('../utils/drive-helper');
const { sessions } = require('./create-session');

module.exports = async (req, res) => {
  const form = new formidable.IncomingForm({
    maxFileSize: 100 * 1024 * 1024, // 100MB max per chunk
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to parse upload',
      });
    }

    try {
      const { sessionId, deviceType, chunkNumber, timestamp, recovery, email, studentId } = fields;
      const videoFile = files.video;

      if (!sessionId || !deviceType || !chunkNumber || !videoFile) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      let session = sessions.get(sessionId[0]);

      // Handle recovery uploads: create temporary session if it doesn't exist
      if (!session && recovery && recovery[0] === 'true' && email && studentId) {
        console.log(`Recovery upload: Creating temporary session for ${email[0]}`);
        session = {
          sessionId: sessionId[0],
          email: email[0],
          studentId: studentId[0],
          chunks: {},
          isRecovery: true,
        };
        sessions.set(sessionId[0], session);
      }

      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found',
        });
      }

      // Read file into buffer
      const fileBuffer = fs.readFileSync(videoFile[0].filepath);

      // CRITICAL: Validate Google Drive config before attempting upload
      if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
        console.error('CRITICAL: GOOGLE_DRIVE_FOLDER_ID not configured');
        // Save locally but don't crash
        fs.unlinkSync(videoFile[0].filepath);
        return res.status(500).json({
          success: false,
          message: 'Server configuration error - uploads disabled',
        });
      }

      // Create folder structure: Email_StudentID/SessionID/
      const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const studentFolderName = `${session.email}_${session.studentId}`;

      let studentFolderId, sessionFolderId, uploadResult;

      try {
        studentFolderId = await findOrCreateFolder(mainFolderId, studentFolderName);
        sessionFolderId = await findOrCreateFolder(studentFolderId, sessionId[0]);

        // Upload chunk directly to session folder (no "chunks" subfolder)
        // Detect format from uploaded file mime type (iOS uses MP4, desktop uses WebM)
        const fileMimeType = videoFile[0].mimetype || 'video/webm';
        const fileExtension = fileMimeType.includes('mp4') ? 'mp4' : 'webm';
        const fileName = `${deviceType[0]}_chunk_${chunkNumber[0]}.${fileExtension}`;
        uploadResult = await uploadBuffer(fileBuffer, fileName, sessionFolderId, fileMimeType);
      } catch (driveError) {
        console.error('Google Drive upload error:', driveError);
        // Clean up temp file
        fs.unlinkSync(videoFile[0].filepath);
        return res.status(500).json({
          success: false,
          message: 'Upload to Google Drive failed',
          error: driveError.message,
        });
      }

      // Track chunk in session
      if (!session.chunks[deviceType[0]]) {
        session.chunks[deviceType[0]] = [];
      }
      session.chunks[deviceType[0]].push({
        chunkNumber: parseInt(chunkNumber[0]),
        fileId: uploadResult.fileId,
        uploadedAt: new Date().toISOString(),
      });

      // Clean up temp file
      fs.unlinkSync(videoFile[0].filepath);

      res.json({
        success: true,
        message: 'Chunk uploaded successfully',
        fileId: uploadResult.fileId,
      });
    } catch (error) {
      console.error('Chunk upload error:', error);

      // Ensure temp file is cleaned up even on error
      try {
        if (files && files.video && files.video[0] && files.video[0].filepath) {
          fs.unlinkSync(files.video[0].filepath);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload chunk',
        error: error.message,
      });
    }
  });
};

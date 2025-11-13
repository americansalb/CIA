const formidable = require('formidable');
const fs = require('fs');
const { findOrCreateFolder, uploadBuffer } = require('../utils/drive-helper');
const { sessions } = require('./create-session');

module.exports = async (req, res) => {
  const form = formidable({
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
      const { sessionId, deviceType, chunkNumber, timestamp } = fields;
      const videoFile = files.video;

      if (!sessionId || !deviceType || !chunkNumber || !videoFile) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      const session = sessions.get(sessionId[0]);
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found',
        });
      }

      // Read file into buffer
      const fileBuffer = fs.readFileSync(videoFile[0].filepath);

      // Create folder structure: CIA_Recordings/Email_StudentID/SessionID/Chunks
      const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const studentFolderName = `${session.email}_${session.studentId}`;
      const studentFolderId = await findOrCreateFolder(mainFolderId, studentFolderName);
      const sessionFolderId = await findOrCreateFolder(studentFolderId, sessionId[0]);
      const chunksFolderId = await findOrCreateFolder(sessionFolderId, 'chunks');

      // Upload chunk
      const fileName = `${deviceType[0]}_chunk_${chunkNumber[0]}.webm`;
      const uploadResult = await uploadBuffer(fileBuffer, fileName, chunksFolderId, 'video/webm');

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
      res.status(500).json({
        success: false,
        message: 'Failed to upload chunk',
      });
    }
  });
};

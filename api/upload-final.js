const formidable = require('formidable');
const fs = require('fs');
const { findOrCreateFolder, uploadBuffer } = require('../utils/drive-helper');
const { sessions } = require('./create-session');

module.exports = async (req, res) => {
  const form = new formidable.IncomingForm({
    maxFileSize: 500 * 1024 * 1024, // 500MB max for full video
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
      const { sessionId, deviceType, duration, interventionCount } = fields;
      const videoFile = files.video;

      if (!sessionId || !deviceType || !videoFile) {
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

      // Create folder structure matching chunk uploads
      const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const studentFolderName = `${session.email}_${session.studentId}`;

      const studentFolderId = await findOrCreateFolder(mainFolderId, studentFolderName);
      const sessionFolderId = await findOrCreateFolder(studentFolderId, sessionId[0]);

      // Upload final video
      // Detect format from uploaded file mime type (iOS uses MP4, desktop uses WebM)
      const fileMimeType = videoFile[0].mimetype || 'video/webm';
      const fileExtension = fileMimeType.includes('mp4') ? 'mp4' : 'webm';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${session.email}_${session.studentId}_${session.permittedTest}_${deviceType[0]}_FINAL_${timestamp}.${fileExtension}`;
      const uploadResult = await uploadBuffer(fileBuffer, fileName, sessionFolderId, fileMimeType);

      // Create metadata file
      const metadata = {
        sessionId: sessionId[0],
        email: session.email,
        studentId: session.studentId,
        permittedTest: session.permittedTest,
        deviceType: deviceType[0],
        duration: duration ? duration[0] : 'unknown',
        interventionCount: interventionCount ? parseInt(interventionCount[0]) : session.interventions.length,
        interventions: session.interventions,
        uploadedAt: new Date().toISOString(),
        status: 'pending_review',
      };

      const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
      const metadataFileName = `${session.email}_${session.studentId}_${deviceType[0]}_metadata.json`;
      await uploadBuffer(metadataBuffer, metadataFileName, sessionFolderId, 'application/json');

      // Clean up temp file
      fs.unlinkSync(videoFile[0].filepath);

      res.json({
        success: true,
        message: 'Final video uploaded successfully',
        fileId: uploadResult.fileId,
        webViewLink: uploadResult.webViewLink,
      });
    } catch (error) {
      console.error('Final upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload final video',
      });
    }
  });
};

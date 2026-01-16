const { getDrive } = require('../utils/google-auth');

module.exports = async (req, res) => {
  try {
    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Get all student folders
    const studentFoldersResponse = await drive.files.list({
      q: `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const recordings = [];

    // For each student folder, get session folders
    for (const studentFolder of studentFoldersResponse.data.files || []) {
      const sessionFoldersResponse = await drive.files.list({
        q: `'${studentFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      // For each session, get metadata and videos
      for (const sessionFolder of sessionFoldersResponse.data.files || []) {
        const filesResponse = await drive.files.list({
          q: `'${sessionFolder.id}' in parents and trashed=false`,
          fields: 'files(id, name, createdTime, webViewLink, mimeType)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = filesResponse.data.files || [];
        const metadataFile = files.find(f => f.name.endsWith('_metadata.json'));
        const videoFiles = files.filter(f => f.name.includes('_FINAL_') && (f.mimeType === 'video/webm' || f.mimeType === 'video/mp4'));
        const chunkFiles = files.filter(f => f.name.includes('_chunk_'));

        if (metadataFile) {
          // Complete recording with metadata
          const metadataResponse = await drive.files.get({
            fileId: metadataFile.id,
            alt: 'media',
            supportsAllDrives: true,
          });

          const metadata = metadataResponse.data;

          // Check which videos have been converted (have CONVERTED in name)
          const convertedFiles = videoFiles.filter(f => f.name.includes('_CONVERTED_'));
          const unconvertedWebms = videoFiles.filter(f =>
            f.name.endsWith('.webm') &&
            !f.name.includes('_CONVERTED_') &&
            // Check if there's no corresponding converted version
            !convertedFiles.some(cf =>
              cf.name.replace('_CONVERTED_', '_').replace('.mp4', '.webm') === f.name
            )
          );

          recordings.push({
            ...metadata,
            studentFolder: studentFolder.name,
            sessionFolder: sessionFolder.name,
            sessionFolderId: sessionFolder.id,
            videos: videoFiles.map(v => ({
              fileId: v.id,
              fileName: v.name,
              webViewLink: v.webViewLink,
              mimeType: v.mimeType,
              deviceType: v.name.includes('_main_') ? 'main' : 'proctor',
              needsConversion: unconvertedWebms.some(u => u.id === v.id),
            })),
          });
        } else if (chunkFiles.length > 0) {
          // Incomplete recording - student left prematurely, but chunks were uploaded
          // Parse info from folder structure: studentFolder format is "email_studentId"
          const folderParts = studentFolder.name.split('_');
          const email = folderParts.slice(0, -1).join('_'); // Everything except last part
          const studentId = folderParts[folderParts.length - 1]; // Last part

          // Count chunks by device type
          const mainChunks = chunkFiles.filter(f => f.name.includes('main_chunk_'));
          const proctorChunks = chunkFiles.filter(f => f.name.includes('proctor_chunk_'));

          // Check for COMBINED videos (already processed)
          const combinedVideos = files.filter(f => f.name.includes('COMBINED_'));
          const hasCombinedMain = combinedVideos.some(f => f.name.includes('COMBINED_main'));
          const hasCombinedProctor = combinedVideos.some(f => f.name.includes('COMBINED_proctor'));

          // Get first chunk upload time as proxy for session start
          const earliestChunk = chunkFiles.sort((a, b) =>
            new Date(a.createdTime) - new Date(b.createdTime)
          )[0];

          // Only show chunkCount for uncombined device types
          const chunkCount = {};
          if (mainChunks.length > 0 && !hasCombinedMain) {
            chunkCount.main = mainChunks.length;
          }
          if (proctorChunks.length > 0 && !hasCombinedProctor) {
            chunkCount.proctor = proctorChunks.length;
          }

          // Create synthetic metadata for incomplete session
          recordings.push({
            sessionId: sessionFolder.name,
            email: email,
            studentId: studentId,
            permittedTest: 'Unknown',
            duration: 'incomplete',
            interventionCount: 0,
            interventions: [],
            uploadedAt: earliestChunk ? earliestChunk.createdTime : sessionFolder.createdTime,
            status: 'incomplete',
            studentFolder: studentFolder.name,
            sessionFolder: sessionFolder.name,
            sessionFolderId: sessionFolder.id,
            chunkCount: Object.keys(chunkCount).length > 0 ? chunkCount : null,
            videos: [
              // Show combined videos if available
              ...combinedVideos.map(v => ({
                fileId: v.id,
                fileName: v.name,
                webViewLink: v.webViewLink,
                deviceType: v.name.includes('_main') ? 'main' : 'proctor',
                isCombined: true,
              })),
              // Mark as having chunks available for viewing (only if not combined)
              ...(mainChunks.length > 0 && !hasCombinedMain ? [{
                fileId: 'chunks',
                fileName: `${mainChunks.length} chunks`,
                webViewLink: null,
                deviceType: 'main',
              }] : []),
              ...(proctorChunks.length > 0 && !hasCombinedProctor ? [{
                fileId: 'chunks',
                fileName: `${proctorChunks.length} chunks`,
                webViewLink: null,
                deviceType: 'proctor',
              }] : []),
            ],
          });
        }
      }
    }

    res.json({
      success: true,
      recordings,
    });
  } catch (error) {
    console.error('Get recordings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings',
    });
  }
};

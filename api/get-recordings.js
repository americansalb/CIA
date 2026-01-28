const { getDrive } = require('../utils/google-auth');

// Helper to list ALL files with pagination
async function listAllFiles(drive, query, fields) {
  const allFiles = [];
  let pageToken = null;

  do {
    const response = await drive.files.list({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    allFiles.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

module.exports = async (req, res) => {
  try {
    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Step 1: Get all student folders (with pagination)
    const studentFolders = await listAllFiles(
      drive,
      `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id, name, createdTime'
    );

    console.log(`[Recordings] Found ${studentFolders.length} student folders`);

    // Step 2: Get all session folders IN PARALLEL
    const sessionFolderPromises = studentFolders.map(async (studentFolder) => {
      const sessions = await listAllFiles(
        drive,
        `'${studentFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        'id, name, createdTime'
      );
      return sessions.map(s => ({ ...s, studentFolder }));
    });

    const sessionFoldersNested = await Promise.all(sessionFolderPromises);
    const allSessionFolders = sessionFoldersNested.flat();

    console.log(`[Recordings] Found ${allSessionFolders.length} session folders`);

    // Step 3: Get files from all sessions IN PARALLEL (batched to avoid rate limits)
    const BATCH_SIZE = 20;
    const recordings = [];

    for (let i = 0; i < allSessionFolders.length; i += BATCH_SIZE) {
      const batch = allSessionFolders.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (sessionInfo) => {
        const sessionFolder = sessionInfo;
        const studentFolder = sessionInfo.studentFolder;

        try {
          const files = await listAllFiles(
            drive,
            `'${sessionFolder.id}' in parents and trashed=false`,
            'id, name, createdTime, webViewLink, mimeType'
          );

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

            // Check which videos have been converted
            const convertedFiles = videoFiles.filter(f => f.name.includes('_CONVERTED_'));
            const unconvertedWebms = videoFiles.filter(f =>
              f.name.endsWith('.webm') &&
              !f.name.includes('_CONVERTED_') &&
              !convertedFiles.some(cf =>
                cf.name.replace('_CONVERTED_', '_').replace('.mp4', '.webm') === f.name
              )
            );

            return {
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
            };
          } else if (chunkFiles.length > 0) {
            // Incomplete recording
            const folderParts = studentFolder.name.split('_');
            const email = folderParts.slice(0, -1).join('_');
            const studentId = folderParts[folderParts.length - 1];

            const mainChunks = chunkFiles.filter(f => f.name.includes('main_chunk_'));
            const proctorChunks = chunkFiles.filter(f => f.name.includes('proctor_chunk_'));
            const combinedVideos = files.filter(f => f.name.includes('COMBINED_'));
            const hasCombinedMain = combinedVideos.some(f => f.name.includes('COMBINED_main'));
            const hasCombinedProctor = combinedVideos.some(f => f.name.includes('COMBINED_proctor'));

            const earliestChunk = chunkFiles.sort((a, b) =>
              new Date(a.createdTime) - new Date(b.createdTime)
            )[0];

            const chunkCount = {};
            if (mainChunks.length > 0 && !hasCombinedMain) {
              chunkCount.main = mainChunks.length;
            }
            if (proctorChunks.length > 0 && !hasCombinedProctor) {
              chunkCount.proctor = proctorChunks.length;
            }

            return {
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
                ...combinedVideos.map(v => ({
                  fileId: v.id,
                  fileName: v.name,
                  webViewLink: v.webViewLink,
                  deviceType: v.name.includes('_main') ? 'main' : 'proctor',
                  isCombined: true,
                })),
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
            };
          }

          return null;
        } catch (err) {
          console.error(`Error processing session ${sessionFolder.name}:`, err.message);
          return null;
        }
      }));

      recordings.push(...batchResults.filter(r => r !== null));
    }

    console.log(`[Recordings] Returning ${recordings.length} recordings`);

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

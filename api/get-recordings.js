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

// Helper to parse student info from folder name (format: email_studentId)
function parseStudentFolder(folderName) {
  const folderParts = folderName.split('_');
  return {
    email: folderParts.slice(0, -1).join('_'),
    studentId: folderParts[folderParts.length - 1],
  };
}

// Helper to extract test name from a FINAL video filename
// Format: email_studentId_testName_deviceType_FINAL_timestamp.ext
function extractTestName(fileName, email, studentId) {
  const beforeFinal = fileName.split('_FINAL_')[0];
  const prefix = `${email}_${studentId}_`;
  if (beforeFinal.startsWith(prefix)) {
    const remainder = beforeFinal.slice(prefix.length);
    const parts = remainder.split('_');
    if (parts.length >= 2) {
      // Last part is deviceType (main/proctor), everything before is test name
      return parts.slice(0, -1).join('_');
    }
  }
  return 'Unknown';
}

// Walk Drive and build the recording list. Split out from the route handler so
// the results sheet can be rebuilt from the same source the admin panel reads,
// rather than a second, drifting copy of this traversal.
async function collectRecordings() {
    const drive = await getDrive();
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Step 1: Get all student folders (with pagination)
    const studentFolders = await listAllFiles(
      drive,
      `'${mainFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id, name, createdTime'
    );

    console.log(`[Recordings] Found ${studentFolders.length} student folders`);

    // Group student folders by name — race conditions in findOrCreateFolder can
    // create duplicate folders with the same name but different IDs, scattering
    // files across them. We merge duplicates so no recordings are lost.
    const studentGroups = new Map();
    for (const f of studentFolders) {
      if (!studentGroups.has(f.name)) studentGroups.set(f.name, []);
      studentGroups.get(f.name).push(f);
    }

    console.log(`[Recordings] ${studentGroups.size} unique students (${studentFolders.length} folders)`);

    // Step 2: For each student, get session folders from ALL duplicate student
    // folders, then group sessions by name to merge duplicates at that level too.
    const sessionGroupPromises = [...studentGroups.entries()].map(async ([studentName, folders]) => {
      const allSessions = [];
      for (const studentFolder of folders) {
        const sessions = await listAllFiles(
          drive,
          `'${studentFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          'id, name, createdTime'
        );
        allSessions.push(...sessions);
      }

      // Group session folders by name (session ID) to merge duplicates
      const sessionMap = new Map();
      for (const s of allSessions) {
        if (!sessionMap.has(s.name)) sessionMap.set(s.name, []);
        sessionMap.get(s.name).push(s);
      }

      return [...sessionMap.entries()].map(([sessionName, sessionFolders]) => ({
        sessionName,
        sessionFolders,           // All folder instances for this session (may be >1)
        studentFolderName: studentName,
      }));
    });

    const sessionGroupsNested = await Promise.all(sessionGroupPromises);
    const allSessionGroups = sessionGroupsNested.flat();

    console.log(`[Recordings] Found ${allSessionGroups.length} unique sessions`);

    // Step 3: Get files from all sessions IN PARALLEL (batched to avoid rate limits)
    const BATCH_SIZE = 20;
    const recordings = [];

    for (let i = 0; i < allSessionGroups.length; i += BATCH_SIZE) {
      const batch = allSessionGroups.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (sessionGroup) => {
        try {
          // Fetch files from ALL duplicate session folders and merge them
          const files = [];
          for (const folder of sessionGroup.sessionFolders) {
            const folderFiles = await listAllFiles(
              drive,
              `'${folder.id}' in parents and trashed=false`,
              'id, name, createdTime, webViewLink, mimeType'
            );
            files.push(...folderFiles);
          }

          // Use the first session folder ID for reference (e.g. for combine-chunks)
          const sessionFolderId = sessionGroup.sessionFolders[0].id;
          const sessionName = sessionGroup.sessionName;
          const studentFolderName = sessionGroup.studentFolderName;

          const metadataFile = files.find(f => f.name.endsWith('_metadata.json'));
          // Match video files by MIME type OR filename extension to catch files
          // uploaded with non-standard MIME types (e.g. application/octet-stream)
          const videoFiles = files.filter(f => f.name.includes('_FINAL_') && (
            f.mimeType === 'video/webm' || f.mimeType === 'video/mp4' ||
            f.name.endsWith('.webm') || f.name.endsWith('.mp4')
          ));
          const chunkFiles = files.filter(f => f.name.includes('_chunk_'));

          if (metadataFile) {
            // Try to download and parse metadata
            let metadata = null;
            try {
              const metadataResponse = await drive.files.get({
                fileId: metadataFile.id,
                alt: 'media',
                supportsAllDrives: true,
              });

              metadata = metadataResponse.data;
              // Handle case where response is a string instead of parsed JSON
              if (typeof metadata === 'string') {
                metadata = JSON.parse(metadata);
              }
            } catch (metaErr) {
              console.error(`[Recordings] Failed to read metadata for session ${sessionName}:`, metaErr.message);
            }

            if (metadata && typeof metadata === 'object') {
              // Complete recording with valid metadata
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
                studentFolder: studentFolderName,
                sessionFolder: sessionName,
                sessionFolderId: sessionFolderId,
                videos: videoFiles.map(v => ({
                  fileId: v.id,
                  fileName: v.name,
                  webViewLink: v.webViewLink,
                  mimeType: v.mimeType,
                  deviceType: v.name.includes('_main_') ? 'main' : 'proctor',
                  needsConversion: unconvertedWebms.some(u => u.id === v.id),
                })),
              };
            }

            // Metadata download/parse failed — fall through to file-based detection
            console.warn(`[Recordings] Metadata unreadable for session ${sessionName}, using file-based detection`);
          }

          // No valid metadata — build recording entry from available files
          const { email, studentId } = parseStudentFolder(studentFolderName);
          const combinedVideos = files.filter(f => f.name.includes('COMBINED_'));
          const hasCombinedMain = combinedVideos.some(f => f.name.includes('COMBINED_main'));
          const hasCombinedProctor = combinedVideos.some(f => f.name.includes('COMBINED_proctor'));

          const mainChunks = chunkFiles.filter(f => f.name.includes('main_chunk_'));
          const proctorChunks = chunkFiles.filter(f => f.name.includes('proctor_chunk_'));

          // Skip truly empty session folders
          if (chunkFiles.length === 0 && videoFiles.length === 0 && combinedVideos.length === 0) {
            return null;
          }

          const earliestFile = [...chunkFiles, ...videoFiles].sort((a, b) =>
            new Date(a.createdTime) - new Date(b.createdTime)
          )[0];

          // Try to extract test name from FINAL video filenames
          let permittedTest = 'Unknown';
          if (videoFiles.length > 0) {
            permittedTest = extractTestName(videoFiles[0].name, email, studentId);
          }

          const chunkCount = {};
          if (mainChunks.length > 0 && !hasCombinedMain) {
            chunkCount.main = mainChunks.length;
          }
          if (proctorChunks.length > 0 && !hasCombinedProctor) {
            chunkCount.proctor = proctorChunks.length;
          }

          const mainFinal = videoFiles.filter(f => f.name.includes('_main_'));
          const proctorFinal = videoFiles.filter(f => f.name.includes('_proctor_'));
          const hasFinalVideos = videoFiles.length > 0;

          return {
            sessionId: sessionName,
            email: email,
            studentId: studentId,
            permittedTest: permittedTest,
            duration: 'incomplete',
            interventionCount: 0,
            interventions: [],
            uploadedAt: earliestFile ? earliestFile.createdTime : sessionGroup.sessionFolders[0].createdTime,
            status: hasFinalVideos ? 'pending_review' : 'incomplete',
            studentFolder: studentFolderName,
            sessionFolder: sessionName,
            sessionFolderId: sessionFolderId,
            chunkCount: Object.keys(chunkCount).length > 0 ? chunkCount : null,
            videos: [
              // Include FINAL videos
              ...mainFinal.map(v => ({
                fileId: v.id,
                fileName: v.name,
                webViewLink: v.webViewLink,
                mimeType: v.mimeType,
                deviceType: 'main',
              })),
              ...proctorFinal.map(v => ({
                fileId: v.id,
                fileName: v.name,
                webViewLink: v.webViewLink,
                mimeType: v.mimeType,
                deviceType: 'proctor',
              })),
              // Include combined videos
              ...combinedVideos.map(v => ({
                fileId: v.id,
                fileName: v.name,
                webViewLink: v.webViewLink,
                deviceType: v.name.includes('_main') ? 'main' : 'proctor',
                isCombined: true,
              })),
              // Include chunk references only if not already combined or finalized
              ...(mainChunks.length > 0 && !hasCombinedMain && mainFinal.length === 0 ? [{
                fileId: 'chunks',
                fileName: `${mainChunks.length} chunks`,
                webViewLink: null,
                deviceType: 'main',
              }] : []),
              ...(proctorChunks.length > 0 && !hasCombinedProctor && proctorFinal.length === 0 ? [{
                fileId: 'chunks',
                fileName: `${proctorChunks.length} chunks`,
                webViewLink: null,
                deviceType: 'proctor',
              }] : []),
            ],
          };
        } catch (err) {
          console.error(`Error processing session ${sessionGroup.sessionName}:`, err.message);
          return null;
        }
      }));

      recordings.push(...batchResults.filter(r => r !== null));
    }

    return recordings;
}

module.exports = async (req, res) => {
  try {
    const recordings = await collectRecordings();

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

module.exports.collectRecordings = collectRecordings;

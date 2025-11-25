const { getDrive } = require('./google-auth');
const fs = require('fs');
const path = require('path');

async function findOrCreateFolder(parentFolderId, folderName) {
  try {
    const drive = await getDrive();

    // Search for existing folder
    const query = `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const searchResponse = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id;
    }

    // Create new folder
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    });

    return folder.data.id;
  } catch (error) {
    console.error(`Drive API error in findOrCreateFolder(${parentFolderId}, ${folderName}):`, error.message);
    throw new Error(`Failed to create/find folder "${folderName}": ${error.message}`);
  }
}

async function uploadFile(filePath, fileName, folderId, mimeType = 'video/webm') {
  const drive = await getDrive();

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath),
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  return {
    fileId: file.data.id,
    fileName: file.data.name,
    webViewLink: file.data.webViewLink,
  };
}

async function uploadBuffer(buffer, fileName, folderId, mimeType = 'video/webm') {
  try {
    const drive = await getDrive();
    const { Readable } = require('stream');

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    return {
      fileId: file.data.id,
      fileName: file.data.name,
      webViewLink: file.data.webViewLink,
    };
  } catch (error) {
    console.error(`Drive API error in uploadBuffer(${fileName}, ${folderId}):`, error.message);
    throw new Error(`Failed to upload file "${fileName}": ${error.message}`);
  }
}

async function listRecordings(folderId) {
  const drive = await getDrive();

  const query = `'${folderId}' in parents and trashed=false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, createdTime, webViewLink, mimeType)',
    orderBy: 'createdTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.files || [];
}

module.exports = {
  findOrCreateFolder,
  uploadFile,
  uploadBuffer,
  listRecordings,
};

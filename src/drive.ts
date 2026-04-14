function listDriveFiles(folderId?: string, max?: string): { id: string; name: string; type: string; size: string | null; updated: string }[] {
  const limit = parseInt(max || "20");
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  const result: { id: string; name: string; type: string; size: string | null; updated: string }[] = [];

  const folders = folder.getFolders();
  while (folders.hasNext() && result.length < limit) {
    const f = folders.next();
    result.push({ id: f.getId(), name: f.getName(), type: "folder", size: null, updated: f.getLastUpdated().toISOString() });
  }

  const files = folder.getFiles();
  while (files.hasNext() && result.length < limit) {
    const f = files.next();
    result.push({ id: f.getId(), name: f.getName(), type: f.getMimeType(), size: String(f.getSize()), updated: f.getLastUpdated().toISOString() });
  }

  return result;
}

function downloadFile(fileId: string): { name: string; mimeType: string; content: string } {
  const file = DriveApp.getFileById(fileId);
  return { name: file.getName(), mimeType: file.getMimeType(), content: file.getBlob().getDataAsString() };
}

function uploadFile(folderId: string, name: string, data: string, isBase64?: boolean, mimeType?: string): { id: string; name: string; folder: string } {
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  const blob = isBase64
    ? Utilities.newBlob(Utilities.base64Decode(data), mimeType || "application/octet-stream", name)
    : Utilities.newBlob(data, mimeType || "text/plain", name);
  const file = folder.createFile(blob);
  return { id: file.getId(), name: file.getName(), folder: folder.getName() };
}

function moveFile(fileId: string, destFolderId: string): { id: string; name: string; folder: string } {
  const file = DriveApp.getFileById(fileId);
  const dest = DriveApp.getFolderById(destFolderId);
  file.moveTo(dest);
  return { id: file.getId(), name: file.getName(), folder: dest.getName() };
}

function copyFile(fileId: string, destFolderId?: string, name?: string): { id: string; name: string; folder: string } {
  const src = DriveApp.getFileById(fileId);
  const dest = destFolderId ? DriveApp.getFolderById(destFolderId) : src.getParents().next();
  const copy = src.makeCopy(name || src.getName(), dest);
  return { id: copy.getId(), name: copy.getName(), folder: dest.getName() };
}

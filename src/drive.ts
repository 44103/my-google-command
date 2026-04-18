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

function createShortcut(targetId: string, folderId?: string): { id: string; name: string; folder: string } {
  const target = DriveApp.getFileById(targetId);
  const folder = folderId ? DriveApp.getFolderById(folderId) : target.getParents().next();
  const res = Drive.Files!.create({
    name: target.getName(),
    mimeType: "application/vnd.google-apps.shortcut",
    shortcutDetails: { targetId },
    parents: [folder.getId()],
  });
  return { id: res.id!, name: res.name!, folder: folder.getName() };
}

function renameFile(fileId: string, name: string): { id: string; name: string } {
  const file = DriveApp.getFileById(fileId);
  file.setName(name);
  return { id: file.getId(), name: file.getName() };
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

function listRevisions(fileId: string, max = 20): { name: string; revisions: { id: string; modifiedTime: string; lastModifyingUser: string }[] } {
  const file = DriveApp.getFileById(fileId);
  const res = Drive.Revisions!.list(fileId, { maxResults: max, fields: "items(id,modifiedDate,lastModifyingUser(displayName,emailAddress))" });
  const revisions = ((res as any).items || []).map((r: any) => ({
    id: r.id!,
    modifiedTime: r.modifiedDate!,
    lastModifyingUser: r.lastModifyingUser?.displayName || r.lastModifyingUser?.emailAddress || "unknown",
  }));
  return { name: file.getName(), revisions };
}

function getRevisionContent(fileId: string, revisionId: string): string {
  const file = DriveApp.getFileById(fileId);
  const mime = file.getMimeType();
  let exportMime = "text/plain";
  if (mime === "application/vnd.google-apps.spreadsheet") exportMime = "text/csv";

  const rev = Drive.Revisions!.get(fileId, revisionId) as any;
  const exportLinks: Record<string, string> = rev.exportLinks || {};
  const url = exportLinks[exportMime] || exportLinks["text/plain"] || rev.downloadUrl;
  if (!url) throw new Error("No download URL available for this revision");

  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error("Failed to fetch revision: " + resp.getContentText());
  return resp.getContentText();
}

function diffRevisions(fileId: string, rev1: string, rev2: string): { name: string; rev1: string; rev2: string; diff: { type: string; line: string }[] } {
  const file = DriveApp.getFileById(fileId);
  const c1 = getRevisionContent(fileId, rev1).split("\n");
  const c2 = getRevisionContent(fileId, rev2).split("\n");

  // Simple line-by-line diff
  const diff: { type: string; line: string }[] = [];
  const max = Math.max(c1.length, c2.length);
  for (let i = 0; i < max; i++) {
    const a = i < c1.length ? c1[i] : undefined;
    const b = i < c2.length ? c2[i] : undefined;
    if (a === b) continue;
    if (a !== undefined && b !== undefined) {
      diff.push({ type: "-", line: a }, { type: "+", line: b });
    } else if (a !== undefined) {
      diff.push({ type: "-", line: a });
    } else {
      diff.push({ type: "+", line: b! });
    }
  }
  return { name: file.getName(), rev1, rev2, diff };
}

function searchFiles(query: string, max = 20): { id: string; name: string; type: string; updated: string }[] {
  const files = DriveApp.searchFiles("title contains '" + query.replace(/'/g, "\\'") + "'");
  const result: { id: string; name: string; type: string; updated: string }[] = [];
  while (files.hasNext() && result.length < max) {
    const f = files.next();
    result.push({ id: f.getId(), name: f.getName(), type: f.getMimeType(), updated: f.getLastUpdated().toISOString() });
  }
  return result;
}

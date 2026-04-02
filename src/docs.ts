function listDocs(): { id: string; name: string; url: string; lastUpdated: string }[] {
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_DOCS);
  const result: { id: string; name: string; url: string; lastUpdated: string }[] = [];
  while (files.hasNext()) {
    const f = files.next();
    result.push({
      id: f.getId(),
      name: f.getName(),
      url: f.getUrl(),
      lastUpdated: f.getLastUpdated().toISOString(),
    });
  }
  return result;
}

function getDocContent(id: string): { name: string; body: string } {
  const doc = DocumentApp.openById(id);
  return {
    name: doc.getName(),
    body: doc.getBody().getText(),
  };
}

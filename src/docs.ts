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

function createDoc(name: string, text?: string, format?: string): { id: string; name: string; url: string; body: string } {
  const doc = DocumentApp.create(name);
  if (text) {
    if (format === "markdown") {
      writeMarkdownToBody(doc.getBody(), text);
    } else {
      doc.getBody().appendParagraph(text);
    }
  }
  doc.saveAndClose();
  const updated = DocumentApp.openById(doc.getId());
  return { id: updated.getId(), name: updated.getName(), url: updated.getUrl(), body: updated.getBody().getText() };
}

function appendDoc(id: string, text: string, format?: string): { name: string; body: string } {
  const doc = DocumentApp.openById(id);
  if (format === "markdown") {
    writeMarkdownToBody(doc.getBody(), text);
  } else {
    doc.getBody().appendParagraph(text);
  }
  doc.saveAndClose();
  const updated = DocumentApp.openById(id);
  return { name: updated.getName(), body: updated.getBody().getText() };
}

function overwriteDoc(id: string, text: string, format?: string): { name: string; body: string } {
  const doc = DocumentApp.openById(id);
  doc.getBody().clear();
  if (format === "markdown") {
    writeMarkdownToBody(doc.getBody(), text);
  } else {
    doc.getBody().appendParagraph(text);
  }
  doc.saveAndClose();
  const updated = DocumentApp.openById(id);
  return { name: updated.getName(), body: updated.getBody().getText() };
}

function listDocs(max = 20): { id: string; name: string; url: string; lastUpdated: string }[] {
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_DOCS);
  const result: { id: string; name: string; url: string; lastUpdated: string }[] = [];
  while (files.hasNext() && result.length < max) {
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

function getTabBody(doc: GoogleAppsScript.Document.Document, tabId: string): GoogleAppsScript.Document.Body {
  const tab = doc.getTabs().find((t) => t.getId() === tabId);
  if (!tab) throw new Error(`Tab not found: ${tabId}`);
  return tab.asDocumentTab().getBody();
}

function appendDoc(id: string, text: string, format?: string, tab?: string): { name: string; body: string } {
  if (tab && format !== "markdown") {
    return appendDocTab(id, tab, text);
  }
  const doc = DocumentApp.openById(id);
  const body = tab ? getTabBody(doc, tab) : doc.getBody();
  if (format === "markdown") {
    writeMarkdownToBody(body, text);
  } else {
    body.appendParagraph(text);
  }
  doc.saveAndClose();
  const updated = DocumentApp.openById(id);
  const updatedBody = tab ? getTabBody(updated, tab) : updated.getBody();
  return { name: updated.getName(), body: updatedBody.getText() };
}

function overwriteDoc(id: string, text: string, format?: string, tab?: string): { name: string; body: string } {
  if (tab && format !== "markdown") {
    return overwriteDocTab(id, tab, text);
  }
  const doc = DocumentApp.openById(id);
  const body = tab ? getTabBody(doc, tab) : doc.getBody();

  // Append new content first, then remove old elements
  const oldCount = body.getNumChildren();
  if (format === "markdown") {
    writeMarkdownToBody(body, text);
  } else {
    body.appendParagraph(text);
  }
  // Remove old elements (iterate backwards to keep indices stable)
  for (let i = oldCount - 1; i >= 0; i--) {
    body.removeChild(body.getChild(i));
  }

  doc.saveAndClose();
  const updated = DocumentApp.openById(id);
  const updatedBody = tab ? getTabBody(updated, tab) : updated.getBody();
  return { name: updated.getName(), body: updatedBody.getText() };
}

function appendDocTab(id: string, tabId: string, text: string): { name: string; body: string } {
  const docData = Docs.Documents!.get(id, { includeTabsContent: true } as any) as any;
  const tabData = docData.tabs.find((t: any) => t.tabProperties.tabId === tabId);
  const endIndex = tabData.documentTab.body.content.slice(-1)[0].endIndex;
  Docs.Documents!.batchUpdate(
    { requests: [{ insertText: { text: "\n" + text, location: { index: endIndex - 1, tabId } as any } }] },
    id,
  );
  const name = DocumentApp.openById(id).getName();
  return { name, body: text };
}

function overwriteDocTab(id: string, tabId: string, text: string): { name: string; body: string } {
  const docData = Docs.Documents!.get(id, { includeTabsContent: true } as any) as any;
  const tabData = docData.tabs.find((t: any) => t.tabProperties.tabId === tabId);
  const endIndex = tabData.documentTab.body.content.slice(-1)[0].endIndex;
  const requests: any[] = [];
  if (endIndex > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1, tabId } } });
  }
  requests.push({ insertText: { text, location: { index: 1, tabId } } });
  Docs.Documents!.batchUpdate({ requests }, id);
  const name = DocumentApp.openById(id).getName();
  return { name, body: text };
}

function listDocTabs(id: string): { id: string; title: string }[] {
  const doc = DocumentApp.openById(id);
  return doc.getTabs().map((tab) => ({
    id: tab.getId(),
    title: tab.getTitle(),
  }));
}

function addDocTab(id: string, name: string, index?: number, parentTabId?: string): { tabId: string; title: string } {
  const tabProperties: any = { title: name };
  if (index !== undefined) tabProperties.index = index;
  if (parentTabId) tabProperties.parentTabId = parentTabId;
  const response = Docs.Documents!.batchUpdate(
    { requests: [{ addDocumentTab: { tabProperties } } as any] },
    id,
  );
  const props = (response.replies![0] as any).addDocumentTab.tabProperties;
  return { tabId: props.tabId, title: props.title };
}

function renameDocTab(id: string, tabId: string, title: string): { tabId: string; title: string } {
  Docs.Documents!.batchUpdate(
    { requests: [{ updateDocumentTabProperties: { tabProperties: { tabId, title }, fields: "title" } } as any] },
    id,
  );
  return { tabId, title };
}

function moveDocTab(id: string, tabId: string, index: number, parentTabId?: string): { tabId: string; index: number; parentTabId: string } {
  const tabProperties: any = { tabId, index };
  let fields = "index";
  if (parentTabId !== undefined) {
    tabProperties.parentTabId = parentTabId;
    fields = "index,parentTabId";
  }
  Docs.Documents!.batchUpdate(
    { requests: [{ updateDocumentTabProperties: { tabProperties, fields } } as any] },
    id,
  );
  return { tabId, index, parentTabId: parentTabId || "" };
}

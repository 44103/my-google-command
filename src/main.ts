function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput {
  const action = e.parameter.action;
  try {
    if (action === "auth") {
      const token = ScriptApp.getOAuthToken();
      return HtmlService.createHtmlOutput(`
        <style>body{font-family:sans-serif;max-width:600px;margin:40px auto}pre{background:#f5f5f5;padding:12px;word-break:break-all;white-space:pre-wrap}button{padding:8px 16px;font-size:14px;cursor:pointer}</style>
        <h2>Access Token</h2>
        <pre id="t">${token}</pre>
        <button onclick="navigator.clipboard.writeText(document.getElementById('t').textContent).then(()=>{this.textContent='✓ Copied!';this.disabled=true})">📋 Copy Token</button>
      `).setTitle("GAS Auth");
    }

    let result: unknown;
    switch (action) {
      case "spreadsheets":
        result = listSpreadsheets(parseInt(e.parameter.max || "20"));
        break;
      case "spreadsheet":
        result = listSheets(resolveId(e.parameter));
        break;
      case "sheet":
        result = getSheetData(resolveId(e.parameter), e.parameter.name);
        break;
      case "docs":
        result = listDocs(parseInt(e.parameter.max || "20"));
        break;
      case "doc":
        result = getDocContent(resolveId(e.parameter));
        break;
      case "mails":
        result = listMails(e.parameter.q, e.parameter.max);
        break;
      case "mail":
        result = getMail(e.parameter.id);
        break;
      case "tasklists":
        result = listTaskLists();
        break;
      case "tasks":
        result = listTasks(e.parameter.id);
        break;
      case "calendars":
        result = listCalendars();
        break;
      case "events":
        result = listEvents(e.parameter.id, e.parameter.from, e.parameter.to);
        break;
      case "mail:filters":
        result = listFilters();
        break;
      default:
        result = { error: "Unknown action", available: ["spreadsheets", "spreadsheet", "sheet", "docs", "doc", "mails", "mail", "mail:filters", "tasklists", "tasks", "calendars", "events", "auth"] };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ContentService.createTextOutput(JSON.stringify({ error: msg })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result: unknown;
    switch (action) {
      case "doc:create":
        result = createDoc(body.name, body.text, body.format);
        break;
      case "doc:append":
        result = appendDoc(resolveId(body), body.text, body.format);
        break;
      case "doc:overwrite":
        result = overwriteDoc(resolveId(body), body.text, body.format);
        break;
      case "sheet:write":
        result = writeSheet(resolveId(body), body.name, body.range, body.text);
        break;
      case "sheet:create":
        result = createSheet(resolveId(body), body.name);
        break;
      case "task:create":
        result = createTask(body.id, body.title, body.due, body.notes);
        break;
      case "task:update":
        result = updateTask(body.id, body.task, { title: body.title, due: body.due, notes: body.notes });
        break;
      case "task:done":
        result = completeTask(body.id, body.task);
        break;
      case "task:delete":
        result = deleteTask(body.id, body.task);
        break;
      case "event:create":
        result = createEvent(body.id, body.title, body.start, body.end, body.location);
        break;
      case "mail:draft":
        if (body.id) {
          result = updateDraft(body.id, body.to, body.subject, body.text);
        } else {
          result = createDraft(body.to, body.subject, body.text);
        }
        break;
      case "mail:draft:delete":
        result = deleteDraft(body.id);
        break;
      case "mail:label":
        result = labelMails(body.query, body.label, body.skipInbox === "true" || body.skipInbox === true);
        break;
      case "mail:filter:create":
        result = createFilter(body.query, body.label, body.skipInbox === "true" || body.skipInbox === true);
        break;
      case "mail:filter:delete":
        result = deleteFilter(body.id);
        break;
      default:
        result = { error: "Unknown action", available: ["doc:create", "doc:append", "doc:overwrite", "sheet:write", "sheet:create", "task:create", "task:update", "task:done", "task:delete", "event:create", "mail:draft", "mail:draft:delete", "mail:filter:create", "mail:filter:delete"] };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ContentService.createTextOutput(JSON.stringify({ error: msg })).setMimeType(ContentService.MimeType.JSON);
  }
}

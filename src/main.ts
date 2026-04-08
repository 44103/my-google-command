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
        result = listSpreadsheets();
        break;
      case "spreadsheet":
        result = listSheets(resolveId(e.parameter));
        break;
      case "sheet":
        result = getSheetData(resolveId(e.parameter), e.parameter.name);
        break;
      case "docs":
        result = listDocs();
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
      default:
        result = { error: "Unknown action", available: ["spreadsheets", "spreadsheet", "sheet", "docs", "doc", "mails", "mail", "tasklists", "tasks", "calendars", "events", "auth"] };
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
      case "task:create":
        result = createTask(body.id, body.title, body.due);
        break;
      case "task:done":
        result = completeTask(body.id, body.task);
        break;
      case "event:create":
        result = createEvent(body.id, body.title, body.start, body.end, body.location);
        break;
      default:
        result = { error: "Unknown action", available: ["doc:create", "doc:append", "doc:overwrite", "sheet:write", "task:create", "task:done", "event:create"] };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ContentService.createTextOutput(JSON.stringify({ error: msg })).setMimeType(ContentService.MimeType.JSON);
  }
}

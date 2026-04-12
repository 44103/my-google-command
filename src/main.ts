function doGet(
  e: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput {
  const action = e.parameter.action;
  try {
    if (action === "auth") {
      const token = ScriptApp.getOAuthToken();
      return HtmlService.createHtmlOutput(
        `
        <style>body{font-family:sans-serif;max-width:600px;margin:40px auto}pre{background:#f5f5f5;padding:12px;word-break:break-all;white-space:pre-wrap}button{padding:8px 16px;font-size:14px;cursor:pointer}</style>
        <h2>Access Token</h2>
        <pre id="t">${token}</pre>
        <button onclick="navigator.clipboard.writeText(document.getElementById('t').textContent).then(()=>{this.textContent='✓ Copied!';this.disabled=true})">📋 Copy Token</button>
      `,
      ).setTitle("GAS Auth");
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
      case "event:freebusy":
        result = findFreeSlots(e.parameter.emails, e.parameter.from, e.parameter.to, e.parameter.duration);
        break;
      case "mail:filters":
        result = listFilters();
        break;
      case "files":
        result = listDriveFiles(e.parameter.id, e.parameter.max);
        break;
      case "file":
        result = downloadFile(e.parameter.id);
        break;
      case "slides":
        result = listSlides(parseInt(e.parameter.max || "20"));
        break;
      case "slide":
        result = getSlideContent(resolveId(e.parameter), e.parameter.page);
        break;
      case "forms":
        result = listForms(parseInt(e.parameter.max || "20"));
        break;
      case "form":
        result = getFormDetail(resolveId(e.parameter));
        break;
      case "form:responses":
        result = getFormResponses(resolveId(e.parameter));
        break;
      case "contacts":
        result = listContacts(parseInt(e.parameter.max || "20"));
        break;
      case "contacts:search":
        result = listDirectoryPeople(e.parameter.q, parseInt(e.parameter.max || "20"));
        break;
      case "contact":
        result = getContact(e.parameter.id);
        break;
      default:
        result = {
          error: "Unknown action",
          available: [
            "spreadsheets",
            "spreadsheet",
            "sheet",
            "docs",
            "doc",
            "mails",
            "mail",
            "mail:filters",
            "files",
            "file",
            "slides",
            "slide",
            "tasklists",
            "tasks",
            "calendars",
            "events",
            "auth",
          ],
        };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ContentService.createTextOutput(
      JSON.stringify({ error: msg }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(
  e: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
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
        result = updateTask(body.id, body.task, {
          title: body.title,
          due: body.due,
          notes: body.notes,
        });
        break;
      case "task:done":
        result = completeTask(body.id, body.task);
        break;
      case "task:delete":
        result = deleteTask(body.id, body.task);
        break;
      case "event:create":
        result = createEvent(
          body.id,
          body.title,
          body.start,
          body.end,
          body.location,
        );
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
        result = labelMails(
          body.query,
          body.label,
          body.skipInbox === "true" || body.skipInbox === true,
        );
        break;
      case "mail:filter:create":
        result = createFilter(
          body.query,
          body.label,
          body.skipInbox === "true" || body.skipInbox === true,
        );
        break;
      case "mail:filter:delete":
        result = deleteFilter(body.id);
        break;
      case "file:upload":
        result = uploadFile(
          body.folder,
          body.name,
          body.data,
          body.isBase64 === "true" || body.isBase64 === true,
          body.mimeType,
        );
        break;
      case "file:move":
        result = moveFile(body.id, body.folder);
        break;
      case "slide:create":
        result = body.format === "markdown" && body.text
          ? createSlideFromMarkdown(body.name, body.text)
          : createSlide(body.name);
        break;
      case "slide:addpage":
        result = addSlidePage(resolveId(body));
        break;
      case "slide:addtext":
        result = addSlideText(resolveId(body), body.page, body.text);
        break;
      case "slide:overwrite":
        result = overwriteSlideFromMarkdown(resolveId(body), body.text);
        break;
      case "form:create":
        result = createForm(body.name, body.description);
        break;
      case "form:additem":
        result = addFormItem(resolveId(body), body.type, body.title, {
          choices: body.choices, required: body.required === "true" || body.required === true,
          low: body.low, high: body.high, lowLabel: body.lowLabel, highLabel: body.highLabel,
        });
        break;
      default:
        result = {
          error: "Unknown action",
          available: [
            "doc:create",
            "doc:append",
            "doc:overwrite",
            "sheet:write",
            "sheet:create",
            "task:create",
            "task:update",
            "task:done",
            "task:delete",
            "event:create",
            "mail:draft",
            "mail:draft:delete",
            "mail:label",
            "mail:filter:create",
            "mail:filter:delete",
            "file:upload",
            "file:move",
            "slide:create",
            "slide:addpage",
            "slide:addtext",
          ],
        };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ContentService.createTextOutput(
      JSON.stringify({ error: msg }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

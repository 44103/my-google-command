// Run this function manually in GAS editor to trigger scope authorization
function authorizeScopes() {
  UrlFetchApp.fetch("https://www.google.com");
  Drive.Revisions!.list("dummy");
}

function doGet(
  e: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.Content.TextOutput | GoogleAppsScript.HTML.HtmlOutput {
  const action = e.parameter.action;
  try {
    if (action === "auth") {
      const tmpl = HtmlService.createTemplateFromFile("auth");
      tmpl.token = ScriptApp.getOAuthToken();
      return tmpl.evaluate().setTitle("GAS Auth");
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
      case "doc:tabs":
        result = listDocTabs(resolveId(e.parameter));
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
      case "tasks:completed":
        result = listCompletedTasks(e.parameter.id);
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
      case "rooms":
        result = listRooms(e.parameter.q);
        break;
      case "mail:filters":
        result = listFilters();
        break;
      case "mail:labels":
        result = listLabels();
        break;
      case "files":
        result = listDriveFiles(e.parameter.id, e.parameter.max);
        break;
      case "files:search":
        result = searchFiles(e.parameter.q, parseInt(e.parameter.max || "20"));
        break;
      case "file":
        result = downloadFile(e.parameter.id);
        break;
      case "file:history":
        result = listRevisions(resolveId(e.parameter), parseInt(e.parameter.max || "20"));
        break;
      case "file:revision":
        result = diffRevisions(resolveId(e.parameter), e.parameter.rev1, e.parameter.rev2);
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
            "file:history",
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
      case "doc:addtab":
        result = addDocTab(resolveId(body), body.name, body.index && body.index !== "" ? parseInt(body.index) : undefined, body.parent || undefined);
        break;
      case "doc:renametab":
        result = renameDocTab(resolveId(body), body.tab, body.name);
        break;
      case "doc:movetab":
        result = moveDocTab(resolveId(body), body.tab, parseInt(body.index), body.parent || undefined);
        break;
      case "doc:append":
        result = appendDoc(resolveId(body), body.text, body.format, body.tab);
        break;
      case "doc:overwrite":
        result = overwriteDoc(resolveId(body), body.text, body.format, body.tab);
        break;
      case "sheet:write":
        result = writeSheet(resolveId(body), body.name, body.range, body.text);
        break;
      case "sheet:create":
        result = createSheet(resolveId(body), body.name);
        break;
      case "spreadsheet:create":
        result = createSpreadsheet(body.name);
        break;
      case "task:create":
        result = createTask(body.id, body.title, body.due, body.notes, body.parent);
        break;
      case "tasklist:create":
        result = createTaskList(body.title);
        break;
      case "tasklist:update":
        result = updateTaskList(body.id, body.title);
        break;
      case "tasklist:delete":
        result = deleteTaskList(body.id);
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
        result = createEvent(body.id, body.title, body.start, body.end, body.location);
        break;
      case "event:update":
        result = updateEvent(body.id, body.event, { title: body.title, start: body.start, end: body.end, location: body.location });
        break;
      case "event:delete":
        result = deleteEvent(body.id, body.event);
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
      case "file:rename":
        result = renameFile(body.id, body.name);
        break;
      case "file:shortcut":
        result = createShortcut(body.id, body.folder);
        break;
      case "file:copy":
        result = copyFile(body.id, body.folder, body.name);
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
            "file:rename",
            "file:shortcut",
            "file:copy",
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

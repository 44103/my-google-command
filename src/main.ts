// config is a global variable defined in config.generated.ts

// GAS global functions - used by GAS runtime, not called directly in code
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
      tmpl.feedbackUrl = config.feedbackUrl || "";
      // callback may be base64-encoded to avoid GAS URL parameter restrictions
      const rawCallback = e.parameter.callback || "";
      try {
        tmpl.callback = rawCallback ? Utilities.newBlob(Utilities.base64Decode(rawCallback)).getDataAsString() : "";
      } catch (_e) {
        // If not base64, use as-is (backwards compatibility)
        tmpl.callback = rawCallback;
      }
      return tmpl.evaluate().setTitle("GAS Auth");
    }

    let result: unknown;
    switch (action) {
      case "feedback":
        result = { url: config.feedbackUrl || null };
        break;
      case "whoami": {
        const about = Drive.About!.get({});
        result = { email: (about as any).user.emailAddress, name: (about as any).user.displayName };
        break;
      }
      case "spreadsheets":
        result = listSpreadsheets(parseInt(e.parameter.max || "20"));
        break;
      case "spreadsheet":
        result = listSheets(resolveId(e.parameter));
        break;
      case "sheet":
        checkAcl(resolveId(e.parameter), "r");
        result = getSheetData(resolveId(e.parameter), e.parameter.name, resolveGid(e.parameter), e.parameter.range, e.parameter.rows ? parseInt(e.parameter.rows) : undefined, e.parameter.colors !== "false");
        break;
      case "sheet:lastrow":
        result = getSheetLastRow(resolveId(e.parameter), e.parameter.name, resolveGid(e.parameter));
        break;
      case "docs":
        result = listDocs(parseInt(e.parameter.max || "20"));
        break;
      case "doc":
        checkAcl(resolveId(e.parameter), "r");
        result = getDocContent(resolveId(e.parameter), e.parameter.tab);
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
      case "event":
        result = getEvent(e.parameter.id, e.parameter.event);
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
        checkAcl(e.parameter.id, "r");
        result = downloadFile(e.parameter.id);
        trackFileAccess(e.parameter.id);
        break;
      case "file:props":
        result = getFileProps(resolveId(e.parameter));
        break;
      case "file:share":
        result = listPermissions(resolveId(e.parameter));
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
        checkAcl(resolveId(e.parameter), "r");
        result = getSlideContent(resolveId(e.parameter), e.parameter.page);
        break;
      case "slide:notes":
        result = getSlideNotes(resolveId(e.parameter), e.parameter.page);
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
      case "comments":
        result = listComments(resolveId(e.parameter));
        break;
      case "sheet:notes":
        result = getNotes(resolveId(e.parameter), e.parameter.name, e.parameter.range || "A1:Z1000");
        break;
      case "gas:info":
        result = getGasInfo(e.parameter.script);
        break;
      case "gas:deployments":
        result = listGasDeployments(e.parameter.script);
        break;
      case "gas:versions":
        result = listGasVersions(e.parameter.script);
        break;
      case "gas:files":
        result = listGasFiles(e.parameter.script);
        break;
      case "gas:file":
        result = getGasFile(e.parameter.script, e.parameter.name);
        break;
      default:
        result = { error: `Unknown action: ${action}` };
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
        if (result && (result as any).id) trackFileCreation((result as any).id);
        break;
      case "doc:addtab":
        result = addDocTab(resolveId(body), body.name, body.index && body.index !== "" ? parseInt(body.index) : undefined, body.parent || undefined);
        break;
      case "doc:renametab":
        result = renameDocTab(resolveId(body), body.tab, body.name);
        break;
      case "doc:copytab":
        result = copyDocTab(resolveId(body), body.tab, body.name, body.index && body.index !== "" ? parseInt(body.index) : undefined);
        break;
      case "doc:movetab":
        result = moveDocTab(resolveId(body), body.tab, parseInt(body.index), body.parent || undefined);
        break;
      case "doc:append":
        checkAcl(resolveId(body), "w");
        result = appendDoc(resolveId(body), body.text, body.format, body.tab);
        trackFileWrite(resolveId(body));
        break;
      case "doc:overwrite":
        checkAcl(resolveId(body), "w");
        result = overwriteDoc(resolveId(body), body.text, body.format, body.tab);
        trackFileWrite(resolveId(body));
        break;
      case "sheet:write":
        checkAcl(resolveId(body), "w");
        result = writeSheet(resolveId(body), body.name, body.range, body.text, body.header === "true" || body.header === true, resolveGid(body));
        trackFileWrite(resolveId(body));
        break;
      case "sheet:create":
        result = createSheet(resolveId(body), body.name);
        break;
      case "sheet:delete":
        result = deleteSheet(resolveId(body), body.name, resolveGid(body));
        break;
      case "sheet:rename":
        result = renameSheet(resolveId(body), body.name, body.newName, resolveGid(body));
        break;
      case "spreadsheet:create":
        result = createSpreadsheet(body.name);
        if (result && (result as any).id) trackFileCreation((result as any).id);
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
        result = createEvent(body.id, body.title, body.start, body.end, body.location, body.color, body.description, body.guests, body.visibility, body.reminders);
        break;
      case "event:update":
        result = updateEvent(body.id, body.event, { title: body.title, start: body.start, end: body.end, location: body.location, color: body.color, description: body.description, guests: body.guests, visibility: body.visibility, reminders: body.reminders });
        break;
      case "event:delete":
        result = deleteEvent(body.id, body.event);
        break;
      case "mail:draft":
        if (body.id) {
          result = updateDraft(body.id, body.to, body.subject, body.text, body.cc, body.bcc);
        } else {
          result = createDraft(body.to, body.subject, body.text, body.cc, body.bcc);
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
          body.markAsRead === "true" || body.markAsRead === true,
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
        if (result && (result as any).id) trackFileCreation((result as any).id);
        break;
      case "file:props:set":
        result = setFileAcl(resolveId(body), body.value);
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
      case "file:share":
        result = addPermission(body.id, body.type, body.role, body.value);
        break;
      case "file:unshare":
        result = removePermission(body.id, body.permission);
        break;
      case "file:mkdir":
        result = createFolder(body.name, body.folder);
        if (result && (result as any).id) trackFileCreation((result as any).id);
        break;
      case "file:delete":
        result = deleteFile(body.id);
        break;
      case "slide:create":
        result = body.format === "markdown" && body.text
          ? createSlideFromMarkdown(body.name, body.text)
          : createSlide(body.name);
        if (result && (result as any).id) trackFileCreation((result as any).id);
        break;
      case "slide:addpage":
        checkAcl(resolveId(body), "w");
        result = addSlidePage(resolveId(body));
        break;
      case "slide:addtext":
        checkAcl(resolveId(body), "w");
        result = addSlideText(resolveId(body), body.page, body.text);
        trackFileWrite(resolveId(body));
        break;
      case "slide:note:set":
        checkAcl(resolveId(body), "w");
        result = setSlideNote(resolveId(body), body.page, body.text);
        trackFileWrite(resolveId(body));
        break;
      case "slide:note:clear":
        checkAcl(resolveId(body), "w");
        result = clearSlideNote(resolveId(body), body.page);
        trackFileWrite(resolveId(body));
        break;
      case "slide:overwrite":
        checkAcl(resolveId(body), "w");
        result = overwriteSlideFromMarkdown(resolveId(body), body.text);
        trackFileWrite(resolveId(body));
        break;
      case "form:create":
        result = createForm(body.name, body.description);
        if (result && (result as any).id) trackFileCreation((result as any).id);
        break;
      case "form:additem":
        result = addFormItem(resolveId(body), body.type, body.title, {
          choices: body.choices, required: body.required === "true" || body.required === true,
          low: body.low, high: body.high, lowLabel: body.lowLabel, highLabel: body.highLabel,
        });
        break;
      case "comment:create":
        result = createComment(resolveId(body), body.text);
        break;
      case "comment:update":
        result = updateComment(resolveId(body), body.comment, body.text);
        break;
      case "comment:delete":
        result = deleteComment(resolveId(body), body.comment);
        break;
      case "sheet:note:set":
        result = setNote(resolveId(body), body.name, body.cell, body.text);
        break;
      case "sheet:note:clear":
        result = clearNote(resolveId(body), body.name, body.cell);
        break;
      case "sheet:color":
        checkAcl(resolveId(body), "w");
        result = setSheetColor(resolveId(body), body.name, body.range || body.cell, body.color, resolveGid(body));
        trackFileWrite(resolveId(body));
        break;
      default:
        result = { error: `Unknown action: ${action}` };
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

function listMails(query?: string, max?: string): { id: string; subject: string; from: string; date: string }[] {
  const threads = query ? GmailApp.search(query, 0, parseInt(max || "20")) : GmailApp.getInboxThreads(0, parseInt(max || "20"));
  return threads.map((t) => {
    const msg = t.getMessages()[0];
    return {
      id: msg.getId(),
      subject: msg.getSubject(),
      from: msg.getFrom(),
      date: msg.getDate().toISOString(),
    };
  });
}

function getMail(id: string): { subject: string; from: string; to: string; date: string; body: string } {
  const msg = GmailApp.getMessageById(id);
  return {
    subject: msg.getSubject(),
    from: msg.getFrom(),
    to: msg.getTo(),
    date: msg.getDate().toISOString(),
    body: msg.getPlainBody(),
  };
}

function createDraft(to: string, subject: string, body: string): { id: string; to: string; subject: string } {
  const draft = GmailApp.createDraft(to, subject, body);
  return { id: draft.getId(), to, subject };
}

function updateDraft(draftId: string, to: string, subject: string, body: string): { id: string; to: string; subject: string } {
  const draft = GmailApp.getDraft(draftId);
  draft.update(to, subject, body);
  return { id: draft.getId(), to, subject };
}

function deleteDraft(draftId: string): { deleted: true; draft: string } {
  GmailApp.getDraft(draftId).deleteDraft();
  return { deleted: true, draft: draftId };
}

function labelMails(query: string, labelName: string, skipInbox?: boolean): { labeled: number; label: string; query: string } {
  const label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
  const threads = GmailApp.search(query, 0, 100);
  threads.forEach(t => {
    t.addLabel(label);
    if (skipInbox) t.moveToArchive();
  });
  return { labeled: threads.length, label: labelName, query };
}

function listLabels(): { id: string; name: string; type: string }[] {
  const res = Gmail.Users!.Labels!.list("me");
  return (res.labels || []).map((l: GoogleAppsScript.Gmail.Schema.Label) => ({
    id: l.id!, name: l.name!, type: l.type || "user",
  }));
}

function listFilters(): object[] {
  const res = Gmail.Users!.Settings!.Filters!.list("me");
  return (res.filter || []).map((f: GoogleAppsScript.Gmail.Schema.Filter) => ({
    id: f.id!,
    criteria: f.criteria || {},
    action: f.action || {},
  }));
}

function createFilter(query: string, labelName: string, skipInbox?: boolean): { id: string; query: string; label: string } {
  const labels = Gmail.Users!.Labels!.list("me").labels || [];
  let label = labels.find((l: GoogleAppsScript.Gmail.Schema.Label) => l.name === labelName);
  if (!label) {
    label = Gmail.Users!.Labels!.create({ name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" }, "me");
  }

  const action: GoogleAppsScript.Gmail.Schema.FilterAction = { addLabelIds: [label.id!] };
  if (skipInbox) action.removeLabelIds = ["INBOX"];

  const filter = Gmail.Users!.Settings!.Filters!.create({
    criteria: { query },
    action,
  }, "me");
  return { id: filter.id!, query, label: labelName };
}

function deleteFilter(filterId: string): { deleted: true; filter: string } {
  Gmail.Users!.Settings!.Filters!.remove("me", filterId);
  return { deleted: true, filter: filterId };
}

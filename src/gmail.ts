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

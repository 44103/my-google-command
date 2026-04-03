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

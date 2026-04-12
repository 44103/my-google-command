function listCalendars(): { id: string; name: string }[] {
  const cals = CalendarApp.getAllCalendars();
  return cals.map(c => ({ id: c.getId(), name: c.getName() }));
}

function resolveCal(calId?: string): GoogleAppsScript.Calendar.Calendar {
  if (!calId || calId === "self") return CalendarApp.getDefaultCalendar();
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) throw new Error(`Calendar "${calId}" not found`);
  return cal;
}

function listEvents(calId: string, from?: string, to?: string): { id: string; title: string; start: string; end: string; location: string }[] {
  const cal = resolveCal(calId);
  const startDate = from ? new Date(from) : new Date();
  const endDate = to ? new Date(to) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  return cal.getEvents(startDate, endDate).map(e => ({
    id: e.getId(),
    title: e.getTitle(),
    start: e.getStartTime().toISOString(),
    end: e.getEndTime().toISOString(),
    location: e.getLocation(),
  }));
}

function createEvent(calId: string, title: string, start: string, end: string, location?: string): { id: string; title: string; start: string; end: string } {
  const cal = resolveCal(calId);
  const ev = cal.createEvent(title, new Date(start), new Date(end), location ? { location } : {});
  return { id: ev.getId(), title: ev.getTitle(), start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString() };
}

function findFreeSlots(
  emails: string,
  from?: string,
  to?: string,
  duration?: string,
): { slots: { start: string; end: string }[]; busyInfo: Record<string, { start: string; end: string }[]> } {
  const startTime = from ? new Date(from) : new Date();
  const endTime = to ? new Date(to) : new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
  const durationMin = parseInt(duration || "30");

  const emailList = emails.split(",").map((e) => e.trim());
  const items = emailList.map((id) => ({ id }));

  const resp = Calendar.Freebusy!.query({
    timeMin: startTime.toISOString(),
    timeMax: endTime.toISOString(),
    items,
  });

  // Collect all busy periods
  const busyInfo: Record<string, { start: string; end: string }[]> = {};
  const allBusy: { start: Date; end: Date }[] = [];

  for (const email of emailList) {
    const cal = (resp.calendars as Record<string, { busy?: { start?: string; end?: string }[] }>)?.[email];
    const periods = cal?.busy || [];
    busyInfo[email] = periods.map((p) => ({ start: p.start || "", end: p.end || "" }));
    for (const p of periods) {
      if (p.start && p.end) allBusy.push({ start: new Date(p.start), end: new Date(p.end) });
    }
  }

  // Merge overlapping busy periods
  allBusy.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [];
  for (const b of allBusy) {
    const last = merged[merged.length - 1];
    if (last && b.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), b.end.getTime()));
    } else {
      merged.push({ start: new Date(b.start), end: new Date(b.end) });
    }
  }

  // Find free slots between busy periods (business hours 9:00-18:00)
  const slots: { start: string; end: string }[] = [];
  const durationMs = durationMin * 60 * 1000;
  let cursor = new Date(startTime);

  const toBusinessStart = (d: Date): Date => {
    const r = new Date(d);
    r.setHours(9, 0, 0, 0);
    return r;
  };
  const toBusinessEnd = (d: Date): Date => {
    const r = new Date(d);
    r.setHours(18, 0, 0, 0);
    return r;
  };

  // Iterate day by day
  const currentDay = new Date(cursor);
  currentDay.setHours(0, 0, 0, 0);

  while (currentDay < endTime) {
    const dayStart = toBusinessStart(currentDay);
    const dayEnd = toBusinessEnd(currentDay);

    if (dayStart >= endTime) break;
    const effectiveStart = new Date(Math.max(dayStart.getTime(), startTime.getTime()));
    const effectiveEnd = new Date(Math.min(dayEnd.getTime(), endTime.getTime()));

    // Skip weekends
    const dow = currentDay.getDay();
    if (dow === 0 || dow === 6) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    cursor = new Date(effectiveStart);
    for (const busy of merged) {
      if (busy.start >= effectiveEnd) break;
      if (busy.end <= cursor) continue;

      if (busy.start.getTime() - cursor.getTime() >= durationMs) {
        const slotEnd = new Date(Math.min(busy.start.getTime(), effectiveEnd.getTime()));
        slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
      }
      cursor = new Date(Math.max(cursor.getTime(), busy.end.getTime()));
    }

    if (effectiveEnd.getTime() - cursor.getTime() >= durationMs) {
      slots.push({ start: cursor.toISOString(), end: effectiveEnd.toISOString() });
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return { slots, busyInfo };
}

function listRooms(query?: string): { id: string; name: string }[] {
  // Try Admin Directory API first, fall back to CalendarList
  try {
    const resp = AdminDirectory.Resources!.Calendars!.list("my_customer", { maxResults: 200, query: query || undefined });
    return ((resp as { items?: { resourceEmail?: string; generatedResourceName?: string }[] }).items || []).map((r) => ({
      id: r.resourceEmail || "",
      name: r.generatedResourceName || "",
    }));
  } catch (_) {
    // Fall back to subscribed calendars (Admin SDK requires admin privileges)
    const resp = Calendar.CalendarList!.list({ maxResults: 250, showHidden: true });
    const items = resp.items || [];
    let rooms = items.filter((c: { id?: string }) => (c.id || "").includes("resource.calendar.google.com"));
    if (query) {
      const q = query.toLowerCase();
      rooms = rooms.filter((c: { summary?: string }) => (c.summary || "").toLowerCase().includes(q));
    }
    return rooms.map((c: { id?: string; summary?: string }) => ({ id: c.id || "", name: c.summary || "" }));
  }
}

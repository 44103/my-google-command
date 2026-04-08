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

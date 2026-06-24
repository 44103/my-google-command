function resolveId(params: { id?: string; url?: string }): string {
  const value = params.id || params.url;
  if (!value) throw new Error("id or url is required");
  const match = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

function resolveGid(params: { id?: string; url?: string; gid?: string }): number | undefined {
  if (params.gid) return parseInt(params.gid);
  const value = params.id || params.url || "";
  const match = value.match(/[?&#]gid=(\d+)/);
  return match ? parseInt(match[1]) : undefined;
}

function findSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name?: string, gid?: number): GoogleAppsScript.Spreadsheet.Sheet {
  if (gid !== undefined) {
    const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
    if (!sheet) throw new Error(`Sheet with gid=${gid} not found`);
    return sheet;
  }
  if (!name) throw new Error("Sheet name or gid is required");
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found`);
  return sheet;
}

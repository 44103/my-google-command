function listSpreadsheets(): { id: string; name: string; url: string; lastUpdated: string }[] {
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS);
  const result: { id: string; name: string; url: string; lastUpdated: string }[] = [];
  while (files.hasNext()) {
    const f = files.next();
    result.push({
      id: f.getId(),
      name: f.getName(),
      url: f.getUrl(),
      lastUpdated: f.getLastUpdated().toISOString(),
    });
  }
  return result;
}

function resolveSpreadsheetId(params: { id?: string; url?: string }): string {
  if (params.id) {
    const match = params.id.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : params.id;
  }
  if (params.url) {
    const match = params.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  throw new Error("id or url is required");
}

function listSheets(id: string): { spreadsheetName: string; sheets: string[] } {
  const ss = SpreadsheetApp.openById(id);
  return {
    spreadsheetName: ss.getName(),
    sheets: ss.getSheets().map((s) => s.getName()),
  };
}

function getSheetData(id: string, sheetName: string): { spreadsheetName: string; sheet: string; data: unknown[][] } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  return {
    spreadsheetName: ss.getName(),
    sheet: sheetName,
    data: sheet.getDataRange().getValues(),
  };
}

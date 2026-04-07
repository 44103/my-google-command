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

function writeSheet(id: string, sheetName: string, range: string, csv: string): { spreadsheetName: string; sheet: string; range: string; rows: number; cols: number } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  if (!csv.trim()) throw new Error("No data provided");
  const data = Utilities.parseCsv(csv);
  const target = sheet.getRange(range).offset(0, 0, data.length, data[0].length);
  target.setValues(data);
  return { spreadsheetName: ss.getName(), sheet: sheetName, range: target.getA1Notation(), rows: data.length, cols: data[0].length };
}

function listSpreadsheets(max = 20): { id: string; name: string; url: string; lastUpdated: string }[] {
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS);
  const result: { id: string; name: string; url: string; lastUpdated: string }[] = [];
  while (files.hasNext() && result.length < max) {
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

function openAsSpreadsheet(id: string): { ss: GoogleAppsScript.Spreadsheet.Spreadsheet; tempId?: string } {
  const file = DriveApp.getFileById(id);
  const mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) return { ss: SpreadsheetApp.openById(id) };
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const blob = file.getBlob();
    const tmp = (Drive as unknown as GoogleAppsScript.Drive_v2).Files!.insert({ title: "__tmp_xlsx_" + Date.now(), mimeType: MimeType.GOOGLE_SHEETS }, blob);
    return { ss: SpreadsheetApp.openById(tmp.id!), tempId: tmp.id! };
  }
  throw new Error(`Unsupported file type: ${mime}`);
}

function cleanupTemp(tempId?: string) {
  if (tempId) DriveApp.getFileById(tempId).setTrashed(true);
}

function listSheets(id: string): { spreadsheetName: string; sheets: string[] } {
  const { ss, tempId } = openAsSpreadsheet(id);
  try {
    return { spreadsheetName: ss.getName(), sheets: ss.getSheets().map((s) => s.getName()) };
  } finally { cleanupTemp(tempId); }
}

function getSheetData(id: string, sheetName: string): { spreadsheetName: string; sheet: string; data: unknown[][] } {
  const { ss, tempId } = openAsSpreadsheet(id);
  try {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
    return { spreadsheetName: ss.getName(), sheet: sheetName, data: sheet.getDataRange().getValues() };
  } finally { cleanupTemp(tempId); }
}

function writeSheet(id: string, sheetName: string, range: string, csv: string): { spreadsheetName: string; sheet: string; range: string; rows: number; cols: number } {
  const file = DriveApp.getFileById(id);
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) throw new Error("Write is not supported for XLSX files. Use a Google Sheets file.");
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  if (!csv.trim()) throw new Error("No data provided");
  const data = Utilities.parseCsv(csv);
  const target = sheet.getRange(range).offset(0, 0, data.length, data[0].length);
  target.setValues(data);
  return { spreadsheetName: ss.getName(), sheet: sheetName, range: target.getA1Notation(), rows: data.length, cols: data[0].length };
}

function createSheet(id: string, sheetName: string): { spreadsheetName: string; sheet: string } {
  const ss = SpreadsheetApp.openById(id);
  if (ss.getSheetByName(sheetName)) throw new Error(`Sheet "${sheetName}" already exists`);
  ss.insertSheet(sheetName);
  return { spreadsheetName: ss.getName(), sheet: sheetName };
}

function createSpreadsheet(name: string): { id: string; name: string; url: string } {
  const ss = SpreadsheetApp.create(name);
  return { id: ss.getId(), name: ss.getName(), url: ss.getUrl() };
}

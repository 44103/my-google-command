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

function getSheetData(id: string, sheetName: string): { spreadsheetName: string; sheet: string; data: unknown[][]; colors?: { cell: string; color: string }[] } {
  const { ss, tempId } = openAsSpreadsheet(id);
  try {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
    const range = sheet.getDataRange();
    const data = range.getValues();
    const bgs = range.getBackgrounds();
    const colors: { cell: string; color: string }[] = [];
    for (let row = 0; row < bgs.length; row++) {
      for (let col = 0; col < bgs[row].length; col++) {
        if (bgs[row][col] && bgs[row][col] !== "#ffffff") {
          colors.push({ cell: range.getCell(row + 1, col + 1).getA1Notation(), color: bgs[row][col] });
        }
      }
    }
    const result: { spreadsheetName: string; sheet: string; data: unknown[][]; colors?: { cell: string; color: string }[] } = { spreadsheetName: ss.getName(), sheet: sheetName, data };
    if (colors.length > 0) result.colors = colors;
    return result;
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

  // Check for rich text markup and apply
  const richCells: { row: number; col: number; rich: RichCell }[] = [];
  const plainData = data.map((row, r) =>
    row.map((cell, c) => {
      if (hasRichText(cell)) {
        const rich = parseRichCell(cell);
        richCells.push({ row: r, col: c, rich });
        return rich.plainText;
      }
      return cell;
    }),
  );

  target.setValues(plainData);

  for (const { row, col, rich } of richCells) {
    target.getCell(row + 1, col + 1).setRichTextValue(buildRichTextValue(rich));
  }

  return { spreadsheetName: ss.getName(), sheet: sheetName, range: target.getA1Notation(), rows: data.length, cols: data[0].length };
}

function createSheet(id: string, sheetName: string): { spreadsheetName: string; sheet: string } {
  const ss = SpreadsheetApp.openById(id);
  if (ss.getSheetByName(sheetName)) throw new Error(`Sheet "${sheetName}" already exists`);
  ss.insertSheet(sheetName);
  return { spreadsheetName: ss.getName(), sheet: sheetName };
}

function deleteSheet(id: string, sheetName: string): { spreadsheetName: string; deleted: string } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  if (ss.getSheets().length <= 1) throw new Error("Cannot delete the only sheet");
  ss.deleteSheet(sheet);
  return { spreadsheetName: ss.getName(), deleted: sheetName };
}

function renameSheet(id: string, sheetName: string, newName: string): { spreadsheetName: string; oldName: string; newName: string } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  if (ss.getSheetByName(newName)) throw new Error(`Sheet "${newName}" already exists`);
  sheet.setName(newName);
  return { spreadsheetName: ss.getName(), oldName: sheetName, newName };
}

function createSpreadsheet(name: string): { id: string; name: string; url: string } {
  const ss = SpreadsheetApp.create(name);
  return { id: ss.getId(), name: ss.getName(), url: ss.getUrl() };
}

function getNotes(id: string, sheetName: string, range: string): { sheet: string; range: string; notes: { cell: string; note: string }[] } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  const r = sheet.getRange(range);
  const notes = r.getNotes();
  const result: { cell: string; note: string }[] = [];
  for (let row = 0; row < notes.length; row++) {
    for (let col = 0; col < notes[row].length; col++) {
      if (notes[row][col]) {
        result.push({ cell: r.getCell(row + 1, col + 1).getA1Notation(), note: notes[row][col] });
      }
    }
  }
  return { sheet: sheetName, range: r.getA1Notation(), notes: result };
}

function setNote(id: string, sheetName: string, cell: string, text: string): { sheet: string; cell: string; note: string } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  sheet.getRange(cell).setNote(text);
  return { sheet: sheetName, cell, note: text };
}

function clearNote(id: string, sheetName: string, cell: string): { sheet: string; cell: string; cleared: true } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  sheet.getRange(cell).clearNote();
  return { sheet: sheetName, cell, cleared: true };
}

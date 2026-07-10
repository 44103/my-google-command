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

function listSheets(id: string): { spreadsheetName: string; sheets: { name: string; gid: number }[] } {
  const { ss, tempId } = openAsSpreadsheet(id);
  try {
    return { spreadsheetName: ss.getName(), sheets: ss.getSheets().map((s) => ({ name: s.getName(), gid: s.getSheetId() })) };
  } finally { cleanupTemp(tempId); }
}

function getSheetData(id: string, sheetName: string, gid?: number, rangeA1?: string, rows?: number, includeColors = true): { spreadsheetName: string; sheet: string; range: string; data: unknown[][]; colors?: { cell: string; color: string }[]; warning?: string } {
  const { ss, tempId } = openAsSpreadsheet(id);
  try {
    const sheet = findSheet(ss, sheetName, gid);
    const effectiveRows = rows && rows > 0 ? rows : undefined;
    let range: GoogleAppsScript.Spreadsheet.Range;
    if (rangeA1) {
      try {
        range = sheet.getRange(rangeA1);
      } catch (e) {
        throw new Error(`Invalid range "${rangeA1}": ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (effectiveRows) {
      const lastCol = sheet.getLastColumn();
      const lastRow = sheet.getLastRow();
      range = sheet.getRange(1, 1, Math.min(effectiveRows, lastRow || 1), lastCol || 1);
    } else {
      range = sheet.getDataRange();
    }
    if (effectiveRows && rangeA1) {
      range = range.offset(0, 0, Math.min(effectiveRows, range.getNumRows()), range.getNumColumns());
    }
    const data = range.getValues();
    const result: { spreadsheetName: string; sheet: string; range: string; data: unknown[][]; colors?: { cell: string; color: string }[]; warning?: string } = { spreadsheetName: ss.getName(), sheet: sheet.getName(), range: range.getA1Notation(), data };
    if (data.length > 10000) {
      result.warning = `Large result: ${data.length} rows returned. Consider narrowing the range.`;
    }
    if (includeColors) {
      const bgs = range.getBackgrounds();
      const colors: { cell: string; color: string }[] = [];
      for (let row = 0; row < bgs.length; row++) {
        for (let col = 0; col < bgs[row].length; col++) {
          if (bgs[row][col] && bgs[row][col] !== "#ffffff") {
            colors.push({ cell: range.getCell(row + 1, col + 1).getA1Notation(), color: bgs[row][col] });
          }
        }
      }
      if (colors.length > 0) result.colors = colors;
    }
    return result;
  } finally { cleanupTemp(tempId); }
}

function getSheetLastRow(id: string, sheetName: string, gid?: number): { spreadsheetName: string; sheet: string; lastRow: number } {
  const { ss, tempId } = openAsSpreadsheet(id);
  try {
    const sheet = findSheet(ss, sheetName, gid);
    return { spreadsheetName: ss.getName(), sheet: sheet.getName(), lastRow: sheet.getLastRow() };
  } finally { cleanupTemp(tempId); }
}

function writeSheet(id: string, sheetName: string, range: string, csv: string, header?: boolean, gid?: number): { spreadsheetName: string; sheet: string; range: string; rows: number; cols: number } {
  const file = DriveApp.getFileById(id);
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) throw new Error("Write is not supported for XLSX files. Use a Google Sheets file.");
  const ss = SpreadsheetApp.openById(id);
  const sheet = findSheet(ss, sheetName, gid);
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

  if (header) {
    const headerRange = target.offset(0, 0, 1, data[0].length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f3f3f3");
    sheet.setFrozenRows(sheet.getRange(range).getRow());
  }

  return { spreadsheetName: ss.getName(), sheet: sheetName, range: target.getA1Notation(), rows: data.length, cols: data[0].length };
}

function createSheet(id: string, sheetName: string): { spreadsheetName: string; sheet: string } {
  const ss = SpreadsheetApp.openById(id);
  if (ss.getSheetByName(sheetName)) throw new Error(`Sheet "${sheetName}" already exists`);
  ss.insertSheet(sheetName);
  return { spreadsheetName: ss.getName(), sheet: sheetName };
}

function deleteSheet(id: string, sheetName: string, gid?: number): { spreadsheetName: string; deleted: string } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = findSheet(ss, sheetName, gid);
  if (ss.getSheets().length <= 1) throw new Error("Cannot delete the only sheet");
  const name = sheet.getName();
  ss.deleteSheet(sheet);
  return { spreadsheetName: ss.getName(), deleted: name };
}

function renameSheet(id: string, sheetName: string, newName: string, gid?: number): { spreadsheetName: string; oldName: string; newName: string } {
  const ss = SpreadsheetApp.openById(id);
  const sheet = findSheet(ss, sheetName, gid);
  if (ss.getSheetByName(newName)) throw new Error(`Sheet "${newName}" already exists`);
  const oldName = sheet.getName();
  sheet.setName(newName);
  return { spreadsheetName: ss.getName(), oldName, newName };
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

function setSheetColor(id: string, sheetName: string, range: string, color: string, gid?: number): { spreadsheetName: string; sheet: string; range: string; color: string } {
  const file = DriveApp.getFileById(id);
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) throw new Error("Color setting is not supported for XLSX files. Use a Google Sheets file.");
  const ss = SpreadsheetApp.openById(id);
  const sheet = findSheet(ss, sheetName, gid);
  const target = sheet.getRange(range);
  if (color === "-" || color === "none") {
    target.setBackground(null);
    return { spreadsheetName: ss.getName(), sheet: sheet.getName(), range: target.getA1Notation(), color: "cleared" };
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`Invalid color format: "${color}". Use hex format (e.g., #ff0000) or "-" to clear.`);
  }
  target.setBackground(color);
  return { spreadsheetName: ss.getName(), sheet: sheet.getName(), range: target.getA1Notation(), color };
}
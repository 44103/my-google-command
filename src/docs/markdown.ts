function writeMarkdownToBody(body: GoogleAppsScript.Document.Body, markdown: string): void {
  const blocks = parseMarkdownBlocks(markdown);

  for (const block of blocks) {
    switch (block.type) {
      case "code": {
        if (block.content) {
          const table = body.appendTable([[block.content]]);
          const cell = table.getRow(0).getCell(0);
          cell.setBackgroundColor("#282c34");
          const cellText = cell.editAsText();
          cellText.setFontFamily("Roboto Mono");
          cellText.setFontSize(9);
          cellText.setForegroundColor("#ABB2BF");
          highlightCode(cellText, block.lang || "");
          table.setBorderColor("#3E4451");
          table.setBorderWidth(1);
        }
        break;
      }
      case "empty":
        body.appendParagraph("");
        break;
      case "heading": {
        const p = body.appendParagraph(block.content);
        const headings: Record<number, GoogleAppsScript.Document.ParagraphHeading> = {
          1: DocumentApp.ParagraphHeading.HEADING1,
          2: DocumentApp.ParagraphHeading.HEADING2,
          3: DocumentApp.ParagraphHeading.HEADING3,
        };
        p.setHeading(headings[block.level || 1]);
        applyDocInlineStyles(p);
        break;
      }
      case "table": {
        const rows = block.rows || [];
        if (rows.length > 0) {
          const cols = rows[0].length || 1;
          const table = body.appendTable();
          for (const row of rows) {
            const tr = table.appendTableRow();
            for (let c = 0; c < cols; c++) {
              const cell = tr.appendTableCell(row[c] || "");
              applyDocInlineStyles(cell.editAsText());
            }
          }
          if (table.getNumRows() > 0) {
            const headerRow = table.getRow(0);
            for (let c = 0; c < headerRow.getNumCells(); c++) {
              headerRow.getCell(c).editAsText().setBold(true);
            }
          }
        }
        break;
      }
      case "list": {
        const items = block.items || [];
        for (const item of items) {
          const p = body.appendListItem(item);
          p.setGlyphType(block.ordered
            ? DocumentApp.GlyphType.NUMBER
            : DocumentApp.GlyphType.BULLET);
          applyDocInlineStyles(p);
        }
        break;
      }
      case "blockquote": {
        const p = body.appendParagraph(block.content);
        p.setIndentStart(36);
        p.editAsText().setForegroundColor("#666666");
        applyDocInlineStyles(p);
        break;
      }
      case "hr":
        body.appendHorizontalRule();
        break;
      case "text": {
        const p = body.appendParagraph(block.content);
        applyDocInlineStyles(p);
        break;
      }
    }
  }
}

function applyDocInlineStyles(element: GoogleAppsScript.Document.Text | GoogleAppsScript.Document.ListItem | GoogleAppsScript.Document.Paragraph): void {
  const text = element.editAsText();
  const raw = text.getText();
  const segments = parseInlineStyles(raw);

  // Rebuild text from segments
  const plain = segments.map((s) => s.text).join("");
  if (plain === raw && segments.every((s) => !s.bold && !s.code && !s.link)) return;

  text.setText(plain);

  let pos = 0;
  for (const seg of segments) {
    const end = pos + seg.text.length - 1;
    if (seg.text.length > 0 && end >= pos) {
      if (seg.bold) text.setBold(pos, end, true);
      if (seg.code) {
        text.setFontFamily(pos, end, "Roboto Mono");
        text.setBackgroundColor(pos, end, "#f0f0f0");
      }
      if (seg.link) text.setLinkUrl(pos, end, seg.link);
    }
    pos += seg.text.length;
  }
}

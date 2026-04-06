function writeMarkdownToBody(body: GoogleAppsScript.Document.Body, markdown: string): void {
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing ```
      if (codeLines.length > 0) {
        const table = body.appendTable([[codeLines.join("\n")]]);
        const cell = table.getRow(0).getCell(0);
        cell.setBackgroundColor("#282c34");
        const cellText = cell.editAsText();
        cellText.setFontFamily("Roboto Mono");
        cellText.setFontSize(9);
        cellText.setForegroundColor("#ABB2BF");
        highlightCode(cellText, lang);
        table.setBorderColor("#3E4451");
        table.setBorderWidth(1);
      }
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      body.appendParagraph("");
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const p = body.appendParagraph(text);
      const headings: Record<number, GoogleAppsScript.Document.ParagraphHeading> = {
        1: DocumentApp.ParagraphHeading.HEADING1,
        2: DocumentApp.ParagraphHeading.HEADING2,
        3: DocumentApp.ParagraphHeading.HEADING3,
      };
      p.setHeading(headings[level]);
      i++;
      continue;
    }

    // Table (consecutive lines starting with |)
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        // Skip separator rows (|---|---|)
        if (!/^\|[\s\-:|]+\|$/.test(lines[i].trim())) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      if (tableLines.length > 0) {
        const rows = tableLines.map(l =>
          l.split("|").slice(1, -1).map(c => c.trim())
        );
        const cols = rows[0]?.length || 1;
        const table = body.appendTable();
        for (const row of rows) {
          const tr = table.appendTableRow();
          for (let c = 0; c < cols; c++) {
          const cell = tr.appendTableCell(row[c] || "");
          applyInlineStyles(cell.editAsText());
          }
        }
        // Bold header row
        if (table.getNumRows() > 0) {
          const headerRow = table.getRow(0);
          for (let c = 0; c < headerRow.getNumCells(); c++) {
            headerRow.getCell(c).editAsText().setBold(true);
          }
        }
      }
      continue;
    }

    // List
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (listMatch) {
      const text = listMatch[3];
      const p = body.appendListItem(text);
      const isOrdered = /^\d+\./.test(listMatch[2]);
      p.setGlyphType(isOrdered
        ? DocumentApp.GlyphType.NUMBER
        : DocumentApp.GlyphType.BULLET);
      const indent = listMatch[1].length;
      if (indent >= 2) p.setNestingLevel(Math.min(Math.floor(indent / 2), 3));
      applyInlineStyles(p);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const text = line.slice(2);
      const p = body.appendParagraph(text);
      p.setIndentStart(36);
      p.editAsText().setForegroundColor("#666666");
      applyInlineStyles(p);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      body.appendHorizontalRule();
      i++;
      continue;
    }

    // Paragraph
    const p = body.appendParagraph(line);
    applyInlineStyles(p);
    i++;
  }
}

function applyInlineStyles(element: GoogleAppsScript.Document.Text | GoogleAppsScript.Document.ListItem | GoogleAppsScript.Document.Paragraph): void {
  const text = element.editAsText();

  // Process links [text](url) first (from end to start)
  const linkMatches: { start: number; end: number; label: string; url: string }[] = [];
  let lm;
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const linkContent = text.getText();
  while ((lm = linkRe.exec(linkContent)) !== null) {
    linkMatches.push({ start: lm.index, end: lm.index + lm[0].length - 1, label: lm[1], url: lm[2] });
  }
  linkMatches.sort((a, b) => b.start - a.start);
  for (const link of linkMatches) {
    text.deleteText(link.start, link.end);
    text.insertText(link.start, link.label);
    text.setLinkUrl(link.start, link.start + link.label.length - 1, link.url);
  }

  const content = text.getText();

  // Collect matches (process from end to avoid index shift)
  type InlineMatch = { start: number; end: number; type: "bold" | "code" };
  const matches: InlineMatch[] = [];

  let m;
  const boldRe = /\*\*(.+?)\*\*/g;
  while ((m = boldRe.exec(content)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length - 1, type: "bold" });
  }

  const codeRe = /`([^`]+)`/g;
  while ((m = codeRe.exec(content)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length - 1, type: "code" });
  }

  matches.sort((a, b) => b.start - a.start);
  for (const mt of matches) {
    if (mt.type === "bold") {
      text.setBold(mt.start, mt.end, true);
    } else {
      text.setFontFamily(mt.start, mt.end, "Roboto Mono");
      text.setBackgroundColor(mt.start, mt.end, "#f0f0f0");
    }
    text.deleteText(mt.end - (mt.type === "bold" ? 1 : 0), mt.end);
    text.deleteText(mt.start, mt.start + (mt.type === "bold" ? 1 : 0));
  }
}

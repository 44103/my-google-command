/** Supported style tags */
const STYLE_TAGS = ["red", "blue", "green", "bold", "italic"] as const;
type StyleTag = (typeof STYLE_TAGS)[number];

interface RichSpan {
  text: string;
  styles: StyleTag[];
}

interface RichCell {
  plainText: string;
  spans: RichSpan[];
}

const TAG_RE = new RegExp(
  `\\{(${STYLE_TAGS.join("|")}(?:,(?:${STYLE_TAGS.join("|")}))*)\\}|\\{/(?:${STYLE_TAGS.join("|")})?\\}|\\{\\{|\\}\\}`,
  "g",
);

function parseRichCell(raw: string): RichCell {
  const spans: RichSpan[] = [];
  const activeStyles: StyleTag[] = [];
  let lastIndex = 0;

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, m.index);
    if (before) {
      spans.push({ text: before, styles: [...activeStyles] });
    }
    lastIndex = TAG_RE.lastIndex;

    const token = m[0];
    if (token === "{{") {
      spans.push({ text: "{", styles: [...activeStyles] });
    } else if (token === "}}") {
      spans.push({ text: "}", styles: [...activeStyles] });
    } else if (token.startsWith("{/")) {
      // close tag — pop matching or all
      const inner = token.slice(2, -1);
      if (inner) {
        const idx = activeStyles.lastIndexOf(inner as StyleTag);
        if (idx !== -1) activeStyles.splice(idx, 1);
      } else {
        activeStyles.length = 0;
      }
    } else {
      // open tag
      const tags = m[1].split(",") as StyleTag[];
      for (const t of tags) activeStyles.push(t);
    }
  }
  const tail = raw.slice(lastIndex);
  if (tail) spans.push({ text: tail, styles: [...activeStyles] });

  const plainText = spans.map((s) => s.text).join("");
  return { plainText, spans };
}

function hasRichText(raw: string): boolean {
  TAG_RE.lastIndex = 0;
  return TAG_RE.test(raw);
}

function buildRichTextValue(cell: RichCell): GoogleAppsScript.Spreadsheet.RichTextValue {
  const builder = SpreadsheetApp.newRichTextValue().setText(cell.plainText);
  let offset = 0;
  for (const span of cell.spans) {
    if (span.styles.length > 0) {
      let style = SpreadsheetApp.newTextStyle();
      for (const s of span.styles) {
        switch (s) {
          case "red": style = style.setForegroundColor("#ff0000"); break;
          case "blue": style = style.setForegroundColor("#0000ff"); break;
          case "green": style = style.setForegroundColor("#008000"); break;
          case "bold": style = style.setBold(true); break;
          case "italic": style = style.setItalic(true); break;
        }
      }
      builder.setTextStyle(offset, offset + span.text.length, style.build());
    }
    offset += span.text.length;
  }
  return builder.build();
}

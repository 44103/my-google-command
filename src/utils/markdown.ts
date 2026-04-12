// Shared Markdown parser for Docs and Slides

interface MdBlock {
  type: "heading" | "text" | "list" | "code" | "table" | "blockquote" | "hr" | "empty";
  level?: number;       // heading level 1-3
  content: string;
  items?: string[];     // list items
  lang?: string;        // code language
  rows?: string[][];    // table rows
  ordered?: boolean;    // ordered list
}

function parseMarkdownBlocks(markdown: string): MdBlock[] {
  const lines = markdown.split("\n");
  const blocks: MdBlock[] = [];
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
      i++;
      blocks.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      blocks.push({ type: "empty", content: "" });
      i++;
      continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (hMatch) {
      blocks.push({ type: "heading", content: hMatch[2], level: hMatch[1].length });
      i++;
      continue;
    }

    // Table
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        if (!/^\|[\s\-:|]+\|$/.test(lines[i].trim())) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      const rows = tableLines.map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
      blocks.push({ type: "table", content: "", rows });
      continue;
    }

    // List
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (listMatch) {
      const items: string[] = [];
      const ordered = /^\d+\./.test(listMatch[2]);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items, ordered });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      blocks.push({ type: "blockquote", content: line.slice(2) });
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Text (collect consecutive)
    const textLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s/.test(lines[i]) &&
      !lines[i].startsWith("```") &&
      !lines[i].trimStart().startsWith("|") &&
      !lines[i].startsWith("> ") &&
      !/^---+$/.test(lines[i].trim())
    ) {
      textLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "text", content: textLines.join("\n") });
  }

  return blocks;
}

interface InlineSegment {
  text: string;
  bold?: boolean;
  code?: boolean;
  link?: string;
}

function parseInlineStyles(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Match **bold**, `code`, [label](url), or plain text
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|([^*`\[]+|[*`\[])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) segments.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) segments.push({ text: m[2], code: true });
    else if (m[3] !== undefined) segments.push({ text: m[3], link: m[4] });
    else if (m[5] !== undefined) segments.push({ text: m[5] });
  }
  return segments;
}

interface HighlightToken {
  start: number;
  end: number;
  color: string;
  priority: number;
}

function highlightCode(
  textElement: GoogleAppsScript.Document.Text,
  lang: string
): void {
  const def = findLanguage(lang);
  if (!def) return;

  const content = textElement.getText();
  const tokens: HighlightToken[] = [];

  for (const rule of def.rules) {
    // Reset lastIndex for each rule (RegExp with /g flag)
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(content)) !== null) {
      if (m[0].length === 0) { rule.pattern.lastIndex++; continue; }
      tokens.push({
        start: m.index,
        end: m.index + m[0].length - 1,
        color: rule.color,
        priority: rule.priority,
      });
    }
  }

  // Sort by priority descending — higher priority tokens are placed first
  tokens.sort((a, b) => b.priority - a.priority || a.start - b.start);

  // Build occupied ranges from high-priority tokens, skip overlapping lower ones
  const occupied: { start: number; end: number }[] = [];

  const overlaps = (s: number, e: number): boolean =>
    occupied.some(r => s <= r.end && e >= r.start);

  const applied: HighlightToken[] = [];
  for (const t of tokens) {
    if (!overlaps(t.start, t.end)) {
      occupied.push({ start: t.start, end: t.end });
      applied.push(t);
    }
  }

  // Apply colors
  for (const t of applied) {
    textElement.setForegroundColor(t.start, t.end, t.color);
  }
}

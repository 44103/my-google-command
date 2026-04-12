interface HighlightToken {
  start: number;
  end: number;
  color: string;
}

function tokenizeCode(content: string, lang: string): HighlightToken[] {
  const def = findLanguage(lang);
  if (!def) return [];

  const raw: { start: number; end: number; color: string; priority: number }[] = [];
  for (const rule of def.rules) {
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(content)) !== null) {
      if (m[0].length === 0) { rule.pattern.lastIndex++; continue; }
      raw.push({ start: m.index, end: m.index + m[0].length - 1, color: rule.color, priority: rule.priority });
    }
  }

  raw.sort((a, b) => b.priority - a.priority || a.start - b.start);

  const occupied: { start: number; end: number }[] = [];
  const result: HighlightToken[] = [];
  for (const t of raw) {
    if (!occupied.some((r) => t.start <= r.end && t.end >= r.start)) {
      occupied.push({ start: t.start, end: t.end });
      result.push({ start: t.start, end: t.end, color: t.color });
    }
  }
  return result;
}

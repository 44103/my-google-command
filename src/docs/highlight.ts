function highlightCode(textElement: GoogleAppsScript.Document.Text, lang: string): void {
  const tokens = tokenizeCode(textElement.getText(), lang);
  for (const t of tokens) {
    textElement.setForegroundColor(t.start, t.end, t.color);
  }
}

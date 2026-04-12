// Markdown → Google Slides converter (Marp-like)

const SLIDE_W = 720;
const SLIDE_H = 405;
const MARGIN = 40;
const CONTENT_W = SLIDE_W - MARGIN * 2;

const S_COLORS = {
  title: "#1a1a2e",
  body: "#333333",
  codeBg: "#282c34",
  codeFg: "#abb2bf",
  accent: "#0066cc",
};

function buildSlidePages(pres: GoogleAppsScript.Slides.Presentation, markdown: string): void {
  const pages = markdown.split(/\n---\n/).map((p) => p.trim());
  for (const page of pages) {
    const slide = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    renderSlideBlocks(slide, parseMarkdownBlocks(page));
  }
}

function createSlideFromMarkdown(
  name: string,
  markdown: string,
): { id: string; name: string; url: string; totalPages: number } {
  const pres = SlidesApp.create(name);
  const defaultSlides = pres.getSlides();
  if (defaultSlides.length > 0) defaultSlides[0].remove();
  buildSlidePages(pres, markdown);
  return { id: pres.getId(), name: pres.getName(), url: pres.getUrl(), totalPages: pres.getSlides().length };
}

function overwriteSlideFromMarkdown(
  id: string,
  markdown: string,
): { id: string; name: string; url: string; totalPages: number } {
  const pres = SlidesApp.openById(id);
  const existing = pres.getSlides();
  for (const s of existing) s.remove();
  buildSlidePages(pres, markdown);
  return { id: pres.getId(), name: pres.getName(), url: pres.getUrl(), totalPages: pres.getSlides().length };
}
function renderSlideBlocks(slide: GoogleAppsScript.Slides.Slide, blocks: MdBlock[]): void {
  let y = MARGIN;

  for (const block of blocks) {
    if (y > SLIDE_H - MARGIN) break;
    if (block.type === "empty") { y += 8; continue; }

    switch (block.type) {
      case "heading": {
        const isH1 = block.level === 1;
        const fontSize = isH1 ? 32 : block.level === 2 ? 24 : 20;
        const h = isH1 ? 50 : 38;
        const shape = slide.insertTextBox("", MARGIN, y, CONTENT_W, h);
        applySlideInline(shape, block.content, fontSize, true, S_COLORS.title);
        alignLeft(shape);
        y += h + (isH1 ? 16 : 10);
        break;
      }
      case "text": {
        const lineCount = block.content.split("\n").length;
        const h = Math.min(lineCount * 24 + 8, SLIDE_H - y - MARGIN);
        const shape = slide.insertTextBox("", MARGIN, y, CONTENT_W, h);
        applySlideInline(shape, block.content, 16, false, S_COLORS.body);
        alignLeft(shape);
        y += h + 10;
        break;
      }
      case "list": {
        const items = block.items || [];
        const prefix = block.ordered
          ? items.map((_, i) => `${i + 1}. `)
          : items.map(() => "•  ");
        const h = Math.min(items.length * 28 + 8, SLIDE_H - y - MARGIN);
        const shape = slide.insertTextBox("", MARGIN + 10, y, CONTENT_W - 10, h);
        const textRange = shape.getText();

        // Build full text and track segment positions
        const styleRuns: { pos: number; segments: InlineSegment[] }[] = [];
        let fullText = "";
        for (let i = 0; i < items.length; i++) {
          fullText += prefix[i];
          const segStart = fullText.length;
          const segments = parseInlineStyles(items[i]);
          fullText += segments.map((s) => s.text).join("");
          styleRuns.push({ pos: segStart, segments });
          if (i < items.length - 1) fullText += "\n";
        }
        textRange.setText(fullText);

        // Apply inline styles
        for (const run of styleRuns) {
          let pos = run.pos;
          for (const seg of run.segments) {
            const end = pos + seg.text.length;
            if (seg.text.length > 0) {
              const range = textRange.getRange(pos, end);
              if (seg.bold) range.getTextStyle().setBold(true);
              if (seg.code) {
                range.getTextStyle().setFontFamily("Roboto Mono").setBackgroundColor("#e8e8e8");
              }
              if (seg.link) range.getTextStyle().setLinkUrl(seg.link);
            }
            pos = end;
          }
        }

        textRange.getTextStyle().setFontSize(16).setForegroundColor(S_COLORS.body);
        textRange.getParagraphStyle().setLineSpacing(140);
        alignLeft(shape);
        y += h + 10;
        break;
      }
      case "code": {
        const lines = block.content.split("\n");
        const h = Math.min(lines.length * 16 + 12, SLIDE_H - y - MARGIN);
        const shape = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, MARGIN, y, CONTENT_W, h);
        shape.getFill().setSolidFill(S_COLORS.codeBg);
        shape.getBorder().setTransparent();
        const codeText = shape.getText();
        codeText.setText(block.content);
        codeText.getTextStyle()
          .setFontSize(11)
          .setFontFamily("Roboto Mono")
          .setForegroundColor(S_COLORS.codeFg);
        const tokens = tokenizeCode(block.content, block.lang || "");
        for (const t of tokens) {
          codeText.getRange(t.start, t.end + 1).getTextStyle().setForegroundColor(t.color);
        }
        shape.setContentAlignment(SlidesApp.ContentAlignment.TOP);
        alignLeft(shape);
        y += h + 10;
        break;
      }
      case "blockquote": {
        const h = 30;
        const shape = slide.insertTextBox("", MARGIN + 20, y, CONTENT_W - 20, h);
        applySlideInline(shape, block.content, 15, false, "#666666");
        shape.getText().getTextStyle().setItalic(true);
        alignLeft(shape);
        y += h + 10;
        break;
      }
    }
  }
}

function applySlideInline(
  shape: GoogleAppsScript.Slides.Shape,
  text: string,
  fontSize: number,
  bold: boolean,
  color: string,
): void {
  const segments = parseInlineStyles(text);
  const textRange = shape.getText();
  applySegments(textRange, 0, segments, fontSize, color);
  if (bold) textRange.getTextStyle().setBold(true);
}

function applySegments(
  textRange: GoogleAppsScript.Slides.TextRange,
  startOffset: number,
  segments: InlineSegment[],
  fontSize: number,
  color: string,
): void {
  // Build plain text from segments
  const plainText = segments.map((s) => s.text).join("");

  // Insert text at the right position
  if (startOffset === 0) {
    textRange.setText(plainText);
  } else {
    textRange.appendText(plainText);
  }

  // Apply styles to each segment
  let pos = startOffset;
  for (const seg of segments) {
    const end = pos + seg.text.length;
    if (seg.text.length > 0) {
      const range = textRange.getRange(pos, end);
      range.getTextStyle().setFontSize(fontSize).setForegroundColor(color);
      if (seg.bold) range.getTextStyle().setBold(true);
      if (seg.code) {
        range.getTextStyle().setFontFamily("Roboto Mono").setBackgroundColor("#e8e8e8");
      }
      if (seg.link) range.getTextStyle().setLinkUrl(seg.link);
    }
    pos = end;
  }
}

function alignLeft(shape: GoogleAppsScript.Slides.Shape): void {
  shape.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.START);
}

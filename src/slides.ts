function listSlides(max?: number): { id: string; name: string; updated: string }[] {
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_SLIDES);
  const result: { id: string; name: string; updated: string }[] = [];
  const limit = max || 20;
  while (files.hasNext() && result.length < limit) {
    const f = files.next();
    result.push({ id: f.getId(), name: f.getName(), updated: f.getLastUpdated().toISOString() });
  }
  return result;
}

function getSlideContent(id: string, page?: string): { name: string; totalPages: number; pages: { page: number; texts: string[] }[] } {
  const pres = SlidesApp.openById(id);
  const slides = pres.getSlides();
  const pageNum = page ? parseInt(page) : 0;

  const extractTexts = (slide: GoogleAppsScript.Slides.Slide): string[] => {
    const texts = slide.getShapes().map(s => s.getText().asString().trim()).filter(t => t.length > 0);
    const tables = slide.getTables();
    tables.forEach(table => {
      const rows: string[] = [];
      for (let r = 0; r < table.getNumRows(); r++) {
        const cells: string[] = [];
        for (let c = 0; c < table.getNumColumns(); c++) {
          cells.push(table.getCell(r, c).getText().asString().trim());
        }
        rows.push(cells.join('\t'));
      }
      texts.push('[TABLE]\n' + rows.join('\n'));
    });
    return texts;
  };

  if (pageNum > 0) {
    if (pageNum > slides.length) throw new Error(`Page ${pageNum} not found. Total pages: ${slides.length}`);
    return { name: pres.getName(), totalPages: slides.length, pages: [{ page: pageNum, texts: extractTexts(slides[pageNum - 1]) }] };
  }

  return {
    name: pres.getName(),
    totalPages: slides.length,
    pages: slides.map((s, i) => ({ page: i + 1, texts: extractTexts(s) })),
  };
}

function createSlide(name: string): { id: string; name: string; url: string } {
  const pres = SlidesApp.create(name);
  return { id: pres.getId(), name: pres.getName(), url: pres.getUrl() };
}

function addSlidePage(id: string): { totalPages: number } {
  const pres = SlidesApp.openById(id);
  pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  return { totalPages: pres.getSlides().length };
}

function addSlideText(id: string, page: string, text: string): { page: number; shapeId: string } {
  const pres = SlidesApp.openById(id);
  const slides = pres.getSlides();
  const pageNum = parseInt(page);
  if (pageNum < 1 || pageNum > slides.length) throw new Error(`Page ${pageNum} not found. Total pages: ${slides.length}`);
  const shape = slides[pageNum - 1].insertTextBox(text);
  return { page: pageNum, shapeId: shape.getObjectId() };
}

function getSlideNotes(id: string, page?: string): { name: string; notes: { page: number; note: string }[] } {
  const pres = SlidesApp.openById(id);
  const slides = pres.getSlides();
  if (page) {
    const p = parseInt(page);
    if (p < 1 || p > slides.length) throw new Error(`Page ${p} not found. Total pages: ${slides.length}`);
    const note = slides[p - 1].getNotesPage().getSpeakerNotesShape().getText().asString().trim();
    return { name: pres.getName(), notes: [{ page: p, note }] };
  }
  return {
    name: pres.getName(),
    notes: slides.map((s, i) => ({ page: i + 1, note: s.getNotesPage().getSpeakerNotesShape().getText().asString().trim() })).filter(n => n.note),
  };
}

function setSlideNote(id: string, page: string, text: string): { page: number; note: string } {
  const pres = SlidesApp.openById(id);
  const slides = pres.getSlides();
  const p = parseInt(page);
  if (p < 1 || p > slides.length) throw new Error(`Page ${p} not found. Total pages: ${slides.length}`);
  slides[p - 1].getNotesPage().getSpeakerNotesShape().getText().setText(text);
  return { page: p, note: text };
}

function clearSlideNote(id: string, page: string): { page: number; cleared: true } {
  const pres = SlidesApp.openById(id);
  const slides = pres.getSlides();
  const p = parseInt(page);
  if (p < 1 || p > slides.length) throw new Error(`Page ${p} not found. Total pages: ${slides.length}`);
  slides[p - 1].getNotesPage().getSpeakerNotesShape().getText().clear();
  return { page: p, cleared: true };
}

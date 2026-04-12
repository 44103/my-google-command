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

  const extractTexts = (slide: GoogleAppsScript.Slides.Slide): string[] =>
    slide.getShapes().map(s => s.getText().asString().trim()).filter(t => t.length > 0);

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

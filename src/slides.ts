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

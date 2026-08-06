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

type SlideTextRunSnapshot = {
  startIndex: number;
  endIndex: number;
  text: string;
  fontFamily: string | null;
  fontSize: number | null;
};

type SlideParagraphSnapshot = {
  startIndex: number;
  endIndex: number;
  text: string;
  lineSpacing: number | null;
};

type SlideShapeSnapshot = {
  objectId: string;
  type: string;
  shapeType: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontFamily: string | null;
  fontSize: number | null;
  lineSpacing: number | null;
  textRuns: SlideTextRunSnapshot[];
  paragraphs: SlideParagraphSnapshot[];
};

type SlideElementGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SlideElementGeometryReader = {
  getLeft(): number;
  getTop(): number;
  getWidth(): number;
  getHeight(): number;
};

function parseSlidePage(page: string, totalPages: number): number {
  if (!/^\d+$/.test(page || "")) throw new Error("page must be a positive integer");
  const pageNum = Number(page);
  if (pageNum < 1 || pageNum > totalPages) {
    throw new Error(`Page ${pageNum} not found. Total pages: ${totalPages}`);
  }
  return pageNum;
}

function parseOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  return parsed;
}

function isDryRun(value: unknown): boolean {
  if (value === true || value === "true") return true;
  if (value === undefined || value === null || value === "" || value === false || value === "false") {
    return false;
  }
  throw new Error("dry-run must be true or false");
}

function getSlideByPage(
  pres: GoogleAppsScript.Slides.Presentation,
  page: string,
): { slide: GoogleAppsScript.Slides.Slide; pageNum: number } {
  const slides = pres.getSlides();
  const pageNum = parseSlidePage(page, slides.length);
  return { slide: slides[pageNum - 1], pageNum };
}

function getShapeByObjectId(
  slide: GoogleAppsScript.Slides.Slide,
  objectId: string,
): GoogleAppsScript.Slides.Shape {
  if (!objectId) throw new Error("shape is required");
  const shape = slide.getShapes().find(candidate => candidate.getObjectId() === objectId);
  if (!shape) throw new Error(`Shape ${objectId} not found on the selected page`);
  return shape;
}

function getElementGeometry(element: SlideElementGeometryReader): SlideElementGeometry {
  return {
    x: element.getLeft(),
    y: element.getTop(),
    width: element.getWidth(),
    height: element.getHeight(),
  };
}

function inspectShape(shape: GoogleAppsScript.Slides.Shape): SlideShapeSnapshot {
  const textRange = shape.getText();
  const textStyle = textRange.getTextStyle();
  const paragraphStyle = textRange.getParagraphStyle();
  const textRuns = textRange.getRuns().map((run): SlideTextRunSnapshot => {
    const runStyle = run.getTextStyle();
    return {
      startIndex: run.getStartIndex(),
      endIndex: run.getEndIndex(),
      text: run.asString(),
      fontFamily: runStyle?.getFontFamily() ?? null,
      fontSize: runStyle?.getFontSize() ?? null,
    };
  });
  const paragraphs: SlideParagraphSnapshot[] = [];
  textRange.getParagraphs().forEach(paragraph => {
    const range = paragraph.getRange();
    if (!range) return;
    paragraphs.push({
      startIndex: range.getStartIndex(),
      endIndex: range.getEndIndex(),
      text: range.asString(),
      lineSpacing: range.getParagraphStyle().getLineSpacing() ?? null,
    });
  });
  return {
    objectId: shape.getObjectId(),
    type: String(shape.getPageElementType()),
    shapeType: String(shape.getShapeType()),
    text: textRange.asString(),
    ...getElementGeometry(shape),
    rotation: shape.getRotation(),
    // Aggregate values are null for empty or mixed formatting; detailed values remain in the arrays.
    fontFamily: textStyle?.getFontFamily() ?? null,
    fontSize: textStyle?.getFontSize() ?? null,
    lineSpacing: paragraphStyle.getLineSpacing() ?? null,
    textRuns,
    paragraphs,
  };
}

function inspectSlide(
  id: string,
  page?: string,
): {
  name: string;
  totalPages: number;
  pageSize: { width: number; height: number };
  pages: { page: number; pageId: string; shapes: SlideShapeSnapshot[] }[];
} {
  const pres = SlidesApp.openById(id);
  const slides = pres.getSlides();
  const selectedSlides = page
    ? [{ slide: getSlideByPage(pres, page).slide, page: parseSlidePage(page, slides.length) }]
    : slides.map((slide, index) => ({ slide, page: index + 1 }));

  return {
    name: pres.getName(),
    totalPages: slides.length,
    pageSize: { width: pres.getPageWidth(), height: pres.getPageHeight() },
    pages: selectedSlides.map(({ slide, page: pageNum }) => ({
      page: pageNum,
      pageId: slide.getObjectId(),
      shapes: slide.getShapes().map(inspectShape),
    })),
  };
}

function getSlideThumbnail(
  id: string,
  page: string,
): { page: number; pageId: string; contentUrl: string; width: number; height: number; mimeType: string } {
  const pres = SlidesApp.openById(id);
  const { slide, pageNum } = getSlideByPage(pres, page);
  const thumbnail = Slides.Presentations!.Pages!.getThumbnail(id, slide.getObjectId(), {
    thumbnailProperties: { mimeType: "PNG", thumbnailSize: "LARGE" },
  });
  if (!thumbnail.contentUrl) throw new Error("Google Slides API did not return a thumbnail URL");
  return {
    page: pageNum,
    pageId: slide.getObjectId(),
    contentUrl: thumbnail.contentUrl,
    width: thumbnail.width || 0,
    height: thumbnail.height || 0,
    mimeType: "image/png",
  };
}

function applySlideBatchUpdate(
  id: string,
  requests: GoogleAppsScript.Slides.Schema.Request[],
): void {
  Slides.Presentations!.batchUpdate({ requests }, id);
}

function updateSlideText(
  id: string,
  page: string,
  objectId: string,
  text: string,
  dryRunValue?: unknown,
): { page: number; shape: string; dryRun: boolean; before: { text: string }; after: { text: string } } {
  if (typeof text !== "string") throw new Error("text is required");
  const pres = SlidesApp.openById(id);
  const { slide, pageNum } = getSlideByPage(pres, page);
  const shape = getShapeByObjectId(slide, objectId);
  const before = { text: shape.getText().asString() };
  const dryRun = isDryRun(dryRunValue);
  if (!dryRun) {
    const requests: GoogleAppsScript.Slides.Schema.Request[] = [{
      deleteText: { objectId, textRange: { type: "ALL" } },
    }];
    if (text.length > 0) {
      requests.push({
        insertText: { objectId, insertionIndex: 0, text },
      });
    }
    // Deletion and insertion are validated and applied atomically by the Slides API.
    applySlideBatchUpdate(id, requests);
  }
  return { page: pageNum, shape: objectId, dryRun, before, after: { text } };
}

function updateSlideTextStyle(
  id: string,
  page: string,
  objectId: string,
  sizeValue: unknown,
  dryRunValue?: unknown,
): { page: number; shape: string; dryRun: boolean; before: { fontSize: number | null }; after: { fontSize: number } } {
  const size = parseOptionalNumber(sizeValue, "size");
  if (size === undefined || size <= 0) throw new Error("size must be greater than 0");
  const pres = SlidesApp.openById(id);
  const { slide, pageNum } = getSlideByPage(pres, page);
  const shape = getShapeByObjectId(slide, objectId);
  const textRange = shape.getText();
  if (textRange.isEmpty()) throw new Error(`Shape ${objectId} has no text to style`);
  const textStyle = textRange.getTextStyle();
  const before = { fontSize: textStyle?.getFontSize() ?? null };
  const dryRun = isDryRun(dryRunValue);
  if (!dryRun) {
    applySlideBatchUpdate(id, [{
      updateTextStyle: {
        objectId,
        textRange: { type: "ALL" },
        style: { fontSize: { magnitude: size, unit: "PT" } },
        fields: "fontSize",
      },
    }]);
  }
  return { page: pageNum, shape: objectId, dryRun, before, after: { fontSize: size } };
}

function updateSlideShape(
  id: string,
  page: string,
  objectId: string,
  values: { width?: unknown; height?: unknown; x?: unknown; y?: unknown },
  dryRunValue?: unknown,
): { page: number; shape: string; dryRun: boolean; before: SlideElementGeometry; after: SlideElementGeometry } {
  const width = parseOptionalNumber(values.width, "width");
  const height = parseOptionalNumber(values.height, "height");
  const x = parseOptionalNumber(values.x, "x");
  const y = parseOptionalNumber(values.y, "y");
  if ([width, height, x, y].every(value => value === undefined)) {
    throw new Error("At least one of width, height, x, or y is required");
  }
  if (width !== undefined && width <= 0) throw new Error("width must be greater than 0");
  if (height !== undefined && height <= 0) throw new Error("height must be greater than 0");

  const pres = SlidesApp.openById(id);
  const { slide, pageNum } = getSlideByPage(pres, page);
  const shape = getShapeByObjectId(slide, objectId);
  const before = getElementGeometry(shape);
  const after = {
    width: width ?? before.width,
    height: height ?? before.height,
    x: x ?? before.x,
    y: y ?? before.y,
  };
  const dryRun = isDryRun(dryRunValue);
  if (!dryRun) {
    const transform = shape.getTransform();
    const widthRatio = after.width / before.width;
    const heightRatio = after.height / before.height;
    applySlideBatchUpdate(id, [{
      updatePageElementTransform: {
        objectId,
        applyMode: "ABSOLUTE",
        transform: {
          // Scale each basis-vector column to preserve the current rotation and shear.
          scaleX: transform.getScaleX() * widthRatio,
          shearY: transform.getShearY() * widthRatio,
          shearX: transform.getShearX() * heightRatio,
          scaleY: transform.getScaleY() * heightRatio,
          translateX: x ?? transform.getTranslateX(),
          translateY: y ?? transform.getTranslateY(),
          unit: "PT",
        },
      },
    }]);
  }
  return { page: pageNum, shape: objectId, dryRun, before, after };
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

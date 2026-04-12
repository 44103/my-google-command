function listForms(max?: number): { id: string; name: string; updated: string }[] {
  const files = DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
  const result: { id: string; name: string; updated: string }[] = [];
  const limit = max || 20;
  while (files.hasNext() && result.length < limit) {
    const f = files.next();
    result.push({ id: f.getId(), name: f.getName(), updated: f.getLastUpdated().toISOString() });
  }
  return result;
}

function getFormDetail(id: string): {
  id: string; name: string; description: string; url: string;
  items: { index: number; title: string; type: string; choices?: string[]; required: boolean }[];
} {
  const form = FormApp.openById(id);
  const items = form.getItems().map((item, i) => {
    const base = { index: i, title: item.getTitle(), type: item.getType().toString(), required: false as boolean, choices: undefined as string[] | undefined };
    switch (item.getType()) {
      case FormApp.ItemType.TEXT:
        base.required = item.asTextItem().isRequired(); break;
      case FormApp.ItemType.PARAGRAPH_TEXT:
        base.required = item.asParagraphTextItem().isRequired(); break;
      case FormApp.ItemType.MULTIPLE_CHOICE: {
        const mc = item.asMultipleChoiceItem();
        base.required = mc.isRequired();
        base.choices = mc.getChoices().map(c => c.getValue());
        break;
      }
      case FormApp.ItemType.CHECKBOX: {
        const cb = item.asCheckboxItem();
        base.required = cb.isRequired();
        base.choices = cb.getChoices().map(c => c.getValue());
        break;
      }
      case FormApp.ItemType.LIST: {
        const li = item.asListItem();
        base.required = li.isRequired();
        base.choices = li.getChoices().map(c => c.getValue());
        break;
      }
      case FormApp.ItemType.SCALE:
        base.required = item.asScaleItem().isRequired(); break;
    }
    return base;
  });
  return { id: form.getId(), name: form.getTitle(), description: form.getDescription(), url: form.getPublishedUrl(), items };
}

function getFormResponses(id: string): {
  responseCount: number;
  responses: { timestamp: string; answers: { title: string; response: string }[] }[];
} {
  const form = FormApp.openById(id);
  const responses = form.getResponses();
  return {
    responseCount: responses.length,
    responses: responses.map(r => ({
      timestamp: r.getTimestamp().toISOString(),
      answers: r.getItemResponses().map(ir => ({
        title: ir.getItem().getTitle(),
        response: String(ir.getResponse()),
      })),
    })),
  };
}

function createForm(name: string, description?: string): { id: string; name: string; url: string; editUrl: string } {
  const form = FormApp.create(name);
  if (description) form.setDescription(description);
  return { id: form.getId(), name, url: form.getPublishedUrl(), editUrl: form.getEditUrl() };
}

function addFormItem(
  id: string,
  type: string,
  title: string,
  options?: { choices?: string; required?: boolean; low?: string; high?: string; lowLabel?: string; highLabel?: string },
): { index: number; title: string; type: string } {
  const form = FormApp.openById(id);
  const req = options?.required || false;

  switch (type) {
    case "text": {
      const item = form.addTextItem().setTitle(title).setRequired(req);
      return { index: item.getIndex(), title: item.getTitle(), type };
    }
    case "paragraph": {
      const item = form.addParagraphTextItem().setTitle(title).setRequired(req);
      return { index: item.getIndex(), title: item.getTitle(), type };
    }
    case "choice": {
      const item = form.addMultipleChoiceItem().setTitle(title).setRequired(req);
      if (options?.choices) item.setChoiceValues(options.choices.split(",").map(s => s.trim()));
      return { index: item.getIndex(), title: item.getTitle(), type };
    }
    case "checkbox": {
      const item = form.addCheckboxItem().setTitle(title).setRequired(req);
      if (options?.choices) item.setChoiceValues(options.choices.split(",").map(s => s.trim()));
      return { index: item.getIndex(), title: item.getTitle(), type };
    }
    case "dropdown": {
      const item = form.addListItem().setTitle(title).setRequired(req);
      if (options?.choices) item.setChoiceValues(options.choices.split(",").map(s => s.trim()));
      return { index: item.getIndex(), title: item.getTitle(), type };
    }
    case "scale": {
      const item = form.addScaleItem().setTitle(title).setRequired(req);
      const low = parseInt(options?.low || "1");
      const high = parseInt(options?.high || "5");
      item.setBounds(low, high);
      if (options?.lowLabel) item.setLabels(options.lowLabel, options?.highLabel || "");
      return { index: item.getIndex(), title: item.getTitle(), type };
    }
    default:
      throw new Error(`Unknown item type: ${type}. Available: text, paragraph, choice, checkbox, dropdown, scale`);
  }
}

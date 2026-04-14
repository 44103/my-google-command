function listTaskLists(): { id: string; title: string }[] {
  const res = Tasks.Tasklists!.list();
  return (res.items || []).map(tl => ({ id: tl.id!, title: tl.title! }));
}

function createTaskList(title: string): { id: string; title: string } {
  const created = Tasks.Tasklists!.insert({ title });
  return { id: created.id!, title: created.title! };
}

function updateTaskList(id: string, title: string): { id: string; title: string } {
  const updated = Tasks.Tasklists!.patch({ title }, id);
  return { id: updated.id!, title: updated.title! };
}

function deleteTaskList(id: string): { deleted: true; id: string } {
  Tasks.Tasklists!.remove(id);
  return { deleted: true, id };
}

function listTasks(taskListId: string): { id: string; title: string; status: string; due: string | null }[] {
  const res = Tasks.Tasks!.list(taskListId, { showCompleted: false });
  return (res.items || []).map(t => ({
    id: t.id!,
    title: t.title!,
    status: t.status!,
    due: t.due || null,
  }));
}

function createTask(taskListId: string, title: string, due?: string, notes?: string): { id: string; title: string; status: string; due: string | null; notes: string | null } {
  const task: GoogleAppsScript.Tasks.Schema.Task = { title };
  if (due) task.due = new Date(due).toISOString();
  if (notes) task.notes = notes;
  const created = Tasks.Tasks!.insert(task, taskListId);
  return { id: created.id!, title: created.title!, status: created.status!, due: created.due || null, notes: created.notes || null };
}

function updateTask(taskListId: string, taskId: string, fields: { title?: string; due?: string; notes?: string }): { id: string; title: string; status: string; due: string | null; notes: string | null } {
  const patch: GoogleAppsScript.Tasks.Schema.Task = {};
  if (fields.title !== undefined && fields.title !== "") patch.title = fields.title;
  if (fields.due !== undefined && fields.due !== "") patch.due = new Date(fields.due).toISOString();
  if (fields.notes !== undefined && fields.notes !== "") patch.notes = fields.notes;
  const updated = Tasks.Tasks!.patch(patch, taskListId, taskId);
  return { id: updated.id!, title: updated.title!, status: updated.status!, due: updated.due || null, notes: updated.notes || null };
}

function completeTask(taskListId: string, taskId: string): { id: string; title: string; status: string } {
  const updated = Tasks.Tasks!.patch({ status: "completed" }, taskListId, taskId);
  return { id: updated.id!, title: updated.title!, status: updated.status! };
}

function deleteTask(taskListId: string, taskId: string): { deleted: true; task: string } {
  Tasks.Tasks!.remove(taskListId, taskId);
  return { deleted: true, task: taskId };
}

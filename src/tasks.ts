function listTaskLists(): { id: string; title: string }[] {
  const res = Tasks.Tasklists!.list();
  return (res.items || []).map(tl => ({ id: tl.id!, title: tl.title! }));
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

function createTask(taskListId: string, title: string, due?: string): { id: string; title: string; status: string; due: string | null } {
  const task: GoogleAppsScript.Tasks.Schema.Task = { title };
  if (due) task.due = new Date(due).toISOString();
  const created = Tasks.Tasks!.insert(task, taskListId);
  return { id: created.id!, title: created.title!, status: created.status!, due: created.due || null };
}

function completeTask(taskListId: string, taskId: string): { id: string; title: string; status: string } {
  const updated = Tasks.Tasks!.patch({ status: "completed" }, taskListId, taskId);
  return { id: updated.id!, title: updated.title!, status: updated.status! };
}

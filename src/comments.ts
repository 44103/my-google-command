function listComments(fileId: string): {
  id: string;
  author: string;
  content: string;
  createdTime: string;
  resolved: boolean;
  quotedContent: string | null;
  replies: { author: string; content: string; createdTime: string }[];
}[] {
  const res = Drive.Comments!.list(fileId, {
    fields: "items(commentId,author(displayName),content,createdDate,status,context(value),replies(author(displayName),content,createdDate))",
    maxResults: 100,
    includeDeleted: false,
  });
  return ((res as any).items || []).map((c: any) => ({
    id: c.commentId || "",
    author: c.author?.displayName || "",
    content: c.content || "",
    createdTime: c.createdDate || "",
    resolved: c.status === "resolved",
    quotedContent: c.context?.value || null,
    replies: (c.replies || []).map((r: any) => ({
      author: r.author?.displayName || "",
      content: r.content || "",
      createdTime: r.createdDate || "",
    })),
  }));
}

function createComment(fileId: string, content: string): { id: string; author: string; content: string; createdTime: string } {
  const res = (Drive as any).Comments.insert({ content }, fileId);
  return {
    id: res.commentId || "",
    author: res.author?.displayName || "",
    content: res.content || "",
    createdTime: res.createdDate || "",
  };
}

function updateComment(fileId: string, commentId: string, content: string): { id: string; content: string } {
  const res = (Drive as any).Comments.patch({ content }, fileId, commentId);
  return { id: res.commentId || "", content: res.content || "" };
}

function deleteComment(fileId: string, commentId: string): { success: true } {
  (Drive as any).Comments.remove(fileId, commentId);
  return { success: true };
}

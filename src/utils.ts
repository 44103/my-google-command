function resolveId(params: { id?: string; url?: string }): string {
  const value = params.id || params.url;
  if (!value) throw new Error("id or url is required");
  const match = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

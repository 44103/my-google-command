function getCurrentEmail(): { local: string; domain: string } {
  const about = (Drive as any).About.get({});
  const email: string = about.user.emailAddress;
  const [local, domain] = email.split("@");
  return { local, domain };
}

function getPrivateProperty(fileId: string, key: string): string | null {
  try {
    const prop = (Drive as any).Properties.get(fileId, key, { visibility: "PRIVATE" });
    return prop.value || null;
  } catch (_e) {
    return null;
  }
}

function setPrivateProperty(fileId: string, key: string, value: string): void {
  try {
    (Drive as any).Properties.update({ key, value, visibility: "PRIVATE" }, fileId, key, { visibility: "PRIVATE" });
  } catch (_e) {
    (Drive as any).Properties.insert({ key, value, visibility: "PRIVATE" }, fileId);
  }
}

function getFileProps(fileId: string): { id: string; name: string; properties: Record<string, string> } {
  const file = DriveApp.getFileById(fileId);
  const propList = (Drive as any).Properties.list(fileId, { visibility: "PRIVATE" }) as any;
  const items: any[] = propList.items || [];
  const props: Record<string, string> = {};
  for (const item of items) {
    props[item.key] = item.value;
  }
  return { id: fileId, name: file.getName(), properties: props };
}

function resolvePermission(acl: string | null, required: "r" | "w"): { result: "allow" | "deny"; reason: "blocked" | "not_set" | "readonly" | null } {
  if (acl === "-") return { result: "deny", reason: "blocked" };
  if (acl === "w") return { result: "allow", reason: null };
  if (acl === "r") return required === "r" ? { result: "allow", reason: null } : { result: "deny", reason: "readonly" };
  return ACL_MODE === "blacklist" ? { result: "allow", reason: null } : { result: "deny", reason: "not_set" };
}

function checkAcl(fileId: string, mode: "r" | "w"): void {
  const acl = getPrivateProperty(fileId, "acl");
  const { result, reason } = resolvePermission(acl, mode);
  if (result === "deny") {
    const level = mode === "w" ? "full" : "readonly";
    const desc = mode === "w" ? "read+write" : "read-only";
    const prefix = reason === "blocked"
      ? "ACCESS_DENIED: WARNING - This file is explicitly BLOCKED (acl=-). Someone intentionally restricted access."
      : reason === "readonly"
        ? "WRITE_DENIED: This file is read-only (acl=r)."
        : "ACL_NOT_SET: This file has not been permitted for myg access.";
    throw new Error(prefix + " To allow " + desc + " access, run: myg acl file id=" + fileId + " " + level);
  }
}

function setFileAcl(fileId: string, value: string): { id: string; name: string; acl: string } {
  const file = DriveApp.getFileById(fileId);
  const allowed = ["-", "r", "w"];
  if (!allowed.includes(value)) {
    throw new Error("Invalid acl value. Allowed: -, r, w");
  }
  setPrivateProperty(fileId, "acl", value);
  const { local, domain } = getCurrentEmail();
  setPrivateProperty(fileId, "permitted_local", local);
  setPrivateProperty(fileId, "permitted_domain", domain);
  setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
  return { id: fileId, name: file.getName(), acl: value };
}

function trackFileAccess(fileId: string): void {
  if (ACL_MODE !== "blacklist") return;
  const currentAcl = getPrivateProperty(fileId, "acl");
  if (!currentAcl) {
    setPrivateProperty(fileId, "acl", "r");
    const { local, domain } = getCurrentEmail();
    setPrivateProperty(fileId, "permitted_local", local);
    setPrivateProperty(fileId, "permitted_domain", domain);
    setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
  }
}

function trackFileWrite(fileId: string): void {
  const currentAcl = getPrivateProperty(fileId, "acl");
  if (!currentAcl || currentAcl === "r") {
    setPrivateProperty(fileId, "acl", "w");
    const { local, domain } = getCurrentEmail();
    setPrivateProperty(fileId, "permitted_local", local);
    setPrivateProperty(fileId, "permitted_domain", domain);
    setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
  }
}

function trackFileCreation(fileId: string): void {
  setPrivateProperty(fileId, "created", "y");
  setPrivateProperty(fileId, "acl", "w");
  const { local, domain } = getCurrentEmail();
  setPrivateProperty(fileId, "permitted_local", local);
  setPrivateProperty(fileId, "permitted_domain", domain);
  setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
}

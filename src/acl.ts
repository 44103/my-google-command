// config is a global variable defined in config.generated.ts

// --- Cache helpers for read-only file fallback ---
const ACL_CACHE_PREFIX = "acl:";
const ACL_CACHE_TTL = 600; // 10 minutes

function getCachedAcl(fileId: string): string | null {
  const cache = CacheService.getUserCache();
  return cache.get(ACL_CACHE_PREFIX + fileId);
}

function setCachedAcl(fileId: string, value: string): void {
  const cache = CacheService.getUserCache();
  cache.put(ACL_CACHE_PREFIX + fileId, value, ACL_CACHE_TTL);
}

// --- Core helpers ---

function getCurrentEmail(): { local: string; domain: string } {
  const about = (Drive as any).About.get({});
  const email: string = about.user.emailAddress;
  const [local, domain] = email.split("@");
  return { local, domain };
}

function getPrivateProperty(fileId: string, key: string): { value: string | null; accessible: boolean } {
  try {
    const prop = (Drive as any).Properties.get(fileId, key, { visibility: "PRIVATE" });
    return { value: prop.value || null, accessible: true };
  } catch (e: any) {
    // Distinguish "not found" (404) from "no access" (403)
    const msg = e && e.message ? e.message : String(e);
    if (msg.indexOf("404") !== -1 || msg.indexOf("not found") !== -1 || msg.indexOf("Not Found") !== -1) {
      // Property doesn't exist, but we have access to the file
      return { value: null, accessible: true };
    }
    // Permission denied or other error → file is likely read-only
    return { value: null, accessible: false };
  }
}

function setPrivateProperty(fileId: string, key: string, value: string): void {
  try {
    (Drive as any).Properties.update({ key, value, visibility: "PRIVATE" }, fileId, key, { visibility: "PRIVATE" });
  } catch (_e) {
    (Drive as any).Properties.insert({ key, value, visibility: "PRIVATE" }, fileId);
  }
}

function getFileProps(fileId: string): { id: string; name: string; properties: Record<string, string>; aclMessage?: string } {
  const file = DriveApp.getFileById(fileId);
  const props: Record<string, string> = {};
  try {
    const propList = (Drive as any).Properties.list(fileId, { visibility: "PRIVATE" }) as any;
    const items: any[] = propList.items || [];
    for (const item of items) {
      props[item.key] = item.value;
    }
    // If no ACL in file properties, check cache as well
    if (!props["acl"]) {
      const cached = getCachedAcl(fileId);
      if (cached) {
        props["acl"] = cached;
        props["_source"] = "cache";
      }
    }
  } catch (_e) {
    // Cannot read properties (read-only file); check cache
    const cached = getCachedAcl(fileId);
    if (cached) {
      props["acl"] = cached;
      props["_source"] = "cache";
    }
  }
  const result: { id: string; name: string; properties: Record<string, string>; aclMessage?: string } = {
    id: fileId,
    name: file.getName(),
    properties: props
  };
  if (config.aclMessage) {
    result.aclMessage = config.aclMessage;
  }
  return result;
}

function resolvePermission(acl: string | null, required: "r" | "w"): { result: "allow" | "deny"; reason: "blocked" | "not_set" | "readonly" | null } {
  if (acl === "-") return { result: "deny", reason: "blocked" };
  if (acl === "w") return { result: "allow", reason: null };
  if (acl === "r") return required === "r" ? { result: "allow", reason: null } : { result: "deny", reason: "readonly" };
  return config.aclMode === "blacklist" ? { result: "allow", reason: null } : { result: "deny", reason: "not_set" };
}

function checkAcl(fileId: string, mode: "r" | "w"): void {
  // 1. Try File Properties (works for files we can edit)
  const { value: acl, accessible } = getPrivateProperty(fileId, "acl");
  if (accessible && acl !== null) {
    const { result, reason } = resolvePermission(acl, mode);
    if (result === "deny") {
      throwAclError(fileId, mode, reason!);
    }
    return;
  }

  // 2. Check cache (covers read-only files and explicit cache-based deny)
  const cached = getCachedAcl(fileId);
  if (cached !== null) {
    const { result, reason } = resolvePermission(cached, mode);
    if (result === "deny") {
      throwAclError(fileId, mode, reason!);
    }
    return;
  }

  // 3. File is read-only (cannot access properties) → auto-grant read via cache
  if (!accessible && mode === "r") {
    setCachedAcl(fileId, "r");
    return;
  }

  // 4. File is read-only but write requested → deny
  if (!accessible && mode === "w") {
    throwAclError(fileId, mode, "readonly");
    return;
  }

  // 5. Accessible but ACL not set → fall back to default ACL_MODE behavior
  const { result, reason } = resolvePermission(null, mode);
  if (result === "deny") {
    throwAclError(fileId, mode, reason!);
  }
}

function throwAclError(fileId: string, mode: "r" | "w", reason: "blocked" | "not_set" | "readonly"): never {
  const level = mode === "w" ? "full" : "readonly";
  const desc = mode === "w" ? "read+write" : "read-only";
  const prefix = reason === "blocked"
    ? "ACCESS_DENIED: WARNING - This file is explicitly BLOCKED (acl=-). Someone intentionally restricted access."
    : reason === "readonly"
      ? "WRITE_DENIED: This file is read-only (acl=r)."
      : "ACL_NOT_SET: This file has not been permitted for myg access.";
  throw new Error(prefix + " To allow " + desc + " access, run: myg acl file id=" + fileId + " " + level);
}

function setFileAcl(fileId: string, value: string): { id: string; name: string; acl: string; storage: "file" | "cache"; aclMessage?: string } {
  const file = DriveApp.getFileById(fileId);
  const allowed = ["-", "r", "w"];
  if (!allowed.includes(value)) {
    throw new Error("Invalid acl value. Allowed: -, r, w");
  }

  // Always update cache (works regardless of file permissions)
  setCachedAcl(fileId, value);

  // Try to write to File Properties directly; fall back to cache if it fails
  let storage: "file" | "cache" = "cache";
  try {
    // Attempt to write File Properties - this will fail for read-only files
    setPrivateProperty(fileId, "acl", value);
    const { local, domain } = getCurrentEmail();
    setPrivateProperty(fileId, "permitted_local", local);
    setPrivateProperty(fileId, "permitted_domain", domain);
    setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
    storage = "file";
  } catch (_e) {
    // File Properties write failed (likely read-only file) - ACL is enforced via cache only
  }

  const result: { id: string; name: string; acl: string; storage: "file" | "cache"; aclMessage?: string } = {
    id: fileId,
    name: file.getName(),
    acl: value,
    storage
  };
  if (config.aclMessage) {
    result.aclMessage = config.aclMessage;
  }
  return result;
}

function trackFileAccess(fileId: string): void {
  if (config.aclMode !== "blacklist") return;
  const { value: currentAcl, accessible } = getPrivateProperty(fileId, "acl");
  if (!currentAcl) {
    if (accessible) {
      try {
        setPrivateProperty(fileId, "acl", "r");
        const { local, domain } = getCurrentEmail();
        setPrivateProperty(fileId, "permitted_local", local);
        setPrivateProperty(fileId, "permitted_domain", domain);
        setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
      } catch (_e) {
        setCachedAcl(fileId, "r");
      }
    } else {
      setCachedAcl(fileId, "r");
    }
  }
}

function trackFileWrite(fileId: string): void {
  const { value: currentAcl, accessible } = getPrivateProperty(fileId, "acl");
  if (!currentAcl || currentAcl === "r") {
    if (accessible) {
      try {
        setPrivateProperty(fileId, "acl", "w");
        const { local, domain } = getCurrentEmail();
        setPrivateProperty(fileId, "permitted_local", local);
        setPrivateProperty(fileId, "permitted_domain", domain);
        setPrivateProperty(fileId, "permitted_at", new Date().toISOString());
      } catch (_e) {
        setCachedAcl(fileId, "w");
      }
    } else {
      setCachedAcl(fileId, "w");
    }
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

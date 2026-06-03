function resolveScriptId(id: string): string {
  const match = id.match(/\/projects\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : id;
}

function gasFetch(path: string) {
  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch(`https://script.googleapis.com/v1/projects/${path}`, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const data = JSON.parse(resp.getContentText());
  if (code >= 400) throw new Error(data.error?.message || `API error ${code}`);
  return data;
}

function getGasInfo(scriptId: string) {
  const data = gasFetch(resolveScriptId(scriptId));
  return {
    scriptId: data.scriptId,
    title: data.title,
    createTime: data.createTime,
    updateTime: data.updateTime,
    parentId: data.parentId,
  };
}

function listGasDeployments(scriptId: string) {
  const data = gasFetch(`${resolveScriptId(scriptId)}/deployments`);
  return (data.deployments || []).map((d: any) => ({
    id: d.deploymentId,
    version: d.deploymentConfig?.versionNumber || "HEAD",
    description: d.deploymentConfig?.description || "",
    updated: d.updateTime,
    url: d.entryPoints?.find((ep: any) => ep.webApp)?.webApp?.url || null,
    access: d.entryPoints?.find((ep: any) => ep.webApp)?.webApp?.entryPointConfig?.access || null,
  }));
}

function listGasVersions(scriptId: string) {
  const data = gasFetch(`${resolveScriptId(scriptId)}/versions`);
  return (data.versions || []).map((v: any) => ({
    version: v.versionNumber,
    description: v.description || "",
    created: v.createTime,
  }));
}

function listGasFiles(scriptId: string) {
  const data = gasFetch(`${resolveScriptId(scriptId)}/content`);
  return (data.files || []).map((f: any) => ({
    name: f.name,
    type: f.type,
    lines: (f.source || "").split("\n").length,
  }));
}

function getGasFile(scriptId: string, name: string) {
  const data = gasFetch(`${resolveScriptId(scriptId)}/content`);
  const file = (data.files || []).find((f: any) => f.name === name);
  if (!file) throw new Error(`File not found: ${name}`);
  return { name: file.name, type: file.type, source: file.source };
}

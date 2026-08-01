#!/usr/bin/env node
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// --- Version check ---
const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);
if (nodeVersion < 18) {
  process.stderr.write(
    `[myg-daemon] Error: Node.js 18+ required (found: v${process.versions.node})\n`
  );
  process.exit(1);
}

// --- Configuration ---
const PORT = parseInt(process.env.MYG_DAEMON_PORT || "19333", 10);
const PID_FILE = path.join(__dirname, "..", ".daemon-pid");
const LOG_FILE = process.env.MYG_DAEMON_LOG || path.join(
  process.platform === "win32" ? (process.env.TEMP || "C:\\Temp") : "/tmp",
  "myg-daemon.log"
);
const HOST = "127.0.0.1";
const MAX_REDIRECTS = 10;

// --- Page templates ---
const PAGES_DIR = path.join(__dirname, "pages");

function loadPage(name) {
  return fs.readFileSync(path.join(PAGES_DIR, name), "utf-8");
}

function renderPage(name, vars) {
  let html = loadPage(name);
  // Simple template: {{var}}, {{#var}}...{{/var}} (conditional block)
  for (const [key, value] of Object.entries(vars)) {
    // Conditional blocks
    const blockRe = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, "g");
    html = value ? html.replace(blockRe, "$1") : html.replace(blockRe, "");
    // Variable substitution
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  // Remove unresolved conditional blocks
  html = html.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, "");
  return html;
}

// --- State ---
let accessToken = null;
let tokenReceivedAt = null;
const pendingConfirms = new Map();

// --- Helpers ---
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

/**
 * Follow redirects manually using http/https.request.
 * fetch() handles redirects automatically but does not expose intermediate URLs.
 * We use fetch() for the actual proxy since Node 18+ guarantees it.
 */
async function proxyToGas(method, gasUrl, headers, body) {
  const options = {
    method,
    headers: { ...headers },
    redirect: "follow",
  };
  if (body) {
    options.body = body;
  }

  const res = await fetch(gasUrl, options);
  const text = await res.text();
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: text,
  };
}

// --- Request Handler ---
async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Gas-Url, X-Http-Method",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // --- POST /auth/callback --- receive token from browser
  if (url.pathname === "/auth/callback" && req.method === "POST") {
    const body = await readBody(req);
    let token;
    try {
      const parsed = JSON.parse(body);
      token = parsed.token;
    } catch {
      // Try form-encoded
      const params = new URLSearchParams(body);
      token = params.get("token");
    }

    if (!token) {
      jsonResponse(res, 400, { error: "No token provided" });
      return;
    }

    accessToken = token;
    tokenReceivedAt = new Date().toISOString();
    log("Token received and stored in memory.");
    jsonResponse(res, 200, { ok: true, message: "Token saved" });
    return;
  }

  // --- GET /auth/callback --- browser redirect (show success page)
  if (url.pathname === "/auth/callback" && req.method === "GET") {
    const token = url.searchParams.get("token");
    if (token) {
      accessToken = token;
      tokenReceivedAt = new Date().toISOString();
      log("Token received via GET callback.");
    }
    // Return a simple HTML success page
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderPage("auth-success.html", {}));
    return;
  }

  // --- GET /status --- health check
  if (url.pathname === "/status") {
    jsonResponse(res, 200, {
      running: true,
      hasToken: !!accessToken,
      tokenReceivedAt,
      pid: process.pid,
      nodeVersion: process.versions.node,
    });
    return;
  }

  // --- POST /auth/clear --- clear existing token for re-authentication
  if (url.pathname === "/auth/clear" && req.method === "POST") {
    accessToken = null;
    tokenReceivedAt = null;
    log("Token cleared for re-authentication.");
    jsonResponse(res, 200, { ok: true });
    return;
  }

  // --- GET /token --- retrieve token (localhost only, for saving to .token file)
  if (url.pathname === "/token" && req.method === "GET") {
    if (!accessToken) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(accessToken);
    return;
  }

  // --- POST /shutdown --- graceful stop
  if (url.pathname === "/shutdown" && req.method === "POST") {
    jsonResponse(res, 200, { ok: true, message: "Shutting down" });
    cleanup();
    setTimeout(() => process.exit(0), 100);
    return;
  }

  // --- POST /proxy --- forward request to GAS
  if (url.pathname === "/proxy" && req.method === "POST") {
    if (!accessToken) {
      jsonResponse(res, 401, { error: "No token. Run: myg auth" });
      return;
    }

    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      jsonResponse(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const { gasUrl, method: gasMethod, params, postBody } = payload;
    if (!gasUrl) {
      jsonResponse(res, 400, { error: "Missing gasUrl" });
      return;
    }

    try {
      let targetUrl = gasUrl;
      const headers = { Authorization: `Bearer ${accessToken}` };

      if ((gasMethod || "GET") === "GET" && params) {
        const qs = new URLSearchParams(params).toString();
        targetUrl += (targetUrl.includes("?") ? "&" : "?") + qs;
      }

      let reqBody = null;
      if ((gasMethod || "GET") === "POST" && postBody) {
        headers["Content-Type"] = "application/json";
        reqBody = typeof postBody === "string" ? postBody : JSON.stringify(postBody);
      }

      const gasRes = await proxyToGas(gasMethod || "GET", targetUrl, headers, reqBody);

      // Pass through the response
      res.writeHead(gasRes.status, {
        "Content-Type": gasRes.headers["content-type"] || "application/json",
      });
      res.end(gasRes.body);
    } catch (err) {
      log(`Proxy error: ${err.message}`);
      jsonResponse(res, 502, { error: `Proxy error: ${err.message}` });
    }
    return;
  }

  // --- Confirmation flow ---
  const confirmMatch = url.pathname.match(/^\/confirm\/([^/]+)(?:\/(.+))?$/);
  if (confirmMatch) {
    const confirmId = confirmMatch[1];
    const subpath = confirmMatch[2] || "";

    // POST /confirm/request — create a new confirmation prompt
    if (url.pathname === "/confirm/request" && req.method === "POST") {
      const body = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const { message, action } = payload;
      const id = Math.random().toString(36).slice(2, 10);
      pendingConfirms.set(id, {
        message: message || "Are you sure?",
        action: action || "",
        status: "pending",
        createdAt: new Date().toISOString(),
        waiters: [],
      });
      log(`Confirm request created: ${id} - ${message || action}`);
      jsonResponse(res, 200, {
        id,
        url: `http://${HOST}:${PORT}/confirm/${id}/page`,
      });
      return;
    }

    const entry = pendingConfirms.get(confirmId);
    if (!entry) {
      jsonResponse(res, 404, { error: "Confirmation not found or expired" });
      return;
    }

    // GET /confirm/:id — check status
    if (!subpath && req.method === "GET") {
      jsonResponse(res, 200, {
        id: confirmId,
        status: entry.status,
        message: entry.message,
        action: entry.action,
        createdAt: entry.createdAt,
      });
      return;
    }

    // GET /confirm/:id/wait — long-poll until resolved or timeout
    if (subpath === "wait" && req.method === "GET") {
      if (entry.status !== "pending") {
        jsonResponse(res, 200, { id: confirmId, status: entry.status });
        return;
      }
      // Hold connection open until resolved
      const timeout = setTimeout(() => {
        entry.waiters = entry.waiters.filter((w) => w !== resolve);
        jsonResponse(res, 408, { id: confirmId, status: "timeout" });
      }, 60000);

      const resolve = (status) => {
        clearTimeout(timeout);
        jsonResponse(res, 200, { id: confirmId, status });
      };
      entry.waiters.push(resolve);
      return;
    }

    // GET /confirm/:id/page — browser confirmation page
    if (subpath === "page" && req.method === "GET") {
      if (entry.status !== "pending") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderPage("confirm-resolved.html", {
          status: entry.status === "approved" ? "Approved" : "Denied",
        }));
        return;
      }
      // Escape < > first, then convert URLs to links
      const escaped = entry.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const escapedMessage = escaped.replace(/(https?:\/\/[^\s&]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      const escapedAction = entry.action ? entry.action.replace(/</g, "&lt;") : "";
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderPage("confirm.html", {
        message: escapedMessage,
        action: escapedAction,
        id: confirmId,
      }));
      return;
    }

    // POST /confirm/:id/approve
    if (subpath === "approve" && req.method === "POST") {
      entry.status = "approved";
      log(`Confirm ${confirmId}: approved`);
      for (const waiter of entry.waiters) waiter("approved");
      entry.waiters = [];
      // Auto-cleanup after 60s
      setTimeout(() => pendingConfirms.delete(confirmId), 60000);
      jsonResponse(res, 200, { id: confirmId, status: "approved" });
      return;
    }

    // POST /confirm/:id/deny
    if (subpath === "deny" && req.method === "POST") {
      entry.status = "denied";
      log(`Confirm ${confirmId}: denied`);
      for (const waiter of entry.waiters) waiter("denied");
      entry.waiters = [];
      setTimeout(() => pendingConfirms.delete(confirmId), 60000);
      jsonResponse(res, 200, { id: confirmId, status: "denied" });
      return;
    }

    jsonResponse(res, 404, { error: "Not found" });
    return;
  }

  // --- 404 ---
  jsonResponse(res, 404, { error: "Not found" });
}

// --- Server Lifecycle ---
const server = http.createServer(handleRequest);

function cleanup() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {}
}

function writePidFile() {
  fs.writeFileSync(PID_FILE, String(process.pid));
}

server.listen(PORT, HOST, () => {
  writePidFile();
  log(`Listening on ${HOST}:${PORT} (pid: ${process.pid})`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log(`Port ${PORT} already in use. Another daemon may be running.`);
    process.exit(1);
  }
  log(`Server error: ${err.message}`);
  process.exit(1);
});

process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

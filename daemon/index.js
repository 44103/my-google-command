#!/usr/bin/env node
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// --- Configuration ---
const PORT = parseInt(process.env.MYG_DAEMON_PORT || "19287", 10);
const PID_FILE = path.join(__dirname, "..", ".daemon-pid");
const HOST = "127.0.0.1";

// --- State ---
let accessToken = null;
let tokenReceivedAt = null;

// --- Helpers ---
function log(msg) {
  process.stderr.write(`[myg-daemon] ${msg}\n`);
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

function proxyToGas(method, gasUrl, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(gasUrl);
    const transport = url.protocol === "https:" ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { ...headers },
    };

    const req = transport.request(options, (res) => {
      // Follow redirects (GAS always redirects)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        proxyToGas(method, res.headers.location, headers, body)
          .then(resolve)
          .catch(reject);
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        });
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
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
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>myg auth</title></head>
<body style="font-family:sans-serif;max-width:400px;margin:60px auto;text-align:center">
<h2>&#10003; Authentication Complete</h2>
<p>You can close this tab and return to the terminal.</p>
<script>window.close()</script>
</body></html>`);
    return;
  }

  // --- GET /status --- health check
  if (url.pathname === "/status") {
    jsonResponse(res, 200, {
      running: true,
      hasToken: !!accessToken,
      tokenReceivedAt,
      pid: process.pid,
    });
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
      jsonResponse(res, 502, { error: `Proxy error: ${err.message}` });
    }
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
    log(`Port ${PORT} already in use. Daemon may already be running.`);
    process.exit(1);
  }
  log(`Server error: ${err.message}`);
  process.exit(1);
});

process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

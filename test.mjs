import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "url-shortener-"));
const dbPath = path.join(tmpDir, "test.db");

let server = null;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn("node", ["server.js"], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath },
    });
    server.on("exit", () => {
      if (server._expectExit !== true) reject(new Error("server exited unexpectedly"));
    });
    resolve();
  });
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start in time");
}

async function stopServer() {
  if (!server) return;
  server._expectExit = true;
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  server = null;
}

function post(url, body) {
  return fetch(`${BASE}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runSuite() {
  await waitForServer();

  const bad = await post("", { url: "not-a-url" });
  check("invalid URL rejected", bad.status === 400);

  const good = await post("", { url: "https://example.com/a/b?q=1" });
  check("valid URL creates link", good.status === 201);
  const link = await good.json();
  check("response has shortUrl", typeof link.shortUrl === "string" && link.shortUrl.startsWith("/"));
  check("code is unique string", typeof link.code === "string" && link.code.length > 0);

  const redirect = await fetch(`${BASE}${link.shortUrl}`, { redirect: "manual" });
  check("short link redirects", redirect.status === 302 && redirect.headers.get("location") === "https://example.com/a/b?q=1");

  await new Promise((r) => setTimeout(r, 300));

  const missing = await fetch(`${BASE}/zzzz9999`, { redirect: "manual" });
  check("unknown code 404", missing.status === 404);

  globalThis.__testCode = link.code;
}

try {
  await startServer();
  await runSuite();
  await stopServer();

  await startServer();
  await waitForServer();
  const again = await fetch(`${BASE}/${globalThis.__testCode}`, { redirect: "manual" });
  check("link survives restart", again.status === 302, `it now returns ${again.status}`);
  await stopServer();
} catch (err) {
  console.error("FATAL:", err.message);
  failed++;
} finally {
  if (server) server.kill("SIGTERM");
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log(failed === 0 ? "\nAll tests passed." : `\n${failed} test(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
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

  const home = await fetch(`${BASE}/`);
  check("dashboard serves HTML", home.status === 200 && home.headers.get("content-type").includes("text/html"));

  const list = await fetch(`${BASE}/api/links`);
  const all = await list.json();
  check("list endpoint returns the created link", list.ok && all.some((l) => l.code === link.code));

  globalThis.__testCode = link.code;
}

async function runAuthSuite() {
  const config = await (await fetch(`${BASE}/api/config`)).json();
  if (!config.authEnabled) {
    console.log("SKIP  auth tests — SUPABASE_URL/SUPABASE_ANON_KEY not set");
    return;
  }

  const emailA = `alice-${Date.now()}@test.local`;
  const emailB = `bob-${Date.now()}@test.local`;
  const password = "supersecret123";

  for (const email of [emailA, emailB]) {
    const signup = await fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    check(`signup ${email.split("@")[0]}`, signup.status === 201);
  }

  async function login(email) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    check(`login ${email.split("@")[0]} works`, res.ok && data.session?.access_token);
    return data.session.access_token;
  }

  const tokenA = await login(emailA);
  const tokenB = await login(emailB);

  const noToken = await fetch(`${BASE}/api/links`);
  check("links require auth", noToken.status === 401);

  const createdA = await fetch(`${BASE}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ url: "https://example.org/alice-only" }),
  });
  check("authed user A can create", createdA.status === 201);

  const listA = await (await fetch(`${BASE}/api/links`, { headers: { Authorization: `Bearer ${tokenA}` } })).json();
  check("user A sees own link", listA.some((l) => l.url === "https://example.org/alice-only"));

  const listB = await (await fetch(`${BASE}/api/links`, { headers: { Authorization: `Bearer ${tokenB}` } })).json();
  check("user B cannot see A's link", !listB.some((l) => l.url === "https://example.org/alice-only"));
}

try {
  await startServer();
  await runSuite();
  await runAuthSuite();
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
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

function post(url, body, token) {
  return fetch(`${BASE}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function getToken(email, password) {
  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!signup.ok) throw new Error(`signup failed: ${(await signup.json()).error || signup.status}`);
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await login.json();
  if (!login.ok || !data.session?.access_token) throw new Error("login failed");
  return data.session.access_token;
}

async function runSuite() {
  await waitForServer();

  const config = await (await fetch(`${BASE}/api/config`)).json();
  let token = null;
  if (config.authEnabled) {
    token = await getToken(`suite-${Date.now()}@gmail.com`, "supersecret123");
  }

  const bad = await post("", { url: "not-a-url" }, token);
  check("invalid URL rejected", bad.status === 400);

  const good = await post("", { url: "https://example.com/a/b?q=1" }, token);
  check("valid URL creates link", good.status === 201);
  const link = await good.json();
  check("response has shortUrl", typeof link.shortUrl === "string" && link.shortUrl.startsWith("/"));
  check("code is unique string", typeof link.code === "string" && link.code.length > 0);

  const redirect = await fetch(`${BASE}${link.shortUrl}`, { redirect: "manual" });
  check("short link redirects", redirect.status === 302 && redirect.headers.get("location") === "https://example.com/a/b?q=1");

  if (config.authEnabled) {
    const anonAnalytics = await fetch(`${BASE}/api/links/${link.code}/analytics`);
    check("analytics requires auth", anonAnalytics.status === 401);
  } else {
    for (let i = 0; i < 3; i++) {
      await fetch(`${BASE}${link.shortUrl}`, { redirect: "manual" });
    }
    await new Promise((r) => setTimeout(r, 300));
    const analytics = await (await fetch(`${BASE}/api/links/${link.code}/analytics`)).json();
    check("analytics reports total clicks", analytics.total === 4, `total=${analytics.total}`);
    const today = new Date().toISOString().slice(0, 10);
    check("analytics has a row for today", analytics.daily.some((d) => d.date === today));
  }

  await new Promise((r) => setTimeout(r, 300));

  const missing = await fetch(`${BASE}/zzzz9999`, { redirect: "manual" });
  check("unknown code 404", missing.status === 404);

  const home = await fetch(`${BASE}/`);
  check("dashboard serves HTML", home.status === 200 && home.headers.get("content-type").includes("text/html"));

  const login = await fetch(`${BASE}/login`);
  check("login page serves HTML", login.status === 200 && login.headers.get("content-type").includes("text/html"));

  const favicon = await fetch(`${BASE}/favicon.ico`);
  const favBody = await favicon.text();
  check("favicon does not hit link lookup", favicon.status !== 200 || !favBody.includes("Short link not found"));

  const stray = await fetch(`${BASE}/does-not-exist`);
  check("unknown page gets generic 404", stray.status === 404 && (await stray.text()).includes("Not found"));

  const list = await fetch(`${BASE}/api/links`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
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

  const emailA = `alice-${Date.now()}@gmail.com`;
  const emailB = `bob-${Date.now()}@gmail.com`;
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

  const createdAres = await fetch(`${BASE}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ url: "https://example.org/alice-only" }),
  });
  const createdA = await createdAres.json();
  check("authed user A can create", createdAres.status === 201);

  const listA = await (await fetch(`${BASE}/api/links`, { headers: { Authorization: `Bearer ${tokenA}` } })).json();
  check("user A sees own link", listA.some((l) => l.url === "https://example.org/alice-only"));

  const listB = await (await fetch(`${BASE}/api/links`, { headers: { Authorization: `Bearer ${tokenB}` } })).json();
  check("user B cannot see A's link", !listB.some((l) => l.url === "https://example.org/alice-only"));

  const analyticsA = await fetch(`${BASE}/api/links/${createdA.code}/analytics`, { headers: { Authorization: `Bearer ${tokenA}` } });
  check("owner A can view analytics", analyticsA.ok);
  const analyticsB = await fetch(`${BASE}/api/links/${createdA.code}/analytics`, { headers: { Authorization: `Bearer ${tokenB}` } });
  check("user B cannot view A's analytics", analyticsB.status === 403);
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
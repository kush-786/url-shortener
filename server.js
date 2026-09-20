import "dotenv/config";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLink, getLinkByCode, incrementClicks, listLinks, dailyClicks, logClick } from "./db.js";
import { AUTH_ENABLED, supabase, requireAuth, bearerToken } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const RESERVED_CODES = new Set(["api", "dashboard", "login"]);

const CODE_PATTERN = /^[A-Za-z0-9_-]{4,11}$/;

const randomCode = (length = 7) =>
  crypto.randomBytes(length).toString("base64url").slice(0, length);

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function authOn(res) {
  if (AUTH_ENABLED) return;
  res.status(503).json({ error: "Auth is not configured on this server." });
}

app.get("/api/config", (_req, res) => {
  res.json({
    authEnabled: AUTH_ENABLED,
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
});

app.post("/api/auth/signup", async (req, res) => {
  if (!AUTH_ENABLED) return authOn(res);
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Email and a password of 6+ characters are required." });
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user });
});

app.post("/api/auth/login", async (req, res) => {
  if (!AUTH_ENABLED) return authOn(res);
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ session: data.session });
});

app.post("/api/auth/logout", requireAuth, async (_req, res) => {
  await supabase.auth.signOut();
  res.json({ ok: true });
});

app.post("/api/links", requireAuth, (req, res) => {
  const longUrl = req.body?.url;
  if (typeof longUrl !== "string" || !isValidUrl(longUrl)) {
    return res.status(400).json({ error: "A valid http(s) URL is required." });
  }

  let code = randomCode();
  while (getLinkByCode(code) || RESERVED_CODES.has(code)) code = randomCode();

  const link = createLink({ code, url: longUrl, userId: req.user?.id ?? null });
  res.status(201).json({ shortUrl: `/${code}`, ...link });
});

app.get("/api/links", requireAuth, (req, res) => {
  res.json(listLinks({ userId: req.user?.id ?? null }));
});

app.get("/api/links/:code/analytics", requireAuth, (req, res) => {
  const link = getLinkByCode(req.params.code);
  if (!link) {
    return res.status(404).json({ error: "Short link not found." });
  }
  if (AUTH_ENABLED && req.user && link.user_id && link.user_id !== req.user.id) {
    return res.status(403).json({ error: "You do not own this link." });
  }
  res.json({
    code: link.code,
    url: link.url,
    total: link.clicks,
    daily: dailyClicks(link.code),
  });
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/:code", (req, res, next) => {
  if (!CODE_PATTERN.test(req.params.code)) {
    return next();
  }
  const link = getLinkByCode(req.params.code);
  if (!link) {
    return res.status(404).json({ error: "Short link not found." });
  }
  incrementClicks(link.id);
  logClick(link.code, link.user_id);
  res.redirect(302, link.url);
});

app.use("/", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`url-shortener listening on http://localhost:${PORT}`);
});
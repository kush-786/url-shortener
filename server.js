import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLink, getLinkByCode, incrementClicks, listLinks } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const RESERVED_CODES = new Set(["api", "dashboard"]);

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

app.post("/api/links", (req, res) => {
  const longUrl = req.body?.url;
  if (typeof longUrl !== "string" || !isValidUrl(longUrl)) {
    return res.status(400).json({ error: "A valid http(s) URL is required." });
  }

  let code = randomCode();
  while (getLinkByCode(code) || RESERVED_CODES.has(code)) code = randomCode();

  const link = createLink({ code, url: longUrl });
  res.status(201).json({ shortUrl: `/${code}`, ...link });
});

app.get("/api/links", (_req, res) => {
  res.json(listLinks());
});

app.get("/:code", (req, res) => {
  const link = getLinkByCode(req.params.code);
  if (!link) {
    return res.status(404).json({ error: "Short link not found." });
  }
  incrementClicks(link.id);
  res.redirect(302, link.url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`url-shortener listening on http://localhost:${PORT}`);
});
import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json());

const links = new Map();

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
  while (links.has(code)) code = randomCode();

  const link = { code, url: longUrl, clicks: 0, createdAt: new Date().toISOString() };
  links.set(code, link);

  res.status(201).json({ shortUrl: `/r/${code}`, ...link });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`url-shortener listening on http://localhost:${PORT}`);
});
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
export const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!AUTH_ENABLED) {
  console.warn(
    "[auth] SUPABASE_URL / SUPABASE_ANON_KEY not set — running in anonymous dev mode."
  );
}

export const supabase = AUTH_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export function bearerToken(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

export async function requireAuth(req, res, next) {
  if (!AUTH_ENABLED) {
    return next();
  }

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }

  req.user = data.user;
  next();
}
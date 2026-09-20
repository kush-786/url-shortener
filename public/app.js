const form = document.getElementById("shortenForm");
const urlInput = document.getElementById("urlInput");
const formError = document.getElementById("formError");
const result = document.getElementById("result");
const resultLink = document.getElementById("resultLink");
const linkList = document.getElementById("linkList");
const emptyState = document.getElementById("emptyState");
const accountArea = document.getElementById("accountArea");

let authEnabled = false;
let token = null;

const shortUrl = (code) => `${location.origin}/${code}`;

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

function renderAccount(user) {
  if (!authEnabled) return;

  accountArea.innerHTML = "";
  const email = document.createElement("span");
  email.className = "account-email";
  email.textContent = user.email;
  const logout = document.createElement("button");
  logout.className = "btn btn-ghost";
  logout.textContent = "Log out";
  logout.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await supabase.auth.signOut();
    location.href = "/login";
  });
  accountArea.append(email, logout);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;
  result.hidden = true;

  const res = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ url: urlInput.value }),
  });

  const data = await res.json();

  if (!res.ok) {
    formError.textContent = data.error || "Something went wrong.";
    formError.hidden = false;
    return;
  }

  const full = shortUrl(data.code);
  resultLink.href = full;
  resultLink.textContent = full;
  result.hidden = false;
  urlInput.value = "";

  await copyText(full);
  result.textContent = "Copied! Short link: ";
  result.appendChild(resultLink);

  await loadLinks();
});

function renderLinks(links) {
  linkList.innerHTML = "";
  emptyState.hidden = links.length > 0;

  for (const link of links) {
    const row = document.createElement("div");
    row.className = "link-row";

    const short = document.createElement("a");
    short.className = "link-short";
    short.href = shortUrl(link.code);
    short.target = "_blank";
    short.rel = "noopener";
    short.textContent = `/${link.code}`;

    const original = document.createElement("span");
    original.className = "link-original";
    original.textContent = link.url;

    const created = document.createElement("span");
    created.className = "link-created";
    created.textContent = new Date(link.created_at).toLocaleDateString();

    const copy = document.createElement("button");
    copy.className = "copy-btn";
    copy.textContent = "copy";
    copy.addEventListener("click", async () => {
      const ok = await copyText(shortUrl(link.code));
      copy.textContent = ok ? "copied!" : "copy";
      setTimeout(() => (copy.textContent = "copy"), 1500);
    });

    row.append(short, original, created, copy);
    linkList.appendChild(row);
  }
}

async function loadLinks() {
  const res = await api("/api/links");
  if (!res.ok) return;
  const links = await res.json();
  renderLinks(links);
}

async function init() {
  const res = await fetch("/api/config");
  const config = await res.json();
  authEnabled = config.authEnabled;

  if (authEnabled) {
    window.SUPABASE_URL = config.supabaseUrl;
    window.SUPABASE_ANON_KEY = config.supabaseAnonKey;
    const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (!session) {
      location.href = "/login";
      return;
    }

    token = session.access_token;
    renderAccount(session.user);
  }

  await loadLinks();
}

init();
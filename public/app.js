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

    const count = document.createElement("span");
    count.className = "link-clicks";
    count.textContent = `${link.clicks} click${link.clicks === 1 ? "" : "s"}`;

    const created = document.createElement("span");
    created.className = "link-created";
    created.textContent = new Date(link.created_at).toLocaleDateString();

    const chart = document.createElement("button");
    chart.className = "copy-btn";
    chart.textContent = "chart";
    chart.addEventListener("click", async () => {
      chart.disabled = true;
      await renderChart(link.code, row);
      chart.disabled = false;
    });

    const copy = document.createElement("button");
    copy.className = "copy-btn";
    copy.textContent = "copy";
    copy.addEventListener("click", async () => {
      const ok = await copyText(shortUrl(link.code));
      copy.textContent = ok ? "copied!" : "copy";
      setTimeout(() => (copy.textContent = "copy"), 1500);
    });

    row.append(short, original, count, created, copy, chart);
    linkList.appendChild(row);

    const chartBox = document.createElement("div");
    chartBox.className = "chart-box";
    chartBox.hidden = true;
    row.appendChild(chartBox);
  }
}

function svgChart(rows, days) {
  const W = 600;
  const H = 160;
  const pad = 28;

  const counts = new Array(days).fill(0);
  const labels = new Array(days).fill("");
  const max = Math.max(1, ...rows.map((r) => r.clicks));

  for (const r of rows) {
    const idx = days - 1 - Math.round((Date.now() - new Date(r.date).getTime()) / 86400000);
    if (idx >= 0 && idx < days) {
      counts[idx] = r.clicks;
      labels[idx] = r.date.slice(5);
    }
  }

  const bw = (W - pad * 2) / days;
  const bars = counts
    .map((c, i) => {
      const h = (c / max) * (H - pad * 2);
      const x = pad + i * bw;
      const y = H - pad - h;
      return `<rect x="${x}" y="${y}" width="${bw - 2}" height="${h || 1}" fill="#38bdf8" rx="1"><title>${labels[i]}: ${c} clicks</title></rect>`;
    })
    .join("");

  const daysToLabel = Math.max(1, Math.floor(days / 7));
  const labelsSvg = counts
    .map((_, i) =>
      i % daysToLabel === 0
        ? `<text x="${pad + i * bw + bw / 2}" y="${H - pad + 16}" font-size="10" fill="#94a3b8" text-anchor="middle">${labels[i]}</text>`
        : ""
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Clicks per day">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#334155"/>
    ${bars}
    ${labelsSvg}
  </svg>`;
}

async function renderChart(code, row) {
  const res = await api(`/api/links/${code}/analytics`);
  if (!res.ok) return;
  const data = await res.json();

  let box = row.querySelector(".chart-box");
  if (!box) {
    box = document.createElement("div");
    box.className = "chart-box";
    row.appendChild(box);
  }

  if (box.dataset.open === "1") {
    box.hidden = true;
    box.dataset.open = "0";
    return;
  }

  box.hidden = false;
  box.dataset.open = "1";
  box.innerHTML = `<div class="chart-head">Last 14 days · ${data.total} total clicks</div>` + svgChart(data.daily, 14);
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
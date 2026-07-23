"use strict";

// This dashboard is deployed for exactly one repo, so these are fixed
// rather than user-configurable (only the token needs to be entered).
const GH_OWNER = "elmi-power";
const GH_REPO = "hub400-dashboard";
const GH_BRANCH = "main";

const TOKEN_KEY = "hub400DashboardToken";

const GitHub = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  },
  setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  },
  headers(accept) {
    const headers = { Accept: accept || "application/vnd.github+json" };
    const token = GitHub.getToken();
    if (token) headers.Authorization = `token ${token}`;
    return headers;
  },

  async listDir(path) {
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`;
    const res = await fetch(url, { headers: GitHub.headers() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub API Fehler (${res.status}) bei ${path}`);
    return res.json();
  },

  async fetchText(path) {
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`;
    const res = await fetch(url, { headers: GitHub.headers("application/vnd.github.raw") });
    if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (${res.status}): ${path}`);
    return res.text();
  },

  utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  },

  async commitFile(path, content, message) {
    const token = GitHub.getToken();
    if (!token) throw new Error("Bitte einen GitHub Token in den Einstellungen hinterlegen, um speichern zu können.");

    const base = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
    let sha;
    const existing = await fetch(`${base}?ref=${GH_BRANCH}`, { headers: GitHub.headers() });
    if (existing.ok) {
      const json = await existing.json();
      sha = json.sha;
    }

    const res = await fetch(base, {
      method: "PUT",
      headers: { ...GitHub.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message || `Update ${path}`,
        content: GitHub.utf8ToBase64(content),
        branch: GH_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Commit fehlgeschlagen (${res.status})`);
    }
    return res.json();
  },
};

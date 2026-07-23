"use strict";

// Client-side gate only. This is a public static site, so this hash is the
// *only* secret material committed to the repo — the plaintext password is
// never stored here or anywhere else in the repository. Anyone reading this
// source sees a SHA-256 digest, not the password itself. This is a light
// deterrent (keeps casual/automated readers out), not real access control —
// a private repo (GitHub Pro/Team) is the only way to get actual auth here.
const AUTH_HASH = "1aaec704cba14833424e4ef22b7ca8ad9915883ef102dbf8b41179501c97e6ac";
const AUTH_SESSION_KEY = "hub400DashboardAuthed";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const Auth = {
  isAuthed() {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  },
  async tryLogin(password) {
    const hash = await sha256Hex(password);
    if (hash === AUTH_HASH) {
      sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      return true;
    }
    return false;
  },
  logout() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    location.reload();
  },
};

function initAuthGate(onAuthed) {
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  const form = document.getElementById("loginForm");
  const input = document.getElementById("loginPassword");
  const error = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");

  function showApp() {
    loginScreen.classList.add("hidden");
    appRoot.classList.remove("hidden");
    onAuthed();
  }

  if (Auth.isAuthed()) {
    showApp();
    logoutBtn.addEventListener("click", () => Auth.logout());
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const ok = await Auth.tryLogin(input.value);
    if (ok) {
      showApp();
    } else {
      error.textContent = "Falsches Passwort.";
      input.value = "";
      input.focus();
    }
  });

  logoutBtn.addEventListener("click", () => Auth.logout());
}

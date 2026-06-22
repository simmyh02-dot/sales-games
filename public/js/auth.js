/* ==========================================================================
   auth.js — Google Sign-In + JWT session for Sales Camp Games
   Loaded on every page. Injects auth UI into #auth-widget.
   ========================================================================== */

const SCG_AUTH = (() => {
  const TOKEN_KEY = "scg_auth_token";
  const USER_KEY  = "scg_auth_user";

  let _user = null;
  let _token = null;

  function getToken() { return _token || localStorage.getItem(TOKEN_KEY); }
  function getUser()  { return _user  || JSON.parse(localStorage.getItem(USER_KEY) || "null"); }

  function storeSession(token, user) {
    _token = token;
    _user  = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    _token = null;
    _user  = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // Authenticated fetch — adds Bearer token
  async function authFetch(url, opts = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  }

  // Validate stored token against server
  async function validateSession() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await authFetch("/api/auth/me");
      if (!res.ok) { clearSession(); return null; }
      const user = await res.json();
      _user  = user;
      _token = token;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  }

  // Called by Google Identity Services on sign-in
  async function onGoogleCredential(response) {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      if (!res.ok) throw new Error("Auth failed");
      const { token, user } = await res.json();
      storeSession(token, user);
      if (window._authRedirectAfterLogin) {
        window.location.href = window._authRedirectAfterLogin;
        return;
      }
      renderAuthWidget(user);
      // Sync scores from server after sign-in
      if (typeof SCG !== "undefined") SCG.syncFromServer();
      if (typeof SCG_HOME !== "undefined") SCG_HOME.refresh();
    } catch (err) {
      console.error("Sign-in error:", err.message);
    }
  }

  function signOut() {
    clearSession();
    renderAuthWidget(null);
    if (typeof google !== "undefined") google.accounts.id.disableAutoSelect();
    if (typeof SCG !== "undefined") SCG.renderAll();
    if (typeof SCG_HOME !== "undefined") SCG_HOME.refresh();
  }

  function renderAuthWidget(user) {
    const widget = document.getElementById("auth-widget");
    if (!widget) return;

    if (user) {
      widget.innerHTML = `
        <div class="auth-user">
          ${user.picture
            ? `<img class="auth-avatar" src="${escapeHtmlAttr(user.picture)}" alt="${escapeHtmlAttr(user.name)}" referrerpolicy="no-referrer" />`
            : `<div class="auth-avatar-initials">${escapeHtml((user.name || "?").charAt(0).toUpperCase())}</div>`
          }
          <span class="auth-name">${escapeHtml(user.name || user.email || "You")}</span>
          <button class="auth-signout-btn" onclick="SCG_AUTH.signOut()">Sign out</button>
        </div>
      `;
    } else {
      // Show Google One Tap button if GOOGLE_CLIENT_ID is available
      widget.innerHTML = `<div id="google-signin-btn"></div>`;
      if (window._googleClientId) {
        try {
          google.accounts.id.initialize({
            client_id: window._googleClientId,
            callback: SCG_AUTH.onGoogleCredential,
          });
          google.accounts.id.renderButton(
            document.getElementById("google-signin-btn"),
            { theme: "filled_black", size: "medium", text: "signin_with", shape: "square" }
          );
        } catch {
          // Google script not loaded yet — will retry when it loads
        }
      }
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function escapeHtmlAttr(str) {
    return (str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Initialise on DOMContentLoaded
  async function init() {
    // Check health to see if auth is configured
    try {
      const res  = await fetch("/api/health");
      const data = await res.json();
      window._googleClientId = data.googleClientId || null;
    } catch { /* no-op */ }

    const user = await validateSession();
    renderAuthWidget(user);

    // If Google Sign-In script is loaded and no user, prompt One Tap
    if (!user && window._googleClientId && typeof google !== "undefined") {
      try {
        google.accounts.id.initialize({
          client_id: window._googleClientId,
          callback: SCG_AUTH.onGoogleCredential,
          auto_select: false,
        });
        google.accounts.id.prompt();
      } catch { /* no-op */ }
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  return { getToken, getUser, authFetch, signOut, onGoogleCredential, validateSession };
})();

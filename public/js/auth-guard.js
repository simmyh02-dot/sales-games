/* ==========================================================================
   auth-guard.js — route guard for the app pages (loaded first, in <head>).
   A signed-out visitor who hits /home or any mode page directly is bounced
   to the public landing page BEFORE the app shell paints, so the product
   sits properly behind the sign-in / trial wall.

   Logged-in users reveal instantly (we don't block paint on a network round
   trip); the session is re-validated in the background and a revoked/expired
   token bounces them out. All /api/* routes are independently auth-guarded
   on the server, so this is UX/perception — the data is never exposed.
   ========================================================================== */
(function () {
  var TOKEN_KEY = "scg_auth_token";
  var USER_KEY  = "scg_auth_user";
  var token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }

  // No session at all → straight to the wall, before any app content renders.
  if (!token) {
    location.replace("/");
    return;
  }

  // Session present → let the page render now, verify in the background.
  fetch("/api/auth/me", { headers: { "Authorization": "Bearer " + token } })
    .then(function (r) {
      if (r.status === 401 || r.status === 404) {
        try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
        location.replace("/");
      }
    })
    .catch(function () { /* offline: keep the optimistic render */ });
})();

/**
 * auth.js
 * Google Sign-In using Google Identity Services (GIS).
 *
 * ARCHITECTURE NOTE — GitHub Pages frontend + Google Apps Script backend:
 * GitHub Pages cannot run server code, so a classic OAuth "authorization code"
 * exchange (which needs a client secret) is not safe to do in the browser.
 * Instead we use GIS's ID-token flow: the browser gets a signed Google ID
 * token (a JWT) directly from Google, and GAS verifies that token's signature
 * and audience on every request via Google's tokeninfo endpoint
 * (see gas/Auth.gs -> verifyGoogleIdToken_). This is a supported, secure
 * pattern that needs no client secret in the frontend and re-validates the
 * user's identity on the server for every single API call — the frontend
 * is never trusted to say "I am logged in as X".
 */

const AUTH = (function () {
  'use strict';

  let onSignedInCallback = null;

  function init(buttonElId, onSignedIn) {
    onSignedInCallback = onSignedIn;
    if (!window.google || !google.accounts || !google.accounts.id) {
      // GIS script not loaded yet — retry shortly.
      setTimeout(() => init(buttonElId, onSignedIn), 200);
      return;
    }
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
      ux_mode: 'popup'
    });
    const target = document.getElementById(buttonElId);
    if (target) {
      google.accounts.id.renderButton(target, {
        type: 'standard', theme: 'outline', size: 'large',
        text: 'continue_with', shape: 'pill', width: 280
      });
    }
  }

  function handleCredentialResponse(response) {
    // response.credential is the signed Google ID token (JWT). We do NOT
    // decode/trust it client-side for authorization — we hand it to GAS,
    // which re-verifies it on every call.
    const idToken = response.credential;
    const payload = decodeJwtPayloadForDisplayOnly_(idToken);

    APP.saveSession({
      idToken: idToken,
      name: payload.name || '',
      email: payload.email || '',
      photoUrl: payload.picture || ''
    });

    if (onSignedInCallback) onSignedInCallback();
  }

  // This decode is ONLY used to show a name/photo instantly in the UI.
  // It is never used for authorization decisions — those always happen
  // server-side against a freshly re-verified token.
  function decodeJwtPayloadForDisplayOnly_(jwt) {
    try {
      const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(json);
    } catch (e) {
      return {};
    }
  }

  function signOut() {
    APP.clearSession();
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    window.location.href = 'index.html';
  }

  function currentUser() {
    return APP.getSession();
  }

  return { init, signOut, currentUser };
})();

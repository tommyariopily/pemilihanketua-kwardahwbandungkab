/**
 * app.js
 * Shared helpers used by every page: API calls to the GAS backend,
 * toast notifications, loading overlay, and small utilities.
 *
 * Depends on CONFIG being defined (see config.js / config.example.js).
 */

const APP = (function () {
  'use strict';

  const SESSION_KEY = 'hw_kwarda_session'; // stores only: idToken, name, email, photoUrl (no secrets)

  /* ---------------- Loading overlay ---------------- */
  function ensureOverlay() {
    if (document.getElementById('hw-loading-overlay')) return;
    const el = document.createElement('div');
    el.id = 'hw-loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = '<div class="spinner"></div><div class="msg" id="hw-loading-msg">Memproses...</div>';
    document.body.appendChild(el);
  }
  function showLoading(msg) {
    ensureOverlay();
    document.getElementById('hw-loading-msg').textContent = msg || 'Memproses...';
    document.getElementById('hw-loading-overlay').classList.add('open');
  }
  function hideLoading() {
    const el = document.getElementById('hw-loading-overlay');
    if (el) el.classList.remove('open');
  }

  /* ---------------- Toast ---------------- */
  function ensureToastWrap() {
    if (document.getElementById('hw-toast-wrap')) return document.getElementById('hw-toast-wrap');
    const el = document.createElement('div');
    el.id = 'hw-toast-wrap';
    el.className = 'toast-wrap';
    document.body.appendChild(el);
    return el;
  }
  function toast(message, type) {
    const wrap = ensureToastWrap();
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = message;
    wrap.appendChild(t);
    setTimeout(() => { t.remove(); }, 4200);
  }

  /* ---------------- Session (local, non-sensitive) ---------------- */
  function saveSession(data) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------------- API call to GAS Web App ---------------- */
  // GAS Web Apps only reliably accept simple POST (text/plain body to avoid a CORS
  // preflight, which GAS does not handle). We always POST a JSON string body and
  // read a JSON string back. Every call sends the Google ID token; GAS re-verifies
  // it server-side on every request (never trust a cached "isAdmin" flag).
  function call(action, payload, opts) {
    opts = opts || {};
    const session = getSession();
    const body = {
      action: action,
      idToken: session ? session.idToken : null,
      data: payload || {}
    };

    if (!opts.silent) showLoading(opts.loadingMessage || 'Memproses...');

    return fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      // text/plain avoids a CORS preflight against the Apps Script endpoint
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then((res) => res.json())
      .then((json) => {
        if (!opts.silent) hideLoading();
        if (!json || json.ok !== true) {
          const msg = (json && json.message) || 'Terjadi kendala pada sistem. Silakan coba kembali.';
          if (!opts.silentError) toast(msg, 'error');
          const err = new Error(msg);
          err.code = json && json.code;
          throw err;
        }
        return json.result;
      })
      .catch((err) => {
        if (!opts.silent) hideLoading();
        if (!opts.silentError && !err.code) {
          toast('Terjadi kendala saat menghubungkan ke server. Silakan coba kembali.', 'error');
        }
        throw err;
      });
  }

  /* ---------------- Small utilities ---------------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function requireLogin(redirectTo) {
    const s = getSession();
    if (!s || !s.idToken) {
      window.location.href = redirectTo || 'login.html';
      return null;
    }
    return s;
  }
  function disableWhileRunning(btn, fn) {
    // Prevents double-submit: disable the button immediately, re-enable on completion.
    return function (...args) {
      if (btn.disabled) return;
      btn.disabled = true;
      const restore = () => { btn.disabled = false; };
      Promise.resolve(fn.apply(null, args)).then(restore, restore);
    };
  }

  return {
    showLoading, hideLoading, toast,
    saveSession, getSession, clearSession,
    call, qs, qsa, escapeHtml, requireLogin, disableWhileRunning
  };
})();

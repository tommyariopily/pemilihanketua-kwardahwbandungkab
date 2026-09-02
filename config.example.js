/**
 * config.example.js
 * Copy this file to "config.js" and fill in the real values below.
 * config.js is safe to publish on GitHub Pages: it only contains PUBLIC
 * identifiers (a Web App URL and an OAuth Client ID), never a secret.
 * Do NOT put an OAuth client secret, a service-account key, or any
 * password/token here — this project never needs one on the frontend.
 */
const CONFIG = {
  // The /exec URL you get after deploying the Apps Script project as a Web App.
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbz9XMnSQcflEgx0-TfWov4QVmteFJNSI_r61xDwMeRl4rN9Rbg_tyxCEWi7jihGHGU2dQ/exec",

  // OAuth 2.0 Client ID (type "Web application") from Google Cloud Console.
  // This is public by design — Google Identity Services is built to use it
  // directly in browser JavaScript.
  GOOGLE_CLIENT_ID: "474948003523-pfngtpq4u9a83c3hplodfas816o259ku.apps.googleusercontent.com",

  APP_NAME: "Pemilihan Ketua Kwarda Hizbul Wathan Kabupaten Bandung",
  ORG_NAME: "Kwartir Daerah Hizbul Wathan Kabupaten Bandung",
  LOGO_URL: "assets/logo-hw.png"
};

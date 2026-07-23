/* =======================================================================
   App configuration
   =======================================================================
   This is the one file you edit to point the app at your backend.

   NOTE ON SECURITY: this file is served to every visitor's browser, exactly
   like index.html. Splitting it out keeps config tidy and lets you swap
   backends without touching app logic — but it is NOT a way to hide the URL.
   Anything the browser can read, anyone can read. The backend is hardened to
   be safe as a public endpoint (see apps-script.gs); that, not hiding this
   URL, is what protects the data.

   To deploy: paste your Apps Script Web App URL below.
   ======================================================================= */
window.APP_CONFIG = {
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyqgm_Bz3ifAXEt8hM9DErd7KUUFsRWdVBY8tXLw7lXYnS7VxxkDl4fU-Wlrlw8LfH6YQ/exec",

  // Sent with every request. Must match APP_TOKEN in apps-script.gs. This only
  // keeps random scanners off the endpoint — it is public (it ships to the
  // browser), so it is not a real access control. Rotate by changing it in
  // BOTH this file and apps-script.gs.
  APP_TOKEN: "bisons-2026-x7Qk9pLm"
};

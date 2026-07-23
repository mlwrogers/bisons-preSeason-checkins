/* =======================================================================
   SETUP
   =======================================================================
   1. Create a new Google Sheet.
   2. Add two tabs, exactly named:
        Players   with header row: id | key | name | team | pin
        Checkins  with header row: playerId | sessionId | timestamp
      (The "pin" column stores a salted HASH, never the real PIN. Don't edit
       it by hand — to reset a player's PIN, just CLEAR their pin cell; the
       next PIN they type on login becomes their new one, points preserved.)
   3. Extensions > Apps Script. Delete any starter code, paste this whole
      file in, save.
   4. Deploy > New deployment > gear icon > Web app.
        - Execute as: Me
        - Who has access: Anyone
      Click Deploy, authorize when prompted, then copy the Web app URL.
   5. Paste that URL into WEB_APP_URL in config.js.
   6. Set APP_TOKEN below to the SAME value as APP_TOKEN in config.js.

   SECURITY MODEL (read before changing)
   - This endpoint is "Anyone" and its URL is in a public repo, so treat every
     request as untrusted. Never put anything in a response that shouldn't be
     world-readable (in particular: never return PINs or hashes).
   - APP_TOKEN is a cheap filter to keep random internet scanners off the
     endpoint (and off your Apps Script quota). It is NOT real auth — it lives
     in config.js which anyone can read — so don't rely on it for anything but
     noise reduction.
   - PINs are stored as SHA-256(pepper + playerId + pin). The pepper lives in
     Script Properties (server-side only, not in the sheet, not in the repo)
     and is auto-generated on first use. So someone who can read the Sheet
     still can't recover PINs. checkin/uncheck require the PIN.
   ======================================================================= */

// Must match APP_TOKEN in config.js.
var APP_TOKEN = "bisons-2026-x7Qk9pLm";

// Keep in sync with TEAMS in the front end. Logins for any other team value
// are rejected, so a direct API call can't pollute the roster.
var TEAMS = ["Adult Men", "Adult Women", "U16 Boys & Girls", "U14 Boys & Girls"];
var MAX_NAME_LEN = 40;

function doGet(e) {
  var action = e.parameter.action;

  // Cheap scanner filter (see security notes). Not real auth.
  if (e.parameter.token !== APP_TOKEN) {
    return jsonResponse({ error: 'Unauthorised.' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var playersSheet = ss.getSheetByName('Players');
  var checkinsSheet = ss.getSheetByName('Checkins');

  try {
    if (action === 'getState') {
      return jsonResponse({
        players: getPlayersPublic(playersSheet),
        checkins: getCheckins(checkinsSheet)
      });
    }
    if (action === 'login') {
      return jsonResponse(login(playersSheet, e.parameter.name, e.parameter.team, e.parameter.pin));
    }
    if (action === 'checkin') {
      return jsonResponse(checkin(playersSheet, checkinsSheet, e.parameter.playerId, e.parameter.sessionId, e.parameter.pin));
    }
    if (action === 'uncheck') {
      return jsonResponse(uncheck(playersSheet, checkinsSheet, e.parameter.playerId, e.parameter.sessionId, e.parameter.pin));
    }
    return jsonResponse({ error: 'Unknown action.' });
  } catch (err) {
    // Don't leak internal error details to a public endpoint.
    Logger.log('doGet error: ' + err);
    return jsonResponse({ error: 'Server error. Please try again.' });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- PIN hashing --------------------------------------------------
   Pepper is a server-side secret held in Script Properties, auto-created on
   first use. It never appears in the sheet or the repo, so a sheet reader
   can't reverse the (only 10k-wide) 4-digit PIN space. */
function getPepper() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PIN_PEPPER');
  if (!p) {
    p = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PIN_PEPPER', p);
  }
  return p;
}

function hashPin(playerId, pin) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    getPepper() + '|' + playerId + '|' + String(pin),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(raw);
}

/* ---------- Data access -------------------------------------------------- */
// Internal use only — the `pin` field here is the stored HASH.
function getPlayers(sheet) {
  var data = sheet.getDataRange().getValues();
  return data.slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), key: String(r[1]), name: String(r[2]), team: String(r[3]), pin: String(r[4]) };
  });
}

// Client-safe projection: never includes the PIN hash.
function getPlayersPublic(sheet) {
  return getPlayers(sheet).map(function (p) { return publicPlayer(p); });
}

function publicPlayer(p) {
  return { id: p.id, key: p.key, name: p.name, team: p.team };
}

function getCheckins(sheet) {
  var data = sheet.getDataRange().getValues();
  return data.slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    // ts (ISO) lets the app award an "on-time" bonus for completing a session
    // within its scheduled week. Not sensitive — it's the player's own action.
    var ts = "";
    if (r[2]) { try { ts = new Date(r[2]).toISOString(); } catch (e) { ts = ""; } }
    return { playerId: String(r[0]), sessionId: String(r[1]), ts: ts };
  });
}

function findPlayerById(sheet, playerId) {
  playerId = String(playerId || '');
  if (!playerId) return null;
  var players = getPlayers(sheet);
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === playerId) return players[i];
  }
  return null;
}

// Writes a new PIN hash into an existing player's row (col 5 = pin).
function setPinHash(sheet, playerId, hash) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(playerId)) {
      sheet.getRange(i + 1, 5).setValue(hash);
      return true;
    }
  }
  return false;
}

// Verifies a player owns the given PIN. Returns the player row, or null.
function authPlayer(playersSheet, playerId, pin) {
  var player = findPlayerById(playersSheet, playerId);
  if (!player) return null;
  if (!player.pin) return null; // reset slot — no PIN set, not usable for writes
  if (player.pin !== hashPin(player.id, pin)) return null;
  return player;
}

/* ---------- Actions ------------------------------------------------------ */
function login(sheet, name, team, pin) {
  // Normalise & bound the name: strip control chars, trim, cap length.
  name = String(name || '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_NAME_LEN);
  if (!name) return { error: 'Enter your name.' };
  if (TEAMS.indexOf(team) === -1) return { error: 'Pick a valid team.' };
  if (!/^\d{4}$/.test(pin || '')) return { error: 'PIN needs to be 4 digits.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = name.toLowerCase() + '|' + team;
    var players = getPlayers(sheet);
    var existing = players.filter(function (p) { return p.key === key; })[0];

    if (existing) {
      // Reset slot: PIN cell was cleared, so adopt whatever PIN they type now.
      if (!existing.pin) {
        setPinHash(sheet, existing.id, hashPin(existing.id, pin));
        return { ok: true, player: publicPlayer(existing) };
      }
      if (existing.pin !== hashPin(existing.id, pin)) {
        return { error: "That PIN doesn't match this name + team. Check your spelling, or you may have used a different PIN when you joined." };
      }
      return { ok: true, player: publicPlayer(existing) };
    }

    var id = Utilities.getUuid();
    sheet.appendRow([id, key, name, team, hashPin(id, pin)]);
    return { ok: true, player: { id: id, key: key, name: name, team: team } };
  } finally {
    lock.releaseLock();
  }
}

function checkin(playersSheet, sheet, playerId, sessionId, pin) {
  if (!authPlayer(playersSheet, playerId, pin)) return { error: 'Not authorised.' };
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(sessionId || '')) return { error: 'Bad session.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = sheet.getDataRange().getValues();
    var rows = data.slice(1);
    var already = rows.some(function (r) { return String(r[0]) === String(playerId) && String(r[1]) === String(sessionId); });
    if (already) return { ok: true, already: true };
    sheet.appendRow([playerId, sessionId, new Date()]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function uncheck(playersSheet, sheet, playerId, sessionId, pin) {
  if (!authPlayer(playersSheet, playerId, pin)) return { error: 'Not authorised.' };
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(sessionId || '')) return { error: 'Bad session.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var rows = data.slice(1).filter(function (r) {
      return !(String(r[0]) === String(playerId) && String(r[1]) === String(sessionId));
    });
    sheet.clearContents();
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

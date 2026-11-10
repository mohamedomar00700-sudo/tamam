// Tamam: task management for the account. Google Apps Script backend.
// How to install: paste this whole file in Extensions > Apps Script of a NEW Google Sheet, run setup() once,
// then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone) and copy the /exec link.
// Every time is stamped here, on the server, so nobody can type or change one.

const TZ = 'Africa/Cairo';
const OTP_MINUTES = 10;
const SESSION_DAYS = 30;
// The QA scorecard sheet, only used by importTeamFromScorecard() to copy names and emails once.
const QA_SHEET_ID = '1EshGgymlOcNGNVy-scZpgqVVSKpRljA5xV4tKWhTf_M';

const TABS = {
  Team: ['Name', 'Arabic name', 'Email', 'Role (owner / lead / member)', 'Group', 'Active'],
  Tasks: ['ID', 'Created', 'Asked by', 'Owner', 'Task', 'Type', 'Priority', 'Due', 'Status', 'Seen', 'Confirmed', 'Started', 'Done', 'Worked (min)', 'Waiting on others (min)', 'Expected (min)', 'Record (JSON)'],
  Told: ['ID', 'Logged at', 'Happened at', 'From', 'To', 'Subject', 'How', 'Confirmed by', 'Still pending', 'Record (JSON)'],
  Routines: ['ID', 'Item', 'Done by (time)', 'Days', 'For', 'Active', 'Record (JSON)'],
  Checks: ['Day', 'Name', 'Done', 'Skipped', 'Day off', 'Record (JSON)'],
  Record: ['At', 'Who', 'Kind', 'ID', 'Title', 'Action', 'Details'],
};

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tab_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
// Text typed by people goes into cells as text, never as a formula.
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function dt_(ms) { return ms ? new Date(ms) : ''; }
function min_(ms) { return Math.round((ms || 0) / 6e4); }

// One tab = one list of records. The last column holds the full record; the others are for people to read.
function store_(name, keyOf, cells, lastRows) {
  const sh = tab_(name), jc = TABS[name].length;
  let L = null;
  function load() {
    if (L) return L;
    L = { list: [], row: {}, obj: {} };
    const last = sh.getLastRow(), first = lastRows ? Math.max(2, last - lastRows + 1) : 2, n = last - first + 1;
    if (n > 0) sh.getRange(first, jc, n, 1).getValues().forEach(function (r, i) {
      try { const o = JSON.parse(r[0]); const k = keyOf(o); L.row[k] = first + i; L.obj[k] = o; L.list.push(o); } catch (e) {}
    });
    return L;
  }
  return {
    all: function () { return load().list; },
    get: function (k) { return load().obj[k]; },
    put: function (o) {
      const S = load(), k = keyOf(o), vals = cells(o).map(function (v) { return typeof v === 'string' ? safe_(v) : v; }).concat(JSON.stringify(o));
      if (S.row[k]) { sh.getRange(S.row[k], 1, 1, jc).setValues([vals]); if (S.obj[k] !== o) { S.list[S.list.indexOf(S.obj[k])] = o; S.obj[k] = o; } }
      else { sh.appendRow(vals); S.row[k] = sh.getLastRow(); S.obj[k] = o; S.list.push(o); }
    },
  };
}

function db_() {
  const props = PropertiesService.getScriptProperties();
  const tasks = store_('Tasks', function (t) { return t.id; }, function (t) {
    return [t.id, dt_(t.created), t.by, t.to, t.title, t.cat, t.pri, dt_(t.due), t.status, dt_(t.seenAt), dt_(t.ackAt), dt_(t.startedAt), dt_(t.doneAt), min_(t.work), min_(t.waitMs), t.est || ''];
  });
  const notices = store_('Told', function (n) { return n.id; }, function (n) {
    return [n.id, dt_(n.at), dt_(n.saidAt), n.by, n.to.join(', '), n.subject, n.channel,
      n.to.filter(function (p) { return n.acks[p]; }).map(function (p) { return p + ' ' + Utilities.formatDate(new Date(n.acks[p].at), TZ, 'yyyy-MM-dd HH:mm'); }).join(' | '),
      n.to.filter(function (p) { return !n.acks[p]; }).join(', ')];
  });
  const routines = store_('Routines', function (r) { return r.id; }, function (r) {
    return [r.id, r.title, r.time, (r.days || []).map(function (d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]; }).join(' '), (r.groups || []).concat(r.people || []).join(', '), r.active ? 'Yes' : 'No'];
  });
  const checks = store_('Checks', function (c) { return c.day + '|' + c.name; }, function (c) {
    const ks = Object.keys(c.items || {});
    return [c.day, c.name, ks.filter(function (k) { return c.items[k].st === 'done'; }).length, ks.filter(function (k) { return c.items[k].st === 'skip'; }).length, c.off ? 'Yes' : ''];
  }, 3000);
  let team = null; const logRows = [];
  function loadTeam() {
    if (team) return team;
    const sh = tab_('Team'), n = sh.getLastRow() - 1;
    team = n > 0 ? sh.getRange(2, 1, n, 6).getValues().filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
      const role = String(r[3]).toLowerCase();
      return { name: String(r[0]).trim(), ar: String(r[1]).trim(), email: String(r[2]).trim().toLowerCase(), role: role.indexOf('owner') >= 0 ? 'owner' : role.indexOf('lead') >= 0 ? 'lead' : 'member', group: String(r[4]).trim(), active: !/^(no|false|0)$/i.test(String(r[5]).trim()) };
    }) : [];
    return team;
  }
  return {
    team: loadTeam,
    saveMember: function (m) {
      const sh = tab_('Team'), list = loadTeam(), n = sh.getLastRow() - 1;
      const names = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
      const vals = [[safe_(m.name), safe_(m.ar), safe_(m.email), m.role, safe_(m.group), m.active ? 'Yes' : 'No']], i = names.indexOf(m.name);
      if (i >= 0) sh.getRange(i + 2, 1, 1, 6).setValues(vals); else sh.appendRow(vals[0]);
      const j = list.findIndex(function (x) { return x.name === m.name; }); if (j >= 0) list[j] = m; else list.push(m);
    },
    tasks: tasks.all, task: tasks.get, putTask: tasks.put,
    notices: notices.all, notice: notices.get, putNotice: notices.put,
    routines: routines.all, putRoutine: routines.put,
    checks: function (from, to) { return checks.all().filter(function (c) { return c.day >= from && c.day <= to; }); },
    putCheck: checks.put,
    config: function () { return JSON.parse(props.getProperty('cfg') || '{}'); },
    setConfig: function (c) { props.setProperty('cfg', JSON.stringify(c)); },
    nextId: function (p) { const n = Number(props.getProperty('seq') || 1000) + 1; props.setProperty('seq', String(n)); return p + '-' + n; },
    log: function (r) { logRows.push([new Date(r.at), r.who, r.kind, r.id, safe_(r.title), r.action, safe_(typeof r.details === 'string' ? r.details : JSON.stringify(r.details || ''))]); },
    flush: function () { if (logRows.length) { const sh = tab_('Record'); sh.getRange(sh.getLastRow() + 1, 1, logRows.length, 7).setValues(logRows); logRows.length = 0; } },
  };
}
function env_(mail) {
  return {
    now: function () { return Date.now(); },
    day: function (ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd'); },
    hm: function (ms) { return Utilities.formatDate(new Date(ms), TZ, 'HH:mm'); },
    notify: function (kind, item, extra) { if (mail) mail.push({ kind: kind, item: item, extra: extra || {} }); },
  };
}

// ---------- sign-in with a code sent by email ----------
function hash_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))); }
function memberByEmail_(db, email) {
  const em = String(email || '').trim().toLowerCase();
  return em ? db.team().filter(function (m) { return m.active && m.email === em; })[0] || null : null;
}
function quotaOk_(n) { try { return MailApp.getRemainingDailyQuota() >= n; } catch (e) { return true; } }
function otpRequest_(db, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: 'bad_email' };
  const who = memberByEmail_(db, em);
  if (!who) return { ok: false, error: 'not_in_team' };
  const cache = CacheService.getScriptCache();
  let o = JSON.parse(cache.get('otp_' + em) || 'null');
  if (o && Date.now() - o.sent < 45 * 1000) return { ok: true, wait: true };
  if (!quotaOk_(1)) return { ok: false, error: 'mail_quota' };
  // asking again within the 10 minutes sends the same code, so an older email still works
  if (!o) o = { code: String(Math.floor(100000 + Math.random() * 900000)), at: Date.now(), tries: 0 };
  o.sent = Date.now();
  cache.put('otp_' + em, JSON.stringify(o), OTP_MINUTES * 60);
  MailApp.sendEmail({
    to: em, name: 'Tamam', subject: 'Tamam sign-in code: ' + o.code,
    htmlBody: mailWrap_('Your sign-in code', '<p style="margin:0 0 12px">Hello ' + esc_(who.name) + ',</p><p style="margin:0 0 12px">Your Tamam sign-in code is</p>' +
      '<p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:0 0 12px">' + o.code + '</p><p style="margin:0;color:#6b7280">It works for ' + OTP_MINUTES + ' minutes. If you did not ask for it, ignore this email.</p>'),
  });
  return { ok: true };
}
function otpVerify_(db, email, code, app) {
  const em = String(email || '').trim().toLowerCase(), cache = CacheService.getScriptCache();
  const o = JSON.parse(cache.get('otp_' + em) || 'null');
  if (!o) return { ok: false, error: 'code_expired' };
  if (o.tries >= 5) { cache.remove('otp_' + em); return { ok: false, error: 'too_many_tries' }; }
  if (String(code || '').replace(/\D/g, '') !== o.code) { o.tries++; cache.put('otp_' + em, JSON.stringify(o), OTP_MINUTES * 60); return { ok: false, error: 'wrong_code' }; }
  cache.remove('otp_' + em);
  const who = memberByEmail_(db, em);
  if (!who) return { ok: false, error: 'not_in_team' };
  const session = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('ses_' + hash_(session), JSON.stringify({ email: em, exp: Date.now() + SESSION_DAYS * 864e5 }));
  const c = db.config();
  if (!c.appUrl && /^https:\/\//.test(String(app || ''))) { c.appUrl = String(app).slice(0, 300); db.setConfig(c); }
  return { ok: true, session: session, name: who.name };
}
function who_(db, session) {
  if (!session) return null;
  const props = PropertiesService.getScriptProperties(), k = 'ses_' + hash_(session);
  const s = JSON.parse(props.getProperty(k) || 'null');
  const who = s && s.exp >= Date.now() ? memberByEmail_(db, s.email) : null;
  if (!who && s) props.deleteProperty(k);
  return who;
}

// ---------- the web app ----------
function reply_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return reply_({ ok: true, app: 'Tamam', time: new Date().toISOString() }); }
function doPost(e) {
  let lock = null;
  try {
    const b = JSON.parse(e.postData.contents), db = db_(), mail = [];
    if (b.action === 'otpRequest') return reply_(otpRequest_(db, b.email));
    if (b.action === 'otpVerify') return reply_(otpVerify_(db, b.email, b.code, b.app));
    const reads = b.action === 'sync' || b.action === 'history';
    if (!reads) { lock = LockService.getScriptLock(); lock.waitLock(25000); }
    const me = who_(db, b.session);
    if (!me) return reply_({ ok: false, error: 'signed_out' });
    const res = TM.make(db, env_(mail)).run(me, b.action, b);
    db.flush();
    if (lock) { lock.releaseLock(); lock = null; }
    if (res.ok && mail.length) try { sendNow_(db, mail); } catch (err) {}
    return reply_(res);
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message || err) });
  } finally { if (lock) try { lock.releaseLock(); } catch (e2) {} }
}

// ---------- emails (English only) ----------
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
function when_(ms) { return ms ? Utilities.formatDate(new Date(ms), TZ, 'EEE d MMM, h:mm a') : 'no due time'; }
function mailWrap_(title, inner, link) {
  return '<div dir="ltr" style="background:#eef2f7;padding:22px 12px;font-family:\'Segoe UI\',Tahoma,Arial,sans-serif;color:#0f1c2e;font-size:15px;line-height:1.55">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe2ec;border-radius:14px;overflow:hidden">' +
    '<div style="background:#1c4e92;color:#fff;padding:14px 20px;font-weight:700;font-size:17px">Tamam <span style="font-weight:400;opacity:.85">· ' + esc_(title) + '</span></div>' +
    '<div style="padding:20px">' + inner + (link ? '<p style="margin:18px 0 0"><a href="' + link + '" style="background:#1c4e92;color:#fff;text-decoration:none;padding:10px 18px;border-radius:9px;font-weight:600;display:inline-block">Open Tamam</a></p>' : '') + '</div></div></div>';
}
function mailList_(title, rows) {
  if (!rows.length) return '';
  return '<p style="margin:16px 0 6px;font-weight:700">' + esc_(title) + ' (' + rows.length + ')</p><table style="border-collapse:collapse;width:100%">' + rows.map(function (r) {
    return '<tr><td style="padding:7px 0;border-top:1px solid #e5e9f0;vertical-align:top;white-space:nowrap;color:#7f8da2;font-family:Consolas,monospace;font-size:13px;width:70px">' + esc_(r[0]) + '</td><td style="padding:7px 8px;border-top:1px solid #e5e9f0">' + esc_(r[1]) + (r[2] ? '<br><span style="color:#6b7280;font-size:13px">' + esc_(r[2]) + '</span>' : '') + '</td></tr>';
  }).join('') + '</table>';
}
function send_(to, subject, title, inner, link) {
  if (!to || !quotaOk_(8)) return false; // keep a few emails for sign-in codes
  MailApp.sendEmail({ to: to, name: 'Tamam', subject: subject, htmlBody: mailWrap_(title, inner, link) });
  return true;
}
function emailOf_(db, name) { const m = db.team().filter(function (x) { return x.name === name && x.active; })[0]; return m ? m.email : ''; }
// Emails that go out at once, right after an action.
function sendNow_(db, mail) {
  const cfg = TM.make(db, env_()).cfg(), link = cfg.appUrl || '';
  mail.forEach(function (m) {
    const t = m.item;
    if (m.kind === 'assign') {
      if (cfg.mailAssign === 'none' || (cfg.mailAssign === 'high' && t.pri !== 'high' && t.pri !== 'urgent')) return;
      send_(emailOf_(db, t.to), (t.pri === 'urgent' ? 'URGENT task: ' : 'New task: ') + t.title, m.extra.handoff ? 'A task was handed over to you' : 'New task',
        '<p style="margin:0 0 10px"><b>' + esc_(m.extra.handoff ? m.extra.handoff : t.by) + '</b> ' + (m.extra.handoff ? 'handed this task over to you' : 'gave you a task') + ':</p><p style="margin:0 0 10px;font-size:17px;font-weight:700">' + esc_(t.title) + '</p>' +
        '<p style="margin:0;color:#46566c">' + t.id + ' · Due: ' + when_(t.due) + (t.est ? ' · Expected: ' + t.est + ' min' : '') + ' · Priority: ' + t.pri + '</p><p style="margin:12px 0 0">Open Tamam and press <b>Got it</b> so the time you received it is on the record.</p>', link);
    } else if (m.kind === 'done' && t.status === 'review') {
      send_(emailOf_(db, t.by), 'Waiting for your approval: ' + t.title, 'Waiting for your approval', '<p style="margin:0"><b>' + esc_(t.to) + '</b> finished <b>' + esc_(t.title) + '</b> (' + t.id + '). It closes when you approve it.</p>', link);
    } else if (m.kind === 'return') {
      send_(emailOf_(db, t.to), 'Sent back: ' + t.title, 'A task was sent back to you', '<p style="margin:0"><b>' + esc_(t.title) + '</b> (' + t.id + ') was sent back. Open it to read what is missing.</p>', link);
    }
  });
}

// Every 15 minutes: one reminder per person for what they have not confirmed, and for what is due soon.
function tmTick() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    const db = db_(), core = TM.make(db, env_()), cfg = core.cfg(), now = Date.now(), hm = Utilities.formatDate(new Date(), TZ, 'HH:mm');
    const owner = db.team().filter(function (m) { return m.role === 'owner' && m.active; })[0];
    if (owner) core.run(owner, 'sync', { since: now }); // stops forgotten timers
    if (hm < cfg.workFrom || hm > cfg.workTo) { db.flush(); return; }
    const nudge = cfg.nudgeMin * 6e4, link = cfg.appUrl || '';
    db.team().filter(function (m) { return m.active && m.email; }).forEach(function (m) {
      const open = db.tasks().filter(function (t) { return t.to === m.name && TM.isOpen(t); });
      const un = open.filter(function (t) { return !t.ackAt && !t.nudged && now - t.created > nudge; });
      const soon = open.filter(function (t) { return t.due && t.status !== 'review' && !t.dueNudged && t.due > now && t.due - now < 30 * 6e4; });
      const ns = db.notices().filter(function (n) { return n.to.indexOf(m.name) >= 0 && !n.acks[m.name] && !(n.nudged || {})[m.name] && now - n.at > nudge; });
      if (!un.length && !soon.length && !ns.length) return;
      const inner = mailList_('Tasks waiting for your "Got it"', un.map(function (t) { return [t.id, t.title, 'From ' + t.by + ' · due ' + when_(t.due)]; })) +
        mailList_('Told to you, waiting for your "Got it"', ns.map(function (n) { return [n.id, n.subject, 'From ' + n.by + ' · ' + when_(n.at)]; })) +
        mailList_('Due in the next 30 minutes', soon.map(function (t) { return [t.id, t.title, 'Due ' + when_(t.due)]; }));
      if (!send_(m.email, 'Tamam: ' + (un.length + ns.length ? (un.length + ns.length) + ' waiting for your confirmation' : soon.length + ' due soon'), 'Reminder', inner, link)) return;
      un.forEach(function (t) { t.nudged = now; db.putTask(t); });
      soon.forEach(function (t) { t.dueNudged = now; db.putTask(t); });
      ns.forEach(function (n) { n.nudged = n.nudged || {}; n.nudged[m.name] = now; db.putNotice(n); });
    });
    db.flush();
  } finally { lock.releaseLock(); }
}
// Morning: each person gets their day, only if there is something on it.
function tmMorning() {
  const db = db_(), core = TM.make(db, env_()), cfg = core.cfg(), now = Date.now(), e = env_(), today = e.day(now);
  if (!cfg.mailDigest) return;
  db.team().filter(function (m) { return m.active && m.email; }).forEach(function (m) {
    const open = db.tasks().filter(function (t) { return t.to === m.name && TM.isOpen(t) && t.status !== 'review'; });
    const late = open.filter(function (t) { return TM.overdue(t, now); }), due = open.filter(function (t) { return t.due && t.due > now && e.day(t.due) === today; });
    if (!late.length && !due.length) return;
    const rn = TM.routinesFor(m, today, db.routines()).length, row = function (t) { return [t.id, t.title, 'Due ' + when_(t.due) + ' · from ' + t.by]; };
    send_(m.email, 'Tamam: your day (' + late.length + ' late, ' + due.length + ' due today)', 'Your day', '<p style="margin:0">Good morning ' + esc_(m.name.split(' ')[0]) + '.' + (rn ? ' You have ' + rn + ' routine items today.' : '') + '</p>' + mailList_('Late', late.map(row)) + mailList_('Due today', due.map(row)), cfg.appUrl || '');
  });
}
// End of day: one report for the leads.
function tmEvening() {
  const db = db_(), core = TM.make(db, env_()), cfg = core.cfg(), now = Date.now(), e = env_(), today = e.day(now);
  if (!cfg.mailDigest) return;
  const tasks = db.tasks(), open = tasks.filter(TM.isOpen);
  const done = tasks.filter(function (t) { return t.status === 'done' && e.day(t.doneAt) === today; });
  const late = open.filter(function (t) { return TM.overdue(t, now); }), un = open.filter(function (t) { return !t.ackAt; });
  const pend = db.notices().filter(function (n) { return n.to.some(function (p) { return !n.acks[p]; }); });
  const docs = db.checks(today, today), missed = [];
  db.team().filter(function (m) { return m.active; }).forEach(function (m) {
    const list = TM.routinesFor(m, today, db.routines()), doc = docs.filter(function (c) { return c.name === m.name; })[0];
    if (!list.length || (doc && doc.off)) return;
    const left = list.filter(function (r) { return !(doc && doc.items[r.id]); });
    if (left.length) missed.push([left.length + '/' + list.length, m.name, left.map(function (r) { return r.title; }).join(' · ')]);
  });
  const to = db.team().filter(function (m) { return m.active && m.email && TM.isLead(m); }).map(function (m) { return m.email; }).join(',');
  const row = function (t) { return [t.id, t.title, t.to + ' · due ' + when_(t.due)]; };
  send_(to, 'Tamam end of day: ' + done.length + ' done, ' + late.length + ' late, ' + (un.length + pend.length) + ' not confirmed', 'End of day',
    '<p style="margin:0">' + done.length + ' tasks done today · ' + open.length + ' still open.</p>' + mailList_('Late', late.map(row)) + mailList_('Tasks nobody confirmed', un.map(row)) +
    mailList_('Told, still not confirmed', pend.map(function (n) { return [n.id, n.subject, n.by + ' told ' + n.to.filter(function (p) { return !n.acks[p]; }).join(', ') + ' · ' + when_(n.at)]; })) +
    mailList_('Routine items not done', missed), cfg.appUrl || '');
}

// ---------- run once ----------
function setup() {
  const ss = ss_(); ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TABS).forEach(tab_);
  const team = tab_('Team');
  if (team.getLastRow() < 2) team.appendRow(['Owner', '', Session.getEffectiveUser().getEmail().toLowerCase(), 'owner', 'Management', 'Yes']);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^tm(Tick|Morning|Evening)$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tmTick').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('tmMorning').timeBased().atHour(9).nearMinute(40).inTimezone(TZ).everyDays(1).create();
  ScriptApp.newTrigger('tmEvening').timeBased().atHour(18).nearMinute(30).inTimezone(TZ).everyDays(1).create();
  MailApp.getRemainingDailyQuota(); // asks for the email permission now, not on the first sign-in
  const first = ss.getSheetByName('Sheet1'); if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  return 'Ready. The Team tab has you as the owner. Now deploy as a web app.';
}
// Optional: copy active names and emails from the QA scorecard's Roster tab into the Team tab (never overwrites).
function importTeamFromScorecard() {
  const src = SpreadsheetApp.openById(QA_SHEET_ID).getSheetByName('Roster'), team = tab_('Team');
  const have = team.getLastRow() > 1 ? team.getRange(2, 1, team.getLastRow() - 1, 3).getValues() : [];
  const names = have.map(function (r) { return String(r[0]).trim().toLowerCase(); }), emails = have.map(function (r) { return String(r[2]).trim().toLowerCase(); });
  let added = 0;
  src.getRange(2, 1, src.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const name = String(r[0]).trim(), role = String(r[1]).trim(), email = String(r[3]).trim().toLowerCase();
    if (!name || /^no$/i.test(String(r[2]).trim()) || names.indexOf(name.toLowerCase()) >= 0 || (email && emails.indexOf(email) >= 0)) return;
    const evalr = /^(eval|owner)/i.test(role), quality = /quality|\bqa\b/i.test(role);
    team.appendRow([name, '', email, evalr ? 'lead' : 'member', quality ? 'Quality' : evalr ? 'Team Leaders' : 'Agents', 'Yes']);
    names.push(name.toLowerCase()); if (email) emails.push(email); added++;
  });
  return added + ' people added to the Team tab. Check each row: group, role and email.';
}

// Tamam core: every rule of the tool lives here. The same file runs in the browser (instant updates and the
// demo) and inside the Google Apps Script (the copy that counts). Times are always stamped by whoever runs it;
// on the real tool that is the server, so nobody can type or change a time.
var TM = (function () {
  'use strict';
  var MIN = 6e4, HOUR = 36e5;
  var DEFAULT_CFG = {
    cats: ['Operations', 'Quality', 'Client', 'Reports', 'System / IT', 'Training', 'Admin'],
    groups: ['Agents', 'Team Leaders', 'Quality', 'RTM', 'Operations', 'Management'],
    maxRunHours: 8,      // a timer left running longer than this is stopped and flagged
    nudgeMin: 30,        // email a reminder when something is not acknowledged after this many minutes
    mailAssign: 'all',   // 'all' | 'high' | 'none': email the person when a task is given to them
    mailDigest: true,    // morning email per person + end of day report for leads
    workFrom: '09:00', workTo: '22:00',
    gamify: true, boardMode: 'all', weekStart: 6, teamGoal: 90, // league: on/off, 'all' or 'top' (top 3 + you), week starts Saturday
  };
  var OPEN = { todo: 1, doing: 1, waiting: 1, review: 1 };
  var PRI = { low: 1, normal: 1, high: 1, urgent: 1 };
  var CHANNELS = { verbal: 1, whatsapp: 1, call: 1, email: 1, meeting: 1 };

  function str(v, max) { return String(v == null ? '' : v).replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max || 500); }
  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? Math.round(v) : 0; }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function weekday(day) { return new Date(day + 'T00:00:00Z').getUTCDay(); }
  function isLead(m) { return !!m && (m.role === 'owner' || m.role === 'lead'); }
  function isOpen(t) { return !!OPEN[t.status]; }
  function overdue(t, now) { return !!t.due && isOpen(t) && t.status !== 'review' && now > t.due; }

  // Where the task's time went, in ms: before it was acknowledged, real work, waiting on someone, and idle.
  function breakdown(t, now) {
    var end = t.status === 'done' || t.status === 'review' ? (t.doneAt || now) : t.status === 'cancelled' ? t.updated : now;
    var total = Math.max(0, end - t.created);
    var toAck = Math.max(0, Math.min(end, t.ackAt || end) - t.created);
    var work = (t.work || 0) + (t.runSince ? Math.max(0, now - t.runSince) : 0);
    var wait = (t.waitMs || 0) + (t.waitSince ? Math.max(0, now - t.waitSince) : 0);
    var idle = Math.max(0, total - toAck - work - wait);
    return { total: total, toAck: toAck, work: work, wait: wait, idle: idle };
  }

  // Which daily routine items apply to this person on this day.
  function routinesFor(m, day, routines) {
    var wd = weekday(day);
    return routines.filter(function (r) {
      if (r.fromDay && day < r.fromDay) return false;
      if (r.endDay && day >= r.endDay) return false;
      if (!r.active && !r.endDay) return false;
      if ((r.days || []).indexOf(wd) < 0) return false;
      return (r.people || []).indexOf(m.name) >= 0 || (r.groups || []).indexOf(m.group) >= 0;
    }).sort(function (a, b) { return (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : (a.created - b.created); });
  }

  // A plain in-memory database (the browser's copy, the demo, and the tests).
  function memdb(d) {
    d = d || {};
    d.team = d.team || []; d.tasks = d.tasks || {}; d.notices = d.notices || {}; d.routines = d.routines || {};
    d.checks = d.checks || {}; d.config = d.config || {}; d.seq = d.seq || 1000; d.logRows = d.logRows || [];
    return {
      data: d,
      team: function () { return d.team; },
      saveMember: function (m) { var i = d.team.findIndex(function (x) { return x.name === m.name; }); if (i < 0) d.team.push(m); else d.team[i] = m; },
      tasks: function () { return Object.keys(d.tasks).map(function (k) { return d.tasks[k]; }); },
      task: function (id) { return d.tasks[id]; },
      putTask: function (t) { d.tasks[t.id] = t; },
      notices: function () { return Object.keys(d.notices).map(function (k) { return d.notices[k]; }); },
      notice: function (id) { return d.notices[id]; },
      putNotice: function (n) { d.notices[n.id] = n; },
      routines: function () { return Object.keys(d.routines).map(function (k) { return d.routines[k]; }); },
      putRoutine: function (r) { d.routines[r.id] = r; },
      checks: function (from, to) { return Object.keys(d.checks).map(function (k) { return d.checks[k]; }).filter(function (c) { return c.day >= from && c.day <= to; }); },
      putCheck: function (c) { d.checks[c.day + '|' + c.name] = c; },
      config: function () { return d.config; },
      setConfig: function (c) { d.config = c; },
      nextId: function (p) { d.seq++; return p + '-' + d.seq; },
      log: function (row) { if (d.keepLog) d.logRows.push(row); },
    };
  }

  // env: { now(): ms, day(ms): 'yyyy-mm-dd', hm(ms): 'HH:mm', notify(kind, item, extra) }
  function make(db, env) {
    function cfg() { var c = {}, k, s = db.config() || {}; for (k in DEFAULT_CFG) c[k] = DEFAULT_CFG[k]; for (k in s) c[k] = s[k]; return c; }
    function fail(code) { throw { tm: code }; }
    function member(name) { return db.team().filter(function (m) { return m.name === name; })[0]; }
    function activeMember(name) { var m = member(name); if (!m || !m.active) fail('bad_person'); return m; }
    function sees(me, t) { return isLead(me) || t.by === me.name || t.to === me.name || (t.ppl || []).indexOf(me.name) >= 0; }
    function seesN(me, n) { return isLead(me) || n.by === me.name || n.to.indexOf(me.name) >= 0; }
    function notify(kind, item, extra) { if (env.notify) try { env.notify(kind, item, extra); } catch (e) {} }

    function ev(t, who, a, d) {
      var e = { at: env.now(), by: who, a: a };
      if (d) e.d = d;
      t.log.push(e); t.updated = e.at;
      db.log({ at: e.at, who: who, kind: 'task', id: t.id, title: t.title, action: a, details: d || '' });
    }
    function stopRun(t, at) { if (t.runSince) { t.work = (t.work || 0) + Math.max(0, at - t.runSince); t.runSince = 0; } }
    function stopWait(t, at) { if (t.waitSince) { t.waitMs = (t.waitMs || 0) + Math.max(0, at - t.waitSince); t.waitSince = 0; } }

    function run(me, action, b) {
      var out = { ok: true, now: env.now() };
      function touchT(t) { db.putTask(t); (out.tasks = out.tasks || []).push(t); }
      function touchN(n) { db.putNotice(n); (out.notices = out.notices || []).push(n); }
      try {
        if (!me || !me.active) fail('signed_out');
        b = b || {};
        var now = env.now(), L = isLead(me), t, n, r, i;

        if (action === 'sync') {
          var since = Number(b.since) || 0, today = env.day(now), c = cfg();
          // a timer that was forgotten: stop it at the cap and flag it, so reports never show a 14 hour task
          db.tasks().forEach(function (x) {
            if (x.runSince && now - x.runSince > c.maxRunHours * HOUR) {
              x.work = (x.work || 0) + c.maxRunHours * HOUR; x.runSince = 0; x.timeFlag = true;
              ev(x, 'system', 'autostop', { hours: c.maxRunHours }); db.putTask(x);
            }
          });
          var oldest = now - 45 * 864e5;
          out.tasks = db.tasks().filter(function (x) {
            if (!sees(me, x)) return false;
            if (since) return x.updated > since;
            return isOpen(x) || x.updated > oldest;
          });
          out.notices = db.notices().filter(function (x) { return seesN(me, x) && (since ? x.updated > since : x.updated > oldest || pendingAck(x)); });
          out.routines = db.routines();
          out.checks = db.checks(today, today).filter(function (x) { return L || x.name === me.name; });
          out.team = db.team().map(function (m) { return me.role === 'owner' || m.name === me.name ? m : { name: m.name, ar: m.ar, role: m.role, group: m.group, active: m.active }; });
          out.config = c; out.me = me.name; out.day = today; out.full = !since;
          return out;
        }

        if (action === 'history') { // routine checks of earlier days, for the overview
          out.history = db.checks(str(b.from, 10), str(b.to, 10)).filter(function (x) { return L || x.name === me.name; });
          return out;
        }

        if (action === 'league') { if (cfg().gamify === false && !L) fail('not_allowed'); out.league = league(db, env, cfg(), me); return out; }

        if (action === 'taskNew') {
          var title = str(b.title, 200); if (!title) fail('need_title');
          var tos = uniq([].concat(b.to || me.name)); if (!tos.length) tos = [me.name];
          tos.forEach(activeMember);
          var grp = tos.length > 1 ? 'G' + now : '';
          tos.forEach(function (to) {
            var x = {
              id: db.nextId('T'), title: title, details: str(b.details, 4000), by: me.name, to: to,
              cat: str(b.cat, 40), pri: PRI[b.pri] ? b.pri : 'normal', due: num(b.due), est: num(b.est),
              status: 'todo', needReview: !!b.needReview && to !== me.name, created: now, updated: now,
              seenAt: 0, ackAt: 0, startedAt: 0, doneAt: 0, work: 0, runSince: 0, waitMs: 0, waitSince: 0, waitOn: '',
              subs: [], log: [], ppl: uniq([me.name, to]),
            };
            if (grp) x.grp = grp;
            if (to === me.name) x.seenAt = x.ackAt = now;
            [].concat(b.subs || []).slice(0, 30).forEach(function (s, k) { s = str(s, 200); if (s) x.subs.push({ id: 's' + (k + 1), t: s, done: false }); });
            ev(x, me.name, 'create', { to: to, due: x.due || undefined, est: x.est || undefined });
            if (b.noticeId) { n = db.notice(b.noticeId); if (n && seesN(me, n)) { x.noticeId = n.id; n.taskId = x.id; n.updated = now; touchN(n); } }
            touchT(x);
            if (to !== me.name) notify('assign', x);
          });
          return out;
        }

        if (action === 'taskAct' || action === 'taskEdit') {
          t = db.task(b.id); if (!t || !sees(me, t)) fail('not_found');
          var isTo = t.to === me.name, isBy = t.by === me.name;

          if (action === 'taskEdit') {
            if (!(isBy || L)) fail('not_allowed');
            if (!isOpen(t)) fail('closed');
            var p = b.patch || {}, ch = {};
            var set = function (k, v) { if (p[k] !== undefined && v !== t[k]) { ch[k] = { from: t[k], to: v }; t[k] = v; } };
            if (p.title !== undefined && !str(p.title, 200)) fail('need_title');
            set('title', str(p.title, 200)); set('details', str(p.details, 4000)); set('cat', str(p.cat, 40));
            set('pri', PRI[p.pri] ? p.pri : t.pri); set('due', num(p.due)); set('est', num(p.est));
            set('needReview', !!p.needReview);
            if (ch.details) ch.details = { changed: true };
            if (Object.keys(ch).length) { ev(t, me.name, 'edit', ch); touchT(t); if (ch.due && !isTo) notify('due', t); }
            return out;
          }

          var act = b.act, note = str(b.note, 1000);
          if (act === 'comment') { if (!note) fail('need_note'); ev(t, me.name, 'comment', { text: note }); touchT(t); notify('comment', t, { by: me.name }); return out; }
          if (act === 'seen') { if (isTo && !t.seenAt) { t.seenAt = now; ev(t, me.name, 'seen'); touchT(t); } return out; }
          if (act === 'reopen') {
            if (isOpen(t) && t.status !== 'review') fail('bad_state');
            if (!(isBy || L || (isTo && t.status !== 'cancelled'))) fail('not_allowed');
            t.status = 'todo'; t.doneAt = 0; ev(t, me.name, 'reopen', note ? { note: note } : null); touchT(t); return out;
          }
          if (!isOpen(t)) fail('closed');

          if (act === 'ack') {
            if (!isTo) fail('not_allowed');
            if (!t.ackAt) { t.ackAt = now; if (!t.seenAt) t.seenAt = now; ev(t, me.name, 'ack', note ? { note: note } : null); touchT(t); }
            return out;
          }
          if (act === 'start') {
            if (!isTo) fail('not_allowed');
            if (t.status === 'review') fail('bad_state');
            if (t.runSince) return out;
            db.tasks().forEach(function (x) { // one running timer per person
              if (x.id !== t.id && x.to === me.name && x.runSince) { stopRun(x, now); ev(x, me.name, 'autopause', { for: t.id }); touchT(x); }
            });
            if (!t.ackAt) { t.ackAt = now; if (!t.seenAt) t.seenAt = now; ev(t, me.name, 'ack'); }
            stopWait(t, now);
            var first = !t.startedAt; if (first) t.startedAt = now;
            t.status = 'doing'; t.runSince = now; t.waitOn = '';
            ev(t, me.name, first ? 'start' : 'resume'); touchT(t); return out;
          }
          if (act === 'pause') {
            if (!isTo) fail('not_allowed');
            if (t.runSince) { stopRun(t, now); ev(t, me.name, 'pause', note ? { note: note } : null); touchT(t); }
            return out;
          }
          if (act === 'wait') {
            if (!(isTo || L)) fail('not_allowed');
            if (t.status === 'review') fail('bad_state');
            var on = str(b.on, 120); if (!on && !note) fail('need_note');
            stopRun(t, now); stopWait(t, now);
            t.status = 'waiting'; t.waitSince = now; t.waitOn = on;
            ev(t, me.name, 'wait', { on: on, note: note }); touchT(t); notify('wait', t, { on: on }); return out;
          }
          if (act === 'done') {
            if (!(isTo || L)) fail('not_allowed');
            if (t.status === 'review') fail('bad_state');
            stopRun(t, now); stopWait(t, now);
            if (!t.ackAt && isTo) { t.ackAt = now; if (!t.seenAt) t.seenAt = now; }
            t.doneAt = now; t.waitOn = '';
            t.status = t.needReview && !isBy ? 'review' : 'done';
            ev(t, me.name, 'done', { note: note || undefined, late: t.due && now > t.due ? true : undefined });
            touchT(t); if (!isBy) notify('done', t); return out;
          }
          if (act === 'approve' || act === 'return') {
            if (t.status !== 'review') fail('bad_state');
            if (!(isBy || L)) fail('not_allowed');
            if (act === 'approve') { t.status = 'done'; ev(t, me.name, 'approve', note ? { note: note } : null); }
            else { if (!note) fail('need_note'); t.status = 'doing'; t.doneAt = 0; t.returns = (t.returns || 0) + 1; ev(t, me.name, 'return', { note: note }); notify('return', t); }
            touchT(t); return out;
          }
          if (act === 'cancel') {
            if (!(isBy || L)) fail('not_allowed');
            if (!note) fail('need_note');
            stopRun(t, now); stopWait(t, now); t.status = 'cancelled';
            ev(t, me.name, 'cancel', { note: note }); touchT(t); return out;
          }
          if (act === 'handoff') {
            if (!(isTo || isBy || L)) fail('not_allowed');
            var nt = activeMember(str(b.to, 120)); if (nt.name === t.to) fail('same_person');
            if (!note) fail('need_note');
            stopRun(t, now); stopWait(t, now);
            var from = t.to; t.to = nt.name; t.ppl = uniq((t.ppl || []).concat(nt.name));
            t.seenAt = t.ackAt = nt.name === me.name ? now : 0; t.waitOn = '';
            if (t.status !== 'review') t.status = 'todo';
            ev(t, me.name, 'handoff', { from: from, to: nt.name, note: note }); touchT(t);
            if (nt.name !== me.name) notify('assign', t, { handoff: from }); return out;
          }
          if (act === 'sub') {
            if (!(isTo || isBy || L)) fail('not_allowed');
            var s = (t.subs || []).filter(function (x) { return x.id === b.sid; })[0]; if (!s) fail('not_found');
            s.done = !!b.done; s.at = now; s.by = me.name;
            ev(t, me.name, s.done ? 'subDone' : 'subUndo', { text: s.t }); touchT(t); return out;
          }
          if (act === 'subAdd') {
            if (!(isTo || isBy || L)) fail('not_allowed');
            if (!note) fail('need_note');
            t.subs = t.subs || []; t.subs.push({ id: 's' + now.toString(36), t: note.slice(0, 200), done: false });
            ev(t, me.name, 'subAdd', { text: note.slice(0, 200) }); touchT(t); return out;
          }
          if (act === 'time') { // manual correction of the worked time: always with a reason, always on the record
            if (!(isTo || L)) fail('not_allowed');
            if (!note) fail('need_note');
            stopRun(t, now);
            var mins = Math.max(0, Math.round(Number(b.min) || 0)), was = Math.round((t.work || 0) / MIN);
            t.work = mins * MIN; t.timeEdited = true;
            ev(t, me.name, 'time', { from: was, to: mins, note: note }); touchT(t); return out;
          }
          fail('bad_action');
        }

        if (action === 'noticeNew') {
          var subject = str(b.subject, 300); if (!subject) fail('need_title');
          var to = uniq([].concat(b.to || [])).filter(function (x) { return x !== me.name; });
          if (!to.length) fail('bad_person'); to.forEach(activeMember);
          var said = num(b.saidAt); if (!said || said > now) said = now;
          n = { id: db.nextId('N'), at: now, saidAt: said, by: me.name, to: to, subject: subject, details: str(b.details, 3000),
            channel: CHANNELS[b.channel] ? b.channel : 'verbal', acks: {}, seen: {}, updated: now };
          db.log({ at: now, who: me.name, kind: 'notice', id: n.id, title: subject, action: 'told', details: { to: to, channel: n.channel, saidAt: said !== now ? said : undefined } });
          touchN(n); notify('notice', n); return out;
        }
        if (action === 'noticeAck' || action === 'noticeSeen') {
          [].concat(b.id || b.ids || []).forEach(function (id) {
            n = db.notice(id); if (!n || n.to.indexOf(me.name) < 0) return;
            if (action === 'noticeSeen') { if (!n.seen[me.name]) { n.seen[me.name] = now; n.updated = now; touchN(n); } return; }
            if (n.acks[me.name]) return;
            n.acks[me.name] = { at: now, note: str(b.note, 500) }; if (!n.seen[me.name]) n.seen[me.name] = now; n.updated = now;
            db.log({ at: now, who: me.name, kind: 'notice', id: n.id, title: n.subject, action: 'ack', details: str(b.note, 500) });
            touchN(n); notify('noticeAck', n, { by: me.name });
          });
          return out;
        }

        if (action === 'check') {
          var day = env.day(now), rid = str(b.rid, 40);
          r = db.routines().filter(function (x) { return x.id === rid; })[0];
          if (!r || routinesFor(me, day, [r]).length === 0) fail('not_found');
          var doc = db.checks(day, day).filter(function (x) { return x.name === me.name; })[0] || { day: day, name: me.name, items: {}, off: false };
          var st = b.st === 'done' || b.st === 'skip' ? b.st : '';
          if (st === 'skip' && !str(b.note, 300)) fail('need_note');
          if (st) { doc.items[rid] = { st: st, at: now, note: str(b.note, 300) }; if (r.time && env.hm(now) > r.time) doc.items[rid].late = true; }
          else delete doc.items[rid];
          doc.updated = now; db.putCheck(doc); out.checks = [doc];
          db.log({ at: now, who: me.name, kind: 'routine', id: rid, title: r.title, action: st || 'untick', details: str(b.note, 300) });
          return out;
        }
        if (action === 'dayOff') {
          var who = str(b.name, 120) || me.name; if (who !== me.name && !L) fail('not_allowed');
          var d2 = env.day(now);
          var doc2 = db.checks(d2, d2).filter(function (x) { return x.name === who; })[0] || { day: d2, name: who, items: {}, off: false };
          doc2.off = !!b.off; doc2.updated = now; db.putCheck(doc2); out.checks = [doc2];
          db.log({ at: now, who: me.name, kind: 'routine', id: '', title: who, action: doc2.off ? 'dayOff' : 'dayOn', details: '' });
          return out;
        }
        if (action === 'routineSave') {
          if (!L) fail('not_allowed');
          var rt = str(b.title, 200); if (!rt) fail('need_title');
          var old = b.id ? db.routines().filter(function (x) { return x.id === b.id; })[0] : null;
          r = old || { id: db.nextId('R'), by: me.name, created: now, fromDay: env.day(now) };
          r.title = rt; r.details = str(b.details, 1000);
          r.time = /^\d\d:\d\d$/.test(b.time || '') ? b.time : '';
          r.days = uniq([].concat(b.days || []).map(Number).filter(function (x) { return x >= 0 && x <= 6; }).map(function (x) { return x + 1; })).map(function (x) { return x - 1; });
          r.people = uniq([].concat(b.people || []).map(function (x) { return str(x, 120); }));
          r.groups = uniq([].concat(b.groups || []).map(function (x) { return str(x, 60); }));
          var active = b.active !== false;
          if (!active && r.active !== false) r.endDay = env.day(now);
          if (active) r.endDay = '';
          r.active = active; r.updated = now;
          db.putRoutine(r); out.routines = db.routines();
          db.log({ at: now, who: me.name, kind: 'routine', id: r.id, title: r.title, action: old ? (active ? 'edit' : 'stop') : 'create', details: '' });
          return out;
        }

        if (action === 'memberSave') {
          if (me.role !== 'owner') fail('not_allowed');
          var nm = str(b.name, 120), em = str(b.email, 200).toLowerCase(); if (!nm) fail('need_title');
          if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) fail('bad_email');
          if (em && db.team().some(function (x) { return x.name !== nm && x.email === em; })) fail('email_used');
          var role = b.role === 'owner' || b.role === 'lead' ? b.role : 'member';
          var act2 = b.active !== false;
          if (nm === me.name && (role !== 'owner' || !act2)) fail('keep_owner');
          db.saveMember({ name: nm, ar: str(b.ar, 120), email: em, role: role, group: str(b.group, 60), active: act2 });
          out.team = db.team();
          db.log({ at: now, who: me.name, kind: 'team', id: '', title: nm, action: 'save', details: { role: role, group: str(b.group, 60), active: act2 } });
          return out;
        }
        if (action === 'configSave') {
          if (me.role !== 'owner') fail('not_allowed');
          var c2 = cfg(), q = b.config || {};
          if (Array.isArray(q.cats)) c2.cats = uniq(q.cats.map(function (x) { return str(x, 40); })).slice(0, 30);
          if (Array.isArray(q.groups)) c2.groups = uniq(q.groups.map(function (x) { return str(x, 60); })).slice(0, 30);
          if (num(q.maxRunHours)) c2.maxRunHours = Math.min(24, num(q.maxRunHours));
          if (num(q.nudgeMin)) c2.nudgeMin = Math.max(10, num(q.nudgeMin));
          if (q.mailAssign === 'all' || q.mailAssign === 'high' || q.mailAssign === 'none') c2.mailAssign = q.mailAssign;
          if (q.mailDigest !== undefined) c2.mailDigest = !!q.mailDigest;
          if (q.appUrl !== undefined) c2.appUrl = str(q.appUrl, 300);
          if (q.gamify !== undefined) c2.gamify = !!q.gamify;
          if (q.boardMode === 'all' || q.boardMode === 'top') c2.boardMode = q.boardMode;
          if (num(q.teamGoal)) c2.teamGoal = Math.min(100, num(q.teamGoal));
          db.setConfig(c2); out.config = c2; return out;
        }
        fail('bad_action');
      } catch (e) {
        if (e && e.tm) return { ok: false, error: e.tm };
        throw e;
      }
    }
    function pendingAck(n) { return n.to.some(function (x) { return !n.acks[x]; }); }
    return { run: run, cfg: cfg };
  }


  // ---------- the league: points, streaks and badges, worked out only from stamped facts ----------
  // Fair by design: tasks you give yourself earn nothing, nothing is ever taken away, it resets every week,
  // and people are ranked against their own group (agents with agents, leads with leads).
  var PTS = { ack: 2, done: 5, ontime: 5, clean: 3, rtOn: 2, rtLate: 1, rtFull: 5, told: 1 };
  function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekOf(day, start) { var k = (weekday(day) - start + 7) % 7; var a = addDays(day, -k); return { from: a, to: addDays(a, 7) }; }
  function scoreRange(db, env, cfg, from, to) {
    var team = db.team().filter(function (m) { return m.active; }), P = {}, nudge = cfg.nudgeMin * MIN;
    team.forEach(function (m) { P[m.name] = { name: m.name, group: m.group, pts: 0, why: {}, done: 0, ontime: 0, late: 0, acks: 0, ackMs: 0, clean: 0, returned: 0, rtDays: 0, rtFull: 0 }; });
    function give(n, k, v) { var p = P[n]; if (!p) return; p.pts += v; p.why[k] = (p.why[k] || 0) + v; }
    function inR(at) { var d = env.day(at); return d >= from && d < to; }
    db.tasks().forEach(function (t) {
      var holder = '', since = 0, returnedCycle = false, paid = {};
      t.log.forEach(function (e) {
        var d = e.d || {};
        if (e.a === 'create') { holder = d.to || t.to; since = e.at; }
        if (e.a === 'handoff') { holder = d.to; since = e.at; }
        if (holder === t.by && e.a !== 'approve') return; // own tasks earn nothing
        if (e.a === 'ack' && e.by === holder && inR(e.at)) { var w = e.at - since; P[holder] && (P[holder].acks++, P[holder].ackMs += w); if (w <= nudge) give(holder, 'ack', PTS.ack); }
        if (e.a === 'done' && e.by === holder && inR(e.at) && !paid[holder]) {
          paid[holder] = 1;
          give(holder, 'done', PTS.done); P[holder] && P[holder].done++;
          if (t.due) { if (!d.late) { give(holder, 'ontime', PTS.ontime); P[holder] && P[holder].ontime++; } else if (P[holder]) P[holder].late++; }
        }
        if (e.a === 'return') { returnedCycle = true; if (inR(e.at) && P[holder]) P[holder].returned++; }
        if (e.a === 'approve' && inR(e.at) && holder !== t.by) { if (!returnedCycle) { give(holder, 'clean', PTS.clean); P[holder] && P[holder].clean++; } returnedCycle = false; }
      });
    });
    db.notices().forEach(function (n) {
      if (!inR(n.at)) return;
      n.to.forEach(function (p) { var a = n.acks[p]; if (a && a.at - n.at <= nudge) give(p, 'told', PTS.told); });
    });
    var routines = db.routines();
    db.checks(from, addDays(to, -1)).forEach(function (c) {
      var m = team.filter(function (x) { return x.name === c.name; })[0]; if (!m || c.off) return;
      var list = routinesFor(m, c.day, routines); if (!list.length) return;
      var handled = 0;
      list.forEach(function (r) { var it = c.items[r.id]; if (!it) return; handled++; if (it.st === 'done') give(c.name, it.late ? 'rtLate' : 'rtOn', it.late ? PTS.rtLate : PTS.rtOn); });
      P[c.name].rtDays++;
      if (handled === list.length) { P[c.name].rtFull++; give(c.name, 'rtFull', PTS.rtFull); }
    });
    return P;
  }
  // Days in a row with the whole routine handled. Days with no routine, days off and today (while it is still going) never break it.
  function streakOf(db, env, m, today) {
    var routines = db.routines(), docs = db.checks(addDays(today, -60), today), n = 0;
    for (var k = 0; k <= 60; k++) {
      var day = addDays(today, -k), list = routinesFor(m, day, routines);
      if (!list.length) continue;
      var c = docs.filter(function (x) { return x.day === day && x.name === m.name; })[0];
      if (c && c.off) continue;
      var full = !!c && list.every(function (r) { return c.items[r.id]; });
      if (full) n++; else if (k > 0) break;
    }
    return n;
  }
  function league(db, env, cfg, me) {
    var today = env.day(env.now()), wk = weekOf(today, cfg.weekStart), prev = { from: addDays(wk.from, -7), to: wk.from };
    var cur = scoreRange(db, env, cfg, wk.from, wk.to), last = scoreRange(db, env, cfg, prev.from, prev.to);
    var rows = Object.keys(cur).map(function (k) {
      var p = cur[k], m = db.team().filter(function (x) { return x.name === k; })[0], b = [];
      p.streak = streakOf(db, env, m, today);
      if (p.acks >= 3 && p.ackMs / p.acks <= 10 * MIN) b.push('fast');
      if (p.ontime >= 5 && !p.late) b.push('ontime');
      if (p.rtDays >= 3 && p.rtFull === p.rtDays) b.push('routine');
      if (p.streak >= 5) b.push('streak');
      if (p.clean >= 2 && !p.returned) b.push('clean');
      p.badges = b; p.lastPts = last[k] ? last[k].pts : 0;
      return p;
    });
    var champs = {};
    Object.keys(last).forEach(function (k) { var p = last[k], g = p.group || '-'; if (p.pts > 0 && (!champs[g] || p.pts > champs[g].pts)) champs[g] = { name: k, pts: p.pts }; });
    // the team's goal: share of tasks finished on time this week
    var withDue = rows.reduce(function (s, r) { return s + r.ontime + r.late; }, 0), onT = rows.reduce(function (s, r) { return s + r.ontime; }, 0);
    var team = { goal: cfg.teamGoal, onTime: withDue ? Math.round(onT / withDue * 100) : null, done: rows.reduce(function (s, r) { return s + r.done; }, 0), pts: rows.reduce(function (s, r) { return s + r.pts; }, 0) };
    var L = isLead(me), mine = rows.filter(function (r) { return r.name === me.name; })[0];
    if (!L) { // members: their own breakdown, everyone's points only if the owner allows it
      rows = rows.map(function (r) { return r.name === me.name ? r : { name: r.name, group: r.group, pts: r.pts, badges: r.badges, streak: r.streak, lastPts: r.lastPts }; });
      if (cfg.boardMode === 'top') {
        var mineG = rows.filter(function (r) { return r.group === (mine && mine.group); }).sort(function (a, b) { return b.pts - a.pts; });
        rows = mineG.filter(function (r, i) { return i < 3 || r.name === me.name; }).map(function (r) { r.rank = mineG.indexOf(r) + 1; return r; });
      }
    }
    return { week: wk, rows: rows, champs: champs, team: team, pts: PTS, on: cfg.gamify !== false, mode: cfg.boardMode };
  }

  return { league: league, weekOf: weekOf, addDays: addDays, PTS: PTS, make: make, memdb: memdb, breakdown: breakdown, routinesFor: routinesFor, overdue: overdue, isOpen: isOpen, isLead: isLead, weekday: weekday, DEFAULT_CFG: DEFAULT_CFG };
})();
if (typeof module !== 'undefined') module.exports = TM;

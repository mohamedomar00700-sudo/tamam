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


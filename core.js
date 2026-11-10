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

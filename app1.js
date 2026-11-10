// Tamam, part 1: helpers, state, talking to the sheet, and the demo data.
const CFG = window.TM_CONFIG || {};
const DEMO = !CFG.sheetUrl;
const TZ = 'Africa/Cairo';
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
let lang = ls.get('tm_lang', 'ar');
const L = (ar, en) => (lang === 'ar' ? ar : en);
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;

// ---------- time (everything is shown in Cairo time, whatever the device says) ----------
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
let clockOffset = 0; // server clock minus this device's clock
const env = { now: () => Date.now() + clockOffset, day: (ms) => dayFmt.format(ms), hm: (ms) => hmFmt.format(ms) };
function tzOffset(ms) {
  const p = {}; partsFmt.formatToParts(ms).forEach((x) => { p[x.type] = Number(x.value); });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
const wallToMs = (s) => { const u = Date.parse(s + ':00Z'); return isNaN(u) ? 0 : u - tzOffset(u - 2 * HOUR); };
const msToWall = (ms) => new Date(ms + tzOffset(ms)).toISOString().slice(0, 16);
const loc = () => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
const fmtClock = (ms) => new Intl.DateTimeFormat(loc(), { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(ms);
const fmtDate = (ms, long) => new Intl.DateTimeFormat(loc(), Object.assign({ timeZone: TZ, day: 'numeric', month: 'short' }, long ? { weekday: 'long' } : {})).format(ms);
function fmtStamp(ms) {
  if (!ms) return '';
  const d = env.day(ms), today = env.day(env.now());
  if (d === today) return fmtClock(ms);
  if (d === env.day(env.now() - DAY)) return L('أمس ', 'Yesterday ') + fmtClock(ms);
  if (d === env.day(env.now() + DAY)) return L('بكرة ', 'Tomorrow ') + fmtClock(ms);
  return fmtDate(ms) + ' ' + fmtClock(ms);
}
const fmtDue = (ms) => (env.day(ms) === env.day(env.now()) ? L('النهارده ', 'Today ') + fmtClock(ms) : fmtStamp(ms));
function fmtDur(ms) {
  const m = Math.round(Math.abs(ms) / MIN);
  if (m < 1) return L('0د', '0m');
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const out = [];
  if (d) out.push(d + L('ي', 'd'));
  if (h) out.push(h + L('س', 'h'));
  if (mm && !d) out.push(mm + L('د', 'm'));
  return out.join(' ');
}
const fmtLive = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const p = (n) => String(n).padStart(2, '0'); return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60); };
const stamp = (ms) => (ms ? '<span class="stamp">' + esc(fmtStamp(ms)) + '</span>' : '');

// ---------- icons ----------
const IC = {
  today: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4',
  tasks: 'M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h10M11 12h10M11 18h10',
  told: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  routine: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  board: 'M3 3v18h18M7 15v3M12 9v9M17 5v13',
  setup: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14', check: 'M5 12.5l4.5 4.5L19 7.5', play: 'M7 4.5v15l12-7.5z', pause: 'M8 5v14M16 5v14',
  x: 'M6 6l12 12M18 6L6 18', clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', wait: 'M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4',
  hand: 'M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12', down: 'M12 4v12M6 11l6 6 6-6M4 20h16', edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
};
const ic = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + IC[n] + '"/></svg>';

// ---------- state ----------
let db = TM.memdb();
let core = TM.make(db, env);
const S = {
  session: ls.get('tm_session', ''), me: '', day: env.day(env.now()), since: 0, ready: false, busy: 0,
  view: 'today', drawer: '', modal: null, history: null, historyKey: '',
  f: { scope: 'mine', layout: ls.get('tm_layout', 'board'), q: '', person: '', showDone: false, nscope: 'in', nq: '', range: 7 },
  demoAs: ls.get('tm_demo_as', 'Omar Sami'),
};
const me = () => db.team().find((m) => m.name === S.me) || null;
const lead = () => TM.isLead(me());
const person = (n) => db.team().find((m) => m.name === n);
const pname = (n) => { const m = person(n); return n === 'system' ? L('النظام', 'System') : m ? (lang === 'ar' && m.ar ? m.ar : m.name) : n; };
const short = (n) => pname(n).split(' ').slice(0, 2).join(' ');
function av(n, cls) {
  const s = pname(n).trim(), parts = s.split(/\s+/);
  let hsh = 0; for (const ch of String(n)) hsh = (hsh * 31 + ch.charCodeAt(0)) % 360;
  const ini = lang === 'ar' && /[؀-ۿ]/.test(s) ? s[0] : (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  return '<span class="av ' + (cls || '') + '" style="background:hsl(' + hsh + ' 42% 42%)" title="' + esc(s) + '">' + esc(ini) + '</span>';
}
const ERR = {
  need_title: ['اكتب العنوان الأول', 'Write a title first'], need_note: ['اكتب السبب أو الملاحظة', 'Write the reason or note'],
  bad_person: ['اختار اسم من الفريق', 'Pick someone from the team'], not_allowed: ['مش من صلاحياتك', 'You are not allowed to do this'],
  not_found: ['مش موجود', 'Not found'], closed: ['التاسك مقفولة', 'This task is closed'], bad_state: ['مينفعش في الحالة دي', 'Not possible in this state'],
  same_person: ['هي معاه بالفعل', 'They already have it'], bad_email: ['الإيميل مش صح', 'That email is not valid'], email_used: ['الإيميل ده مستخدم لحد تاني', 'That email belongs to someone else'],
  keep_owner: ['مينفعش تشيل صلاحية نفسك', 'You cannot remove your own owner role'], signed_out: ['سجل دخولك تاني', 'Please sign in again'],
  not_in_team: ['الإيميل ده مش متسجل في الفريق. كلم مسؤول الأداة.', 'This email is not on the team list. Ask the owner.'], code_expired: ['الكود انتهى، اطلب كود جديد', 'The code expired, ask for a new one'],
  wrong_code: ['الكود غلط', 'Wrong code'], too_many_tries: ['محاولات كتير، اطلب كود جديد', 'Too many tries, ask for a new code'], mail_quota: ['الإيميلات خلصت النهارده، جرب بعدين', 'The email limit is used up for today, try later'],
};
const errMsg = (c) => (ERR[c] ? L(ERR[c][0], ERR[c][1]) : L('حصل خطأ: ', 'Something went wrong: ') + c);

function toast(msg, bad) {
  const el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), bad ? 5000 : 2600);
}

// ---------- talking to the sheet ----------
async function server(action, body) {
  const r = await fetch(CFG.sheetUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, cache: 'no-store', body: JSON.stringify(Object.assign({ action, session: S.session }, body || {})) });
  return r.json();
}
function merge(res) {
  (res.tasks || []).forEach((t) => db.putTask(t));
  (res.notices || []).forEach((n) => db.putNotice(n));
  (res.checks || []).forEach((c) => db.putCheck(c));
  if (res.routines) { db.data.routines = {}; res.routines.forEach((r) => db.putRoutine(r)); }
  if (res.team) db.data.team = res.team;
  if (res.config) db.setConfig(res.config);
  if (res.now && !DEMO) clockOffset = res.now - Date.now();
}
const saveDemo = () => { if (DEMO) ls.set('tm_demo_v2', db.data); };
const CREATES = { taskNew: 1, noticeNew: 1, routineSave: 1, memberSave: 1, configSave: 1 };
async function act(action, body) {
  if (DEMO) {
    const res = core.run(me(), action, body);
    if (!res.ok) toast(errMsg(res.error), true); else { if (res.history) S.history = res.history; saveDemo(); }
    render(); return res;
  }
  if (!CREATES[action]) { // show it at once, then let the sheet confirm with its own clock
    const local = core.run(me(), action, body);
    if (!local.ok) { toast(errMsg(local.error), true); return local; }
    render();
  }
  S.busy++; paintBusy();
  try {
    const res = await server(action, body);
    if (!res.ok) { if (res.error === 'signed_out') return signOut(); toast(errMsg(res.error), true); await sync(true); return res; }
    merge(res); return res;
  } catch (e) {
    toast(L('النت واقع. التغيير ممكن ميكونش اتحفظ.', 'No connection. The change may not be saved.'), true); return { ok: false, error: 'net' };
  } finally { S.busy--; paintBusy(); render(); }
}
function pendingForMe() {
  const ids = [];
  db.tasks().forEach((t) => { if (t.to === S.me && !t.ackAt && TM.isOpen(t)) ids.push(t.id); });
  db.notices().forEach((n) => { if (n.to.indexOf(S.me) >= 0 && !n.acks[S.me]) ids.push(n.id); });
  return ids;
}
async function sync(full) {
  if (DEMO) { core.run(me(), 'sync', {}); S.day = env.day(env.now()); return; }
  const before = pendingForMe();
  const res = await server('sync', { since: full ? 0 : S.since });
  if (!res.ok) { if (res.error === 'signed_out') signOut(); return; }
  if (res.full) { db.data.tasks = {}; db.data.notices = {}; db.data.checks = {}; }
  merge(res);
  S.me = res.me; S.day = res.day; S.since = res.now - 5000; S.ready = true;
  const fresh = pendingForMe().filter((x) => before.indexOf(x) < 0);
  if (fresh.length && !full) ping(fresh);
}
function ping(ids) {
  const first = db.task(ids[0]) || db.notice(ids[0]);
  const text = (first.title || first.subject) + (ids.length > 1 ? ' +' + (ids.length - 1) : '');
  toast(L('جديد محتاج تأكيدك: ', 'New, needs your confirmation: ') + text);
  try {
    if (window.Notification && Notification.permission === 'granted') new Notification(L('تمام: محتاج تأكيدك', 'Tamam: needs your confirmation'), { body: text });
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}
function signOut() { S.session = ''; S.me = ''; S.ready = false; ls.del('tm_session'); render(); }
function paintBusy() { const b = $('#busy'); if (b) b.hidden = !S.busy; }

// ---------- demo data (made-up people, so the tool can be tried before the sheet is connected) ----------
function seedDemo() {
  const d = db.data, now = Date.now(), today = env.day(now);
  const P = (name, ar, role, group) => ({ name, ar, email: name.toLowerCase().replace(/ /g, '.') + '@example.com', role, group, active: true });
  d.team = [
    P('Omar Sami', 'عمر سامي', 'owner', 'Management'), P('Karim Adel', 'كريم عادل', 'lead', 'Team Leaders'), P('Rana Khaled', 'رنا خالد', 'lead', 'Operations'),
    P('Dina Magdy', 'دينا مجدي', 'lead', 'Quality'), P('Tamer Nabil', 'تامر نبيل', 'member', 'RTM'),
    P('Farida Samir', 'فريدة سمير', 'member', 'Agents'), P('Laila Hany', 'ليلى هاني', 'member', 'Agents'), P('Mariam Fouad', 'مريم فؤاد', 'member', 'Agents'),
    P('Habiba Tarek', 'حبيبة طارق', 'member', 'Agents'), P('Jana Sherif', 'جنى شريف', 'member', 'Agents'), P('Malak Wael', 'ملك وائل', 'member', 'Agents'),
  ];
  d.config = {}; d.tasks = {}; d.notices = {}; d.routines = {}; d.checks = {}; d.seq = 1040;
  const ago = (m) => now - m * MIN;
  const R = (id, title, time, groups, days) => { d.routines[id] = { id, title, details: '', time, days: days || [0, 1, 2, 3, 4, 5, 6], people: [], groups, active: true, by: 'Omar Sami', created: now - 20 * DAY, fromDay: env.day(now - 20 * DAY), updated: now - 20 * DAY }; };
  R('R-1', 'تسجيل الدخول على Avaya و Odoo وتجربة السماعة', '10:05', ['Agents']);
  R('R-2', 'قراءة تحديثات العروض في بوصلة', '10:15', ['Agents', 'Team Leaders']);
  R('R-3', 'مراجعة مكالمات المتابعة المطلوبة النهارده', '10:30', ['Agents']);
  R('R-4', 'قفل كل الليدز المفتوحة في Odoo قبل نهاية الشيفت', '17:45', ['Agents']);
  R('R-5', 'إرسال تقرير نهاية اليوم للتيم ليدر', '18:00', ['Agents']);
  R('R-6', 'مراجعة الحضور والـ AUX أول الشيفت', '10:10', ['Team Leaders', 'RTM']);
  R('R-7', 'تقييم 4 مكالمات على السكوركارد', '16:00', ['Team Leaders', 'Quality']);
  R('R-8', 'إرسال تقرير الأداء اليومي للعميل', '18:15', ['Operations', 'Management']);
  R('R-9', 'تحديث الـ Intraday كل ساعة', '17:00', ['RTM']);
  // routine history: the last 7 days, with a few misses so the overview has something to show
  let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let k = 6; k >= 0; k--) {
    const day = env.day(now - k * DAY), base = wallToMs(day + 'T00:00');
    d.team.forEach((m, mi) => {
      const items = {};
      TM.routinesFor(m, day, Object.values(d.routines)).forEach((r) => {
        const due = base + Number(r.time.slice(0, 2)) * HOUR + Number(r.time.slice(3)) * MIN;
        if (k === 0 && due > now + 20 * MIN) return;
        const x = rnd(), weak = mi === 8 || mi === 5;
        if (x < (weak ? 0.3 : 0.08)) return;
        const late = x > (weak ? 0.7 : 0.9);
        const at = Math.min(now - MIN, due + (late ? 25 : -6) * MIN + Math.round(rnd() * 5) * MIN);
        items[r.id] = { st: 'done', at, note: '' }; if (late) items[r.id].late = true;
      });
      d.checks[day + '|' + m.name] = { day, name: m.name, items, off: false, updated: now };
    });
  }
  const T = (o) => {
    const t = Object.assign({ id: 'T-' + (++d.seq), details: '', cat: 'Operations', pri: 'normal', due: 0, est: 0, status: 'todo', needReview: false, seenAt: 0, ackAt: 0, startedAt: 0, doneAt: 0, work: 0, runSince: 0, waitMs: 0, waitSince: 0, waitOn: '', subs: [], log: [] }, o);
    t.ppl = [t.by, t.to]; t.log.unshift({ at: t.created, by: t.by, a: 'create', d: { to: t.to } });
    t.updated = t.log[t.log.length - 1].at; d.tasks[t.id] = t; return t;
  };
  const dueAt = (hm, plus) => wallToMs(env.day(now + (plus || 0) * DAY) + 'T' + hm);
  T({ title: 'حل شكوى عميلة فرع أبوظبي عن ميعاد جلسة الليزر', by: 'Karim Adel', to: 'Farida Samir', cat: 'Client', pri: 'urgent', due: ago(-70), est: 40, created: ago(95), seenAt: ago(93), ackAt: ago(92), startedAt: ago(60), status: 'doing', runSince: ago(22), work: 14 * MIN,
    subs: [{ id: 's1', t: 'الاتصال بالعميلة والاعتذار', done: true, at: ago(50), by: 'Farida Samir' }, { id: 's2', t: 'تأكيد الميعاد الجديد مع الفرع', done: false }, { id: 's3', t: 'تسجيل الشكوى في Odoo', done: false }],
    log: [{ at: ago(93), by: 'Farida Samir', a: 'seen' }, { at: ago(92), by: 'Farida Samir', a: 'ack' }, { at: ago(60), by: 'Farida Samir', a: 'start' }, { at: ago(46), by: 'Farida Samir', a: 'pause', d: { note: 'مكالمة واردة' } }, { at: ago(22), by: 'Farida Samir', a: 'resume' }] });
  T({ title: 'تحديث أسعار عروض نوفمبر في شيت المتابعة', by: 'Omar Sami', to: 'Rana Khaled', cat: 'Reports', pri: 'high', due: ago(130), est: 60, created: ago(26 * 60), seenAt: ago(25 * 60), ackAt: ago(25 * 60), startedAt: ago(5 * 60), status: 'waiting', waitSince: ago(200), waitOn: 'العميل', work: 55 * MIN, waitMs: 0,
    log: [{ at: ago(25 * 60), by: 'Rana Khaled', a: 'ack' }, { at: ago(5 * 60), by: 'Rana Khaled', a: 'start' }, { at: ago(200), by: 'Rana Khaled', a: 'wait', d: { on: 'العميل', note: 'مستنية تأكيد سعر جلسة الهيدرافيشل من العميل' } }] });
  T({ title: 'مراجعة 5 مكالمات لملك قبل جلسة الكوتشينج', by: 'Dina Magdy', to: 'Karim Adel', cat: 'Quality', pri: 'normal', due: dueAt('16:00'), est: 50, created: ago(180), seenAt: ago(170), log: [{ at: ago(170), by: 'Karim Adel', a: 'seen' }] });
  T({ title: 'تجهيز تقرير الغياب والتأخير الأسبوعي', by: 'Omar Sami', to: 'Tamer Nabil', cat: 'Reports', pri: 'normal', due: dueAt('17:00'), est: 45, created: ago(240), seenAt: ago(238), ackAt: ago(236), startedAt: ago(120), status: 'doing', work: 35 * MIN, needReview: true,
    log: [{ at: ago(236), by: 'Tamer Nabil', a: 'ack' }, { at: ago(120), by: 'Tamer Nabil', a: 'start' }, { at: ago(85), by: 'Tamer Nabil', a: 'pause' }] });
  T({ title: 'الاتصال بـ 6 عملاء لم يحضروا الاستشارة المجانية', by: 'Karim Adel', to: 'Laila Hany', cat: 'Client', pri: 'high', due: dueAt('15:30'), est: 30, created: ago(48), log: [] });
  T({ title: 'إرسال قائمة أرقام الواتساب المتوقفة لـ IT', by: 'Rana Khaled', to: 'Omar Sami', cat: 'System / IT', pri: 'high', due: dueAt('14:00'), est: 15, created: ago(75), log: [] });
  T({ title: 'تحديث سكريبت الترحيب بعد تغيير اسم المركز', by: 'Omar Sami', to: 'Dina Magdy', cat: 'Quality', pri: 'normal', due: dueAt('12:00', 1), est: 90, created: ago(300), seenAt: ago(290), ackAt: ago(290), log: [{ at: ago(290), by: 'Dina Magdy', a: 'ack' }] });
  T({ title: 'مراجعة جدول الشيفتات للأسبوع الجاي', by: 'Omar Sami', to: 'Omar Sami', cat: 'Admin', pri: 'normal', due: dueAt('18:00'), est: 30, created: ago(400), seenAt: ago(400), ackAt: ago(400) });
  T({ title: 'تصحيح 3 ليدز متسجلة بمرحلة غلط في Odoo', by: 'Dina Magdy', to: 'Habiba Tarek', cat: 'Quality', pri: 'normal', due: ago(300), est: 20, created: ago(28 * 60), seenAt: ago(27 * 60), log: [{ at: ago(27 * 60), by: 'Habiba Tarek', a: 'seen' }] });
  T({ title: 'تقرير أداء أكتوبر للعميل', by: 'Omar Sami', to: 'Rana Khaled', cat: 'Reports', pri: 'high', due: ago(20 * 60), est: 120, created: ago(3 * 1440), seenAt: ago(3 * 1440 - 20), ackAt: ago(3 * 1440 - 20), startedAt: ago(2 * 1440), status: 'review', doneAt: ago(21 * 60), work: 150 * MIN, needReview: true,
    log: [{ at: ago(3 * 1440 - 20), by: 'Rana Khaled', a: 'ack' }, { at: ago(2 * 1440), by: 'Rana Khaled', a: 'start' }, { at: ago(21 * 60), by: 'Rana Khaled', a: 'done', d: { note: 'التقرير على الدرايف' } }] });
  [['Farida Samir', 'Client', 25, 22, false], ['Laila Hany', 'Client', 30, 48, true], ['Mariam Fouad', 'Operations', 20, 18, false], ['Jana Sherif', 'Training', 45, 40, false], ['Karim Adel', 'Quality', 60, 85, true], ['Malak Wael', 'Operations', 15, 12, false], ['Tamer Nabil', 'Reports', 40, 38, false], ['Habiba Tarek', 'Client', 30, 65, true]]
    .forEach((x, i) => {
      const titles = ['متابعة حجز عميلة بوتوكس', 'الرد على استفسارات واتساب المتأخرة', 'تحديث بيانات 10 ليدز', 'حضور جلسة منتج الليزر الجديدة', 'كاليبريشن مكالمتين مع الكواليتي', 'تجربة خط الواتساب الجديد', 'تقرير الـ Intraday لأمس', 'الاتصال بعملاء عرض الهيدرافيشل'];
      const c = ago((i % 5 + 1) * 1440 + 200), s = c + (12 + i * 9) * MIN, e = s + (x[3] + 15) * MIN, due = c + 4 * HOUR;
      T({ title: titles[i], by: i % 2 ? 'Karim Adel' : 'Omar Sami', to: x[0], cat: x[1], est: x[2], due: x[4] ? e - 40 * MIN : due, created: c, seenAt: s - 5 * MIN, ackAt: s - 4 * MIN, startedAt: s, doneAt: e, status: 'done', work: x[3] * MIN,
        log: [{ at: s - 4 * MIN, by: x[0], a: 'ack' }, { at: s, by: x[0], a: 'start' }, { at: e, by: x[0], a: 'done', d: x[4] ? { late: true } : undefined }] });
    });
  const N = (o) => { const n = Object.assign({ id: 'N-' + (++d.seq), details: '', channel: 'verbal', acks: {}, seen: {} }, o); n.saidAt = n.saidAt || n.at; n.updated = n.at; d.notices[n.id] = n; };
  N({ at: ago(35), by: 'Karim Adel', to: ['Omar Sami'], subject: 'خط الواتساب بتاع فرع الفجيرة واقع من 12:40', details: 'بلغت IT بالتليفون وهيردوا خلال ساعة.', channel: 'call' });
  N({ at: ago(140), by: 'Omar Sami', to: ['Karim Adel', 'Rana Khaled'], subject: 'العميل طلب إيقاف عرض المساج اللمفاوي من بكرة', channel: 'meeting', acks: { 'Karim Adel': { at: ago(128), note: 'تمام هبلغ الإيجنتس' } }, seen: { 'Karim Adel': ago(130) } });
  N({ at: ago(190), by: 'Dina Magdy', to: ['Farida Samir', 'Laila Hany', 'Mariam Fouad', 'Habiba Tarek', 'Jana Sherif', 'Malak Wael'], subject: 'لازم نقول اسم المركز كامل "مركز H&P الطبي" في الترحيب', channel: 'whatsapp',
    acks: { 'Farida Samir': { at: ago(185), note: '' }, 'Laila Hany': { at: ago(180), note: '' }, 'Mariam Fouad': { at: ago(160), note: '' }, 'Jana Sherif': { at: ago(60), note: '' } } });
  N({ at: ago(26 * 60), by: 'Omar Sami', to: ['Tamer Nabil'], subject: 'طلب بريك إضافي لازم يتوافق عليه من التيم ليدر قبل ما الإيجنت يسيب الفلور', channel: 'verbal', acks: { 'Tamer Nabil': { at: ago(26 * 60 - 12), note: '' } } });
  N({ at: ago(55), by: 'Rana Khaled', to: ['Omar Sami'], subject: 'تقرير أكتوبر جاهز ومحتاج اعتمادك قبل ما يتبعت', channel: 'whatsapp' });
  void today;
}
function loadDemo() {
  const saved = ls.get('tm_demo_v2', null);
  if (saved && saved.team && saved.team.length) { db = TM.memdb(saved); core = TM.make(db, env); }
  else { db = TM.memdb(); core = TM.make(db, env); seedDemo(); saveDemo(); }
  if (!person(S.demoAs)) S.demoAs = db.team()[0].name;
  S.me = S.demoAs; S.ready = true; S.day = env.day(env.now());
}

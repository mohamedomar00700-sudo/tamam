// Tamam, extras: quick add in plain words, the command palette, the league, the week calendar and celebrations.
Object.assign(IC, {
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3',
  flame: 'M12 22c4 0 7-2.7 7-6.6 0-3.7-2.6-6.3-4.3-8.4-.4 2.2-1.6 3.6-3 4.2.3-3.3-1.2-6.4-4-9.2C7.5 6 5 9 5 15.4 5 19.3 8 22 12 22z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z', enter: 'M9 10l-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
});
const nk = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').trim();

// ---------- quick add: "كلم عملاء العرض @كريم بكرة 3م !عاجل 30د #Client" ----------
const DAYW = [[['الاحد', 'الحد', 'sun', 'sunday'], 0], [['الاتنين', 'الاثنين', 'mon', 'monday'], 1], [['التلات', 'الثلاثاء', 'التلاتاء', 'tue', 'tuesday'], 2], [['الاربع', 'الاربعاء', 'wed', 'wednesday'], 3], [['الخميس', 'thu', 'thursday'], 4], [['الجمعه', 'fri', 'friday'], 5], [['السبت', 'sat', 'saturday'], 6]];
function matchPerson(w1, w2) {
  const a = nk(w1), b = w2 ? nk(w2) : '', team = db.team().filter((m) => m.active);
  const keys = (m) => { const e = nk(m.name).split(/\s+/), r = nk(m.ar).split(/\s+/).filter(Boolean); return { one: [e[0], r[0]].filter(Boolean), two: [e.slice(0, 2).join(' '), r.slice(0, 2).join(' ')].filter((x) => x.indexOf(' ') > 0) }; };
  if (b) { const hit = team.filter((m) => keys(m).two.indexOf(a + ' ' + b) >= 0); if (hit.length === 1) return { m: hit[0], used: 2 }; }
  let hit = team.filter((m) => keys(m).one.indexOf(a) >= 0);
  if (!hit.length && a.length >= 3) hit = team.filter((m) => keys(m).one.some((k) => k.indexOf(a) === 0) || nk(m.name).replace(/\s/g, '').indexOf(a) === 0);
  if (hit.length > 1 && b) { const narrow = hit.filter((m) => keys(m).two.some((k) => k.split(' ')[1] && k.split(' ')[1].indexOf(b) === 0)); if (narrow.length === 1) return { m: narrow[0], used: 2 }; }
  return hit.length === 1 ? { m: hit[0], used: 1 } : null;
}
function parseQuick(raw) {
  let s = ' ' + String(raw || '').replace(/\s+/g, ' ') + ' ';
  const o = { to: [], pri: '', cat: '', est: 0, due: 0, unknown: [] }, E = '(?=\\s)';
  const take = (re, fn) => { s = s.replace(re, function () { const r = fn.apply(null, arguments); return r === false ? arguments[0] : ' ' + (typeof r === 'string' ? r : '') + ' '; }); };
  take(/@([^\s@]+)(?:\s+([^\s@!#]+))?/g, (m, w1, w2) => { const p = matchPerson(w1, w2); if (!p) { o.unknown.push('@' + w1); return false; } if (o.to.indexOf(p.m.name) < 0) o.to.push(p.m.name); return p.used === 1 && w2 ? w2 : ''; });
  take(new RegExp('\\s(!!|!عاجل|!urgent)' + E, 'gi'), () => { o.pri = 'urgent'; });
  take(new RegExp('\\s(!مهم|!high|!)' + E, 'gi'), () => { if (!o.pri) o.pri = 'high'; });
  take(new RegExp('\\s(!low|!على_مهلك|!عادي)' + E, 'gi'), () => { if (!o.pri) o.pri = 'low'; });
  take(/\s#([^\s#]+)/g, (m, w) => { const c = core.cfg().cats.find((x) => nk(x).replace(/[\s/]/g, '').indexOf(nk(w)) === 0); if (!c) return false; o.cat = c; });
  let off = null, hm = null, rel = 0;
  take(new RegExp('\\s(بعد بكر[ةه])' + E, 'g'), () => { off = 2; });
  take(new RegExp('\\s(النهارد[ةه]|اليوم|today)' + E, 'gi'), () => { off = 0; });
  take(new RegExp('\\s(بكر[ةه]|غدا|tomorrow)' + E, 'gi'), () => { off = 1; });
  take(new RegExp('\\s(?:يوم\\s+)?([^\\s]+)' + E, 'g'), (m, w) => {
    const k = nk(w), d = DAYW.find((x) => x[0].indexOf(k) >= 0); if (!d) return false;
    off = (d[1] - TM.weekday(env.day(now())) + 7) % 7;
  });
  take(new RegExp('\\s(?:بعد|in)\\s+(نص ساع[ةه]|ساع[ةه]|ساعتين|(\\d+)\\s*(ساعات|ساع[ةه]|س|h|hours?|دقيق[ةه]|دقايق|د|m|mins?|minutes?))' + E, 'gi'), (m, w, n, u) => {
    if (/نص/.test(w)) rel = 30; else if (/ساعتين/.test(w)) rel = 120; else if (!n) rel = 60; else rel = Number(n) * (/^(س|h|hour|ساع)/i.test(u) ? 60 : 1);
  });
  take(new RegExp('\\s(آخر الشيفت|اخر الشيفت|آخر اليوم|اخر اليوم|eod)' + E, 'gi'), () => { hm = [18, 0]; });
  const hour = (h, mm, suf) => {
    h = Number(h); mm = Number(mm || 0); if (h > 23 || mm > 59) return false;
    if (/^(م|pm|مساء|مساءً|العصر|بالليل)$/i.test(suf || '')) { if (h < 12) h += 12; } else if (/^(ظ|الضهر|الظهر)$/.test(suf || '')) { if (h < 6) h += 12; }
    else if (/^(ص|am|الصبح)$/i.test(suf || '')) { if (h === 12) h = 0; } else if (h >= 1 && h <= 7) h += 12;
    hm = [h, mm];
  };
  take(new RegExp('\\s(?:الساع[ةه]\\s*|at\\s*)?(\\d{1,2})(?::(\\d{2}))?\\s*(م|ص|pm|am|مساءً?|الصبح|العصر|بالليل|ظ|الضهر|الظهر)' + E, 'gi'), (m, h, mm, suf) => hour(h, mm, suf));
  take(new RegExp('\\s(?:الساع[ةه]|at)\\s*(\\d{1,2})(?::(\\d{2}))?' + E, 'gi'), (m, h, mm) => hour(h, mm, ''));
  take(new RegExp('\\s(\\d{1,2}):(\\d{2})' + E, 'g'), (m, h, mm) => hour(h, mm, ''));
  take(new RegExp('\\s(\\d+(?:[.,]\\d+)?)\\s*(س|ساع[ةه]|ساعات|h|hrs?)' + E, 'gi'), (m, n) => { o.est = Math.round(Number(n.replace(',', '.')) * 60); });
  take(new RegExp('\\s(\\d+)\\s*(د|دقيق[ةه]|دقايق|m|mins?)' + E, 'gi'), (m, n) => { o.est = Number(n); });
  if (rel) o.due = Math.round((now() + rel * MIN) / MIN) * MIN;
  else if (off != null || hm) {
    const t = hm || [18, 0], at = (d) => wallToMs(env.day(now() + d * DAY) + 'T' + String(t[0]).padStart(2, '0') + ':' + String(t[1]).padStart(2, '0'));
    o.due = at(off || 0); if (off == null && o.due < now()) o.due = at(1);
  }
  o.title = s.replace(/\s+/g, ' ').trim();
  return o;
}
function quickBar() {
  return '<div class="qa card"><div class="qa-row">' + ic('plus') + '<input id="qa" class="qa-in" autocomplete="off" placeholder="' + esc(L('اكتب تاسك وادوس Enter… مثال: كلم عملاء الهيدرافيشل @ليلى بكرة 3م !مهم 30د', 'Type a task and press Enter… e.g. Call the HydraFacial leads @Laila tomorrow 3pm !high 30m')) + '">' +
    '<button class="btn sm ghost" data-a="qaMore" title="' + L('افتح كل التفاصيل', 'Open all fields') + '">' + L('تفاصيل', 'More') + '</button></div><div class="qa-prev" id="qa-prev"><span class="qa-hint">' +
    L('<b>@</b> مين · <b>بكرة 3م</b> إمتى · <b>!</b> مهم · <b>!!</b> عاجل · <b>30د</b> الوقت · <b>#</b> النوع', '<b>@</b> who · <b>tomorrow 3pm</b> when · <b>!</b> high · <b>!!</b> urgent · <b>30m</b> time · <b>#</b> type') + '</span></div></div>';
}
function qaPreview() {
  const el = $('#qa'), box = $('#qa-prev'); if (!el || !box) return;
  if (!el.value.trim()) { box.innerHTML = quickBar().split('id="qa-prev">')[1].replace(/<\/div><\/div>$/, ''); return; }
  const o = parseQuick(el.value), chip = (h, cls) => '<span class="pill ' + (cls || '') + '">' + h + '</span>';
  box.innerHTML = '<span class="qa-t">' + esc(o.title || L('(اكتب العنوان)', '(write the title)')) + '</span>' +
    (o.to.length ? o.to.map((p) => '<span class="pill">' + av(p).replace('class="av ', 'class="av xs ') + esc(short(p)) + '</span>').join('') : chip(L('ليك إنت', 'for you'))) +
    (o.due ? chip(ic('clock') + esc(fmtDue(o.due)), 'todo') : '') + (o.pri ? chip(lbl(PR, o.pri), o.pri === 'urgent' ? 'bad' : o.pri === 'low' ? '' : 'warn') : '') +
    (o.est ? chip(fmtDur(o.est * MIN)) : '') + (o.cat ? chip(esc(o.cat)) : '') + o.unknown.map((u) => chip(esc(u) + L(' مش معروف', ' not found'), 'bad')).join('') +
    '<span class="qa-enter">' + ic('enter') + 'Enter</span>';
}
async function qaSubmit(open) {
  const el = $('#qa'); if (!el) return;
  const o = parseQuick(el.value), b = { title: o.title, to: o.to.length ? o.to : [S.me], due: o.due, pri: o.pri || 'normal', est: o.est, cat: o.cat };
  if (open) return openModal({ type: 'task', prefill: Object.assign({ details: '', needReview: false }, b) });
  if (!b.title) return toast(errMsg('need_title'), true);
  el.value = ''; qaPreview();
  const res = await act('taskNew', b);
  if (res.ok) toast(L('اتسجلت ', 'Added ') + (res.tasks || []).map((t) => t.id).join('، ') + (b.to[0] !== S.me || b.to.length > 1 ? L(' واتبعتت', ' and sent') : ''));
}

// ---------- command palette (Ctrl+K or /) ----------
function palItems(q) {
  const k = nk(q), hit = (s) => !k || nk(s).indexOf(k) >= 0, out = [];
  if (!k || hit(L('تاسك جديدة', 'New task')) || hit('new')) out.push({ i: 'plus', l: L('تاسك جديدة', 'New task'), run: () => openModal({ type: 'task' }) });
  if (!k || hit(L('سجّل إني بلّغت', 'Log that I told someone')) || hit('بلغت')) out.push({ i: 'told', l: L('سجّل إني بلّغت حد', 'Log that I told someone'), run: () => DO.go({ dataset: { v: 'told' } }) });
  NAVS.filter((x) => navOk(x[0])).forEach((x) => { if (hit(navLabel(x[0])) || hit(x[0])) out.push({ i: x[2], l: L('افتح ', 'Go to ') + navLabel(x[0]), run: () => DO.go({ dataset: { v: x[0] } }) }); });
  if (k) {
    db.tasks().filter((t) => hit(t.id + ' ' + t.title + ' ' + t.details)).sort((a, b) => TM.isOpen(b) - TM.isOpen(a) || b.updated - a.updated).slice(0, 8)
      .forEach((t) => out.push({ i: 'tasks', l: t.title, s: t.id + ' · ' + short(t.to) + ' · ' + lbl(ST, t.status), run: () => DO.open({ dataset: { id: t.id } }) }));
    db.notices().filter((n) => hit(n.id + ' ' + n.subject)).sort((a, b) => b.at - a.at).slice(0, 4)
      .forEach((n) => out.push({ i: 'told', l: n.subject, s: n.id + ' · ' + short(n.by) + ' · ' + fmtStamp(n.at), run: () => DO.goNotice({ dataset: { id: n.id } }) }));
    if (lead()) db.team().filter((m) => m.active && (hit(m.name) || hit(m.ar))).slice(0, 4)
      .forEach((m) => out.push({ i: 'tasks', l: L('تاسكات ', 'Tasks of ') + pname(m.name), s: m.group, run: () => { S.view = 'tasks'; S.f.scope = 'all'; S.f.person = m.name; render({ fresh: true }); } }));
  }
  return out.slice(0, 14);
}
function palFill() {
  const q = $('#pal-q'), list = $('#pal-list'); if (!q || !list) return;
  S.pal = palItems(q.value); S.palSel = Math.min(S.palSel || 0, Math.max(0, S.pal.length - 1));
  list.innerHTML = S.pal.length ? S.pal.map((x, i) => '<button class="pal-i ' + (i === S.palSel ? 'on' : '') + '" data-a="palRun" data-i="' + i + '">' + ic(x.i) + '<span class="grow"><b>' + esc(x.l) + '</b>' + (x.s ? '<small>' + esc(x.s) + '</small>' : '') + '</span></button>').join('') : '<div class="empty">' + L('مفيش نتايج', 'No results') + '</div>';
  const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
const EXTRA_MODALS = {
  palette: () => '<div class="modal pal"><div class="pal-top">' + ic('search') + '<input id="pal-q" autocomplete="off" placeholder="' + L('دوّر على تاسك، تبليغ، شخص أو صفحة', 'Search tasks, notices, people or pages') + '"><kbd>Esc</kbd></div><div id="pal-list"></div></div>',
};
function openPalette() { S.palSel = 0; openModal({ type: 'palette' }); palFill(); }

// ---------- the league ----------
const BADGE = {
  fast: ['bolt', ['سريع الرد', 'Quick to confirm'], ['أكد استلام 3 حاجات أو أكتر في متوسط 10 دقايق', 'Confirmed 3+ things in 10 minutes on average']],
  ontime: ['clock', ['ملك المواعيد', 'Always on time'], ['5 تاسكات أو أكتر في ميعادها ومفيش ولا واحدة متأخرة', '5+ tasks on time and none late']],
  routine: ['routine', ['الروتين كامل', 'Full routine'], ['كمّل روتينه كامل كل يوم الأسبوع ده', 'Finished the whole routine every day this week']],
  streak: ['flame', ['سلسلة 5 أيام', '5-day streak'], ['5 أيام ورا بعض روتين كامل', '5 days in a row with the full routine']],
  clean: ['star', ['من أول مرة', 'Right first time'], ['تاسكتين أو أكتر اتعتمدوا من غير ما يرجعوا', '2+ tasks approved without being sent back']],
};
const WHY = { ack: ['تأكيد استلام سريع', 'Quick confirmations'], done: ['تاسكات خلّصها', 'Tasks finished'], ontime: ['في الميعاد', 'On time'], clean: ['اتعتمدت من أول مرة', 'Approved first time'], rtOn: ['روتين في ميعاده', 'Routine on time'], rtLate: ['روتين بعد الميعاد', 'Routine, late'], rtFull: ['يوم روتين كامل', 'Full routine day'], told: ['تأكيد تبليغ سريع', 'Quick notice confirmations'] };
const leagueOn = () => core.cfg().gamify !== false;
const navOk = (k) => (k !== 'overview' || lead()) && (k !== 'league' || leagueOn() || lead());
async function loadLeague(force) {
  if (!S.ready || !me() || (!leagueOn() && !lead())) return;
  if (!force && S.leagueAt && Date.now() - S.leagueAt < 60000) return;
  S.leagueAt = Date.now();
  if (DEMO) { const r = core.run(me(), 'league', {}); if (r.ok) S.league = r.league; return; }
  try { const r = await server('league', {}); if (r.ok) { S.league = r.league; render({ soft: true }); } } catch (e) { S.leagueAt = 0; }
}
const badgeHtml = (b, big) => '<span class="badge b-' + b + (big ? ' big' : '') + '" title="' + esc(L(BADGE[b][2][0], BADGE[b][2][1])) + '">' + ic(BADGE[b][0]) + (big ? '<span>' + L(BADGE[b][1][0], BADGE[b][1][1]) + '</span>' : '') + '</span>';
function myLeague() {
  const lg = S.league; if (!lg) return null;
  const mine = lg.rows.find((r) => r.name === S.me); if (!mine) return null;
  const grp = lg.rows.filter((r) => r.group === mine.group).sort((a, b) => b.pts - a.pts);
  return { lg, mine, rank: mine.rank || grp.indexOf(mine) + 1, of: grp.length };
}
function leagueStrip() {
  if (!leagueOn()) return '';
  loadLeague(); const x = myLeague(); if (!x) return '';
  return '<button class="strip" data-a="go" data-v="league"><span class="strip-i fl">' + ic('flame') + '<b class="mono">' + x.mine.streak + '</b><small>' + L('أيام ورا بعض', 'day streak') + '</small></span>' +
    '<span class="strip-i">' + ic('star') + '<b class="mono">' + x.mine.pts + '</b><small>' + L('نقطة الأسبوع ده', 'points this week') + '</small></span>' +
    '<span class="strip-i">' + ic('trophy') + '<b class="mono">#' + x.rank + '</b><small>' + L('في ', 'in ') + esc(x.mine.group || '') + '</small></span>' +
    (x.mine.badges.length ? '<span class="strip-b">' + x.mine.badges.map((b) => badgeHtml(b)).join('') + '</span>' : '') + '</button>';
}
function pageLeague() {
  if (!leagueOn() && !lead()) return emptyBox(L('الدوري مش شغال', 'The league is off'));
  loadLeague(); const lg = S.league;
  if (!lg) return emptyBox(L('بحمّل الدوري…', 'Loading the league…'));
  let h = '';
  if (!lg.on) h += '<div class="demo-bar">' + L('الدوري واقف للفريق، إنت شايفه عشان إنت ليدر. شغّله من الإعدادات.', 'The league is off for the team; you see it because you are a lead. Turn it on in Setup.') + '</div>';
  const wk = fmtDate(wallToMs(lg.week.from + 'T12:00')) + ' – ' + fmtDate(wallToMs(TM.addDays(lg.week.to, -1) + 'T12:00'));
  const x = myLeague();
  if (x) {
    const why = x.mine.why || {}, maxW = Math.max(1, ...Object.values(why)), delta = x.mine.pts - x.mine.lastPts;
    h += '<div class="lg-hero"><div class="lg-num"><small>' + L('نقطك الأسبوع ده', 'Your points this week') + ' · ' + wk + '</small><b class="mono">' + x.mine.pts + '</b><span class="pill ' + (delta >= 0 ? 'doing' : 'warn') + '">' + (delta >= 0 ? '+' : '') + delta + L(' عن الأسبوع اللي فات', ' vs last week') + '</span></div>' +
      '<div class="lg-side"><div class="lg-kpi">' + ic('trophy') + '<b class="mono">#' + x.rank + '</b><small>' + L('من ', 'of ') + x.of + L(' في ', ' in ') + esc(x.mine.group || '') + '</small></div>' +
      '<div class="lg-kpi fl">' + ic('flame') + '<b class="mono">' + x.mine.streak + '</b><small>' + L('أيام روتين كامل ورا بعض', 'days of full routine in a row') + '</small></div></div>' +
      '<div class="lg-badges">' + (x.mine.badges.length ? x.mine.badges.map((b) => badgeHtml(b, true)).join('') : '<small>' + L('لسه مفيش بادجات الأسبوع ده. بص تحت إزاي تاخدها.', 'No badges yet this week. See below how to earn them.') + '</small>') + '</div>' +
      (Object.keys(why).length ? '<div class="lg-why">' + Object.keys(why).sort((a, b) => why[b] - why[a]).map((k) => '<div><span>' + L(WHY[k][0], WHY[k][1]) + '</span><div class="hbar grow"><i style="width:' + (why[k] / maxW) * 100 + '%"></i></div><b class="mono ltr">+' + why[k] + '</b></div>').join('') + '</div>' : '') + '</div>';
  }
  const t = lg.team, gp = t.onTime == null ? 0 : Math.min(100, (t.onTime / t.goal) * 100);
  h += '<div class="card sec goal"><div class="sec-h"><h2>' + L('هدف الفريق كله', 'The whole team’s goal') + '</h2><span class="end mono">' + (t.onTime == null ? '—' : t.onTime + '%') + ' / ' + t.goal + '%</span></div>' +
    '<div class="goal-bar"><i style="width:' + gp + '%"></i><span style="inset-inline-start:100%"></span></div><small style="color:var(--ink2)">' + L('نسبة التاسكات اللي خلصت في ميعادها الأسبوع ده. ', 'Share of tasks finished on time this week. ') + t.done + L(' تاسك خلصت · ', ' done · ') + t.pts + L(' نقطة للفريق', ' team points') + '</small></div>';
  const groups = Array.from(new Set(lg.rows.map((r) => r.group || '—')));
  const mineG = x ? x.mine.group || '—' : groups[0];
  if (S.lgFor !== S.me) { S.lgFor = S.me; S.lgGroup = ''; }
  if (!S.lgGroup || (S.lgGroup !== '*' && groups.indexOf(S.lgGroup) < 0)) S.lgGroup = mineG;
  const rows = lg.rows.filter((r) => S.lgGroup === '*' || (r.group || '—') === S.lgGroup).sort((a, b) => b.pts - a.pts || b.streak - a.streak);
  const maxP = Math.max(1, ...rows.map((r) => r.pts));
  h += '<section class="sec"><div class="sec-h"><h2>' + L('الترتيب', 'Standings') + '</h2><span class="c">' + L('بيبدأ من الأول كل أسبوع', 'resets every week') + '</span></div>' +
    (lg.mode === 'top' && !lead() ? '' : '<div class="seg" style="margin-bottom:10px">' + groups.map((g) => '<button class="' + (S.lgGroup === g ? 'on' : '') + '" data-a="lgGroup" data-v="' + esc(g) + '">' + esc(g) + '</button>').join('') + (lead() ? '<button class="' + (S.lgGroup === '*' ? 'on' : '') + '" data-a="lgGroup" data-v="*">' + L('الكل', 'All') + '</button>' : '') + '</div>') +
    '<div class="card lg-list">' + (rows.map((r, i) => {
      const rank = r.rank || i + 1, medal = rank <= 3 && r.pts > 0 ? ' m' + rank : '', d = r.pts - (r.lastPts || 0);
      return '<div class="lg-row' + (r.name === S.me ? ' me' : '') + '"><span class="rk' + medal + '">' + rank + '</span>' + av(r.name) + '<div class="grow lg-n"><b>' + esc(pname(r.name)) + '</b><div class="hbar"><i style="width:' + (r.pts / maxP) * 100 + '%"></i></div></div>' +
        '<span class="lg-bd">' + (r.badges || []).map((b) => badgeHtml(b)).join('') + '</span>' + (r.streak ? '<span class="lg-st">' + ic('flame') + r.streak + '</span>' : '') +
        '<span class="lg-p"><b class="mono">' + r.pts + '</b><small class="mono" style="color:' + (d >= 0 ? 'var(--ok)' : 'var(--ink3)') + '">' + (d >= 0 ? '▲' : '▼') + Math.abs(d) + '</small></span></div>';
    }).join('') || emptyBox(L('مفيش حد هنا', 'Nobody here'))) + '</div></section>';
  const ch = Object.keys(lg.champs || {});
  if (ch.length) h += section(L('أبطال الأسبوع اللي فات', 'Last week’s champions'), null, '<div class="champs">' + ch.map((g) => '<div class="champ">' + ic('trophy') + av(lg.champs[g].name, 'lg') + '<div><b>' + esc(pname(lg.champs[g].name)) + '</b><small>' + esc(g) + ' · <span class="mono">' + lg.champs[g].pts + '</span>' + L(' نقطة', ' pts') + '</small></div></div>').join('') + '</div>');
  const P = lg.pts || TM.PTS;
  h += '<details class="card sec how"><summary><b>' + L('النقط بتتحسب إزاي؟', 'How are points worked out?') + '</b></summary><div class="two" style="margin-top:12px"><div><table class="tbl"><tbody>' +
    [['ack', P.ack, L('أكدت استلام تاسك في وقت التذكير', 'Confirmed a task before the reminder time')], ['done', P.done, L('خلّصت تاسك حد اداهالك', 'Finished a task someone gave you')], ['ontime', P.ontime, L('وكمان في ميعادها', 'and it was on time')], ['clean', P.clean, L('اتعتمدت من غير ما ترجع', 'approved without being sent back')], ['rtOn', P.rtOn, L('بند روتين قبل ميعاده', 'A routine item before its time')], ['rtLate', P.rtLate, L('بند روتين بعد ميعاده', 'A routine item after its time')], ['rtFull', P.rtFull, L('يوم روتين كامل', 'The whole routine of the day')], ['told', P.told, L('أكدت استلام تبليغ بسرعة', 'Confirmed a notice quickly')]]
      .map((r) => '<tr><td>' + r[2] + '</td><td class="mono" style="text-align:end;color:var(--ok);font-weight:600">+' + r[1] + '</td></tr>').join('') + '</tbody></table></div>' +
    '<ul class="rules"><li>' + L('النقط بتتحسب من الأوقات اللي السيستم سجلها، محدش يقدر يزودها بالإيد.', 'Points come only from times the system stamped. Nobody can add them by hand.') + '</li><li>' + L('التاسكات اللي بتديها لنفسك مالهاش نقط، عشان محدش يكبّر رقمه.', 'Tasks you give yourself earn nothing, so nobody can pad their score.') + '</li><li>' + L('مفيش خصم نقط. التأخير بس بيضيّع عليك النقطة.', 'Points are never taken away. Being late only means missing them.') + '</li><li>' + L('الترتيب جوه مجموعتك وبيبدأ من الأول كل أسبوع، عشان أي حد يقدر يكسب.', 'You are ranked inside your group and it resets weekly, so anyone can win.') + '</li><li>' + L('الإجازة والأيام اللي مفيهاش روتين مبتقطعش السلسلة.', 'Days off and days without a routine never break a streak.') + '</li></ul></div>' +
    '<div class="lg-badges" style="margin-top:12px">' + Object.keys(BADGE).map((b) => badgeHtml(b, true) + '<small style="color:var(--ink3);margin-inline-end:10px">' + L(BADGE[b][2][0], BADGE[b][2][1]) + '</small>').join('') + '</div></details>';
  return h;
}

// ---------- week calendar ----------
function calView(all) {
  const today = env.day(now()), wk = TM.weekOf(TM.addDays(today, (S.calOff || 0) * 7), core.cfg().weekStart);
  const days = []; for (let i = 0; i < 7; i++) days.push(TM.addDays(wk.from, i));
  const noDue = all.filter((t) => TM.isOpen(t) && !t.due).length;
  let h = '<div class="bar-row"><button class="btn sm" data-a="calMove" data-v="-1">' + L('الأسبوع اللي فات', 'Previous week') + '</button><button class="btn sm" data-a="calMove" data-v="0">' + L('الأسبوع ده', 'This week') + '</button><button class="btn sm" data-a="calMove" data-v="1">' + L('الأسبوع الجاي', 'Next week') + '</button>' +
    (noDue ? '<small style="color:var(--ink3)">' + noDue + L(' تاسك مفتوحة من غير ميعاد مش ظاهرة هنا', ' open tasks without a due time are not shown') + '</small>' : '') + '</div><div class="cal">';
  days.forEach((d) => {
    const items = all.filter((t) => t.due && env.day(t.due) === d && t.status !== 'cancelled').sort((a, b) => a.due - b.due);
    const ms = wallToMs(d + 'T12:00');
    h += '<div class="cal-d' + (d === today ? ' today' : '') + (d < today ? ' past' : '') + '"><div class="cal-h"><b>' + esc(new Intl.DateTimeFormat(loc(), { timeZone: TZ, weekday: 'short' }).format(ms)) + '</b><span class="mono">' + esc(fmtDate(ms)) + '</span>' + (items.length ? '<span class="c">' + items.length + '</span>' : '') + '</div>' +
      (items.map((t) => '<button class="calt p-' + t.pri + (TM.isOpen(t) ? '' : ' closed') + (TM.overdue(t, now()) ? ' late' : '') + '" data-a="open" data-id="' + t.id + '"><span class="mono">' + esc(fmtClock(t.due)) + '</span><b>' + esc(t.title) + '</b><span class="calt-m">' + av(t.to).replace('class="av ', 'class="av xs ') + '<span class="pill ' + t.status + '">' + lbl(ST, t.status) + '</span></span></button>').join('') || '<span class="cal-e">—</span>') + '</div>';
  });
  return h + '</div>';
}

// ---------- celebrations ----------
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'), x = c.getContext('2d'), W = (c.width = innerWidth), H = (c.height = innerHeight);
  c.className = 'confetti'; document.body.appendChild(c);
  const cs = getComputedStyle(document.documentElement), cols = ['--accent', '--ok', '--warn', '--wait', '--bad'].map((v) => cs.getPropertyValue(v).trim());
  const ps = Array.from({ length: 110 }, (_, i) => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.72, vx: (Math.random() - 0.5) * 13, vy: -9 - Math.random() * 10, r: 4 + Math.random() * 5, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], s: Math.random() < 0.5 }));
  const t0 = performance.now();
  (function step(t) {
    const k = (t - t0) / 1600; x.clearRect(0, 0, W, H);
    ps.forEach((p) => { p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.globalAlpha = Math.max(0, 1 - k); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; if (p.s) x.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25); else { x.beginPath(); x.arc(0, 0, p.r / 1.6, 0, 7); x.fill(); } x.restore(); });
    if (k < 1) requestAnimationFrame(step); else c.remove();
  })(t0);
}
function celebrate(msg, pts) {
  confetti();
  const el = document.createElement('div'); el.className = 'celebrate';
  el.innerHTML = ic('check') + '<span>' + esc(msg) + '</span>' + (pts && leagueOn() ? '<b class="mono ltr">+' + pts + '</b>' : '');
  document.body.appendChild(el); setTimeout(() => el.remove(), 2400);
}
const routineFull = () => { const r = myRoutine(); return r.list.length > 0 && r.list.every((x) => r.doc.items[x.id]); };

const EXTRA_DO = {
  palette: openPalette,
  palRun(el) { const it = S.pal[Number(el.dataset.i)]; closeModal(); if (it) it.run(); },
  qaMore() { qaSubmit(true); },
  lgGroup(el) { S.lgGroup = el.dataset.v; render(); },
  calMove(el) { const v = Number(el.dataset.v); S.calOff = v ? (S.calOff || 0) + v : 0; render(); },
  async check(el) {
    const was = routineFull(), turnOn = !el.dataset.on;
    const res = await act('check', { rid: el.dataset.rid, st: turnOn ? 'done' : '' });
    S.leagueAt = 0;
    if (res && res.ok && turnOn && !was && routineFull()) celebrate(L('روتين النهارده كامل!', 'Today’s routine is complete!'), TM.PTS.rtFull);
  },
};
function onDone(t) {
  S.leagueAt = 0;
  const given = t.by !== S.me, pts = given ? TM.PTS.done + (t.due && now() <= t.due ? TM.PTS.ontime : 0) : 0;
  celebrate((t.needReview && given ? L('اتبعتت للاعتماد', 'Sent for approval') : L('خلصت', 'Done')) + ' · ' + fmtClock(now()), pts);
}
document.addEventListener('input', (ev) => { if (ev.target.id === 'qa') qaPreview(); if (ev.target.id === 'pal-q') { S.palSel = 0; palFill(); } });
document.addEventListener('keydown', (ev) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test((ev.target && ev.target.tagName) || '');
  if ((ev.key === 'k' || ev.key === 'K') && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); if (S.ready && me()) openPalette(); return; }
  if (ev.key === '/' && !typing && S.ready && me() && !S.modal) { ev.preventDefault(); openPalette(); return; }
  if (ev.target.id === 'qa' && ev.key === 'Enter') { ev.preventDefault(); qaSubmit(ev.shiftKey); return; }
  if (S.modal && S.modal.type === 'palette' && S.pal) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); S.palSel = (S.palSel + (ev.key === 'ArrowDown' ? 1 : -1) + S.pal.length) % Math.max(1, S.pal.length); palFill(); }
    if (ev.key === 'Enter') { ev.preventDefault(); const it = S.pal[S.palSel]; closeModal(); if (it) it.run(); }
  }
});

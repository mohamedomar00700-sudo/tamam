// Tamam, part 2: the pages.
const ST = { todo: ['جديدة', 'To do'], doing: ['شغّال', 'In progress'], waiting: ['مستني', 'Waiting'], review: ['مستني اعتماد', 'In review'], done: ['خلصت', 'Done'], cancelled: ['اتلغت', 'Cancelled'] };
const PR = { urgent: ['عاجل', 'Urgent'], high: ['مهم', 'High'], normal: ['عادي', 'Normal'], low: ['على مهلك', 'Low'] };
const CH = { verbal: ['وش لوش', 'In person'], whatsapp: ['واتساب', 'WhatsApp'], call: ['مكالمة', 'Call'], email: ['إيميل', 'Email'], meeting: ['اجتماع', 'Meeting'] };
const ROLE = { owner: ['مسؤول الأداة', 'Owner'], lead: ['ليدر', 'Lead'], member: ['عضو', 'Member'] };
const lbl = (map, k) => (map[k] ? L(map[k][0], map[k][1]) : k);
const PW = { urgent: 0, high: 1, normal: 2, low: 3 };
const WD = [['ح', 'Su'], ['ن', 'Mo'], ['ث', 'Tu'], ['ر', 'We'], ['خ', 'Th'], ['ج', 'Fr'], ['س', 'Sa']];

const now = () => env.now();
const workMs = (t) => (t.work || 0) + (t.runSince ? Math.max(0, now() - t.runSince) : 0);
const sortTasks = (a) => a.sort((x, y) => (TM.overdue(y, now()) - TM.overdue(x, now())) || (PW[x.pri] - PW[y.pri]) || ((x.due || 9e15) - (y.due || 9e15)) || (x.created - y.created));
const live = (t) => '<span class="mono" data-run="' + t.runSince + '" data-base="' + (t.work || 0) + '">' + fmtLive(workMs(t)) + '</span>';

function primaryAct(t) {
  const mine = t.to === S.me;
  if (t.status === 'review') return (t.by === S.me || lead()) ? { a: 'approve', l: L('اعتمد', 'Approve'), c: 'ok', i: 'check' } : null;
  if (!TM.isOpen(t) || !mine) return null;
  if (!t.ackAt) return { a: 'ack', l: L('استلمت', 'Got it'), c: 'pri', i: 'check' };
  if (t.runSince) return { a: 'done', l: L('خلصت', 'Done'), c: 'ok', i: 'check' };
  return { a: 'start', l: t.startedAt ? L('كمّل', 'Resume') : L('ابدأ', 'Start'), c: 'pri', i: 'play' };
}
function taskPills(t) {
  const n = now(); let h = '';
  if (t.runSince) h += '<span class="pill doing live">' + live(t) + '</span>';
  else h += '<span class="pill ' + t.status + '">' + lbl(ST, t.status) + (t.status === 'waiting' && t.waitOn ? ': ' + esc(t.waitOn) : '') + '</span>';
  if (TM.overdue(t, n)) h += '<span class="pill bad">' + L('متأخر ', 'Late ') + fmtDur(n - t.due) + '</span>';
  if (!t.ackAt && TM.isOpen(t)) h += '<span class="pill warn">' + L('لسه ماستلمش · ', 'Not confirmed · ') + fmtDur(n - t.created) + '</span>';
  if (t.pri === 'urgent' || t.pri === 'high') h += '<span class="pill ' + (t.pri === 'urgent' ? 'bad' : 'warn') + '">' + lbl(PR, t.pri) + '</span>';
  if (t.timeFlag) h += '<span class="pill warn">' + L('التايمر اتنسى شغال', 'Timer was left running') + '</span>';
  if (t.returns) h += '<span class="pill warn">' + L('رجعت ', 'Returned ') + t.returns + '×</span>';
  return h;
}
function taskCard(t) {
  const p = primaryAct(t), w = workMs(t), subs = t.subs || [], closed = !TM.isOpen(t);
  let meta = '<span class="m">' + av(t.to) + esc(short(t.to)) + '</span>';
  if (t.by !== t.to) meta += '<span class="m">' + L('من ', 'from ') + esc(short(t.by)) + '</span>';
  if (t.due) meta += '<span class="m ' + (TM.overdue(t, now()) ? 'late' : '') + '">' + ic('clock').replace('<svg', '<svg width="14" height="14"') + esc(fmtDue(t.due)) + '</span>';
  if (w || t.est) meta += '<span class="m mono">' + (w ? fmtDur(w) : '0') + (t.est ? ' / ' + fmtDur(t.est * MIN) : '') + '</span>';
  if (subs.length) meta += '<span class="m mono">☑ ' + subs.filter((s) => s.done).length + '/' + subs.length + '</span>';
  return '<article class="tcard p-' + t.pri + (closed ? ' closed' : '') + '" data-a="open" data-id="' + t.id + '" tabindex="0">' +
    '<div class="tc-top"><span class="tid">' + t.id + '</span>' + taskPills(t) + (t.cat ? '<span class="pill">' + esc(t.cat) + '</span>' : '') + '</div>' +
    '<h4>' + esc(t.title) + '</h4><div class="tc-meta">' + meta + '</div>' +
    (p ? '<div class="tc-act"><button class="btn sm ' + p.c + '" data-a="tact" data-act="' + p.a + '" data-id="' + t.id + '">' + ic(p.i) + p.l + '</button>' +
      (t.runSince && t.to === S.me ? '<button class="btn sm" data-a="tact" data-act="pause" data-id="' + t.id + '" title="' + L('وقّف مؤقتاً', 'Pause') + '">' + ic('pause') + '</button>' : '') + '</div>' : '') +
    '</article>';
}
const section = (title, count, body, end) => '<section class="sec"><div class="sec-h"><h2>' + title + '</h2>' + (count != null ? '<span class="c">' + count + '</span>' : '') + (end ? '<span class="end">' + end + '</span>' : '') + '</div>' + body + '</section>';
const emptyBox = (t) => '<div class="empty">' + t + '</div>';

// ---------- notices ----------
function noticeCard(n) {
  const mine = n.to.indexOf(S.me) >= 0, need = mine && !n.acks[S.me];
  const acks = n.to.map((p) => {
    const a = n.acks[p];
    return '<span class="ackchip ' + (a ? 'yes' : '') + '">' + av(p) + esc(short(p)) + ' · ' + (a ? L('استلم ', 'confirmed ') + '<span class="mono">' + esc(fmtStamp(a.at)) + '</span>' : (n.seen[p] ? L('شافها ولسه مأكدش', 'seen, not confirmed') : L('لسه', 'pending'))) + (a && a.note ? ' · “' + esc(a.note) + '”' : '') + '</span>';
  }).join('');
  return '<article class="ncard ' + (need ? 'need' : '') + '" data-nid="' + n.id + '">' +
    '<div class="n-head">' + stamp(n.at) + '<span class="tid">' + n.id + '</span>' + av(n.by) + '<b>' + esc(short(n.by)) + '</b>' + L('بلّغ', 'told') + ' <span class="pill">' + lbl(CH, n.channel) + '</span>' +
    (n.saidAt && n.at - n.saidAt > 2 * MIN ? '<span class="pill warn">' + L('حصل ', 'happened ') + esc(fmtStamp(n.saidAt)) + L(' واتسجل بعدها', ', logged later') + '</span>' : '') + '</div>' +
    '<h4>' + esc(n.subject) + '</h4>' + (n.details ? '<p>' + esc(n.details) + '</p>' : '') +
    '<div class="n-acks">' + acks + '</div>' +
    '<div class="tc-act">' + (need ? '<button class="btn sm pri" data-a="nack" data-id="' + n.id + '">' + ic('check') + L('استلمت', 'Got it') + '</button><button class="btn sm" data-a="nackNote" data-id="' + n.id + '">' + L('استلمت + رد', 'Got it + reply') + '</button>' : '') +
    (n.taskId ? '<button class="btn sm ghost" data-a="open" data-id="' + n.taskId + '">' + n.taskId + '</button>' : '<button class="btn sm ghost" data-a="newTask" data-notice="' + n.id + '">' + ic('plus') + L('حوّلها لتاسك', 'Make it a task') + '</button>') + '</div>' +
    '</article>';
}
function peoplePicker(id, multi, picked, skipMe) {
  const groups = {};
  db.team().filter((m) => m.active && !(skipMe && m.name === S.me)).forEach((m) => { (groups[m.group || '—'] = groups[m.group || '—'] || []).push(m); });
  return '<div class="people chipset" id="' + id + '" data-multi="' + (multi ? 1 : '') + '">' + Object.keys(groups).map((g) =>
    '<div class="pg"><h6>' + esc(g) + '</h6>' + groups[g].map((m) => '<button type="button" class="chip ' + ((picked || []).indexOf(m.name) >= 0 ? 'on' : '') + '" data-a="chip" data-v="' + esc(m.name) + '">' + av(m.name) + esc(short(m.name)) + '</button>').join('') +
    (multi && groups[g].length > 1 ? '<button type="button" class="btn sm ghost" data-a="pickGroup">' + L('الكل', 'all') + '</button>' : '') + '</div>').join('') + '</div>';
}
const chipset = (id, opts, picked, multi) => '<div class="chips chipset" id="' + id + '" data-multi="' + (multi ? 1 : '') + '">' + opts.map((o) => '<button type="button" class="chip ' + ([].concat(picked).indexOf(o[0]) >= 0 ? 'on' : '') + '" data-a="chip" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>').join('') + '</div>';
const picked = (id) => Array.from(document.querySelectorAll('#' + id + ' .chip.on')).map((c) => c.dataset.v);

// ---------- routine ----------
function myRoutine() {
  const m = me(); if (!m) return { list: [], doc: null };
  const doc = db.checks(S.day, S.day).find((c) => c.name === S.me) || { items: {}, off: false };
  return { list: TM.routinesFor(m, S.day, db.routines()), doc };
}
function routineCard() {
  const r = myRoutine(); if (!r.list.length) return '';
  const hm = env.hm(now()), done = r.list.filter((x) => r.doc.items[x.id]).length, pc = Math.round((done / r.list.length) * 100);
  const rows = r.list.map((x) => {
    const it = r.doc.items[x.id], missed = !it && x.time && hm > x.time;
    return '<div class="rt ' + (it ? it.st : missed ? 'missed' : '') + '"><button class="ck" data-a="check" data-rid="' + x.id + '" data-on="' + (it ? 1 : '') + '" aria-label="' + esc(x.title) + '">' + ic('check') + '</button>' +
      '<div class="tx"><b>' + esc(x.title) + '</b><small>' + (x.time ? L('قبل ', 'by ') + '<span class="mono">' + esc(fmtClock(wallToMs(S.day + 'T' + x.time))) + '</span>' : '') +
      (it ? ' · ' + (it.st === 'skip' ? L('اتخطت: ', 'skipped: ') + esc(it.note) : L('اتعملت ', 'done ')) + ' <span class="mono">' + esc(fmtClock(it.at)) + '</span>' + (it.late ? ' · <span style="color:var(--warn)">' + L('بعد الميعاد', 'late') + '</span>' : '') : missed ? ' · ' + L('فات ميعادها', 'past its time') : '') + '</small></div>' +
      (!it ? '<button class="btn sm ghost" data-a="skip" data-rid="' + x.id + '">' + L('مش هتتعمل', 'Skip') + '</button>' : '') + '</div>';
  }).join('');
  return section(L('روتين اليوم', "Today's routine"), done + '/' + r.list.length, '<div class="card"><div style="display:flex;gap:14px;align-items:center;margin-bottom:6px"><div class="ring" style="--p:' + pc + '"><i>' + pc + '%</i></div><div class="grow"><b>' +
    (pc === 100 ? L('تمام، خلصت روتين النهارده', 'All done for today') : L('باقي ', '') + (r.list.length - done) + L(' حاجات', ' left')) + '</b><br><small style="color:var(--ink3)">' + L('كل علامة بتتسجل بوقتها ومحدش يقدر يغيّر الوقت', 'Each tick is stamped with its time and nobody can change it') + '</small></div></div>' + rows + '</div>');
}

// ---------- pages ----------
function pageToday() {
  const n = now(), mine = db.tasks().filter((t) => t.to === S.me && TM.isOpen(t) && t.status !== 'review');
  const needT = mine.filter((t) => !t.ackAt), needN = db.notices().filter((x) => x.to.indexOf(S.me) >= 0 && !x.acks[S.me]);
  const late = mine.filter((t) => TM.overdue(t, n)), todayT = mine.filter((t) => t.due && !TM.overdue(t, n) && env.day(t.due) === S.day);
  const rest = mine.filter((t) => t.ackAt && late.indexOf(t) < 0 && todayT.indexOf(t) < 0);
  const review = db.tasks().filter((t) => t.status === 'review' && (t.by === S.me));
  const givenT = db.tasks().filter((t) => t.by === S.me && t.to !== S.me && TM.isOpen(t) && !t.ackAt);
  const givenN = db.notices().filter((x) => x.by === S.me && x.to.some((p) => !x.acks[p]));
  let h = quickBar() + leagueStrip() + '<div class="stats">' +
    '<div class="stat ' + (needT.length + needN.length ? 'warn' : '') + '"><b>' + (needT.length + needN.length) + '</b><span>' + L('محتاج تأكيد استلامك', 'Need your confirmation') + '</span></div>' +
    '<div class="stat ' + (late.length ? 'bad' : '') + '"><b>' + late.length + '</b><span>' + L('متأخر عليك', 'Late') + '</span></div>' +
    '<div class="stat"><b>' + todayT.length + '</b><span>' + L('مطلوب النهارده', 'Due today') + '</span></div>' +
    '<div class="stat"><b>' + (givenT.length + givenN.length) + '</b><span>' + L('مستني رد من غيرك', 'Waiting on others') + '</span></div></div>';
  if (needT.length + needN.length) h += section(L('محتاج تأكيد استلامك', 'Need your confirmation'), needT.length + needN.length, '<div class="list">' + needN.map(noticeCard).join('') + sortTasks(needT).map(taskCard).join('') + '</div>');
  if (review.length) h += section(L('مستني اعتمادك', 'Waiting for your approval'), review.length, '<div class="list">' + review.map(taskCard).join('') + '</div>');
  h += routineCard();
  const acked = (a) => a.filter((t) => t.ackAt);
  if (acked(late).length) h += section(L('متأخر', 'Late'), acked(late).length, '<div class="list">' + sortTasks(acked(late)).map(taskCard).join('') + '</div>');
  h += section(L('مطلوب النهارده', 'Due today'), acked(todayT).length, acked(todayT).length ? '<div class="list">' + sortTasks(acked(todayT)).map(taskCard).join('') + '</div>' : emptyBox(L('مفيش حاجة مطلوبة النهارده. دوس "تاسك جديدة" لو عايز تضيف.', 'Nothing due today. Use "New task" to add one.')));
  if (rest.length) h += section(L('بعدين أو من غير ميعاد', 'Later or no date'), rest.length, '<div class="list">' + sortTasks(rest).map(taskCard).join('') + '</div>');
  if (givenT.length + givenN.length) h += section(L('اديتها ولسه محدش أكد استلامها', 'Given, not confirmed yet'), givenT.length + givenN.length, '<div class="list">' + givenT.map(taskCard).join('') + givenN.map(noticeCard).join('') + '</div>');
  return h;
}

function pageTasks() {
  const f = S.f, q = f.q.trim().toLowerCase();
  let all = db.tasks();
  const counts = { mine: all.filter((t) => t.to === S.me && TM.isOpen(t)).length, given: all.filter((t) => t.by === S.me && t.to !== S.me && TM.isOpen(t)).length, all: all.filter(TM.isOpen).length };
  if (f.scope === 'mine') all = all.filter((t) => t.to === S.me);
  else if (f.scope === 'given') all = all.filter((t) => t.by === S.me && t.to !== S.me);
  else if (f.person) all = all.filter((t) => t.to === f.person);
  if (q) all = all.filter((t) => (t.id + ' ' + t.title + ' ' + t.details + ' ' + t.cat + ' ' + pname(t.to) + ' ' + t.to).toLowerCase().indexOf(q) >= 0);
  const seg = [['mine', L('بتاعتي', 'Mine')], ['given', L('أنا اللي مديها', 'I gave')]].concat(lead() ? [['all', L('كل الفريق', 'Whole team')]] : []);
  let h = quickBar() + '<div class="bar-row"><div class="seg">' + seg.map((s) => '<button class="' + (f.scope === s[0] ? 'on' : '') + '" data-a="setf" data-k="scope" data-v="' + s[0] + '">' + s[1] + '<span class="c">' + counts[s[0]] + '</span></button>').join('') + '</div>' +
    '<input class="field search grow" id="tq" type="search" placeholder="' + L('دوّر برقم أو عنوان أو اسم', 'Search number, title or name') + '" value="' + esc(f.q) + '" data-input="q">' +
    (f.scope === 'all' ? '<select class="field" id="tperson" style="width:auto" data-change="person"><option value="">' + L('كل الناس', 'Everyone') + '</option>' + db.team().filter((m) => m.active).map((m) => '<option ' + (f.person === m.name ? 'selected' : '') + ' value="' + esc(m.name) + '">' + esc(pname(m.name)) + '</option>').join('') + '</select>' : '') +
    '<div class="seg"><button class="' + (f.layout === 'board' ? 'on' : '') + '" data-a="setf" data-k="layout" data-v="board">' + L('أعمدة', 'Board') + '</button><button class="' + (f.layout === 'list' ? 'on' : '') + '" data-a="setf" data-k="layout" data-v="list">' + L('قايمة', 'List') + '</button><button class="' + (f.layout === 'cal' ? 'on' : '') + '" data-a="setf" data-k="layout" data-v="cal">' + L('تقويم', 'Calendar') + '</button></div></div>';
  const recent = now() - 7 * DAY;
  if (f.layout === 'cal') h += calView(all);
  else if (f.layout === 'board') {
    h += '<div class="board">' + ['todo', 'doing', 'waiting', 'review', 'done'].map((st) => {
      let col = all.filter((t) => t.status === st && (st !== 'done' || t.doneAt > recent));
      col = st === 'done' ? col.sort((a, b) => b.doneAt - a.doneAt).slice(0, 12) : sortTasks(col);
      return '<div class="col"><div class="col-h"><span class="pill ' + st + '">' + lbl(ST, st) + '</span>' + (st === 'done' ? '<small style="color:var(--ink3);font-weight:400">' + L('آخر 7 أيام', 'last 7 days') + '</small>' : '') + '<span class="c">' + col.length + '</span></div><div class="list">' + (col.map(taskCard).join('') || '<div class="empty" style="padding:10px;font-size:12.5px">—</div>') + '</div></div>';
    }).join('') + '</div>';
  } else {
    const open = sortTasks(all.filter(TM.isOpen)), closed = all.filter((t) => !TM.isOpen(t)).sort((a, b) => b.updated - a.updated);
    h += '<div class="list">' + (open.map(taskCard).join('') || emptyBox(L('مفيش تاسكات مفتوحة هنا', 'No open tasks here'))) + '</div>';
    h += '<div style="margin:16px 0 10px"><button class="btn sm ghost" data-a="setf" data-k="showDone" data-v="' + (f.showDone ? '' : 1) + '">' + (f.showDone ? L('اخفي المقفول', 'Hide closed') : L('اعرض المقفول', 'Show closed') + ' (' + closed.length + ')') + '</button></div>';
    if (f.showDone) h += '<div class="list">' + closed.slice(0, 80).map(taskCard).join('') + '</div>';
  }
  return h;
}

function pageNotices() {
  const f = S.f, q = f.nq.trim().toLowerCase();
  let all = db.notices().sort((a, b) => b.at - a.at);
  const cIn = all.filter((n) => n.to.indexOf(S.me) >= 0 && !n.acks[S.me]).length;
  if (f.nscope === 'in') all = all.filter((n) => n.to.indexOf(S.me) >= 0);
  else if (f.nscope === 'out') all = all.filter((n) => n.by === S.me);
  if (q) all = all.filter((n) => (n.id + ' ' + n.subject + ' ' + n.details + ' ' + n.by + ' ' + pname(n.by) + ' ' + n.to.join(' ') + ' ' + n.to.map(pname).join(' ')).toLowerCase().indexOf(q) >= 0);
  const seg = [['in', L('اتبلغت بيها', 'Told to me')], ['out', L('أنا اللي بلّغت', 'I told')]].concat(lead() ? [['all', L('كل الفريق', 'Whole team')]] : []);
  return '<form class="composer" data-form="notice"><h3>' + L('بلّغت مين بإيه؟ سجلها دلوقتي والوقت يتسجل لوحده', 'Who did you tell, and what? Log it now and the time is stamped for you') + '</h3>' +
    '<div class="fgrp"><label class="lb" for="n-subject">' + L('بلّغت بإيه', 'What you told them') + '</label><input class="field" id="n-subject" maxlength="300" placeholder="' + L('مثال: خط الواتساب واقع من 12:40', 'e.g. The WhatsApp line is down since 12:40') + '"></div>' +
    '<div class="fgrp"><label class="lb">' + L('بلّغت مين', 'Who you told') + '</label>' + peoplePicker('n-to', true, [], true) + '</div>' +
    '<div class="frow"><div class="fgrp"><label class="lb">' + L('عن طريق', 'How') + '</label>' + chipset('n-ch', Object.keys(CH).map((k) => [k, lbl(CH, k)]), 'verbal') + '</div>' +
    '<div class="fgrp"><label class="lb" for="n-when">' + L('حصل إمتى (سيبها فاضية لو دلوقتي)', 'When it happened (leave empty for now)') + '</label><input class="field" id="n-when" type="datetime-local" max="' + msToWall(now()) + '"></div></div>' +
    '<div class="fgrp"><label class="lb" for="n-details">' + L('تفاصيل (اختياري)', 'Details (optional)') + '</label><textarea class="field" id="n-details" maxlength="3000" style="min-height:52px"></textarea></div>' +
    '<button class="btn pri" type="submit">' + ic('told') + L('سجّل إني بلّغت', 'Log it') + '</button></form>' +
    '<div class="bar-row"><div class="seg">' + seg.map((s) => '<button class="' + (f.nscope === s[0] ? 'on' : '') + '" data-a="setf" data-k="nscope" data-v="' + s[0] + '">' + s[1] + (s[0] === 'in' && cIn ? '<span class="c">' + cIn + '</span>' : '') + '</button>').join('') + '</div>' +
    '<input class="field search grow" id="nq" type="search" placeholder="' + L('دوّر: بلغت مين بإيه وإمتى', 'Search: who was told what, and when') + '" value="' + esc(f.nq) + '" data-input="nq"></div>' +
    '<div class="list">' + (all.slice(0, 120).map(noticeCard).join('') || emptyBox(L('مفيش حاجة هنا لسه. أول ما تبلّغ حد بحاجة سجلها من فوق.', 'Nothing here yet. Log the next thing you tell someone above.'))) + '</div>';
}

function dotsFor(m, day, doc) {
  const hm = env.hm(now()), list = TM.routinesFor(m, day, db.routines()), items = (doc && doc.items) || {};
  let done = 0;
  const dots = list.map((r) => {
    const it = items[r.id]; if (it) done++;
    const cls = it ? (it.st === 'skip' ? 'skip' : it.late ? 'late' : 'done') : (day < S.day || (r.time && hm > r.time)) ? 'missed' : '';
    return '<span class="dot ' + cls + '" title="' + esc(r.title + (it ? ' · ' + fmtClock(it.at) + (it.note ? ' · ' + it.note : '') : '')) + '">' + (it ? (it.st === 'skip' ? '–' : '✓') : cls ? '!' : '') + '</span>';
  }).join('');
  return { n: list.length, done, dots };
}
function pageRoutines() {
  let h = routineCard() || (lead() ? '' : emptyBox(L('مفيش روتين يومي متحدد ليك لسه', 'No daily routine has been set for you yet')));
  if (!lead()) return h;
  const docs = db.checks(S.day, S.day);
  const rows = db.team().filter((m) => m.active).map((m) => {
    const doc = docs.find((c) => c.name === m.name), d = dotsFor(m, S.day, doc);
    if (!d.n) return '';
    return '<div class="prow"><div class="nm">' + av(m.name) + '<span>' + esc(pname(m.name)) + '</span></div><div class="mono">' + (doc && doc.off ? L('إجازة', 'off') : d.done + '/' + d.n) + '</div><div class="dots">' + d.dots + '</div></div>';
  }).join('');
  h += section(L('الفريق النهارده', 'The team today'), null, '<div class="card">' + (rows || emptyBox(L('ضيف أول بند روتين من تحت', 'Add the first routine item below'))) +
    '<div class="legend" style="margin-top:12px"><span><i style="background:var(--ok)"></i>' + L('في ميعادها', 'on time') + '</span><span><i style="background:var(--warn)"></i>' + L('بعد الميعاد', 'late') + '</span><span><i style="background:var(--bad)"></i>' + L('فاتت', 'missed') + '</span><span><i style="background:var(--idle)"></i>' + L('اتخطت بسبب', 'skipped with a reason') + '</span></div></div>');
  const list = db.routines().sort((a, b) => (b.active - a.active) || ((a.time || '99') < (b.time || '99') ? -1 : 1));
  h += section(L('بنود الروتين', 'Routine items'), list.filter((r) => r.active).length, '<div class="card">' + list.map((r) =>
    '<div class="rt" style="' + (r.active ? '' : 'opacity:.5') + '"><span class="stamp">' + (r.time ? esc(fmtClock(wallToMs(S.day + 'T' + r.time))) : '—') + '</span><div class="tx"><b>' + esc(r.title) + '</b><small>' +
    esc((r.groups || []).concat((r.people || []).map(short)).join('، ')) + ' · ' + ((r.days || []).length === 7 ? L('كل يوم', 'every day') : (r.days || []).map((d) => L(WD[d][0], WD[d][1])).join(' ')) + (r.active ? '' : ' · ' + L('واقف', 'stopped')) + '</small></div>' +
    '<button class="btn sm ghost" data-a="editRoutine" data-id="' + r.id + '">' + ic('edit') + '</button></div>').join('') + '</div>',
  '<button class="btn sm pri" data-a="editRoutine">' + ic('plus') + L('بند جديد', 'New item') + '</button>');
  return h;
}

function boardData() {
  const n = now(), from = n - S.f.range * DAY, all = db.tasks(), cfg = core.cfg();
  const doneIn = all.filter((t) => t.status === 'done' && t.doneAt >= from), withDue = doneIn.filter((t) => t.due);
  const open = all.filter(TM.isOpen), acked = all.filter((t) => t.ackAt >= from && t.by !== t.to && t.log.some((e) => e.a === 'ack'));
  const est = doneIn.filter((t) => t.est && t.work);
  const pendN = db.notices().filter((x) => x.to.some((p) => !x.acks[p]));
  return { n, from, all, cfg, doneIn, withDue, open, acked, est, pendN,
    onTime: withDue.length ? Math.round((withDue.filter((t) => t.doneAt <= t.due).length / withDue.length) * 100) : null,
    avgAck: acked.length ? acked.reduce((s, t) => s + (t.ackAt - t.created), 0) / acked.length : null,
    estRatio: est.length ? est.reduce((s, t) => s + t.work, 0) / est.reduce((s, t) => s + t.est * MIN, 0) : null };
}
function pageBoard() {
  if (!lead()) return emptyBox(L('الصفحة دي لليدرز بس', 'This page is for leads'));
  const b = boardData(), n = b.n, nudge = b.cfg.nudgeMin * MIN;
  loadHistory();
  const lateOpen = b.open.filter((t) => TM.overdue(t, n)), unack = b.open.filter((t) => !t.ackAt && n - t.created > nudge), waiting = b.open.filter((t) => t.status === 'waiting');
  let h = '<div class="bar-row"><div class="seg">' + [[1, L('النهارده', 'Today')], [7, L('7 أيام', '7 days')], [30, L('30 يوم', '30 days')]].map((r) => '<button class="' + (S.f.range === r[0] ? 'on' : '') + '" data-a="setf" data-k="range" data-v="' + r[0] + '">' + r[1] + '</button>').join('') + '</div><span class="grow"></span>' +
    '<button class="btn sm" data-a="excel">' + ic('down') + L('تحميل Excel', 'Download Excel') + '</button></div>';
  h += '<div class="stats">' +
    '<div class="stat ' + (lateOpen.length ? 'bad' : 'ok') + '"><b>' + lateOpen.length + '</b><span>' + L('متأخر دلوقتي', 'Late right now') + '</span><small>' + b.open.length + L(' مفتوحة', ' open') + '</small></div>' +
    '<div class="stat ' + (unack.length + b.pendN.length ? 'warn' : 'ok') + '"><b>' + (unack.length + b.pendN.length) + '</b><span>' + L('محدش أكد استلامه', 'Not confirmed') + '</span><small>' + unack.length + L(' تاسك · ', ' tasks · ') + b.pendN.length + L(' تبليغ', ' notices') + '</small></div>' +
    '<div class="stat"><b>' + b.doneIn.length + '</b><span>' + L('خلصت', 'Done') + '</span><small>' + (b.onTime == null ? '—' : b.onTime + '%' + L(' في الميعاد', ' on time')) + '</small></div>' +
    '<div class="stat"><b>' + (b.avgAck == null ? '—' : fmtDur(b.avgAck)) + '</b><span>' + L('متوسط وقت تأكيد الاستلام', 'Average time to confirm') + '</span></div>' +
    '<div class="stat ' + (b.estRatio > 1.25 ? 'warn' : '') + '"><b>' + (b.estRatio == null ? '—' : Math.round(b.estRatio * 100) + '%') + '</b><span>' + L('الوقت الفعلي من المتوقع', 'Actual vs expected time') + '</span></div></div>';
  // needs a lead to step in
  const attMap = {}, att = [];
  const add = (key, o) => { if (attMap[key]) { attMap[key].s += ' · ' + o.s; attMap[key].w = Math.max(attMap[key].w, o.w); if (o.k === 'bad') attMap[key].k = 'bad'; } else { attMap[key] = o; att.push(o); } };
  lateOpen.forEach((t) => add(t.id, { w: n - t.due, id: t.id, k: 'bad', t: t.title, s: short(t.to) + ' · ' + L('متأخرة ', 'late ') + fmtDur(n - t.due) }));
  unack.forEach((t) => add(t.id, { w: n - t.created, id: t.id, k: 'warn', t: t.title, s: (attMap[t.id] ? '' : short(t.to) + ' · ') + L('محدش استلمها من ', 'not confirmed for ') + fmtDur(n - t.created) }));
  waiting.forEach((t) => { const w = n - t.waitSince; if (w > 2 * HOUR) add(t.id, { w, id: t.id, k: 'wait', t: t.title, s: (attMap[t.id] ? '' : short(t.to) + ' · ') + L('مستنية ', 'waiting on ') + (t.waitOn || '') + L(' من ', ' for ') + fmtDur(w) }); });
  b.open.filter((t) => t.status === 'review').forEach((t) => add(t.id, { w: n - t.doneAt, id: t.id, k: 'warn', t: t.title, s: L('مستنية اعتماد ', 'waiting for approval from ') + short(t.by) + ' · ' + fmtDur(n - t.doneAt) }));
  b.pendN.forEach((x) => { const w = n - x.at; if (w > nudge) add(x.id, { w, nid: x.id, k: 'warn', t: x.subject, s: L('تبليغ من ', 'told by ') + short(x.by) + L(' ولسه مستني: ', ', still pending: ') + x.to.filter((p) => !x.acks[p]).map(short).join('، ') + ' · ' + fmtDur(w) }); });
  att.sort((a, c) => c.w - a.w);
  const attH = att.length ? att.slice(0, 14).map((a) => '<div class="att" data-a="' + (a.id ? 'open' : 'goNotice') + '" data-id="' + (a.id || a.nid) + '"><span class="pill ' + (a.k === 'wait' ? 'waiting' : a.k) + '">' + (a.id || a.nid) + '</span><div class="grow"><b>' + esc(a.t) + '</b><small>' + esc(a.s) + '</small></div></div>').join('') : emptyBox(L('مفيش حاجة واقعة دلوقتي', 'Nothing is slipping right now'));
  // people
  const days = []; for (let k = Math.min(S.f.range, 7) - 1; k >= 0; k--) days.push(env.day(n - k * DAY));
  const hist = S.history || [];
  const rows = db.team().filter((m) => m.active).map((m) => {
    const mineOpen = b.open.filter((t) => t.to === m.name), done = b.doneIn.filter((t) => t.to === m.name), wd = done.filter((t) => t.due);
    const work = b.all.filter((t) => t.to === m.name && (t.doneAt >= b.from || TM.isOpen(t))).reduce((s, t) => s + workMs(t), 0);
    const ack = b.acked.filter((t) => t.to === m.name && t.log.some((e) => e.a === 'ack' && e.by === m.name));
    let rn = 0, rd = 0;
    const heat = days.map((d) => { const x = dotsFor(m, d, hist.concat(db.checks(S.day, S.day)).find((c) => c.day === d && c.name === m.name)); rn += x.n; rd += x.done; const p = x.n ? x.done / x.n : -1; return '<i title="' + d + '" style="' + (p < 0 ? '' : 'background:' + (p >= 0.99 ? 'var(--ok)' : p >= 0.6 ? 'var(--warn)' : 'var(--bad)')) + '"></i>'; }).join('');
    return { name: m.name, open: mineOpen.length, late: mineOpen.filter((t) => TM.overdue(t, n)).length, done: done.length, onTime: wd.length ? Math.round((wd.filter((t) => t.doneAt <= t.due).length / wd.length) * 100) : null, work, ack: ack.length ? ack.reduce((s, t) => s + (t.ackAt - t.created), 0) / ack.length : null, rp: rn ? Math.round((rd / rn) * 100) : null, heat };
  });
  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  S.boardRows = rows;
  const table = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + L('الاسم', 'Name') + '</th><th>' + L('مفتوح', 'Open') + '</th><th>' + L('متأخر', 'Late') + '</th><th>' + L('خلّص', 'Done') + '</th><th>' + L('في الميعاد', 'On time') + '</th><th>' + L('وقت الشغل', 'Time worked') + '</th><th>' + L('بيأكد في', 'Confirms in') + '</th><th>' + L('الروتين', 'Routine') + '</th></tr></thead><tbody>' +
    rows.map((r) => '<tr><td><div class="nm">' + av(r.name) + esc(pname(r.name)) + '</div></td><td><div style="display:flex;gap:8px;align-items:center"><span class="mono">' + r.open + '</span><div class="hbar grow"><i style="width:' + (r.open / maxOpen) * 100 + '%"></i></div></div></td><td class="mono" style="' + (r.late ? 'color:var(--bad);font-weight:600' : '') + '">' + r.late + '</td><td class="mono">' + r.done + '</td><td class="mono">' + (r.onTime == null ? '—' : r.onTime + '%') + '</td><td class="mono">' + (r.work ? fmtDur(r.work) : '—') + '</td><td class="mono">' + (r.ack == null ? '—' : fmtDur(r.ack)) + '</td><td><span class="heat">' + r.heat + '</span> <span class="mono">' + (r.rp == null ? '' : r.rp + '%') + '</span></td></tr>').join('') + '</tbody></table></div>';
  // where the time went, by category
  const cats = {}; b.doneIn.forEach((t) => { const c = t.cat || '—'; cats[c] = cats[c] || { work: 0, est: 0, n: 0 }; cats[c].work += t.work || 0; cats[c].est += (t.est || 0) * MIN; cats[c].n++; });
  const maxC = Math.max(1, ...Object.values(cats).map((c) => Math.max(c.work, c.est)));
  const catH = Object.keys(cats).length ? Object.keys(cats).sort((a, c) => cats[c].work - cats[a].work).map((c) => '<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:13px;gap:8px"><b>' + esc(c) + ' <span class="mono" style="color:var(--ink3);font-weight:400">' + cats[c].n + '</span></b><span class="mono">' + fmtDur(cats[c].work) + (cats[c].est ? ' / ' + fmtDur(cats[c].est) : '') + '</span></div><div class="hbar" style="margin-top:4px"><i style="width:' + (cats[c].work / maxC) * 100 + '%;background:' + (cats[c].est && cats[c].work > cats[c].est * 1.25 ? 'var(--warn)' : 'var(--ok)') + '"></i></div></div>').join('') + '<small style="color:var(--ink3)">' + L('الوقت الفعلي / المتوقع للتاسكات اللي خلصت في الفترة', 'Actual / expected time of tasks done in the period') + '</small>' : emptyBox(L('لسه مفيش تاسكات خلصت في الفترة دي', 'No tasks were done in this period yet'));
  h += '<div class="two sec"><div class="card"><div class="sec-h"><h2>' + L('محتاج تدخل', 'Needs you to step in') + '</h2><span class="c">' + att.length + '</span></div>' + attH + '</div><div class="card"><div class="sec-h"><h2>' + L('الوقت راح فين', 'Where the time went') + '</h2></div>' + catH + '</div></div>';
  h += section(L('كل واحد عامل إيه', 'How each person is doing'), null, '<div class="card">' + table + '</div>');
  return h;
}
async function loadHistory() {
  const to = env.day(now() - DAY), from = env.day(now() - 7 * DAY), key = from + to + S.me;
  if (S.historyKey === key) return;
  S.historyKey = key;
  if (DEMO) { S.history = core.run(me(), 'history', { from, to }).history; return; }
  try { const r = await server('history', { from, to }); if (r.ok) { S.history = r.history; render({ soft: true }); } } catch (e) { S.historyKey = ''; }
}

function pageSetup() {
  const m = me(), cfg = core.cfg(), owner = m.role === 'owner';
  let h = '<div class="card sec"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' + av(m.name, 'lg') + '<div class="grow"><b>' + esc(pname(m.name)) + '</b><br><small style="color:var(--ink3)">' + lbl(ROLE, m.role) + (m.group ? ' · ' + esc(m.group) : '') + '</small></div>' +
    '<div class="seg"><button class="' + (lang === 'ar' ? 'on' : '') + '" data-a="lang" data-v="ar">عربي</button><button class="' + (lang === 'en' ? 'on' : '') + '" data-a="lang" data-v="en">English</button></div>' +
    '<button class="btn sm" data-a="theme">' + L('فاتح / غامق', 'Light / dark') + '</button>' +
    (window.Notification && Notification.permission !== 'granted' && !window.TM_ARTIFACT ? '<button class="btn sm" data-a="notif">' + L('فعّل التنبيهات', 'Turn on alerts') + '</button>' : '') +
    (DEMO ? '' : '<button class="btn sm danger" data-a="signout">' + L('خروج', 'Sign out') + '</button>') + '</div></div>';
  if (DEMO) h += '<div class="card sec"><div class="sec-h"><h2>' + L('نسخة تجريبية', 'Demo copy') + '</h2></div><p style="margin:0 0 10px;color:var(--ink2)">' + L('الأسماء والتاسكات هنا مش حقيقية، وكل اللي بتعمله بيتحفظ على جهازك بس. في النسخة الحقيقية الوقت بيتسجل من السيرفر والتنبيهات بتتبعت بالإيميل.', 'The names and tasks here are made up and everything you do stays on this device. On the real tool the server stamps the time and reminders go out by email.') + '</p><button class="btn sm" data-a="resetDemo">' + L('رجّع البيانات التجريبية من الأول', 'Reset the demo data') + '</button></div>';
  if (!owner) return h;
  h += section(L('الفريق', 'Team'), db.team().filter((x) => x.active).length, '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + L('الاسم', 'Name') + '</th><th>' + L('الإيميل', 'Email') + '</th><th>' + L('المجموعة', 'Group') + '</th><th>' + L('الصلاحية', 'Role') + '</th><th></th></tr></thead><tbody>' +
    db.team().map((x) => '<tr style="' + (x.active ? '' : 'opacity:.5') + '"><td><div class="nm">' + av(x.name) + esc(x.name) + (x.ar ? ' <small style="color:var(--ink3);font-weight:400">' + esc(x.ar) + '</small>' : '') + '</div></td><td class="mono ltr">' + esc(x.email || '—') + '</td><td>' + esc(x.group || '—') + '</td><td>' + lbl(ROLE, x.role) + (x.active ? '' : ' · ' + L('موقوف', 'inactive')) + '</td><td><button class="btn sm ghost" data-a="editMember" data-id="' + esc(x.name) + '">' + ic('edit') + '</button></td></tr>').join('') +
    '</tbody></table></div></div>', '<button class="btn sm pri" data-a="editMember">' + ic('plus') + L('ضيف حد', 'Add a person') + '</button>');
  h += section(L('إعدادات الأكونت', 'Account settings'), null, '<form class="card" data-form="config">' +
    '<div class="fgrp"><label class="lb" for="c-cats">' + L('أنواع التاسكات (كل نوع في سطر)', 'Task types (one per line)') + '</label><textarea class="field" id="c-cats">' + esc(cfg.cats.join('\n')) + '</textarea></div>' +
    '<div class="fgrp"><label class="lb" for="c-groups">' + L('المجموعات (كل مجموعة في سطر)', 'Groups (one per line)') + '</label><textarea class="field" id="c-groups">' + esc(cfg.groups.join('\n')) + '</textarea></div>' +
    '<div class="frow"><div class="fgrp"><label class="lb" for="c-nudge">' + L('ذكّر اللي ماأكدش الاستلام بعد (دقيقة)', 'Remind if not confirmed after (minutes)') + '</label><input class="field" id="c-nudge" type="number" min="10" value="' + cfg.nudgeMin + '"></div>' +
    '<div class="fgrp"><label class="lb" for="c-max">' + L('وقّف التايمر المنسي بعد (ساعة)', 'Stop a forgotten timer after (hours)') + '</label><input class="field" id="c-max" type="number" min="1" max="24" value="' + cfg.maxRunHours + '"></div>' +
    '<div class="fgrp"><label class="lb" for="c-mail">' + L('إيميل عند تاسك جديدة', 'Email on a new task') + '</label><select class="field" id="c-mail">' + [['all', L('كل التاسكات', 'Every task')], ['high', L('المهم والعاجل بس', 'High and urgent only')], ['none', L('من غير إيميل', 'No email')]].map((o) => '<option value="' + o[0] + '" ' + (cfg.mailAssign === o[0] ? 'selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>' +
    '<div class="fgrp"><label class="lb" for="c-digest">' + L('ملخص الصبح وتقرير آخر اليوم', 'Morning summary and end of day report') + '</label><select class="field" id="c-digest"><option value="1" ' + (cfg.mailDigest ? 'selected' : '') + '>' + L('شغال', 'On') + '</option><option value="" ' + (cfg.mailDigest ? '' : 'selected') + '>' + L('واقف', 'Off') + '</option></select></div></div>' +
    '<div class="frow"><div class="fgrp"><label class="lb" for="c-gam">' + L('الدوري والنقط', 'League and points') + '</label><select class="field" id="c-gam"><option value="1" ' + (cfg.gamify !== false ? 'selected' : '') + '>' + L('شغال', 'On') + '</option><option value="" ' + (cfg.gamify === false ? 'selected' : '') + '>' + L('واقف', 'Off') + '</option></select></div>' +
    '<div class="fgrp"><label class="lb" for="c-mode">' + L('الأعضاء يشوفوا في الترتيب', 'Members see in the standings') + '</label><select class="field" id="c-mode"><option value="all" ' + (cfg.boardMode !== 'top' ? 'selected' : '') + '>' + L('مجموعتهم كلها', 'Their whole group') + '</option><option value="top" ' + (cfg.boardMode === 'top' ? 'selected' : '') + '>' + L('أول 3 وترتيبهم هم بس', 'Top 3 and their own rank only') + '</option></select></div>' +
    '<div class="fgrp"><label class="lb" for="c-goal">' + L('هدف الفريق: نسبة التاسكات في الميعاد %', 'Team goal: tasks on time %') + '</label><input class="field" id="c-goal" type="number" min="1" max="100" value="' + (cfg.teamGoal || 90) + '"></div></div>' +
    '<button class="btn pri" type="submit">' + L('احفظ', 'Save') + '</button></form>');
  return h;
}

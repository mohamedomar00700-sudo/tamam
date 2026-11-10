// Tamam, part 3: the frame, the task sheet, the forms, and every button.
const NAVS = [['today', L('يومي', 'My day'), 'today'], ['tasks', L('التاسكات', 'Tasks'), 'tasks'], ['told', L('بلّغت', 'I told'), 'told'], ['routine', L('الروتين', 'Routine'), 'routine'], ['league', L('الدوري', 'League'), 'trophy'], ['overview', L('اللوحة', 'Overview'), 'board'], ['setup', L('الإعدادات', 'Setup'), 'setup']];
const PAGES = { today: pageToday, tasks: pageTasks, told: pageNotices, routine: pageRoutines, league: pageLeague, overview: pageBoard, setup: pageSetup };
const navLabel = (k) => ({ today: L('يومي', 'My day'), tasks: L('التاسكات', 'Tasks'), told: L('بلّغت', 'I told'), routine: L('الروتين', 'Routine'), league: L('الدوري', 'League'), overview: L('اللوحة', 'Overview'), setup: L('الإعدادات', 'Setup') }[k]);

// Replace a region's HTML but keep what the person was typing or had picked.
function swap(root, html, fresh) {
  const keep = {}, chips = {}, a = document.activeElement, focusId = a && root.contains(a) ? a.id : '', sel = focusId && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  if (!fresh) {
    root.querySelectorAll('input[id],textarea[id],select[id]').forEach((el) => { keep[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    root.querySelectorAll('.chipset[id]').forEach((el) => { chips[el.id] = Array.from(el.querySelectorAll('.chip.on')).map((c) => c.dataset.v); });
  }
  const sc = root.classList.contains('scrim') && root.firstElementChild ? root.firstElementChild.scrollTop : 0;
  root.innerHTML = html;
  Object.keys(keep).forEach((id) => { const el = document.getElementById(id); if (el && !el.dataset.input && !el.dataset.change) { if (el.type === 'checkbox') el.checked = keep[id]; else el.value = keep[id]; } });
  Object.keys(chips).forEach((id) => { const el = document.getElementById(id); if (el) el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', chips[id].indexOf(c.dataset.v) >= 0)); });
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  if (sc && root.firstElementChild) root.firstElementChild.scrollTop = sc;
}

function badges() {
  const n = now(), my = db.tasks().filter((t) => t.to === S.me && TM.isOpen(t));
  const pn = db.notices().filter((x) => x.to.indexOf(S.me) >= 0 && !x.acks[S.me]).length;
  return { today: my.filter((t) => !t.ackAt).length + pn, tasks: my.filter((t) => TM.overdue(t, n)).length, told: pn };
}
function render(opt) {
  opt = opt || {};
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const app = $('#app');
  if (!S.ready || !me()) { app.className = ''; app.style.display = 'block'; if (!opt.soft) swap(app, loginHtml()); return; }
  app.style.display = '';
  if (!PAGES[S.view] || !navOk(S.view)) S.view = 'today';
  const b = badges(), m = me(), navs = NAVS.filter((x) => navOk(x[0]));
  const key = lang + '|' + S.me + '|' + m.role;
  if (app.dataset.key !== key) {
    app.dataset.key = key;
    app.innerHTML = '<aside class="rail"><div class="brand"><span class="brand-mark">' + ic('check') + '</span><div><b>' + L('تمام', 'Tamam') + '</b><small>' + L('يوم الأكونت تحت السيطرة', 'The account day, under control') + '</small></div></div><nav id="railnav"></nav>' +
      '<div class="rail-foot"><button class="btn pri" data-a="newTask">' + ic('plus') + L('تاسك جديدة', 'New task') + '</button><button class="btn" data-a="go" data-v="told">' + ic('told') + L('سجّل إني بلّغت', 'Log that I told someone') + '</button><div class="who">' + av(m.name, 'lg') + '<div><b>' + esc(pname(m.name)) + '</b><small>' + lbl(ROLE, m.role) + '</small></div></div></div></aside>' +
      '<main><div class="wrap"><div class="top" id="top"></div><div id="demo"></div><div id="view"></div></div></main><nav class="tabbar" id="tabbar"></nav><button class="fab" data-a="newTask" aria-label="' + L('تاسك جديدة', 'New task') + '">' + ic('plus') + '</button>';
  }
  const navH = (cls) => navs.map((x) => '<button class="' + cls + (S.view === x[0] ? ' on' : '') + '" data-a="go" data-v="' + x[0] + '">' + ic(x[2]) + '<span>' + navLabel(x[0]) + '</span>' + (b[x[0]] ? '<span class="n">' + b[x[0]] + '</span>' : '') + '</button>').join('');
  $('#railnav').innerHTML = navH('nav'); $('#tabbar').innerHTML = navH('');
  const run = db.tasks().find((t) => t.to === S.me && t.runSince);
  $('#top').innerHTML = '<h1>' + (S.view === 'today' ? L('أهلاً يا ', 'Hello, ') + esc(pname(S.me).split(' ')[0]) : navLabel(S.view)) + '<span class="sub">' + esc(fmtDate(now(), true)) + '</span></h1><span class="busy" id="busy" ' + (S.busy ? '' : 'hidden') + '></span>' +
    (run ? '<button class="timer-pill" data-a="open" data-id="' + run.id + '">' + ic('clock').replace('<svg', '<svg width="16" height="16"') + live(run) + '<span>' + esc(run.title) + '</span></button>' : '') +
    '<button class="btn icon-btn" data-a="palette" title="Ctrl+K" aria-label="' + L('بحث', 'Search') + '">' + ic('search') + '</button><button class="btn pri new-btn" data-a="newTask">' + ic('plus') + L('تاسك جديدة', 'New task') + '</button>';
  $('#demo').innerHTML = DEMO ? '<div class="demo-bar"><b>' + L('نسخة تجريبية بأسماء مش حقيقية.', 'Demo with made-up names.') + '</b><label for="demoAs">' + L('شوفها بعين:', 'See it as:') + '</label><select id="demoAs" data-change="demoAs">' + db.team().filter((x) => x.active).map((x) => '<option value="' + esc(x.name) + '" ' + (x.name === S.me ? 'selected' : '') + '>' + esc(pname(x.name)) + ' · ' + esc(x.group) + '</option>').join('') + '</select></div>' : '';
  const typing = opt.soft && document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#view').contains(document.activeElement) && !document.activeElement.dataset.input;
  if (!typing) { swap($('#view'), PAGES[S.view](), opt.fresh); if ($('#qa') && $('#qa').value) qaPreview(); }
  renderDrawer(opt); if (!opt.soft) renderModal();
  document.title = (b.today ? '(' + b.today + ') ' : '') + L('تمام', 'Tamam');
  seenNotices();
}
function seenNotices() { // mark as seen what is on screen for me (once)
  if (S.view !== 'told' && S.view !== 'today') return;
  const ids = db.notices().filter((n) => n.to.indexOf(S.me) >= 0 && !n.seen[S.me]).map((n) => n.id);
  if (!ids.length || seenNotices.busy) return;
  seenNotices.busy = true;
  if (DEMO) { core.run(me(), 'noticeSeen', { ids }); saveDemo(); seenNotices.busy = false; return; }
  core.run(me(), 'noticeSeen', { ids });
  server('noticeSeen', { ids }).catch(() => {}).then(() => { seenNotices.busy = false; });
}

// ---------- the task sheet ----------
const LOGK = { ack: 'ok', done: 'ok', approve: 'ok', subDone: 'ok', start: 'acc', resume: 'acc', handoff: 'acc', create: 'acc', wait: 'wait', return: 'warn', time: 'warn', autostop: 'warn', edit: 'warn', autopause: 'warn', cancel: 'bad' };
function logLine(e) {
  const d = e.d || {}, q = (s) => (s ? '<span class="q">' + esc(s) + '</span>' : '');
  switch (e.a) {
    case 'create': return L('أنشأ التاسك وأداها لـ ', 'created the task for ') + '<b>' + esc(short(d.to)) + '</b>';
    case 'seen': return L('شاف التاسك', 'saw the task');
    case 'ack': return L('أكد إنه استلمها', 'confirmed they got it') + q(d.note);
    case 'start': return L('بدأ الشغل', 'started working');
    case 'resume': return L('كمّل الشغل', 'resumed');
    case 'pause': return L('وقّف مؤقتاً', 'paused') + q(d.note);
    case 'autopause': return L('اتوقفت لوحدها لما بدأ ', 'paused by itself when they started ') + esc(d.for);
    case 'autostop': return L('التايمر اتنسى شغال فاتوقف عند ', 'the timer was left running and was stopped at ') + d.hours + L(' ساعة', ' hours');
    case 'wait': return L('مستني ', 'waiting on ') + '<b>' + esc(d.on) + '</b>' + q(d.note);
    case 'done': return L('خلّصها', 'finished it') + (d.late ? ' <span class="pill bad">' + L('بعد الميعاد', 'after the due time') + '</span>' : '') + q(d.note);
    case 'approve': return L('اعتمدها', 'approved it') + q(d.note);
    case 'return': return L('رجّعها', 'sent it back') + q(d.note);
    case 'reopen': return L('فتحها تاني', 'reopened it') + q(d.note);
    case 'cancel': return L('لغاها', 'cancelled it') + q(d.note);
    case 'handoff': return L('حوّلها من ', 'handed it from ') + '<b>' + esc(short(d.from)) + '</b>' + L(' لـ ', ' to ') + '<b>' + esc(short(d.to)) + '</b>' + q(d.note);
    case 'comment': return L('كتب', 'wrote') + q(d.text);
    case 'subDone': return L('خلّص بند: ', 'ticked: ') + esc(d.text);
    case 'subUndo': return L('شال علامة بند: ', 'unticked: ') + esc(d.text);
    case 'subAdd': return L('ضاف بند: ', 'added a step: ') + esc(d.text);
    case 'time': return L('عدّل وقت الشغل من ', 'changed the worked time from ') + d.from + L(' لـ ', ' to ') + d.to + L(' دقيقة', ' min') + q(d.note);
    case 'edit': return L('عدّل: ', 'edited: ') + Object.keys(d).map((k) => {
      const nm = { title: L('العنوان', 'title'), details: L('التفاصيل', 'details'), cat: L('النوع', 'type'), pri: L('الأولوية', 'priority'), due: L('الميعاد', 'due time'), est: L('الوقت المتوقع', 'expected time'), needReview: L('الاعتماد', 'approval') }[k] || k;
      if (k === 'due') return '<b>' + nm + '</b> ' + (d[k].from ? esc(fmtStamp(d[k].from)) : '—') + ' ← ' + (d[k].to ? esc(fmtStamp(d[k].to)) : '—');
      if (k === 'est') return '<b>' + nm + '</b> ' + (d[k].from || 0) + ' ← ' + (d[k].to || 0) + L(' د', ' min');
      if (k === 'pri') return '<b>' + nm + '</b> ' + lbl(PR, d[k].from) + ' ← ' + lbl(PR, d[k].to);
      return '<b>' + nm + '</b>';
    }).join('، ');
    default: return esc(e.a);
  }
}
function renderDrawer(opt) {
  const root = $('#drawer'), t = S.drawer && db.task(S.drawer);
  if (!t) { root.hidden = true; root.innerHTML = ''; S.drawer = ''; return; }
  const n = now(), mine = t.to === S.me, by = t.by === S.me, Ld = lead(), open = TM.isOpen(t), b = TM.breakdown(t, n), tot = Math.max(1, b.total);
  const B = (act, label, cls, icon) => '<button class="btn ' + (cls || '') + '" data-a="tact" data-act="' + act + '" data-id="' + t.id + '">' + (icon ? ic(icon) : '') + label + '</button>';
  let acts = '';
  if (open && t.status !== 'review') {
    if (mine && !t.ackAt) acts += B('ack', L('استلمت', 'Got it'), 'pri', 'check');
    if (mine && !t.runSince) acts += B('start', t.startedAt ? L('كمّل', 'Resume') : L('ابدأ', 'Start'), t.ackAt ? 'pri' : '', 'play');
    if (mine && t.runSince) acts += B('pause', L('وقّف مؤقتاً', 'Pause'), '', 'pause');
    if ((mine || Ld) && t.status !== 'waiting') acts += B('wait', L('مستني حد', 'Waiting on someone'), '', 'wait');
    if (mine || Ld) acts += B('done', L('خلصت', 'Done'), 'ok', 'check');
  }
  if (t.status === 'review' && (by || Ld)) acts += B('approve', L('اعتمد', 'Approve'), 'ok', 'check') + B('return', L('رجّعها', 'Send back'), '');
  if (open && (mine || by || Ld)) acts += B('handoff', L('حوّلها لحد', 'Hand over'), 'ghost', 'hand');
  if (open && (by || Ld)) acts += '<button class="btn ghost" data-a="editTask" data-id="' + t.id + '">' + ic('edit') + L('عدّل', 'Edit') + '</button>' + B('cancel', L('الغيها', 'Cancel it'), 'ghost danger');
  if (!open || (t.status === 'review' && mine)) acts += (by || Ld || (mine && t.status !== 'cancelled')) ? B('reopen', L('افتحها تاني', 'Reopen'), '') : '';
  const seg = (k, v) => (v > 0 ? '<i class="w-' + k + '" style="width:' + (v / tot) * 100 + '%"></i>' : '');
  const kv = (k, v) => '<div><small>' + k + '</small><b>' + v + '</b></div>';
  const html = '<div class="sheet" role="dialog" aria-label="' + esc(t.title) + '"><div class="sheet-top"><button class="btn icon-btn" data-a="closeDrawer" aria-label="' + L('اقفل', 'Close') + '">' + ic('x') + '</button><span class="tid">' + t.id + '</span><div class="tc-top grow">' + taskPills(t) + '</div></div>' +
    '<h2>' + esc(t.title) + '</h2>' + (t.details ? '<p style="margin:0 0 6px;color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere">' + esc(t.details) + '</p>' : '') +
    '<div class="actbar">' + acts + '</div>' +
    '<div class="kv sec">' + kv(L('المسؤول', 'Owner'), esc(pname(t.to))) + kv(L('اللي طلبها', 'Asked by'), esc(pname(t.by))) + kv(L('الميعاد', 'Due'), t.due ? esc(fmtDue(t.due)) : '—') + kv(L('الوقت المتوقع', 'Expected time'), t.est ? fmtDur(t.est * MIN) : '—') + kv(L('النوع', 'Type'), esc(t.cat || '—')) + kv(L('اتعملت', 'Created'), esc(fmtStamp(t.created))) + '</div>' +
    '<div class="card sec"><div class="sec-h"><h2>' + L('الوقت راح فين', 'Where the time went') + '</h2><span class="end mono">' + fmtDur(b.total) + '</span></div><div class="where">' + seg('ack', b.toAck) + seg('work', b.work) + seg('wait', b.wait) + seg('idle', b.idle) + '</div>' +
    '<div class="legend"><span><i class="w-ack"></i>' + L('قبل تأكيد الاستلام ', 'Before confirming ') + '<b>' + fmtDur(b.toAck) + '</b></span><span><i class="w-work"></i>' + L('شغل فعلي ', 'Actual work ') + '<b>' + (t.runSince ? live(t) : fmtDur(b.work)) + '</b>' + (t.est ? ' / ' + fmtDur(t.est * MIN) : '') + '</span><span><i class="w-wait"></i>' + L('مستني حد ', 'Waiting on someone ') + '<b>' + fmtDur(b.wait) + '</b></span><span><i class="w-idle"></i>' + L('واقفة ', 'Idle ') + '<b>' + fmtDur(b.idle) + '</b></span></div>' +
    ((mine || Ld) && open ? '<div style="margin-top:10px"><button class="btn sm ghost" data-a="tact" data-act="time" data-id="' + t.id + '">' + L('عدّل وقت الشغل (بسبب، وبيتسجل)', 'Correct the worked time (with a reason, on the record)') + '</button>' + (t.timeEdited ? ' <span class="pill warn">' + L('الوقت اتعدل بالإيد', 'time was edited by hand') + '</span>' : '') + '</div>' : (t.timeEdited ? '<div style="margin-top:8px"><span class="pill warn">' + L('الوقت اتعدل بالإيد', 'time was edited by hand') + '</span></div>' : '')) + '</div>' +
    '<div class="card sec subs"><div class="sec-h"><h2>' + L('الخطوات', 'Steps') + '</h2><span class="c">' + (t.subs || []).filter((s) => s.done).length + '/' + (t.subs || []).length + '</span></div>' +
    (t.subs || []).map((s) => '<label><input type="checkbox" ' + (s.done ? 'checked' : '') + ' ' + (open && (mine || by || Ld) ? '' : 'disabled') + ' data-check="sub" data-id="' + t.id + '" data-sid="' + s.id + '"><span class="' + (s.done ? 'dn' : '') + '">' + esc(s.t) + (s.done && s.at ? ' <span class="stamp">' + esc(fmtStamp(s.at)) + '</span>' : '') + '</span></label>').join('') +
    (open && (mine || by || Ld) ? '<form data-form="subAdd" data-id="' + t.id + '" style="display:flex;gap:8px;margin-top:8px"><input class="field" id="d-sub" maxlength="200" placeholder="' + L('ضيف خطوة', 'Add a step') + '"><button class="btn" type="submit">' + ic('plus') + '</button></form>' : '') + '</div>' +
    '<div class="sec"><div class="sec-h"><h2>' + L('السجل: مين عمل إيه وإمتى', 'The record: who did what, and when') + '</h2></div><ol class="tl">' + t.log.map((e) => '<li class="k-' + (LOGK[e.a] || '') + '">' + stamp(e.at) + '<b>' + esc(short(e.by)) + '</b> ' + logLine(e) + '</li>').join('') + '</ol>' +
    '<form data-form="comment" data-id="' + t.id + '" style="display:flex;gap:8px"><input class="field" id="d-comment" maxlength="1000" placeholder="' + L('اكتب تعليق أو تحديث', 'Write a comment or update') + '"><button class="btn pri" type="submit">' + L('ابعت', 'Send') + '</button></form></div></div>';
  root.hidden = false; swap(root, html, opt && opt.freshDrawer);
}

// ---------- forms in a window ----------
function openModal(m) { S.modal = m; renderModal(); const f = $('#modal input:not([type=hidden]), #modal textarea'); if (f) f.focus(); }
function closeModal() { S.modal = null; renderModal(); }
function renderModal() {
  const root = $('#modal'), m = S.modal;
  if (!m) { root.hidden = true; root.innerHTML = ''; return; }
  let h = '';
  const foot = (label) => '<div class="modal-foot"><button class="btn ghost" type="button" data-a="closeModal">' + L('إلغاء', 'Cancel') + '</button><button class="btn pri" type="submit">' + label + '</button></div>';
  const cfg = core.cfg();
  if (m.type === 'task') {
    const t = m.id ? db.task(m.id) : null, nt = m.notice ? db.notice(m.notice) : null, v = t || m.prefill || { title: nt ? nt.subject : '', details: nt ? nt.details : '', pri: 'normal', cat: '', est: 0, due: 0 };
    const quick = [[L('بعد ساعة', 'In 1 hour'), now() + HOUR], [L('آخر الشيفت 6م', 'End of shift 6pm'), wallToMs(S.day + 'T18:00')], [L('بكرة 12ظ', 'Tomorrow noon'), wallToMs(env.day(now() + DAY) + 'T12:00')]];
    h = '<form class="modal" data-form="task" data-id="' + (m.id || '') + '" data-notice="' + (m.notice || '') + '"><h3>' + (t ? L('تعديل التاسك', 'Edit task') : L('تاسك جديدة', 'New task')) + '</h3>' +
      '<div class="fgrp"><label class="lb" for="t-title">' + L('المطلوب إيه', 'What needs doing') + '</label><input class="field" id="t-title" maxlength="200" value="' + esc(v.title) + '" placeholder="' + L('ابدأ بفعل: كلم، ابعت، راجع…', 'Start with a verb: call, send, review…') + '"></div>' +
      (t ? '' : '<div class="fgrp"><label class="lb">' + L('مين هيعملها (ممكن أكتر من واحد، كل واحد ياخد نسخته)', 'Who does it (pick several and each gets their own copy)') + '</label>' + peoplePicker('t-to', true, (m.prefill && m.prefill.to) || [S.me]) + '</div>') +
      '<div class="fgrp"><label class="lb" for="t-due">' + L('الميعاد', 'Due') + '</label><div class="chips" style="margin-bottom:7px">' + quick.map((q) => '<button type="button" class="chip" data-a="setDue" data-v="' + msToWall(q[1]) + '">' + q[0] + '</button>').join('') + '</div><input class="field" id="t-due" type="datetime-local" value="' + (v.due ? msToWall(v.due) : '') + '"></div>' +
      '<div class="frow"><div class="fgrp"><label class="lb">' + L('الأولوية', 'Priority') + '</label>' + chipset('t-pri', Object.keys(PR).map((k) => [k, lbl(PR, k)]), v.pri) + '</div>' +
      '<div class="fgrp"><label class="lb">' + L('هتاخد وقت قد إيه', 'How long it should take') + '</label>' + chipset('t-est', [[15, L('15د', '15m')], [30, L('30د', '30m')], [60, L('ساعة', '1h')], [120, L('ساعتين', '2h')], [240, L('نص يوم', 'Half day')]].map((x) => [String(x[0]), x[1]]), String(v.est || '')) + '</div></div>' +
      '<div class="fgrp"><label class="lb">' + L('النوع', 'Type') + '</label>' + chipset('t-cat', cfg.cats.map((c) => [c, c]), v.cat) + '</div>' +
      '<div class="fgrp"><label class="lb" for="t-details">' + L('تفاصيل (اختياري)', 'Details (optional)') + '</label><textarea class="field" id="t-details" maxlength="4000">' + esc(v.details) + '</textarea></div>' +
      (t ? '' : '<div class="fgrp"><label class="lb" for="t-subs">' + L('خطوات (كل خطوة في سطر، اختياري)', 'Steps (one per line, optional)') + '</label><textarea class="field" id="t-subs" style="min-height:52px"></textarea></div>') +
      '<div class="fgrp"><label style="display:flex;gap:9px;align-items:center"><input type="checkbox" id="t-review" ' + (v.needReview ? 'checked' : '') + ' style="width:18px;height:18px"> ' + L('متتقفلش غير لما أعتمدها أنا', 'It only closes after I approve it') + '</label></div>' + foot(t ? L('احفظ', 'Save') : L('ادّيها', 'Give it')) + '</form>';
  } else if (m.type === 'prompt') {
    h = '<form class="modal" data-form="prompt"><h3>' + m.title + '</h3>' +
      (m.people ? '<div class="fgrp"><label class="lb">' + L('لمين', 'To whom') + '</label>' + peoplePicker('p-to', false, [], false) + '</div>' : '') +
      (m.on ? '<div class="fgrp"><label class="lb" for="p-on">' + L('مستني مين أو إيه', 'Waiting on who or what') + '</label><input class="field" id="p-on" maxlength="120" placeholder="' + L('مثال: العميل، IT، كريم', 'e.g. the client, IT, Karim') + '"></div>' : '') +
      (m.min != null ? '<div class="fgrp"><label class="lb" for="p-min">' + L('وقت الشغل الصح (بالدقايق)', 'The right worked time (minutes)') + '</label><input class="field" id="p-min" type="number" min="0" value="' + m.min + '"></div>' : '') +
      '<div class="fgrp"><label class="lb" for="p-note">' + m.label + '</label><textarea class="field" id="p-note" maxlength="1000"></textarea></div>' + foot(m.ok || L('تمام', 'OK')) + '</form>';
  } else if (m.type === 'routine') {
    const r = m.id ? db.routines().find((x) => x.id === m.id) : null, v = r || { title: '', time: '', days: [0, 1, 2, 3, 4, 5, 6], groups: [], people: [], active: true };
    h = '<form class="modal" data-form="routine" data-id="' + (m.id || '') + '"><h3>' + (r ? L('تعديل بند روتين', 'Edit routine item') : L('بند روتين جديد', 'New routine item')) + '</h3>' +
      '<div class="fgrp"><label class="lb" for="r-title">' + L('الحاجة اللي لازم تتعمل كل يوم', 'The thing that must be done every day') + '</label><input class="field" id="r-title" maxlength="200" value="' + esc(v.title) + '"></div>' +
      '<div class="frow"><div class="fgrp"><label class="lb" for="r-time">' + L('لازم تخلص قبل الساعة', 'Must be done by') + '</label><input class="field" id="r-time" type="time" value="' + esc(v.time) + '"></div>' +
      '<div class="fgrp"><label class="lb">' + L('الأيام', 'Days') + '</label>' + chipset('r-days', WD.map((d, i) => [String(i), L(d[0], d[1])]), v.days.map(String), true) + '</div></div>' +
      '<div class="fgrp"><label class="lb">' + L('لمجموعة كاملة', 'For a whole group') + '</label>' + chipset('r-groups', cfg.groups.map((g) => [g, g]), v.groups, true) + '</div>' +
      '<div class="fgrp"><label class="lb">' + L('أو لناس بعينهم', 'Or for specific people') + '</label>' + peoplePicker('r-people', true, v.people) + '</div>' +
      (r ? '<div class="fgrp"><label style="display:flex;gap:9px;align-items:center"><input type="checkbox" id="r-active" ' + (v.active ? 'checked' : '') + ' style="width:18px;height:18px"> ' + L('شغال', 'Active') + '</label></div>' : '') + foot(L('احفظ', 'Save')) + '</form>';
  } else if (m.type === 'member') {
    const x = m.id ? person(m.id) : null, v = x || { name: '', ar: '', email: '', role: 'member', group: cfg.groups[0], active: true };
    h = '<form class="modal" data-form="member" data-id="' + esc(m.id || '') + '"><h3>' + (x ? esc(x.name) : L('ضيف حد للفريق', 'Add a person')) + '</h3>' +
      (x ? '' : '<div class="fgrp"><label class="lb" for="m-name">' + L('الاسم بالإنجليزي (زي السكوركارد بالظبط)', 'Name in English (exactly as on the scorecard)') + '</label><input class="field" id="m-name" maxlength="120"></div>') +
      '<div class="frow"><div class="fgrp"><label class="lb" for="m-ar">' + L('الاسم بالعربي', 'Name in Arabic') + '</label><input class="field" id="m-ar" maxlength="120" value="' + esc(v.ar) + '"></div>' +
      '<div class="fgrp"><label class="lb" for="m-email">' + L('إيميل الشغل (بيدخل بيه)', 'Work email (used to sign in)') + '</label><input class="field" id="m-email" type="email" dir="ltr" value="' + esc(v.email) + '"></div></div>' +
      '<div class="frow"><div class="fgrp"><label class="lb" for="m-group">' + L('المجموعة', 'Group') + '</label><select class="field" id="m-group">' + cfg.groups.map((g) => '<option ' + (v.group === g ? 'selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></div>' +
      '<div class="fgrp"><label class="lb" for="m-role">' + L('الصلاحية', 'Role') + '</label><select class="field" id="m-role">' + Object.keys(ROLE).reverse().map((k) => '<option value="' + k + '" ' + (v.role === k ? 'selected' : '') + '>' + lbl(ROLE, k) + '</option>').join('') + '</select></div></div>' +
      '<p style="font-size:12.5px;color:var(--ink3);margin:0 0 12px">' + L('العضو بيشوف تاسكاته واللي اتبلغ بيه بس. الليدر بيشوف الفريق كله واللوحة. مسؤول الأداة بيدير الأسماء والإعدادات.', 'A member sees only their own tasks and notices. A lead sees the whole team and the overview. The owner manages names and settings.') + '</p>' +
      (x ? '<div class="fgrp"><label style="display:flex;gap:9px;align-items:center"><input type="checkbox" id="m-active" ' + (v.active ? 'checked' : '') + ' style="width:18px;height:18px"> ' + L('شغال (شيل العلامة لو ساب الأكونت)', 'Active (untick if they left the account)') + '</label></div>' : '') + foot(L('احفظ', 'Save')) + '</form>';
  }
  if (!h && EXTRA_MODALS[m.type]) h = EXTRA_MODALS[m.type](m);
  root.hidden = false; root.innerHTML = h;
}

const PROMPTS = {
  wait: () => ({ title: L('مستني حد', 'Waiting on someone'), label: L('مستني إيه بالظبط', 'What exactly are you waiting for'), on: true }),
  cancel: () => ({ title: L('إلغاء التاسك', 'Cancel the task'), label: L('سبب الإلغاء', 'Why is it cancelled') }),
  return: () => ({ title: L('رجّعها', 'Send it back'), label: L('ناقص إيه', 'What is missing') }),
  handoff: () => ({ title: L('حوّلها لحد تاني', 'Hand it over'), label: L('ليه، وإيه اللي اتعمل لحد دلوقتي', 'Why, and what has been done so far'), people: true }),
  time: (t) => ({ title: L('تعديل وقت الشغل', 'Correct the worked time'), label: L('سبب التعديل', 'Reason for the change'), min: Math.round(workMs(t) / MIN) }),
};

// ---------- sign in ----------
function loginHtml() {
  const st = S.login || { step: 1, email: '' };
  return '<div class="login"><form class="card" data-form="login"><span class="brand-mark">' + ic('check') + '</span><h1>' + L('تمام', 'Tamam') + '</h1><p>' + L('ادخل بإيميل الشغل. هيوصلك كود على الإيميل.', 'Sign in with your work email. A code will be emailed to you.') + '</p>' +
    (S.session && !S.ready ? '<p>' + L('بحمّل…', 'Loading…') + '</p>' : st.step === 1
      ? '<div class="fgrp"><label class="lb" for="l-email">' + L('الإيميل', 'Email') + '</label><input class="field" id="l-email" type="email" dir="ltr" autocomplete="email" value="' + esc(st.email) + '"></div><button class="btn pri" type="submit" style="width:100%">' + L('ابعتلي الكود', 'Send me the code') + '</button>'
      : '<div class="fgrp"><label class="lb" for="l-code">' + L('الكود اللي وصل على ', 'The code sent to ') + '<span dir="ltr">' + esc(st.email) + '</span></label><input class="field mono" id="l-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="font-size:22px;letter-spacing:6px;text-align:center"></div><button class="btn pri" type="submit" style="width:100%">' + L('ادخل', 'Sign in') + '</button><p style="margin:12px 0 0;font-size:12.5px">' + L('مش لاقيه؟ بص في Junk. نفس الكود شغال 10 دقايق.', 'Cannot find it? Check Junk. The same code works for 10 minutes.') + ' <button class="btn sm ghost" type="button" data-a="loginBack">' + L('غيّر الإيميل', 'Change email') + '</button></p>') +
    '</form></div>';
}

// ---------- every button ----------
const DO = {
  go(el) { S.view = el.dataset.v; location.hash = S.view; window.scrollTo(0, 0); render({ fresh: true }); },
  open(el) { S.drawer = el.dataset.id; const t = db.task(S.drawer); render({ freshDrawer: true }); if (t && t.to === S.me && !t.seenAt) act('taskAct', { id: t.id, act: 'seen' }); },
  closeDrawer() { S.drawer = ''; renderDrawer(); },
  closeModal,
  newTask(el) { openModal({ type: 'task', notice: el.dataset.notice || '' }); },
  editTask(el) { openModal({ type: 'task', id: el.dataset.id }); },
  editRoutine(el) { openModal({ type: 'routine', id: el.dataset.id || '' }); },
  editMember(el) { openModal({ type: 'member', id: el.dataset.id || '' }); },
  setf(el) { let v = el.dataset.v; if (el.dataset.k === 'range') v = Number(v); if (el.dataset.k === 'showDone') v = !!v; S.f[el.dataset.k] = v; if (el.dataset.k === 'layout') ls.set('tm_layout', v); render(); },
  chip(el) { const set = el.closest('.chipset'); if (!set.dataset.multi) set.querySelectorAll('.chip.on').forEach((c) => { if (c !== el) c.classList.remove('on'); }); el.classList.toggle('on'); },
  pickGroup(el) { const box = el.closest('.pg'), all = Array.from(box.querySelectorAll('.chip')), on = all.every((c) => c.classList.contains('on')); all.forEach((c) => c.classList.toggle('on', !on)); },
  setDue(el) { $('#t-due').value = el.dataset.v; },
  tact(el) {
    const t = db.task(el.dataset.id), a = el.dataset.act; if (!t) return;
    if (PROMPTS[a]) return openModal(Object.assign({ type: 'prompt', run: (b) => act('taskAct', Object.assign({ id: t.id, act: a }, b)) }, PROMPTS[a](t)));
    act('taskAct', { id: t.id, act: a });
    if (a === 'done') onDone(t);
  },
  nack(el) { act('noticeAck', { id: el.dataset.id }); },
  nackNote(el) { openModal({ type: 'prompt', title: L('استلمت + رد', 'Got it + reply'), label: L('ردك', 'Your reply'), optional: true, run: (b) => act('noticeAck', { id: el.dataset.id, note: b.note }) }); },
  goNotice(el) { S.view = 'told'; S.f.nscope = 'all'; S.f.nq = el.dataset.id; location.hash = 'told'; render({ fresh: true }); },
  check(el) { act('check', { rid: el.dataset.rid, st: el.dataset.on ? '' : 'done' }); },
  skip(el) { openModal({ type: 'prompt', title: L('مش هتتعمل النهارده', 'Not doing it today'), label: L('السبب', 'The reason'), run: (b) => act('check', { rid: el.dataset.rid, st: 'skip', note: b.note }) }); },
  lang(el) { lang = el.dataset.v; ls.set('tm_lang', lang); render({ fresh: true }); },
  theme() { const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; ls.set('tm_theme', r.dataset.theme); },
  notif() { try { Notification.requestPermission().then(() => render()); } catch (e) {} },
  signout() { signOut(); },
  resetDemo() { ls.del('tm_demo_v2'); loadDemo(); S.history = null; S.historyKey = ''; toast(L('رجعت البيانات التجريبية', 'Demo data was reset')); render({ fresh: true }); },
  loginBack() { S.login = { step: 1, email: S.login ? S.login.email : '' }; render(); },
  excel,
};
Object.assign(DO, EXTRA_DO);
const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const FORMS = {
  async task(f) {
    const due = val('t-due') ? wallToMs(val('t-due')) : 0;
    const base = { title: val('t-title'), details: val('t-details'), due, pri: picked('t-pri')[0] || 'normal', est: Number(picked('t-est')[0]) || 0, cat: picked('t-cat')[0] || '', needReview: $('#t-review').checked };
    if (!base.title) return toast(errMsg('need_title'), true);
    let res;
    if (f.dataset.id) res = await act('taskEdit', { id: f.dataset.id, patch: base });
    else { const to = picked('t-to'); if (!to.length) return toast(errMsg('bad_person'), true); res = await act('taskNew', Object.assign(base, { to, subs: val('t-subs').split('\n'), noticeId: f.dataset.notice || undefined })); }
    if (res.ok) { closeModal(); if (!f.dataset.id) toast(L('اتسجلت واتبعتت', 'Saved and sent')); }
  },
  async prompt() {
    const m = S.modal, b = { note: val('p-note') };
    if (m.people) { b.to = picked('p-to')[0]; if (!b.to) return toast(errMsg('bad_person'), true); }
    if (m.on) b.on = val('p-on');
    if (m.min != null) b.min = Number(val('p-min'));
    if (!b.note && !m.optional && !(m.on && b.on)) return toast(errMsg('need_note'), true);
    const res = await m.run(b); if (res && res.ok) closeModal();
  },
  async notice() {
    const b = { subject: val('n-subject'), to: picked('n-to'), channel: picked('n-ch')[0] || 'verbal', details: val('n-details'), saidAt: val('n-when') ? wallToMs(val('n-when')) : 0 };
    if (!b.subject) return toast(errMsg('need_title'), true);
    if (!b.to.length) return toast(errMsg('bad_person'), true);
    const res = await act('noticeNew', b);
    if (res.ok) { S.f.nscope = 'out'; toast(L('اتسجلت الساعة ', 'Logged at ') + fmtClock(now())); render({ fresh: true }); }
  },
  async comment(f) { const note = val('d-comment'); if (!note) return; $('#d-comment').value = ''; await act('taskAct', { id: f.dataset.id, act: 'comment', note }); },
  async subAdd(f) { const note = val('d-sub'); if (!note) return; $('#d-sub').value = ''; await act('taskAct', { id: f.dataset.id, act: 'subAdd', note }); },
  async routine(f) {
    const b = { id: f.dataset.id || undefined, title: val('r-title'), time: val('r-time'), days: picked('r-days').map(Number), groups: picked('r-groups'), people: picked('r-people'), active: $('#r-active') ? $('#r-active').checked : true };
    if (!b.groups.length && !b.people.length) return toast(L('اختار مجموعة أو ناس', 'Pick a group or people'), true);
    const res = await act('routineSave', b); if (res.ok) closeModal();
  },
  async member(f) {
    const b = { name: f.dataset.id || val('m-name'), ar: val('m-ar'), email: val('m-email'), group: val('m-group'), role: val('m-role'), active: $('#m-active') ? $('#m-active').checked : true };
    const res = await act('memberSave', b); if (res.ok) closeModal();
  },
  async config() {
    const lines = (id) => val(id).split('\n').map((x) => x.trim()).filter(Boolean);
    const res = await act('configSave', { config: { cats: lines('c-cats'), groups: lines('c-groups'), nudgeMin: Number(val('c-nudge')), maxRunHours: Number(val('c-max')), mailAssign: val('c-mail'), mailDigest: !!val('c-digest'), gamify: !!val('c-gam'), boardMode: val('c-mode'), teamGoal: Number(val('c-goal')), appUrl: location.origin + location.pathname } });
    if (res.ok) toast(L('اتحفظ', 'Saved'));
  },
  async login() {
    const st = S.login || { step: 1, email: '' };
    try {
      if (st.step === 1) {
        const email = val('l-email').toLowerCase(); if (!email) return;
        const r = await server('otpRequest', { email });
        if (!r.ok) return toast(errMsg(r.error), true);
        S.login = { step: 2, email }; render(); const c = $('#l-code'); if (c) c.focus();
      } else {
        const r = await server('otpVerify', { email: st.email, code: val('l-code'), app: location.origin + location.pathname });
        if (!r.ok) return toast(errMsg(r.error), true);
        S.session = r.session; ls.set('tm_session', r.session); S.login = null; S.since = 0;
        await sync(true); render({ fresh: true });
      }
    } catch (e) { toast(L('النت واقع، جرب تاني', 'No connection, try again'), true); }
  },
};

async function excel() {
  if (window.TM_ARTIFACT) return toast(L('التحميل شغال في النسخة الحقيقية', 'Downloads work on the real tool'));
  if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); }).catch(() => {});
  if (!window.XLSX) return toast(L('معرفتش أحمّل ملف الإكسل', 'Could not load the Excel library'), true);
  const n = now(), dt = (ms) => (ms ? msToWall(ms).replace('T', ' ') : ''), mins = (ms) => Math.round(ms / MIN);
  const tasks = db.tasks().sort((a, b) => b.created - a.created).map((t) => { const b = TM.breakdown(t, n); return { ID: t.id, Task: t.title, 'Asked by': t.by, Owner: t.to, Type: t.cat, Priority: t.pri, Status: t.status, Created: dt(t.created), Confirmed: dt(t.ackAt), Started: dt(t.startedAt), Done: dt(t.doneAt), Due: dt(t.due), Late: t.due && (t.doneAt || n) > t.due ? 'Yes' : '', 'Expected (min)': t.est || '', 'Worked (min)': mins(b.work), 'Before confirming (min)': mins(b.toAck), 'Waiting on others (min)': mins(b.wait), 'Idle (min)': mins(b.idle), 'Sent back': t.returns || '', 'Time edited by hand': t.timeEdited ? 'Yes' : '' }; });
  const notices = db.notices().sort((a, b) => b.at - a.at).map((x) => ({ ID: x.id, 'Logged at': dt(x.at), 'Happened at': dt(x.saidAt), From: x.by, To: x.to.join(', '), Subject: x.subject, Details: x.details, How: x.channel, Confirmed: x.to.filter((p) => x.acks[p]).map((p) => p + ' ' + dt(x.acks[p].at)).join(' | '), 'Still pending': x.to.filter((p) => !x.acks[p]).join(', '), Task: x.taskId || '' }));
  const log = []; db.tasks().forEach((t) => t.log.forEach((e) => log.push({ At: dt(e.at), Task: t.id, Title: t.title, Who: e.by, Action: e.a, Details: e.d ? JSON.stringify(e.d) : '' }))); log.sort((a, b) => (a.At < b.At ? 1 : -1));
  const people = (S.boardRows || []).map((r) => ({ Name: r.name, Open: r.open, Late: r.late, Done: r.done, 'On time %': r.onTime == null ? '' : r.onTime, 'Worked (min)': mins(r.work), 'Confirms in (min)': r.ack == null ? '' : mins(r.ack), 'Routine %': r.rp == null ? '' : r.rp }));
  const wb = XLSX.utils.book_new();
  [['People', people], ['Tasks', tasks], ['Told', notices], ['Record', log]].forEach((s) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s[1]), s[0]));
  XLSX.writeFile(wb, 'tamam-' + S.day + '.xlsx');
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) { if (ev.target.id === 'drawer') DO.closeDrawer(); else if (ev.target.id === 'modal') closeModal(); return; }
  // a button inside a card wins over the card itself
  if (DO[el.dataset.a]) { ev.preventDefault(); DO[el.dataset.a](el, ev); }
});
document.addEventListener('submit', (ev) => { const f = ev.target.closest('[data-form]'); if (!f) return; ev.preventDefault(); FORMS[f.dataset.form](f); });
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.check === 'sub') return act('taskAct', { id: el.dataset.id, act: 'sub', sid: el.dataset.sid, done: el.checked });
  if (el.dataset.change === 'person') { S.f.person = el.value; render(); }
  if (el.dataset.change === 'demoAs') { S.me = S.demoAs = el.value; ls.set('tm_demo_as', el.value); S.drawer = ''; S.historyKey = ''; render({ fresh: true }); }
});
let inputTimer = 0;
document.addEventListener('input', (ev) => { const k = ev.target.dataset.input; if (!k) return; S.f[k] = ev.target.value; clearTimeout(inputTimer); inputTimer = setTimeout(() => render(), 180); });
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { if (S.modal) closeModal(); else if (S.drawer) DO.closeDrawer(); }
  if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('tcard')) ev.target.click();
});
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (PAGES[v] && v !== S.view) { S.view = v; render({ fresh: true }); } });

// ---------- start ----------
(async function boot() {
  const th = ls.get('tm_theme', ''); if (th) document.documentElement.dataset.theme = th;
  const v = location.hash.slice(1); if (PAGES[v]) S.view = v;
  if (DEMO) loadDemo();
  render();
  if (!DEMO && S.session) { try { await sync(true); } catch (e) { toast(L('النت واقع', 'No connection'), true); } render({ fresh: true }); }
  setInterval(() => { document.querySelectorAll('[data-run]').forEach((el) => { const r = Number(el.dataset.run); if (r) el.textContent = fmtLive(Number(el.dataset.base) + Math.max(0, now() - r)); }); }, 1000);
  setInterval(async () => {
    if (document.hidden || !S.ready) return;
    if (!DEMO) { try { await sync(false); } catch (e) { return; } }
    else sync();
    if (!S.modal) render({ soft: true });
  }, DEMO ? 60000 : 40000);
  document.addEventListener('visibilitychange', async () => { if (!document.hidden && S.ready && !DEMO) { try { await sync(false); if (!S.modal) render({ soft: true }); } catch (e) {} } });
})();

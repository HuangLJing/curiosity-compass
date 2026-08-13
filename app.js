const KEY = 'tanguang-v2';
const OLD_KEY = 'tanguang-v1';
const SNAPSHOT_KEY = 'tanguang-import-snapshot';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const day = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now() + Math.floor(Math.random() * 10000);

function loadData() {
  const current = localStorage.getItem(KEY);
  if (current) return normalize(JSON.parse(current));
  const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
  if (old) {
    return normalize({
      version: 2,
      plan: { annual: '', monthly: '' },
      items: (old.items || []).map(item => ({
        id: item.id || uid(), kind: 'question', title: item.q, tag: item.tag || '其他',
        state: item.focus || item.status === '进行中' ? 'active' : item.status === '已理解' ? 'understood' : item.status === '转化项目' ? 'project' : 'inbox',
        next: item.next || '', branches: []
      })),
      reviews: old.reviews || {}
    });
  }
  return normalize({ version: 2, plan: { annual: '', monthly: '' }, items: [], reviews: {} });
}

function normalize(raw) {
  raw.version = 3;
  raw.plan ||= { annual: '', monthly: '' };
  raw.items ||= [];
  raw.reviews ||= {};
  raw.pendingPlans ||= [];
  raw.items.forEach(item => { item.branches ||= []; item.kind ||= 'question'; item.state ||= item.kind === 'life' ? 'wishlist' : 'inbox'; item.createdAt ||= ''; if (item.kind === 'life') item.reflections ||= []; });
  return raw;
}

let data = loadData();
let currentView = 'today';
let inboxKind = 'question';
let inboxSearch = '';
let inboxCategory = '全部';
let captureKind = 'question';
let finishTarget = null;

function save(message) {
  localStorage.setItem(KEY, JSON.stringify(data));
  render();
  if (message) toast(message);
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate() {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}

function stateLabel(state) {
  return ({ inbox: 'Inbox', shortlist: '本周候选', active: '进行中', understood: '已理解', project: '转化项目', wishlist: '想体验', done: '已体验' })[state] || state;
}

function render() {
  $('#today').textContent = formatDate();
  $('#annualQuestion').textContent = data.plan.annual || '还没有写下年度问题';
  $('#monthlyQuestion').textContent = data.plan.monthly || '先决定这个月最值得推进的一个问题';
  renderToday();
  renderInbox();
  renderReviews();
}

function renderToday() {
  const active = data.items.find(item => item.kind === 'question' && item.state === 'active');
  const short = data.items.filter(item => item.kind === 'question' && item.state === 'shortlist');
  const questionInbox = data.items.filter(item => item.kind === 'question' && item.state === 'inbox');
  const life = data.items.filter(item => item.kind === 'life' && item.state === 'wishlist');
  $('#questionCount').textContent = questionInbox.length;
  $('#lifeCount').textContent = life.length;
  $('#shortlistCount').textContent = `${short.length}/3`;
  if (!active) {
    $('#focusCard').innerHTML = `<div class="eyebrow">今日唯一探索</div><h1>${short.length ? '从本周候选中，主动选择一个问题' : '今天不必自动开始一个新问题'}</h1><p>${short.length ? `你有 ${short.length} 个经过筛选的候选。开始前先写清楚终点。` : '先推进本月主线、恢复状态，或在每周整理时选择候选。'}</p><div class="focus-actions">${short.length ? '<button class="light-button" data-view="inbox">查看本周候选</button>' : '<button class="light-button" data-action="capture">收下一颗好奇</button>'}</div>`;
    bindDynamic();
    return;
  }
  const time = active.minutes === 'project' ? '独立项目' : `${active.minutes || 45} 分钟`;
  const branches = active.branches.map(branch => `<span>${esc(branch)}</span>`).join('');
  $('#focusCard').innerHTML = `<div class="eyebrow">正在探索 · ${esc(active.level || '初步理解')}</div><h1>${esc(active.title)}</h1><p>${esc(active.purpose || '')}</p><div class="contract-grid"><div class="contract-cell"><span>时间上限</span><strong>${time}</strong></div><div class="contract-cell"><span>结束条件</span><strong>${esc(active.doneWhen || '达到足够理解')}</strong></div></div>${active.notNow ? `<p>这次不研究：${esc(active.notNow)}</p>` : ''}${active.next ? `<p>第一步：${esc(active.next)}</p>` : ''}<div class="branch-box"><div class="eyebrow">分支停车场 · 只记录，不切换</div><div class="branches">${branches}</div><div class="branch-input"><input id="branchInput" placeholder="刚冒出的分支问题"><button data-action="add-branch" data-id="${active.id}">停放</button></div></div><div class="focus-actions"><button class="light-button" data-action="finish" data-id="${active.id}">到达终点，结束探索</button><button class="ghost-light" data-action="edit-contract" data-id="${active.id}">调整边界</button></div>`;
  bindDynamic();
}

function renderInbox() {
  $$('[data-inbox-tabs] button').forEach(button => button.classList.toggle('active', button.dataset.kind === inboxKind));
  let list;
  if (inboxKind === 'question') {
    list = data.items.filter(item => item.kind === 'question' && !['understood'].includes(item.state));
    list.sort((a, b) => ({ active: 0, shortlist: 1, project: 2, inbox: 3 }[a.state] ?? 4) - ({ active: 0, shortlist: 1, project: 2, inbox: 3 }[b.state] ?? 4));
  } else if (inboxKind === 'life') {
    list = data.items.filter(item => item.kind === 'life' && item.state !== 'done');
  } else {
    list = data.items.filter(item => item.state === 'done' || item.state === 'understood' || item.state === 'project');
    list.sort((a, b) => String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || '')));
  }
  const categoryValues = inboxKind === 'question' ? ['全部', '工作', '科普', '技术', '生活', '其他'] : inboxKind === 'life' ? ['全部', '探店', '美食', '书', '电影', '地点', '活动', '联系某人', '其他'] : ['全部', '好奇问题', '生活体验'];
  if (!categoryValues.includes(inboxCategory)) inboxCategory = '全部';
  $('#inboxCategory').innerHTML = categoryValues.map(value => `<option${value === inboxCategory ? ' selected' : ''}>${value}</option>`).join('');
  const categoryOf = item => inboxKind === 'question' ? (item.tag || '其他') : inboxKind === 'life' ? (item.category || '其他') : (item.kind === 'life' ? '生活体验' : '好奇问题');
  if (inboxCategory !== '全部') list = list.filter(item => categoryOf(item) === inboxCategory);
  if (inboxSearch) {
    const term = inboxSearch.toLowerCase();
    list = list.filter(item => [item.title, item.tag, item.category, item.result, item.memory, item.place, item.url, ...(item.reflections || []).map(x => x.text)].some(value => String(value || '').toLowerCase().includes(term)));
  }
  const emptyText = inboxSearch || inboxCategory !== '全部' ? '没有符合当前搜索或分类的内容。' : inboxKind === 'completed' ? '完成一次探索或体验后，它会安静地留在这里。' : '这里还是空的。遇到想问、想去、想吃或想读的，先轻轻收下来。';
  $('#inboxList').innerHTML = list.length ? list.map(item => inboxKind === 'question' ? questionCard(item) : inboxKind === 'life' ? lifeCard(item) : completedCard(item)).join('') : `<div class="empty">${emptyText}</div>`;
  bindDynamic();
}

function questionCard(item) {
  const shortlistCount = data.items.filter(x => x.kind === 'question' && x.state === 'shortlist').length;
  let actions = '';
  if (item.state === 'inbox') actions = `<button class="emphasis" data-action="shortlist" data-id="${item.id}" ${shortlistCount >= 3 ? 'disabled' : ''}>加入本周</button>`;
  if (item.state === 'shortlist') actions = `<button class="emphasis" data-action="contract" data-id="${item.id}">开始探索</button><button data-action="unshortlist" data-id="${item.id}">放回 Inbox</button>`;
  if (item.state === 'active') actions = `<button class="emphasis" data-view="today">回到当前探索</button>`;
  if (item.state === 'project') actions = `<button data-action="shortlist" data-id="${item.id}">作为本周候选</button>`;
  return swipeCard(item, `<div class="card-head"><div class="card-title">${esc(item.title)}</div><span class="pill">${stateLabel(item.state)}</span></div><div class="card-meta">${esc(item.tag || '其他')}${item.next ? ` · 下一步：${esc(item.next)}` : ''}</div>${linkView(item.url)}${actions ? `<div class="card-actions">${actions}</div>` : ''}`);
}

function safeUrl(value = '') {
  const text = String(value).trim();
  if (!text) return '';
  try { const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

function linkView(value) {
  const url = safeUrl(value);
  if (!url) return '';
  const host = new URL(url).hostname.replace(/^www\./, '');
  return `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${esc(host)}"><span>↗ ${esc(host)}</span></a>`;
}

function lifeCard(item) {
  const time = ({ 10: '10 分钟', 60: '30–60 分钟', half: '半天以上' })[item.time] || '时间不限';
  const energy = ({ low: '低能量', mid: '中等能量', high: '高能量' })[item.energy] || '';
  return swipeCard(item, `<div class="card-head"><div class="card-title">${esc(item.title)}</div><span class="pill">${esc(item.category || '生活')}</span></div><div class="card-meta">${time} · ${energy}</div>${linkView(item.url)}<div class="card-actions"><button class="emphasis" data-action="life-done" data-id="${item.id}">我体验过了</button></div>`);
}

function swipeCard(item, content) {
  return `<div class="swipe-row" data-swipe-id="${item.id}"><div class="swipe-actions"><button class="swipe-edit" data-action="edit-item" data-id="${item.id}">编辑</button><button class="swipe-delete" data-action="delete" data-id="${item.id}">删除</button></div><article class="card swipe-content">${content}</article></div>`;
}

function completedCard(item) {
  if (item.kind === 'life') {
    const again = ({ yes: '愿意再次体验', no: '不打算再次体验', maybe: '也许会再次体验' })[item.again] || '';
    const reflections = (item.reflections || []).map(entry => `<div class="completed-memory"><span class="card-meta">${esc(entry.date || '')} · 新感悟</span><br>${esc(entry.text)}</div>`).join('');
    return swipeCard(item, `<div class="card-head"><div class="card-title">${esc(item.title)}</div><span class="pill">${esc(item.category || '生活')}</span></div><div class="card-meta">${esc(item.completedAt || '')}${item.place ? ` · ${esc(item.place)}` : ''}${again ? ` · ${again}` : ''}</div>${linkView(item.url)}${item.rating ? `<div class="stars">${'★'.repeat(Number(item.rating))}${'☆'.repeat(5 - Number(item.rating))}</div>` : ''}<div class="completed-memory">${esc(item.memory || '已完成这次体验')}</div>${reflections}`);
  }
  return swipeCard(item, `<div class="card-head"><div class="card-title">${esc(item.title)}</div><span class="pill">${stateLabel(item.state)}</span></div><div class="card-meta">${esc(item.tag || '其他')}${item.next ? ` · 下一步：${esc(item.next)}` : ''}</div>${linkView(item.url)}${item.result ? `<div class="completed-memory">${esc(item.result)}</div>` : ''}`);
}

function renderReviews() {
  $('#reviewText').value = data.reviews[day()] || '';
  const entries = Object.entries(data.reviews).filter(([, text]) => text).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  $('#reviewHistory').innerHTML = entries.length ? entries.map(([date, text]) => `<article class="card review-card"><time>${date}</time><p>${esc(text)}</p></article>`).join('') : '<div class="empty">完成一次探索或留下今日复盘后，光会落在这里。</div>';
}

function showView(view) {
  currentView = view;
  $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  $$('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(id) { $(`#${id}`).classList.add('open'); }
function closeModals() { $$('.modal').forEach(modal => modal.classList.remove('open')); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800); }

function openCapture(kind = 'question') {
  captureKind = kind;
  $('#captureForm').reset();
  setCaptureKind(kind);
  openModal('captureModal');
  setTimeout(() => $('#captureTitle').focus(), 100);
}

function setCaptureKind(kind) {
  captureKind = kind;
  $$('[data-capture-tabs] button').forEach(button => button.classList.toggle('active', button.dataset.kind === kind));
  $('#questionFields').hidden = kind !== 'question';
  $('#lifeFields').hidden = kind !== 'life';
  $('#captureTitleLabel').textContent = kind === 'question' ? '我想探索的问题' : '我想体验什么？';
  $('#captureTitle').placeholder = kind === 'question' ? '为什么……？如果……会怎样？' : '一家店、一道菜、一本书、一个地方……';
}

function openContract(id) {
  const item = data.items.find(x => x.id === Number(id));
  if (!item) return;
  $('#contractId').value = item.id;
  $('#contractQuestion').textContent = item.title;
  $('#contractPurpose').value = item.purpose || '';
  $('#contractLevel').value = item.level || '初步理解';
  $('#contractMinutes').value = item.minutes || '45';
  $('#contractDone').value = item.doneWhen || '';
  $('#contractNotNow').value = item.notNow || '';
  $('#contractNext').value = item.next || '';
  openModal('contractModal');
}

function recommend() {
  const selected = name => $(`[data-choice="${name}"] .active`)?.dataset.value;
  const time = selected('time'), energy = selected('energy'), intent = selected('intent');
  let recs = [];
  if (intent === 'main') {
    const active = data.items.find(x => x.kind === 'question' && x.state === 'active');
    if (active) recs.push({ meta: '推进当前探索', title: active.next || active.title, detail: active.doneWhen ? `结束条件：${active.doneWhen}` : '只做一个最小行动', action: 'today' });
    else if (data.plan.monthly) recs.push({ meta: '推进本月问题', title: data.plan.monthly, detail: time === '10' ? '写下一个十分钟内能完成的下一步' : '获取一条新的现实证据', action: 'today' });
    else recs.push({ meta: '先定方向', title: '写下本月唯一主要问题', detail: '没有主线时，不用靠随机新问题填满时间。', action: 'plan' });
  }
  if (intent === 'explore') {
    const short = data.items.filter(x => x.kind === 'question' && x.state === 'shortlist').slice(0, 3);
    recs = short.map(x => ({ meta: '本周候选 · 开始前先定终点', title: x.title, detail: `${x.tag || '其他'} · 建议${time === '10' ? '快速知道' : time === '60' ? '初步理解' : '帮助决定'}`, action: 'contract', id: x.id }));
    if (!recs.length) recs.push({ meta: '还没有本周候选', title: '先去收集箱挑选，最多三个', detail: '不要直接从完整 Inbox 开始无限探索。', action: 'inbox' });
  }
  if (intent === 'life') {
    let pool = data.items.filter(x => x.kind === 'life' && x.state === 'wishlist');
    const exact = pool.filter(x => x.time === time && (x.energy === energy || x.energy === 'low'));
    pool = (exact.length ? exact : pool.filter(x => x.time === time).length ? pool.filter(x => x.time === time) : pool).slice(0, 3);
    recs = pool.map(x => ({ meta: `${x.category || '生活愿望'} · ${stateLabel(x.state)}`, title: x.title, detail: '这是生活，不需要把它研究成项目。', action: 'life', id: x.id }));
    if (!recs.length) recs.push({ meta: '生活愿望还是空的', title: '收下一家店、一道菜、一本书或一个地方', detail: '以后不知道做什么时，它会重新出现。', action: 'capture-life' });
  }
  if (intent === 'recover') {
    const recovery = energy === 'low' ? ['喝水并离开屏幕走动十分钟', '洗澡或安静躺一会儿', '收拾眼前的一小块环境'] : energy === 'mid' ? ['散步二十分钟，不带研究任务', '听一张喜欢的专辑', '给一个长期关心的人发一句问候'] : ['做一段让身体舒展的运动', '去户外走一圈', '处理一个拖着的小生活事务'];
    recs = recovery.slice(0, time === '10' ? 1 : 3).map(title => ({ meta: '恢复不是浪费时间', title, detail: '完成后再决定是否需要探索。', action: 'none' }));
  }
  $('#recommendations').innerHTML = recs.map((rec, index) => `<article class="recommendation"><div class="rec-meta">选择 ${index + 1} · ${esc(rec.meta)}</div><h3>${esc(rec.title)}</h3><p>${esc(rec.detail)}</p>${rec.action !== 'none' ? `<button data-rec-action="${rec.action}" ${rec.id ? `data-id="${rec.id}"` : ''}>就做这个</button>` : ''}</article>`).join('');
  $$('[data-rec-action]').forEach(button => button.addEventListener('click', () => handleRecommendation(button.dataset.recAction, button.dataset.id)));
}

function handleRecommendation(action, id) {
  if (action === 'today') showView('today');
  if (action === 'plan') { $('#annualInput').value = data.plan.annual; $('#monthlyInput').value = data.plan.monthly; openModal('planModal'); }
  if (action === 'inbox') showView('inbox');
  if (action === 'contract') openContract(id);
  if (action === 'capture-life') openCapture('life');
  if (action === 'life') toast('已经选好了，去体验，不必继续比较');
}

function openLifeComplete(id) {
  const item = data.items.find(x => x.id === Number(id));
  if (!item) return;
  $('#lifeCompleteForm').reset();
  $('#lifeCompleteId').value = item.id;
  $('#lifeCompleteTitle').textContent = item.title;
  const editing = item.state === 'done';
  $('#lifeCompleteKicker').textContent = editing ? '体验会继续生长' : '把体验留在生活里';
  $('#lifeCompleteHeading').textContent = editing ? '编辑已完成体验' : '完成一次体验';
  $('#lifeCompleteSubmit').textContent = editing ? '保存修改' : '保存到已完成';
  $('#newReflectionField').hidden = !editing;
  $('#lifeMemory').value = item.memory || '';
  $('#lifeCompletedAt').value = item.completedAt || day();
  $('#lifeAgain').value = item.again || 'maybe';
  $('#lifeRating').value = item.rating || '';
  $('#lifePlace').value = item.place || '';
  $('#lifeCompleteUrl').value = item.url || '';
  openModal('lifeCompleteModal');
}

function openItemEdit(id) {
  const item = data.items.find(x => x.id === Number(id));
  if (!item) return;
  if (item.kind === 'life' && item.state === 'done') return openLifeComplete(id);
  $('#itemEditForm').reset();
  $('#itemEditId').value = item.id;
  $('#itemEditTitle').value = item.title || '';
  const isLife = item.kind === 'life';
  $('#itemEditQuestionFields').hidden = isLife;
  $('#itemEditLifeFields').hidden = !isLife;
  $('#itemEditTitleLabel').textContent = isLife ? '我想体验什么？' : '我想探索的问题';
  if (isLife) {
    $('#itemEditCategory').value = item.category || '其他';
    $('#itemEditTime').value = item.time || '10';
    $('#itemEditEnergy').value = item.energy || 'low';
    $('#itemEditLifeUrl').value = item.url || '';
  } else {
    const completed = ['understood', 'project'].includes(item.state);
    $('#itemEditTag').value = item.tag || '其他';
    $('#itemEditUrl').value = item.url || '';
    $('#itemEditResultField').hidden = !completed;
    $('#itemEditNextField').hidden = !completed;
    $('#itemEditResult').value = item.result || '';
    $('#itemEditNext').value = item.next || '';
  }
  openModal('itemEditModal');
}

function bindSwipeRows() {
  $$('.swipe-row').forEach(row => {
    const content = row.querySelector('.swipe-content');
    let startX = 0;
    let deltaX = 0;
    const settle = () => {
      content.style.transform = '';
      if (deltaX < -35) {
        $$('.swipe-row.open').forEach(other => { if (other !== row) other.classList.remove('open'); });
        row.classList.add('open');
      } else if (deltaX > 35) row.classList.remove('open');
    };
    const move = x => {
      deltaX = x - startX;
      const base = row.classList.contains('open') ? -144 : 0;
      content.style.transform = `translateX(${Math.max(-144, Math.min(0, base + deltaX))}px)`;
    };
    content.onpointerdown = event => { startX = event.clientX; deltaX = 0; content.setPointerCapture(event.pointerId); };
    content.onpointermove = event => {
      if (!content.hasPointerCapture(event.pointerId)) return;
      move(event.clientX);
    };
    content.onpointerup = event => {
      if (content.hasPointerCapture(event.pointerId)) content.releasePointerCapture(event.pointerId);
      settle();
    };
    content.onpointercancel = settle;
    content.ontouchstart = event => { startX = event.touches[0].clientX; deltaX = 0; };
    content.ontouchmove = event => move(event.touches[0].clientX);
    content.ontouchend = settle;
  });
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = { app: 'tanguang', schemaVersion: 3, exportedAt: new Date().toISOString(), data };
  downloadFile(`探光完整备份-${day()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  toast('完整备份已导出');
}

function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function exportCsv(name, headers, rows) {
  const csv = '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(name, csv, 'text/csv;charset=utf-8');
}

function exportQuestionsCsv() {
  exportCsv(`探光-好奇问题-${day()}.csv`, ['标题', '标签', '链接', '状态', '探索层级', '结束条件', '结果', '下一步'], data.items.filter(x => x.kind === 'question').map(x => [x.title, x.tag, x.url, stateLabel(x.state), x.level, x.doneWhen, x.result, x.next]));
}
function exportLifeCsv() {
  exportCsv(`探光-生活体验-${day()}.csv`, ['名称', '类型', '链接', '状态', '完成日期', '最想记住', '新增感悟', '评分', '再次体验', '地点'], data.items.filter(x => x.kind === 'life').map(x => [x.title, x.category, x.url, stateLabel(x.state), x.completedAt, x.memory, (x.reflections || []).map(entry => `${entry.date || ''} ${entry.text}`).join('\n'), x.rating, x.again, x.place]));
}
function exportReviewsCsv() {
  exportCsv(`探光-每日复盘-${day()}.csv`, ['日期', '复盘'], Object.entries(data.reviews).sort((a, b) => b[0].localeCompare(a[0])));
}

function simpleKey(item) { return `${item.kind || 'question'}|${String(item.title || '').trim().toLowerCase()}|${item.createdAt || ''}`; }
function contentKey(item) { const copy = { ...item }; delete copy.id; return JSON.stringify(copy); }

function mergeImport(payload) {
  if (!payload || payload.app !== 'tanguang' || !payload.data || !Array.isArray(payload.data.items)) throw new Error('这不是有效的探光备份文件');
  if (Number(payload.schemaVersion || 0) > 3) throw new Error('备份来自更新版本，请先更新探光');
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  const incoming = normalize(JSON.parse(JSON.stringify(payload.data)));
  const report = { added: 0, skipped: 0, conflicts: 0, plans: 0 };
  const existingSimple = new Map(data.items.map(item => [simpleKey(item), item]));
  const existingIds = new Map(data.items.map(item => [String(item.id), item]));
  incoming.items.forEach(item => {
    const same = existingSimple.get(simpleKey(item));
    if (same && contentKey(same) === contentKey(item)) { report.skipped++; return; }
    const sameId = existingIds.get(String(item.id));
    if (sameId && contentKey(sameId) !== contentKey(item)) { item.id = uid(); report.conflicts++; }
    else if (same) { item.id = uid(); report.conflicts++; }
    data.items.push(item); existingSimple.set(simpleKey(item), item); existingIds.set(String(item.id), item); report.added++;
  });
  Object.entries(incoming.reviews || {}).forEach(([date, text]) => {
    if (!data.reviews[date]) { data.reviews[date] = text; report.added++; }
    else if (data.reviews[date] === text) report.skipped++;
    else { data.reviews[`${date}-导入-${Date.now()}`] = text; report.conflicts++; report.added++; }
  });
  ['annual', 'monthly'].forEach(type => {
    const value = incoming.plan?.[type];
    if (value && value !== data.plan[type]) { data.pendingPlans.push({ id: uid(), type, value, importedAt: new Date().toISOString() }); report.plans++; }
  });
  data.lastImportReport = { ...report, importedAt: new Date().toISOString() };
  return report;
}

function showImportReport(report, showPlans = true) {
  $('#importReportSection').hidden = false;
  $('#importReport').innerHTML = `<div><strong>${report.added}</strong><span>新增</span></div><div><strong>${report.skipped}</strong><span>跳过重复</span></div><div><strong>${report.conflicts}</strong><span>保留冲突</span></div>`;
  if (showPlans && report.plans) {
    $('#planConflicts').innerHTML = data.pendingPlans.slice(-report.plans).map(plan => `<article class="card"><div class="card-meta">${plan.type === 'annual' ? '年度问题' : '月度问题'}</div><div class="card-title">${esc(plan.value)}</div><button class="secondary" type="button" data-action="adopt-plan" data-id="${plan.id}">使用这个问题</button></article>`).join('');
    openModal('planConflictModal');
  }
}

async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    const report = mergeImport(payload);
    save(); openModal('dataToolsModal'); showImportReport(report);
    toast(`导入完成：新增 ${report.added} 条`);
  } catch (error) { toast(error.message || '导入失败，当前数据没有改变'); }
  $('#importFile').value = '';
}

function undoImport() {
  const snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
  if (!snapshot?.data) return toast('没有可以撤销的导入');
  data = normalize(snapshot.data); localStorage.removeItem(SNAPSHOT_KEY); save('已恢复到导入前');
  $('#importReportSection').hidden = true;
}

function bindDynamic() {
  $$('[data-view]').forEach(button => { button.onclick = () => showView(button.dataset.view); });
  $$('[data-action="capture"]').forEach(button => { button.onclick = () => openCapture(); });
  $$('[data-action="data-tools"]').forEach(button => { button.onclick = () => { if (data.lastImportReport) showImportReport(data.lastImportReport, false); openModal('dataToolsModal'); }; });
  $$('[data-action="edit-plan"]').forEach(button => { button.onclick = () => { $('#annualInput').value = data.plan.annual; $('#monthlyInput').value = data.plan.monthly; openModal('planModal'); }; });
  $$('[data-action="shortlist"]').forEach(button => { button.onclick = () => { const short = data.items.filter(x => x.kind === 'question' && x.state === 'shortlist'); if (short.length >= 3) return toast('本周候选最多三个'); const item = data.items.find(x => x.id === Number(button.dataset.id)); item.state = 'shortlist'; save('已加入本周候选'); }; });
  $$('[data-action="unshortlist"]').forEach(button => { button.onclick = () => { data.items.find(x => x.id === Number(button.dataset.id)).state = 'inbox'; save('已放回 Inbox'); }; });
  $$('[data-action="contract"], [data-action="edit-contract"]').forEach(button => { button.onclick = () => openContract(button.dataset.id); });
  $$('[data-action="finish"]').forEach(button => { button.onclick = () => { finishTarget = Number(button.dataset.id); $('#finishForm').reset(); $('#parkBranches').checked = true; openModal('finishModal'); }; });
  $$('[data-action="add-branch"]').forEach(button => { button.onclick = () => { const input = $('#branchInput'); const value = input.value.trim(); if (!value) return; data.items.find(x => x.id === Number(button.dataset.id)).branches.push(value); save('已停放，不切换当前探索'); }; });
  $$('[data-action="delete"]').forEach(button => { button.onclick = () => { data.items = data.items.filter(x => x.id !== Number(button.dataset.id)); save('已删除'); }; });
  $$('[data-action="edit-item"]').forEach(button => { button.onclick = () => openItemEdit(button.dataset.id); });
  $$('[data-action="life-done"]').forEach(button => { button.onclick = () => openLifeComplete(button.dataset.id); });
  $$('[data-action="edit-life-complete"]').forEach(button => { button.onclick = () => openLifeComplete(button.dataset.id); });
  bindSwipeRows();
}

document.addEventListener('click', event => {
  const adoptButton = event.target.closest('[data-action="adopt-plan"]');
  if (adoptButton) {
    const plan = data.pendingPlans.find(x => x.id === Number(adoptButton.dataset.id));
    if (plan) {
      data.plan[plan.type] = plan.value;
      data.pendingPlans = data.pendingPlans.filter(x => x.id !== plan.id);
      adoptButton.closest('.card').remove();
      save('已采用导入的问题');
      if (!$('#planConflicts').children.length) closeModals();
    }
  }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton && viewButton.closest('.nav')) showView(viewButton.dataset.view);
  if (event.target.matches('[data-close]') || (event.target.classList.contains('modal'))) closeModals();
});

$$('[data-choice] button').forEach(button => button.addEventListener('click', () => {
  const group = button.closest('[data-choice]');
  group.querySelectorAll('button').forEach(x => x.classList.remove('active'));
  button.classList.add('active');
}));

$$('[data-inbox-tabs] button').forEach(button => button.addEventListener('click', () => { inboxKind = button.dataset.kind; inboxCategory = '全部'; renderInbox(); }));
$('#inboxSearch').addEventListener('input', event => { inboxSearch = event.target.value.trim(); renderInbox(); });
$('#inboxCategory').addEventListener('change', event => { inboxCategory = event.target.value; renderInbox(); });
$('#captureTitle').addEventListener('paste', event => {
  const pasted = event.clipboardData?.getData('text')?.trim() || '';
  const url = safeUrl(pasted);
  if (!url || !/^https?:\/\//i.test(pasted)) return;
  event.preventDefault();
  $(captureKind === 'question' ? '#questionUrl' : '#lifeUrl').value = url;
  if (!$('#captureTitle').value.trim()) $('#captureTitle').value = `${captureKind === 'question' ? '待探索' : '想体验'}：${new URL(url).hostname.replace(/^www\./, '')}`;
  toast('链接已放入独立字段，可继续修改标题');
});
$$('[data-capture-tabs] button').forEach(button => button.addEventListener('click', () => setCaptureKind(button.dataset.kind)));
$('[data-action="recommend"]').addEventListener('click', recommend);
$('[data-action="save-review"]').addEventListener('click', () => { data.reviews[day()] = $('#reviewText').value.trim(); save('今天的光已保存'); });
$('[data-action="export-json"]').addEventListener('click', exportJson);
$('[data-action="export-questions"]').addEventListener('click', exportQuestionsCsv);
$('[data-action="export-life"]').addEventListener('click', exportLifeCsv);
$('[data-action="export-reviews"]').addEventListener('click', exportReviewsCsv);
$('[data-action="undo-import"]').addEventListener('click', undoImport);
$('#importFile').addEventListener('change', event => { const file = event.target.files[0]; if (file) importBackup(file); });

$('#captureForm').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('#captureTitle').value.trim();
  const createdAt = new Date().toISOString();
  if (captureKind === 'question') data.items.unshift({ id: uid(), kind: 'question', title, tag: $('#questionTag').value, url: safeUrl($('#questionUrl').value), state: 'inbox', branches: [], createdAt });
  else data.items.unshift({ id: uid(), kind: 'life', title, category: $('#lifeCategory').value, time: $('#lifeTime').value, energy: $('#lifeEnergy').value, url: safeUrl($('#lifeUrl').value), state: 'wishlist', branches: [], createdAt });
  closeModals();
  save(captureKind === 'question' ? '已收进 Curiosity Inbox' : '已收进 Life Wishlist');
});

$('#planForm').addEventListener('submit', event => {
  event.preventDefault();
  data.plan.annual = $('#annualInput').value.trim();
  data.plan.monthly = $('#monthlyInput').value.trim();
  closeModals();
  save('方向已更新');
});

$('#itemEditForm').addEventListener('submit', event => {
  event.preventDefault();
  const item = data.items.find(x => x.id === Number($('#itemEditId').value));
  if (!item) return;
  item.title = $('#itemEditTitle').value.trim();
  if (item.kind === 'life') {
    item.category = $('#itemEditCategory').value;
    item.time = $('#itemEditTime').value;
    item.energy = $('#itemEditEnergy').value;
    item.url = safeUrl($('#itemEditLifeUrl').value);
  } else {
    item.tag = $('#itemEditTag').value;
    item.url = safeUrl($('#itemEditUrl').value);
    if (['understood', 'project'].includes(item.state)) {
      item.result = $('#itemEditResult').value.trim();
      item.next = $('#itemEditNext').value.trim();
    }
  }
  item.updatedAt = new Date().toISOString();
  closeModals(); save('已保存修改');
});

$('#lifeCompleteForm').addEventListener('submit', event => {
  event.preventDefault();
  const item = data.items.find(x => x.id === Number($('#lifeCompleteId').value));
  if (!item) return;
  const wasDone = item.state === 'done';
  const newReflection = $('#lifeNewReflection').value.trim();
  if (newReflection) {
    item.reflections ||= [];
    item.reflections.push({ id: uid(), date: day(), text: newReflection });
  }
  Object.assign(item, { state: 'done', memory: $('#lifeMemory').value.trim(), completedAt: $('#lifeCompletedAt').value, again: $('#lifeAgain').value, rating: $('#lifeRating').value, place: $('#lifePlace').value.trim(), url: safeUrl($('#lifeCompleteUrl').value), updatedAt: new Date().toISOString() });
  closeModals(); inboxKind = 'completed'; showView('inbox'); save(wasDone ? '已更新完成档案' : '已保存到完成档案');
});

$('#contractForm').addEventListener('submit', event => {
  event.preventDefault();
  const id = Number($('#contractId').value);
  data.items.filter(x => x.kind === 'question' && x.state === 'active' && x.id !== id).forEach(x => x.state = 'shortlist');
  const item = data.items.find(x => x.id === id);
  Object.assign(item, { state: 'active', purpose: $('#contractPurpose').value.trim(), level: $('#contractLevel').value, minutes: $('#contractMinutes').value, doneWhen: $('#contractDone').value.trim(), notNow: $('#contractNotNow').value.trim(), next: $('#contractNext').value.trim() });
  closeModals();
  showView('today');
  save('终点已经定好，现在只走这一条线');
});

$('#finishForm').addEventListener('submit', event => {
  event.preventDefault();
  const item = data.items.find(x => x.id === finishTarget);
  if (!item) return;
  const result = $('#finishResult').value.trim();
  if ($('#parkBranches').checked) item.branches.forEach(title => data.items.unshift({ id: uid(), kind: 'question', title, tag: item.tag || '其他', state: 'inbox', branches: [] }));
  item.branches = [];
  item.result = result;
  item.state = $('#finishState').value;
  item.updatedAt = new Date().toISOString();
  if (item.state === 'understood' || item.state === 'project') item.completedAt = day();
  item.next = $('#finishNext').value.trim();
  const existing = data.reviews[day()] || '';
  data.reviews[day()] = `${existing}${existing ? '\n\n' : ''}【${item.title}】\n${result}${item.next ? `\n下一步：${item.next}` : ''}`;
  closeModals();
  save('这次探索已经合上');
});

bindDynamic();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

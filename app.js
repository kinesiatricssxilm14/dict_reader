// 数据解析 & UI 逻辑

const els = {
  fileInput: null,
  dropzone: null,
  countInput: null,
  searchInput: null,
  list: null,
  detail: null,
  formatBadge: null,
  sheetBlock: null,
  sheetSelect: null,
  themeToggle: null,
  layoutToggle: null,
  clearBtn: null,
};

const state = {
  format: null,
  items: [],
  filtered: [],
  visibleCount: 5,
  workbook: null,
  sheetNames: [],
  selectedIndex: null,
  // 字段选择
  fieldSet: new Set(),
  fieldMode: 'all', // 'all' | 'only' | 'hide'
  allKeys: [],
  // 多选与专注模式
  selectedIndices: new Set(),
  focusMode: false,
  // 统计相关
  statsTopN: 10,
  statsBins: 10,
  stats: null,
  statsFieldScope: 'all',
  // 布局相关（统计面板）
  statsTablePct: 50,
  statsBarPct: 60,
  statsField: null,
  statsChartMode: 'both',
  lastFileName: null,
};

function init() {
  try {
    bindEls();
    // 读取统计布局与图形偏好
    try {
      const t = parseInt(localStorage.getItem('data-viewer-statsTablePct') || '50', 10);
      const b = parseInt(localStorage.getItem('data-viewer-statsBarPct') || '60', 10);
      const m = localStorage.getItem('data-viewer-statsChartMode') || 'both';
      if (!isNaN(t)) state.statsTablePct = Math.max(20, Math.min(80, t));
      if (!isNaN(b)) state.statsBarPct = Math.max(20, Math.min(80, b));
      state.statsChartMode = (m === 'bar' || m === 'pie' || m === 'both') ? m : 'both';
      if (els.statsTablePct) els.statsTablePct.value = String(state.statsTablePct);
      if (els.statsBarPct) els.statsBarPct.value = String(state.statsBarPct);
      if (els.statsTablePctLabel) els.statsTablePctLabel.textContent = state.statsTablePct + '%';
      if (els.statsBarPctLabel) els.statsBarPctLabel.textContent = `${state.statsBarPct}% / ${100 - state.statsBarPct}%`;
      if (els.statsChartMode) els.statsChartMode.value = state.statsChartMode;
    } catch {}
    bindEvents();
    render();
    // 初始应用统计面板布局（表格与图表比例）
    applyStatsLayout();
  } catch (err) {
    console.error('初始化失败:', err);
    // 在统计区域给出错误提示，避免“无响应”的错觉
    const chart = document.getElementById('statsChart');
    if (chart) {
      chart.innerHTML = '';
      const e = document.createElement('div');
      e.className = 'detail-empty';
      e.textContent = '初始化失败：' + err.message;
      chart.appendChild(e);
    }
    const status = document.getElementById('statsStatus');
    if (status) status.textContent = '初始化失败：' + err.message;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function bindEls() {
  els.fileInput = document.getElementById('fileInput');
  els.dropzone = document.getElementById('dropzone');
  els.countInput = document.getElementById('countInput');
  els.searchInput = document.getElementById('searchInput');
  els.list = document.getElementById('listContainer');
  els.detail = document.getElementById('detailContainer');
  els.formatBadge = document.getElementById('formatBadge');
  els.sheetBlock = document.getElementById('sheetBlock');
  els.sheetSelect = document.getElementById('sheetSelect');
  els.themeToggle = document.getElementById('themeToggle');
  els.layoutToggle = document.getElementById('layoutToggle');
  els.clearBtn = document.getElementById('clearBtn');
  // 新增字段与专注相关元素
  els.fieldModeSelect = document.getElementById('fieldModeSelect');
  els.fieldsBlock = document.getElementById('fieldsBlock');
  els.fieldsToggle = document.getElementById('fieldsToggle');
  els.fieldsPanel = document.getElementById('fieldsPanel');
  els.fieldsSearch = document.getElementById('fieldsSearch');
  els.fieldsList = document.getElementById('fieldsList');
  els.focusToggle = document.getElementById('focusToggle');
  // 全选/全不选按钮
  els.itemsSelectAll = document.getElementById('itemsSelectAll');
  els.itemsSelectNone = document.getElementById('itemsSelectNone');
  els.fieldsSelectAll = document.getElementById('fieldsSelectAll');
  els.fieldsSelectNone = document.getElementById('fieldsSelectNone');
  // 统计面板元素
  els.statsBlock = document.getElementById('statsBlock');
  els.statsTopN = document.getElementById('statsTopN');
  els.statsBins = document.getElementById('statsBins');
  els.statsComputeBtn = document.getElementById('statsComputeBtn');
  els.statsFieldScope = document.getElementById('statsFieldScope');
  els.statsTable = document.getElementById('statsTable');
  els.statsChart = document.getElementById('statsChart');
  els.statsStatus = document.getElementById('statsStatus');
  // 新增可调布局控件
  els.statsTablePct = document.getElementById('statsTablePct');
  els.statsBarPct = document.getElementById('statsBarPct');
  els.statsTablePctLabel = document.getElementById('statsTablePctLabel');
  els.statsBarPctLabel = document.getElementById('statsBarPctLabel');
  els.statsBody = document.getElementById('statsBody');
  els.statsChartMode = document.getElementById('statsChartMode');
}

function bindEvents() {
  if (els.fileInput) {
    els.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleFile(file);
        // 重置 input 的值，避免选择同一文件不触发 change（看起来像要点两次）
        try { e.target.value = ''; } catch {}
      }
    });
  }

  // Drag & drop
  if (els.dropzone) {
    ['dragenter','dragover'].forEach(ev => {
      els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); els.dropzone.classList.add('dragover'); });
    });
    ['dragleave','drop'].forEach(ev => {
      els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); els.dropzone.classList.remove('dragover'); });
    });
    // 兼容某些浏览器对透明 file input 的点击不响应：点击整个拖拽区触发文件选择
    els.dropzone.addEventListener('click', () => {
      if (els.fileInput) els.fileInput.click();
    });
    els.dropzone.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) await handleFile(file);
    });
  }

  if (els.countInput) {
    els.countInput.addEventListener('input', () => {
      const v = parseInt(els.countInput.value || '50', 10);
      state.visibleCount = Math.max(1, Math.min(10000, v));
      renderList();
    });
  }

  if (els.searchInput) {
    els.searchInput.addEventListener('input', () => {
      applyFilter();
    });
  }

  if (els.sheetSelect) {
    els.sheetSelect.addEventListener('change', () => {
      if (!state.workbook) return;
      const sheetName = els.sheetSelect.value;
      const ws = state.workbook.Sheets[sheetName];
      state.items = XLSX.utils.sheet_to_json(ws, { defval: null });
      state.filtered = state.items.slice();
      renderBadge('xlsx');
      renderList();
    });
  }

  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
    });
  }

  // 布局切换：分栏/单列
  if (els.layoutToggle) {
    els.layoutToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const curr = html.getAttribute('data-layout') || 'split';
      const next = curr === 'split' ? 'stacked' : 'split';
      html.setAttribute('data-layout', next);
      try { localStorage.setItem('data-viewer-layout', next); } catch {}
    });
  }

  if (els.clearBtn) {
    els.clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearAll();
    });
  }

  // 字段显示模式
  if (els.fieldModeSelect) {
    els.fieldModeSelect.addEventListener('change', () => {
      state.fieldMode = els.fieldModeSelect.value;
      renderList();
      renderDetail();
      // 自动刷新统计
      computeStats();
      renderStats();
    });
  }
  // 字段面板开关
  if (els.fieldsToggle && els.fieldsPanel) {
    els.fieldsToggle.addEventListener('click', () => {
      const show = els.fieldsPanel.style.display !== 'none';
      els.fieldsPanel.style.display = show ? 'none' : '';
    });
  }
  // 字段搜索
  if (els.fieldsSearch) {
    els.fieldsSearch.addEventListener('input', () => renderFieldsPanel());
  }
  // 专注模式
  if (els.focusToggle) {
    els.focusToggle.addEventListener('click', () => {
      state.focusMode = !state.focusMode;
      document.documentElement.setAttribute('data-focus', state.focusMode ? 'on' : 'off');
    });
  }

  // 条目全选/全不选（针对当前显示的第 visibleCount 条）
  if (els.itemsSelectAll) {
    els.itemsSelectAll.addEventListener('click', () => {
      state.selectedIndices.clear();
      const count = Math.min(state.filtered.length, state.visibleCount);
      for (let i = 0; i < count; i++) state.selectedIndices.add(i);
      renderList();
      renderDetail();
    });
  }
  if (els.itemsSelectNone) {
    els.itemsSelectNone.addEventListener('click', () => {
      state.selectedIndices.clear();
      renderList();
      renderDetail();
    });
  }

  // 字段全选/全不选
  if (els.fieldsSelectAll) {
    els.fieldsSelectAll.addEventListener('click', () => {
      state.fieldSet = new Set(state.allKeys);
      renderFieldsPanel();
      renderList();
      renderDetail();
    });
  }
  if (els.fieldsSelectNone) {
    els.fieldsSelectNone.addEventListener('click', () => {
      state.fieldSet.clear();
      renderFieldsPanel();
      renderList();
      renderDetail();
    });
  }

  // 统计配置与计算
  if (els.statsTopN) {
    els.statsTopN.addEventListener('input', () => {
      const v = parseInt(els.statsTopN.value || '10', 10);
      state.statsTopN = Math.max(1, Math.min(50, v));
    });
  }
  if (els.statsBins) {
    els.statsBins.addEventListener('input', () => {
      const v = parseInt(els.statsBins.value || '10', 10);
      state.statsBins = Math.max(3, Math.min(50, v));
    });
  }
  // 布局滑块：表格宽度
  if (els.statsTablePct) {
    els.statsTablePct.addEventListener('input', () => {
      const v = parseInt(els.statsTablePct.value || '50', 10);
      state.statsTablePct = Math.max(20, Math.min(80, v));
      if (els.statsTablePctLabel) els.statsTablePctLabel.textContent = state.statsTablePct + '%';
      try { localStorage.setItem('data-viewer-statsTablePct', String(state.statsTablePct)); } catch {}
      applyStatsLayout();
    });
  }
  // 布局滑块：条形/饼图比例
  if (els.statsBarPct) {
    els.statsBarPct.addEventListener('input', () => {
      const v = parseInt(els.statsBarPct.value || '60', 10);
      state.statsBarPct = Math.max(20, Math.min(80, v));
      if (els.statsBarPctLabel) els.statsBarPctLabel.textContent = `${state.statsBarPct}% / ${100 - state.statsBarPct}%`;
      try { localStorage.setItem('data-viewer-statsBarPct', String(state.statsBarPct)); } catch {}
      if (state.statsField) {
        renderStatsChart(state.statsField);
      }
    });
  }
  if (els.statsChartMode) {
    els.statsChartMode.addEventListener('change', () => {
      state.statsChartMode = els.statsChartMode.value || 'both';
      try { localStorage.setItem('data-viewer-statsChartMode', state.statsChartMode); } catch {}
      if (state.statsField) renderStatsChart(state.statsField);
    });
  }
  if (els.statsComputeBtn) {
    els.statsComputeBtn.addEventListener('click', () => {
      try {
        computeStats();
        renderStats();
        const keys = Object.keys(state.stats || {});
        updateStatsStatus(keys.length > 0
          ? `已计算 ${keys.length} 个字段 · 基于 ${state.filtered.length} 条记录`
          : `暂无统计数据：请加载文件或调整“统计字段范围/管理字段”`);
      } catch (err) {
        console.error('统计失败:', err);
        updateStatsStatus('统计失败：' + err.message);
        if (els.statsChart) {
          els.statsChart.innerHTML = '';
          const e = document.createElement('div'); e.className = 'detail-empty'; e.textContent = '统计失败：' + err.message; els.statsChart.appendChild(e);
        }
      }
    });
  }
  if (els.statsFieldScope) {
    els.statsFieldScope.addEventListener('change', () => {
      state.statsFieldScope = els.statsFieldScope.value || 'all';
      computeStats();
      renderStats();
      const keys = Object.keys(state.stats || {});
      updateStatsStatus(keys.length > 0
        ? `已计算 ${keys.length} 个字段 · 基于 ${state.filtered.length} 条记录`
        : `暂无统计数据：请在“管理字段”勾选或切到“全部字段”`);
    });
  }
}

function clearAll() {
  state.format = null;
  state.items = [];
  state.filtered = [];
  state.visibleCount = 5;
  state.workbook = null;
  state.sheetNames = [];
  state.selectedIndex = null;
  state.selectedIndices.clear();
  state.fieldSet.clear();
  state.fieldMode = 'all';
  state.allKeys = [];
  state.lastFileName = null;
  els.countInput.value = '5';
  els.searchInput.value = '';
  els.fileInput.value = '';
  els.sheetBlock.style.display = 'none';
  els.sheetSelect.innerHTML = '';
  if (els.fieldModeSelect) els.fieldModeSelect.value = 'all';
  if (els.fieldsPanel) els.fieldsPanel.style.display = 'none';
  if (els.fieldsList) els.fieldsList.innerHTML = '';
  // 清理统计面板
  state.stats = null;
  if (els.statsTable) els.statsTable.innerHTML = '';
  if (els.statsChart) els.statsChart.innerHTML = '';
  render();
}

async function handleFile(file) {
  try {
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    let result;
    if (ext === 'json') {
      result = await parseJSON(file);
      state.format = 'json';
    } else if (ext === 'csv') {
      if (typeof Papa === 'undefined') throw new Error('CSV 解析库未加载。请使用 start.command 或在终端运行: python3 -m http.server 8000');
      result = await parseCSV(file);
      state.format = 'csv';
    } else if (ext === 'jsonl') {
      result = await parseJSONL(file);
      state.format = 'jsonl';
    } else if (ext === 'xlsx') {
      if (typeof XLSX === 'undefined') throw new Error('XLSX 解析库未加载。请使用 start.command 或在终端运行: python3 -m http.server 8000');
      result = await parseXLSX(file);
      state.format = 'xlsx';
    } else {
      throw new Error('不支持的文件类型：' + ext);
    }

    state.items = result.items;
    state.filtered = state.items.slice();
    state.workbook = result.workbook || null;
  state.sheetNames = result.sheetNames || [];
  state.selectedIndices.clear();
  state.lastFileName = name;

    // 收集字段
    state.allKeys = collectAllKeys(state.items);
    renderFieldsPanel();

    if (state.format === 'xlsx' && state.sheetNames.length > 0) {
      els.sheetBlock.style.display = '';
      els.sheetSelect.innerHTML = state.sheetNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    } else {
      els.sheetBlock.style.display = 'none';
      els.sheetSelect.innerHTML = '';
    }

    renderBadge(state.format);
    renderList();
  // 初次加载后默认计算一次统计
  computeStats();
  renderStats();
  // 显示已加载文件信息（文件名、格式与记录数）
  updateStatsStatus(`已加载：${name} · 格式：${(state.format||'').toUpperCase()} · 记录数：${state.items.length}`);
  } catch (err) {
    alert('解析失败：' + err.message);
    console.error(err);
  }
}

function render() {
  // 读取布局偏好
  try {
    const saved = localStorage.getItem('data-viewer-layout');
    if (saved) document.documentElement.setAttribute('data-layout', saved);
  } catch {}
  renderBadge(state.format);
  renderList();
  renderDetail();
  // 初始渲染统计区域（无数据时给出提示）
  renderStats();
  updateStatsStatus('请先加载文件或选择字段，然后点击“计算分布”');
  // 应用初始统计布局
  applyStatsLayout();
}

function renderBadge(fmt) {
  if (!els.formatBadge) return;
  const name = state.lastFileName || '';
  const count = state.items.length || 0;
  els.formatBadge.textContent = fmt ? `${fmt.toUpperCase()} · ${name || '—'} · ${count}条` : '—';
}

function applyFilter() {
  const q = (els.searchInput.value || '').trim().toLowerCase();
  if (!q) {
    state.filtered = state.items.slice();
  } else {
    state.filtered = state.items.filter(it => {
      try {
        const s = JSON.stringify(it);
        return s.toLowerCase().includes(q);
      } catch { return false; }
    });
  }
  renderList();
  // 自动刷新统计
  computeStats();
  renderStats();
  applyStatsLayout();
}

function renderList() {
  const list = els.list;
  list.innerHTML = '';
  const items = state.filtered.slice(0, state.visibleCount);
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = '暂无数据，请选择文件或检查筛选条件';
    list.appendChild(empty);
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'card';

    const top = document.createElement('div');
    top.className = 'card-top';
    const indexEl = document.createElement('div');
    indexEl.className = 'index';
    indexEl.textContent = `#${idx + 1}`;
    const formatEl = document.createElement('div');
    formatEl.className = 'count';
    formatEl.textContent = summaryCount(item);
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.className = 'selectbox';
    select.checked = state.selectedIndices.has(idx);
    select.addEventListener('click', (e) => {
      e.stopPropagation();
      if (select.checked) state.selectedIndices.add(idx);
      else state.selectedIndices.delete(idx);
      renderDetail();
    });
    top.appendChild(indexEl);
    top.appendChild(formatEl);
    top.appendChild(select);
    card.appendChild(top);

    const chips = document.createElement('div');
    chips.className = 'chipset';
    if ('__key' in item) {
      if (shouldShowKey('__key')) {
        const c1 = document.createElement('div'); c1.className = 'chip'; c1.textContent = `key: ${previewValue(item.__key)}`; chips.appendChild(c1);
      }
      if (shouldShowKey('__value')) {
        const c2 = document.createElement('div'); c2.className = 'chip'; c2.textContent = `value: ${previewValue(item.__value)}`; chips.appendChild(c2);
      }
    } else {
      getKeyPreview(item).filter(shouldShowKey).forEach(k => {
        const c = document.createElement('div');
        c.className = 'chip';
        c.textContent = `${k}: ${previewValue(item[k])}`;
        chips.appendChild(c);
      });
    }
    card.appendChild(chips);

    card.addEventListener('click', () => {
      state.selectedIndex = idx;
      renderDetail();
    });

    list.appendChild(card);
  });
}

function renderDetail() {
  const d = els.detail;
  d.innerHTML = '';
  // 如果多选有内容，渲染多条详情
  if (state.selectedIndices.size > 0) {
    const header = document.createElement('div');
    header.className = 'detail-actions';
    const title = document.createElement('div');
    title.textContent = `详情 · 已选 ${state.selectedIndices.size} 条`;
    header.appendChild(title);
    const toolbar = document.createElement('div'); toolbar.className = 'toolbar';
    const copyAll = document.createElement('button'); copyAll.className = 'btn'; copyAll.textContent = '复制已选 JSON';
    copyAll.addEventListener('click', () => {
      const arr = Array.from(state.selectedIndices).map(i => state.filtered[i]);
      navigator.clipboard.writeText(JSON.stringify(arr, null, 2));
    });
    toolbar.appendChild(copyAll);
    d.appendChild(header); d.appendChild(toolbar);

    const container = document.createElement('div');
    container.className = 'viewer-group';
    Array.from(state.selectedIndices).forEach(i => {
      const block = document.createElement('div');
      block.style.marginBottom = '12px';
      const t = document.createElement('div'); t.className = 'detail-empty'; t.textContent = `第 ${i + 1} 条`; block.appendChild(t);
      block.appendChild(renderItemViewer(state.filtered[i]));
      container.appendChild(block);
    });
    d.appendChild(container);
    return;
  }

  const idx = state.selectedIndex;
  if (idx == null) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = '选择左侧一条数据查看详情';
    d.appendChild(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'detail-actions';
  const title = document.createElement('div');
  title.textContent = `详情 · 第 ${idx + 1} 条`;
  header.appendChild(title);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = '复制 JSON';
  copyBtn.addEventListener('click', () => {
    const it = state.filtered[idx];
    navigator.clipboard.writeText(JSON.stringify(it, null, 2));
  });
  toolbar.appendChild(copyBtn);

  header.appendChild(toolbar);
  d.appendChild(header);

  const it = state.filtered[idx];
  d.appendChild(renderItemViewer(it));
}

// JSON viewer
function renderJsonNode(value, key) {
  const node = document.createElement('div');
  node.className = 'node';

  if (Array.isArray(value)) {
    const head = document.createElement('div');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '[...] 展开';
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = ` (${value.length} 项)`;
    head.appendChild(toggle);
    head.appendChild(count);

    const body = document.createElement('div');
    body.style.display = 'none';
    value.forEach((v, i) => {
      const pair = document.createElement('div');
      pair.className = 'pair';
      const k = document.createElement('span');
      k.className = 'key';
      k.textContent = i + ':';
      const val = document.createElement('div');
      val.appendChild(renderJsonLeaf(v));
      pair.appendChild(k);
      pair.appendChild(val);
      body.appendChild(pair);
    });

    toggle.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      toggle.textContent = open ? '[...] 展开' : '[–] 收起';
    });

    node.appendChild(head);
    node.appendChild(body);
    return node;
  }

  if (isObject(value)) {
    const head = document.createElement('div');
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '{...} 展开';
    const count = document.createElement('span');
    count.className = 'count';
    const keys = Object.keys(value).filter(shouldShowKey);
    count.textContent = ` (${keys.length} 键)`;
    head.appendChild(toggle);
    head.appendChild(count);

    const body = document.createElement('div');
    body.style.display = 'none';
    keys.forEach((k) => {
      const pair = document.createElement('div');
      pair.className = 'pair';
      const keyEl = document.createElement('span');
      keyEl.className = 'key';
      keyEl.textContent = k + ':';
      const val = document.createElement('div');
      val.appendChild(renderJsonLeaf(value[k]));
      pair.appendChild(keyEl);
      pair.appendChild(val);
      body.appendChild(pair);
    });

    toggle.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      toggle.textContent = open ? '{...} 展开' : '{–} 收起';
    });

    node.appendChild(head);
    node.appendChild(body);
    return node;
  }

  // primitive
  const pair = document.createElement('div');
  pair.className = 'pair';
  const keyEl = document.createElement('span');
  keyEl.className = 'key';
  keyEl.textContent = (key ?? '') + (key ? ':' : '');
  const val = document.createElement('div');
  val.appendChild(renderJsonLeaf(value));
  pair.appendChild(keyEl);
  pair.appendChild(val);
  node.appendChild(pair);
  return node;
}

function renderJsonLeaf(v) {
  if (v === null) {
    const s = document.createElement('span'); s.className = 'val null'; s.textContent = 'null'; return s;
  }
  if (Array.isArray(v) || isObject(v)) return renderJsonNode(v);
  const span = document.createElement('span');
  if (typeof v === 'string') { span.className = 'val str'; span.textContent = '"' + v + '"'; }
  else if (typeof v === 'number') { span.className = 'val num'; span.textContent = String(v); }
  else if (typeof v === 'boolean') { span.className = 'val bool'; span.textContent = String(v); }
  else { span.textContent = String(v); }
  return span;
}

function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

// helpers for list preview
function getKeyPreview(obj, limit = 4) {
  if (!isObject(obj)) return ['值'];
  const keys = Object.keys(obj);
  return keys.filter(shouldShowKey).slice(0, limit);
}
function previewValue(v) {
  try {
    if (v == null) return 'null';
    if (typeof v === 'string') return v.length > 24 ? v.slice(0, 24) + '…' : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[${v.length}]`;
    if (isObject(v)) return '{…}';
    return String(v);
  } catch { return ''; }
}
function summaryCount(item) {
  if (Array.isArray(item)) return `[数组 ${item.length}]`;
  if (isObject(item)) return `{对象 ${Object.keys(item).length} 键}`;
  return '基本类型';
}

// parsing functions
async function parseJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (isObject(data)) {
    const keys = Object.keys(data);
    items = keys.map(k => ({ __key: k, __value: data[k] }));
  } else {
    items = [data];
  }
  return { items };
}

async function parseJSONL(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const items = [];
  for (const line of lines) {
    try { items.push(JSON.parse(line)); }
    catch (e) { console.warn('跳过无法解析的行:', line); }
  }
  return { items };
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (res) => {
        resolve({ items: res.data });
      },
      error: reject,
    });
  });
}

async function parseXLSX(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheetNames = wb.SheetNames;
  const ws = wb.Sheets[sheetNames[0]];
  const items = XLSX.utils.sheet_to_json(ws, { defval: null });
  return { items, workbook: wb, sheetNames };
}

// utils
function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

function shouldShowKey(k) {
  if (!k) return true;
  if (state.fieldMode === 'all') return true;
  const has = state.fieldSet.has(k);
  if (state.fieldMode === 'only') return has;
  if (state.fieldMode === 'hide') return !has;
  return true;
}

function collectAllKeys(items, max = 300) {
  const set = new Set();
  const n = Math.min(items.length, max);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    if (isObject(it)) Object.keys(it).forEach(k => set.add(k));
    if ('__key' in it) set.add('__key');
    if ('__value' in it) set.add('__value');
  }
  return Array.from(set).sort();
}

function renderFieldsPanel() {
  if (!els.fieldsList) return;
  const q = (els.fieldsSearch?.value || '').toLowerCase();
  const frag = document.createDocumentFragment();
  state.allKeys.filter(k => k.toLowerCase().includes(q)).forEach(k => {
    const wrap = document.createElement('label');
    wrap.className = 'field-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = state.fieldSet.has(k);
    cb.addEventListener('change', () => {
      if (cb.checked) state.fieldSet.add(k); else state.fieldSet.delete(k);
      renderList(); renderDetail();
      // 自动刷新统计
      computeStats();
      renderStats();
    });
    const txt = document.createElement('span'); txt.textContent = k;
    wrap.appendChild(cb); wrap.appendChild(txt);
    frag.appendChild(wrap);
  });
  els.fieldsList.innerHTML = '';
  els.fieldsList.appendChild(frag);
}

function renderItemViewer(it) {
  const container = document.createElement('div');
  if ('__key' in it && shouldShowKey('__key')) {
    const keyRow = document.createElement('div');
    keyRow.className = 'pair';
    const k = document.createElement('span'); k.className = 'key'; k.textContent = '字典键:';
    const v = document.createElement('div'); v.appendChild(renderJsonLeaf(it.__key));
    keyRow.appendChild(k); keyRow.appendChild(v);
    container.appendChild(keyRow);
  }
  if ('__value' in it) {
    if (shouldShowKey('__value')) {
      const viewer = document.createElement('div');
      viewer.className = 'jv';
      viewer.appendChild(renderJsonNode(it.__value));
      container.appendChild(viewer);
    }
  } else {
    const viewer = document.createElement('div');
    viewer.className = 'jv';
    viewer.appendChild(renderJsonNode(it));
    container.appendChild(viewer);
  }
  return container;
}

// =============================
// 统计：计算与渲染
// =============================
function typeOfValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'string' | 'number' | 'boolean' | 'object' | 'undefined'
}

function computeStats() {
  const items = state.filtered;
  const stats = Object.create(null);
  const considerKey = (k) => {
    if (state.statsFieldScope === 'selected') return state.fieldSet.has(k);
    // 统计范围为“全部字段”时，不受字段显示模式影响，直接统计所有键
    return true;
  };
  const maxIter = Math.min(items.length, 5000); // 上限避免极端大数据耗时
  for (let i = 0; i < maxIter; i++) {
    const it = items[i];
    let keys;
    if ('__key' in it || '__value' in it) keys = Object.keys(it);
    else keys = isObject(it) ? Object.keys(it) : [];
    keys.filter(considerKey).forEach((k) => {
      const v = it[k];
      if (!stats[k]) stats[k] = {
        nonNull: 0,
        nulls: 0,
        types: { string:0, number:0, boolean:0, object:0, array:0, null:0, undefined:0 },
        unique: new Map(),
        bool: { true:0, false:0 },
        nums: [],
        arrLens: [],
      };
      const s = stats[k];
      const t = typeOfValue(v);
      s.types[t] = (s.types[t] || 0) + 1;
      if (v == null) { s.nulls++; return; }
      s.nonNull++;
      if (t === 'number') {
        s.nums.push(v);
        const key = String(v);
        s.unique.set(key, (s.unique.get(key) || 0) + 1);
      } else if (t === 'boolean') {
        s.bool[v ? 'true' : 'false']++;
        const key = String(v);
        s.unique.set(key, (s.unique.get(key) || 0) + 1);
      } else if (t === 'string') {
        const key = v;
        s.unique.set(key, (s.unique.get(key) || 0) + 1);
      } else if (t === 'array') {
        s.arrLens.push(v.length);
      } else if (t === 'object') {
        // 对象不做唯一统计，主要展示类型与出现次数
      }
    });
  }
  // 汇总派生指标
  Object.keys(stats).forEach((k) => {
    const s = stats[k];
    s.uniqueCount = s.unique.size;
    // TopN
    const entries = Array.from(s.unique.entries());
    entries.sort((a, b) => b[1] - a[1]);
    s.topValues = entries.slice(0, state.statsTopN).map(([label, count]) => ({ label, count, ratio: s.nonNull ? count / s.nonNull : 0 }));
    // 数值统计
    if (s.nums.length > 0) {
      const min = Math.min(...s.nums);
      const max = Math.max(...s.nums);
      const mean = s.nums.reduce((p, c) => p + c, 0) / s.nums.length;
      s.numStats = { min, max, mean };
      s.hist = computeHistogram(s.nums, state.statsBins);
    }
    // 数组长度分布（粗略分箱）
    if (s.arrLens.length > 0) {
      s.arrHist = computeHistogram(s.arrLens, Math.min(8, state.statsBins));
    }
    // 主要类型
    const types = s.types;
    const mainType = Object.keys(types).sort((a,b) => types[b]-types[a])[0] || '—';
    s.mainType = mainType;
  });
  state.stats = stats;
}

function computeHistogram(values, bins = 10) {
  if (!values || values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: String(min), count: values.length, ratio: 1 }];
  const step = (max - min) / bins;
  const hist = Array.from({ length: bins }, (_, i) => ({ label: `${(min + i*step).toFixed(2)}–${(min + (i+1)*step).toFixed(2)}`, count: 0, ratio: 0 }));
  values.forEach(v => {
    let idx = Math.floor((v - min) / step);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    hist[idx].count++;
  });
  const total = values.length;
  hist.forEach(h => { h.ratio = total ? h.count / total : 0; });
  return hist;
}

function renderStats() {
  if (!els.statsTable) return;
  const container = els.statsTable;
  container.innerHTML = '';
  const stats = state.stats || {};
  const keys = Object.keys(stats);
  if (keys.length === 0) {
    const empty = document.createElement('div'); empty.className = 'detail-empty'; empty.textContent = '暂无统计数据。请将统计字段范围设为“全部字段”，或在“管理字段”中勾选至少一个字段。'; container.appendChild(empty);
    if (els.statsChart) { els.statsChart.innerHTML = ''; }
    updateStatsStatus('暂无统计数据：请加载文件或调整“统计字段范围/管理字段”');
    return;
  }
  updateStatsStatus(`已计算 ${keys.length} 个字段 · 基于 ${state.filtered.length} 条记录`);
  // 表头
  const head = document.createElement('div'); head.className = 'stats-row head';
  head.innerHTML = '<div class="col field">字段</div><div class="col type">类型</div><div class="col nonnull">非空</div><div class="col nulls">空值</div><div class="col unique">唯一</div><div class="col top">TopN 预览(比例)</div>';
  container.appendChild(head);
  // 数据行
  keys.forEach((k, i) => {
    const s = stats[k];
    const row = document.createElement('div'); row.className = 'stats-row'; row.dataset.field = k;
    const topPreview = (s.topValues || []).slice(0, 3).map(tv => `${escapeHtml(tv.label)} (${tv.count}, ${(tv.ratio*100).toFixed(1)}%)`).join(' | ');
    row.innerHTML = `
      <div class="col field">${escapeHtml(k)}</div>
      <div class="col type">${escapeHtml(s.mainType)}</div>
      <div class="col nonnull">${s.nonNull}</div>
      <div class="col nulls">${s.nulls}</div>
      <div class="col unique">${s.uniqueCount || 0}</div>
      <div class="col top">${topPreview || '—'}</div>
    `;
    row.addEventListener('click', () => { state.statsField = k; renderStatsChart(k); });
    container.appendChild(row);
    if (i === 0) { state.statsField = k; renderStatsChart(k); }
  });
}

function renderStatsChart(field) {
  if (!els.statsChart) return;
  const box = els.statsChart; box.innerHTML = '';
  const s = state.stats?.[field];
  if (!s) { box.textContent = '无数据'; return; }
  state.statsField = field;
  const title = document.createElement('div'); title.className = 'detail-actions'; title.textContent = `字段「${field}」分布`;
  box.appendChild(title);

  let data = null; let kind = '';
  if (s.nums && s.nums.length > 0 && s.hist && s.hist.length > 0) { data = s.hist; kind = '数值分布'; }
  else if (s.arrLens && s.arrLens.length > 0 && s.arrHist && s.arrHist.length > 0) { data = s.arrHist; kind = '数组长度分布'; }
  else if ((s.bool.true + s.bool.false) > 0) {
    const total = (s.bool.true + s.bool.false) || 1;
    data = [
      { label: 'true', count: s.bool.true, ratio: s.bool.true / total },
      { label: 'false', count: s.bool.false, ratio: s.bool.false / total }
    ];
    kind = '布尔分布';
  } else if (s.topValues && s.topValues.length > 0) { data = s.topValues; kind = 'Top 值分布'; }

  if (!data) { const empty = document.createElement('div'); empty.className = 'detail-empty'; empty.textContent = '暂无可视化数据'; box.appendChild(empty); return; }

  const stack = document.createElement('div'); stack.className = 'chart-stack';
  const boxBar = document.createElement('div'); boxBar.className = 'chart-box';
  const boxPie = document.createElement('div'); boxPie.className = 'chart-box';

  // 条形图
  const subtitleBar = document.createElement('div'); subtitleBar.className = 'chart-subtitle'; subtitleBar.textContent = `${kind}（条形图）`;
  boxBar.appendChild(subtitleBar);
  const chart = document.createElement('div'); chart.className = 'bars';
  const max = Math.max(...data.map(d => d.count));
  data.forEach(d => {
    const row = document.createElement('div'); row.className = 'bar-row';
    const label = document.createElement('div'); label.className = 'bar-label'; label.textContent = d.label;
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('div'); fill.className = 'bar-fill';
    const widthPct = (typeof d.ratio === 'number') ? (d.ratio * 100) : (max ? (d.count / max * 100) : 0);
    fill.style.width = widthPct + '%';
    const val = document.createElement('div'); val.className = 'bar-value';
    const pct = (typeof d.ratio === 'number') ? ` ${(d.ratio*100).toFixed(1)}%` : '';
    val.textContent = `${d.count}${pct}`;
    row.title = `${d.label}: ${d.count}${pct ? ' (' + (d.ratio*100).toFixed(1) + '%)' : ''}`;
    bar.appendChild(fill); row.appendChild(label); row.appendChild(bar); row.appendChild(val);
    chart.appendChild(row);
  });
  boxBar.appendChild(chart);

  // 饼图
  const subtitlePie = document.createElement('div'); subtitlePie.className = 'chart-subtitle'; subtitlePie.textContent = `${kind}（饼图）`;
  boxPie.appendChild(subtitlePie);
  const pie = document.createElement('div'); pie.className = 'pie';
  const legend = document.createElement('div'); legend.className = 'pie-legend';
  const colors = ['#4f8cff','#7c5cff','#10b981','#f59e0b','#06b6d4','#ef4444','#22c55e','#8b5cf6','#14b8a6','#f97316','#eab308','#8dd3c7','#fb9a99'];
  const totalCount = data.reduce((p,c) => p + (typeof c.count === 'number' ? c.count : 0), 0) || 1;
  let acc = 0;
  const stops = data.map((d, i) => {
    const ratio = typeof d.ratio === 'number' ? d.ratio : (d.count / totalCount);
    const start = acc * 100; acc += ratio; const end = acc * 100;
    const color = colors[i % colors.length];
    const li = document.createElement('div'); li.className = 'legend-item';
    const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = color;
    const name = document.createElement('span'); name.textContent = d.label;
    const val = document.createElement('span'); val.className = 'muted'; val.textContent = `${d.count}（${(ratio*100).toFixed(1)}%）`;
    li.title = `${d.label}: ${d.count}（${(ratio*100).toFixed(1)}%）`;
    li.appendChild(sw); li.appendChild(name); li.appendChild(val);
    legend.appendChild(li);
    return `${color} ${start}% ${end}%`;
  }).join(', ');
  pie.style.background = `conic-gradient(${stops})`;
  boxPie.appendChild(pie);
  boxPie.appendChild(legend);

  const barPct = state.statsBarPct || 60;
  if (state.statsChartMode === 'both') {
    stack.appendChild(boxBar);
    stack.appendChild(boxPie);
    stack.style.gridTemplateColumns = `${barPct}% ${100 - barPct}%`;
    box.appendChild(stack);
  } else if (state.statsChartMode === 'bar') {
    box.appendChild(boxBar);
  } else if (state.statsChartMode === 'pie') {
    box.appendChild(boxPie);
  }
}

function updateStatsStatus(msg) {
  if (!els.statsStatus) return;
  els.statsStatus.textContent = msg || '';
}

// 应用统计面板布局：表格宽度与图表比例
function applyStatsLayout() {
  try {
    if (els.statsBody) {
      const tablePct = state.statsTablePct || 50;
      const chartPct = 100 - tablePct;
      els.statsBody.style.gridTemplateColumns = `${tablePct}% ${chartPct}%`;
    }
    if (els.statsTablePctLabel) els.statsTablePctLabel.textContent = (state.statsTablePct || 50) + '%';
    if (els.statsBarPctLabel) els.statsBarPctLabel.textContent = `${state.statsBarPct || 60}% / ${100 - (state.statsBarPct || 60)}%`;
  } catch (err) {
    console.warn('应用统计布局失败:', err);
  }
}
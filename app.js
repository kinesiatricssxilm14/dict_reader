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
};

document.addEventListener('DOMContentLoaded', () => {
  bindEls();
  bindEvents();
  render();
});

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
}

function bindEvents() {
  els.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  });

  // Drag & drop
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

  els.countInput.addEventListener('input', () => {
    const v = parseInt(els.countInput.value || '50', 10);
    state.visibleCount = Math.max(1, Math.min(10000, v));
    renderList();
  });

  els.searchInput.addEventListener('input', () => {
    applyFilter();
  });

  els.sheetSelect.addEventListener('change', () => {
    if (!state.workbook) return;
    const sheetName = els.sheetSelect.value;
    const ws = state.workbook.Sheets[sheetName];
    state.items = XLSX.utils.sheet_to_json(ws, { defval: null });
    state.filtered = state.items.slice();
    renderBadge('xlsx');
    renderList();
  });

  els.themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
  });

  // 布局切换：分栏/单列
  els.layoutToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const curr = html.getAttribute('data-layout') || 'split';
    const next = curr === 'split' ? 'stacked' : 'split';
    html.setAttribute('data-layout', next);
    try { localStorage.setItem('data-viewer-layout', next); } catch {}
  });

  els.clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearAll();
  });

  // 字段显示模式
  if (els.fieldModeSelect) {
    els.fieldModeSelect.addEventListener('change', () => {
      state.fieldMode = els.fieldModeSelect.value;
      renderList();
      renderDetail();
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
  els.countInput.value = '5';
  els.searchInput.value = '';
  els.fileInput.value = '';
  els.sheetBlock.style.display = 'none';
  els.sheetSelect.innerHTML = '';
  if (els.fieldModeSelect) els.fieldModeSelect.value = 'all';
  if (els.fieldsPanel) els.fieldsPanel.style.display = 'none';
  if (els.fieldsList) els.fieldsList.innerHTML = '';
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
}

function renderBadge(fmt) {
  els.formatBadge.textContent = fmt ? fmt.toUpperCase() : '—';
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
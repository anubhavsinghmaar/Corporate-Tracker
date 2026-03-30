// DAK Tracker V2 (Vanilla JS Edition)

const STATE = {
  apiKey: localStorage.getItem('dak_tracker_gemini_key') || '',
  columns: [],
  rows: [],
  roughNotesCol: null,
  aiInsightsCache: {}, // { rowIndex: insightData }
};

// IndexedDB Persistence Layer
const DB_NAME = 'DakTrackerDB';
const STORE_NAME = 'projectState';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => { e.target.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStateToDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(STATE.columns, 'columns');
    store.put(STATE.rows, 'rows');
    store.put(STATE.aiInsightsCache, 'aiInsightsCache');
    return new Promise(resolve => tx.oncomplete = resolve);
  } catch(e) { console.error("IDB save failed", e); }
}

async function loadStateFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const getProm = (key) => new Promise(res => {
      const req = store.get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    });
    
    const [cols, rows, ai] = await Promise.all([getProm('columns'), getProm('rows'), getProm('aiInsightsCache')]);
    
    if (cols && rows && cols.length > 0) {
      STATE.columns = cols;
      STATE.rows = rows;
      STATE.aiInsightsCache = ai || {};
      return true;
    }
  } catch(e) { console.error("IDB load failed", e); }
  return false;
}

async function clearDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    return new Promise(resolve => tx.oncomplete = resolve);
  } catch(e) {}
}

// Elements
const el = (id) => document.getElementById(id);
const views = {
  upload: el('upload-screen'),
  dashboard: el('dashboard-screen'),
  dropZone: el('drop-zone'),
  fileInput: el('file-input'),
  previewContainer: el('preview-container'),
  dropZoneContainer: el('drop-zone-container'),
};

// API Key UI
const keyInput = el('api-key-input');
const keyPanel = el('api-key-panel');
const keyBtnText = el('key-btn-text');

if (STATE.apiKey) {
  keyInput.value = STATE.apiKey;
  keyBtnText.textContent = 'API Key ✓';
  el('toggle-key-btn').className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
}

el('toggle-key-btn').onclick = () => {
  keyPanel.classList.toggle('hidden');
};

el('toggle-visibility-btn').onclick = () => {
  keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
};

el('save-key-btn').onclick = () => {
  const val = keyInput.value.trim();
  STATE.apiKey = val;
  if (val) localStorage.setItem('dak_tracker_gemini_key', val);
  else localStorage.removeItem('dak_tracker_gemini_key');
  
  keyBtnText.textContent = val ? 'API Key ✓' : 'Set API Key';
  el('toggle-key-btn').className = val 
    ? 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
    : 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-amber-50 text-amber-700 hover:bg-amber-100';
  
  keyPanel.classList.add('hidden');
  updateDashboardToolbar();
};

// Drag & Drop
views.dropZone.onclick = () => views.fileInput.click();
views.dropZone.ondragover = (e) => {
  e.preventDefault();
  views.dropZone.classList.add('border-indigo-400', 'bg-indigo-50/50', 'scale-[1.01]');
};
views.dropZone.ondragleave = () => {
  views.dropZone.classList.remove('border-indigo-400', 'bg-indigo-50/50', 'scale-[1.01]');
};
views.dropZone.ondrop = (e) => {
  e.preventDefault();
  views.dropZone.classList.remove('border-indigo-400', 'bg-indigo-50/50', 'scale-[1.01]');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
};
views.fileInput.onchange = (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
};

function handleFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) {
    showError('Please upload a valid Excel file (.xlsx or .xls)');
    return;
  }
  
  el('drop-zone-content').classList.add('hidden');
  el('loading-spinner').classList.remove('hidden');
  el('loading-spinner').classList.add('flex');
  el('error-message').classList.add('hidden');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) throw new Error('Sheet is empty');

      const range = XLSX.utils.decode_range(worksheet['!ref']);
      const columns = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: range.s.r, c });
        const cell = worksheet[cellRef];
        columns.push(cell ? String(cell.v) : `Column ${c + 1}`);
      }

      let roughExists = columns.some(c => c.toLowerCase().trim() === 'rough notes' || c.toLowerCase().trim() === 'rough note');
      let roughColName = columns.find(c => c.toLowerCase().trim() === 'rough notes' || c.toLowerCase().trim() === 'rough note') || 'Rough Notes';

      if (!roughExists) {
        columns.push(roughColName);
      }

      const now = new Date().toISOString();
      const rows = jsonData.map((jsonRow) => {
        const row = {};
        columns.forEach((col) => {
          const val = jsonRow[col] != null ? String(jsonRow[col]) : '';
          row[col] = {
            current_value: val,
            history: [{ value: val, timestamp: now, source: 'excel_import' }]
          };
        });
        return row;
      });

      showPreview(sheetName, columns, rows);
    } catch (err) {
      showError(`Failed to parse Excel: ${err.message}`);
    } finally {
      el('drop-zone-content').classList.remove('hidden');
      el('loading-spinner').classList.add('hidden');
      el('loading-spinner').classList.remove('flex');
    }
  };
  reader.onerror = () => showError('Failed to read file');
  reader.readAsArrayBuffer(file);
}

function showError(msg) {
  const errEl = el('error-message');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}

// Preview Screen
function showPreview(sheetName, columns, rows) {
  STATE.columns = columns;
  STATE.rows = rows;

  views.dropZoneContainer.classList.add('hidden');
  views.previewContainer.classList.remove('hidden');

  el('preview-filename').textContent = `Preview: ${sheetName}`;
  el('preview-counts').textContent = `${columns.length} columns · ${rows.length} rows`;

  // Headers
  const thead = el('preview-thead-row');
  thead.innerHTML = columns.map(c => `<th class="text-left px-4 py-2.5 font-semibold text-primary whitespace-nowrap border-b border-border text-xs uppercase tracking-wider">${c}</th>`).join('');

  // Body
  const tbody = el('preview-tbody');
  tbody.innerHTML = rows.slice(0, 5).map(row => `
    <tr class="border-b border-border/50 last:border-0">
      ${columns.map(c => `<td class="px-4 py-2 text-secondary whitespace-nowrap max-w-[200px] truncate">${row[c]?.current_value || ''}</td>`).join('')}
    </tr>
  `).join('');

  const footer = el('preview-footer');
  if (rows.length > 5) {
    footer.innerHTML = `Showing 5 of ${rows.length} rows`;
    footer.classList.remove('hidden');
  } else {
    footer.classList.add('hidden');
  }
}

el('cancel-preview-btn').onclick = () => {
  views.dropZoneContainer.classList.remove('hidden');
  views.previewContainer.classList.add('hidden');
  views.fileInput.value = '';
};

el('generate-ds-btn').onclick = async () => {
  views.upload.classList.add('hidden');
  views.dashboard.classList.remove('hidden');
  initDashboard();
  await saveStateToDB();
};

el('start-over-btn').onclick = async () => {
  if (!confirm("Are you sure you want to clear your current dashboard and start over?")) return;
  await clearDB();
  STATE.columns = [];
  STATE.rows = [];
  STATE.aiInsightsCache = {};
  views.dashboard.classList.add('hidden');
  views.upload.classList.remove('hidden');
  views.dropZoneContainer.classList.remove('hidden');
  views.previewContainer.classList.add('hidden');
  views.fileInput.value = '';
};

// Check startup
window.addEventListener('DOMContentLoaded', async () => {
  el('drop-zone-content').classList.add('hidden');
  el('loading-spinner').classList.remove('hidden');
  
  const hasData = await loadStateFromDB();
  if (hasData) {
    views.upload.classList.add('hidden');
    views.dashboard.classList.remove('hidden');
    initDashboard();
  }
  
  el('drop-zone-content').classList.remove('hidden');
  el('loading-spinner').classList.add('hidden');
});

// --- Dashboard ---
function initDashboard() {
  const roughCol = STATE.columns.find(c => c.toLowerCase().trim().includes('rough note'));
  STATE.roughNotesCol = roughCol || null;
  
  updateDashboardToolbar();
  renderDashboardTable();
}

function updateDashboardToolbar() {
  el('db-stats').innerHTML = `<span class="font-semibold text-primary">${STATE.rows.length}</span> rows · <span class="font-semibold text-primary">${STATE.columns.length}</span> columns`;
  
  if (STATE.roughNotesCol) {
    el('rough-notes-badge').textContent = `📝 "${STATE.roughNotesCol}" detected`;
    el('rough-notes-badge').classList.remove('hidden');
    
    if (STATE.apiKey) {
      el('run-ai-btn').classList.remove('hidden');
      el('api-key-warning').classList.add('hidden');
    } else {
      el('run-ai-btn').classList.add('hidden');
      el('api-key-warning').classList.remove('hidden');
    }
  }
}

function renderDashboardTable() {
  // Headers
  const thead = el('db-thead-row');
  let headerHTML = `<th class="text-left px-3 py-3 font-bold text-[10px] uppercase tracking-wider text-secondary whitespace-nowrap w-10 bg-slate-50 sticky left-0 z-30">#</th>`;
  
  STATE.columns.forEach(col => {
    headerHTML += `<th class="text-left px-3 py-3 font-bold text-[10px] uppercase tracking-wider text-secondary whitespace-nowrap bg-slate-50 border-r border-border/30 max-w-[300px]">${col} ${col === STATE.roughNotesCol ? '<span class="ml-1 text-indigo-400">📝</span>' : ''}</th>`;
  });

  if (STATE.roughNotesCol) {
    headerHTML += `<th class="text-left px-3 py-3 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 min-w-[320px] sticky right-0 z-30 border-l border-indigo-100">✨ AI Insights</th>`;
  }
  thead.innerHTML = headerHTML;

  // Body
  const tbody = el('db-tbody');
  tbody.innerHTML = '';

  STATE.rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-border/50 hover:bg-slate-50/80 transition-colors group';
    
    // Index cell
    const tdIdx = document.createElement('td');
    tdIdx.className = 'px-3 py-2 text-xs text-slate-300 font-mono select-none bg-white group-hover:bg-slate-50/80 sticky left-0 z-20';
    tdIdx.textContent = ri + 1;
    tr.appendChild(tdIdx);

    // Data cells
    STATE.columns.forEach(col => {
      const td = document.createElement('td');
      td.className = 'editable-cell px-3 py-2 cursor-pointer relative align-top border-r border-border/30 max-w-[300px] min-w-[150px]';
      td.innerHTML = renderCellHTML(row[col]);
      
      // Inline editing triggers
      td.onclick = (e) => {
        if (e.target.closest('.history-btn')) {
          e.stopPropagation();
          toggleHistoryPopup(td, row[col].history, ri, col);
          return;
        }
        startEditing(td, ri, col);
      };

      tr.appendChild(td);
    });

    // AI Insight cell
    if (STATE.roughNotesCol) {
      const tdAi = document.createElement('td');
      tdAi.className = 'px-3 py-2 bg-gradient-to-r from-indigo-50/20 to-purple-50/20 align-top sticky right-0 z-20 border-l border-indigo-100/50 min-w-[320px]';
      tdAi.id = `ai-cell-${ri}`;
      tdAi.innerHTML = renderInsightHTML(STATE.aiInsightsCache[ri]);
      tr.appendChild(tdAi);
    }

    tbody.appendChild(tr);
  });
}

function formatDatestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderCellHTML(data) {
  const val = data.current_value;
  const hist = data.history || [];
  const lastUpdate = hist.length > 1 ? hist[hist.length - 1] : null;

  let html = `<div class="text-sm text-primary whitespace-pre-wrap break-words">${val || '<span class="text-slate-300 italic">—</span>'}</div>`;
  if (lastUpdate) {
    html += `<button class="history-btn text-[10px] text-slate-400 hover:text-indigo-500 transition-colors mt-1 block">Updated: ${formatDatestamp(lastUpdate.timestamp)}</button>`;
  }
  return html;
}

// -- Cell Editing & History --
let currentActivePopup = null;
let isCurrentlyEditing = false;

document.addEventListener('mousedown', (e) => {
  if (currentActivePopup && !e.target.closest('.cell-history-modal') && !e.target.closest('.history-btn')) {
    currentActivePopup.remove();
    currentActivePopup = null;
  }
});

function toggleHistoryPopup(td, history, rIndex, colName) {
  if (currentActivePopup) {
    currentActivePopup.remove();
    currentActivePopup = null;
  }
  if (!history || history.length <= 1) return;

  const sorted = [...history].reverse();
  const popup = document.createElement('div');
  popup.className = 'cell-history-modal animate-fadeIn';
  
  let content = `
    <div class="px-3 py-2 border-b border-border bg-slate-50 rounded-t-xl">
      <p class="text-xs font-semibold text-primary">Edit History</p>
      <p class="text-[10px] text-secondary">${history.length} versions</p>
    </div>
    <div class="max-h-48 overflow-y-auto custom-scroll">
  `;

  sorted.forEach((entry, i) => {
    content += `
      <div class="px-3 py-2 border-b border-border/50 last:border-0 ${i === 0 ? 'bg-indigo-50/30' : ''}">
        <div class="flex items-center gap-2">
          <p class="text-[10px] font-mono text-secondary">${formatDatestamp(entry.timestamp)}</p>
          ${i === 0 ? '<span class="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">Current</span>' : ''}
          ${entry.source === 'excel_import' ? '<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Import</span>' : ''}
        </div>
        <p class="text-sm mt-0.5 ${i === 0 ? 'font-semibold text-primary' : 'text-secondary whitespace-pre-wrap'}">${entry.value || '<em class="text-slate-300">empty</em>'}</p>
      </div>
    `;
  });

  content += `</div>`;
  popup.innerHTML = content;
  td.appendChild(popup);
  currentActivePopup = popup;
}

function startEditing(td, ri, col) {
  if (isCurrentlyEditing) return; // one at a time for simplicity
  if (currentActivePopup) currentActivePopup.remove();
  
  const currentVal = STATE.rows[ri][col].current_value;
  isCurrentlyEditing = true;

  const input = document.createElement(currentVal.length > 50 ? 'textarea' : 'input');
  input.className = 'w-full min-w-[200px] px-2 py-1.5 text-sm rounded-md border border-indigo-400 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/20 resize-y shadow-sm text-primary font-sans';
  input.value = currentVal;
  
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();

  // Resize textarea
  if (input.tagName === 'TEXTAREA') {
    input.rows = Math.min(6, Math.max(2, currentVal.split('\n').length));
  }

  const commit = () => {
    if (!isCurrentlyEditing) return; // prevent double firing
    isCurrentlyEditing = false;
    const newVal = input.value;
    if (newVal !== currentVal) {
      STATE.rows[ri][col].current_value = newVal;
      STATE.rows[ri][col].history.push({
        value: newVal,
        timestamp: new Date().toISOString(),
        source: 'manual_edit'
      });
      saveStateToDB(); // Auto-save on edit
    }
    td.innerHTML = renderCellHTML(STATE.rows[ri][col]);
  };

  input.onblur = commit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && (!e.shiftKey && input.tagName !== 'TEXTAREA')) {
      e.preventDefault();
      input.blur(); // triggers commit
    }
    if (e.key === 'Escape') {
      isCurrentlyEditing = false;
      td.innerHTML = renderCellHTML(STATE.rows[ri][col]); // revert
    }
  };
}

// -- AI Generation --

const SYSTEM_PROMPT = `You are a highly experienced Product Manager who is extremely sharp at identifying risks, ambiguity, and execution gaps.
Your job is NOT just summarization. Your job is to convert messy, informal project updates into decisive, structured project intelligence.
Return output in STRICT JSON format with the following fields:
{
  "clean_summary": "1-2 line crisp summary",
  "attention_level": "HIGH / MEDIUM / LOW",
  "attention_reason": "Specific reason",
  "risks": ["Concrete risks"],
  "recommended_next_steps": ["Clear actions"],
  "confidence_score": 0-100
}
CRITICAL RULES:
- Signal over noise. Timeline shifts = HIGH attention.
- Return ONLY JSON. No markdown ticks (\`\`\`).`;

async function callGemini(rowDict) {
  const note = rowDict[STATE.roughNotesCol].current_value.trim();
  
  const rowContext = Object.entries(rowDict)
    .filter(([k]) => k !== STATE.roughNotesCol)
    .map(([k, v]) => `${k}: ${v.current_value}`)
    .join('\\n');

  const fullPrompt = `ROW DATA:\n${rowContext}\n\nROUGH PM NOTES:\n"${note}"`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${STATE.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error('API Error');
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text.replace(/```json/i, '').replace(/```/i, '').trim());
}

el('run-ai-btn').onclick = async () => {
  if (!STATE.apiKey || !STATE.roughNotesCol) return;
  
  const tasks = [];
  STATE.rows.forEach((row, idx) => {
    const val = row[STATE.roughNotesCol].current_value.trim();
    if (val) tasks.push({ idx, rowDict: row });
  });

  if (tasks.length === 0) return;

  el('run-ai-btn').disabled = true;
  el('ai-progress-container').classList.remove('hidden');
  el('ai-progress-container').classList.add('flex');
  
  for (let i = 0; i < tasks.length; i++) {
    const { idx, rowDict } = tasks[i];
    
    // update progress UI
    el('ai-progress-text').textContent = `Processing ${i + 1} / ${tasks.length}`;
    el('ai-progress-bar').style.width = `${((i + 1) / tasks.length) * 100}%`;
    
    // pulse cell
    const cell = el(`ai-cell-${idx}`);
    if (cell) cell.innerHTML = `<div class="flex items-center gap-2 text-sm text-secondary animate-pulse-soft"><div class="w-4 h-4 spinner"></div><span>Analyzing...</span></div>`;

    if (!STATE.aiInsightsCache[idx]) {
      try {
        const res = await callGemini(rowDict);
        STATE.aiInsightsCache[idx] = res;
      } catch (err) {
        STATE.aiInsightsCache[idx] = { error: true };
      }
      if (i < tasks.length - 1) await new Promise(r => setTimeout(r, 400)); // Rate limit buffer
    }

    if (cell) cell.innerHTML = renderInsightHTML(STATE.aiInsightsCache[idx]);
    await saveStateToDB(); // Save iteratively per row to prevent data loss midway
  }

  el('run-ai-btn').disabled = false;
  el('ai-progress-container').classList.add('hidden');
  el('ai-progress-container').classList.remove('flex');
};

function checkInsightToggle(btn) {
  const expanded = btn.nextElementSibling;
  const isOpen = expanded.classList.contains('open');
  if (isOpen) {
    expanded.classList.remove('open');
    btn.innerHTML = '▼ Risks & Next Steps';
  } else {
    expanded.classList.add('open');
    btn.innerHTML = '▲ Collapse';
  }
}

// Required mapping for onclick events generated inline
window.toggleInsight = checkInsightToggle;

function renderInsightHTML(data) {
  if (!data) return '<span class="text-xs text-slate-300 italic">No analysis</span>';
  if (data.error) return '<span class="text-xs text-rose-500 italic font-medium">⚠ AI analysis failed</span>';

  const badgeColors = {
    'HIGH': 'bg-rose-100 text-rose-700 border-rose-200',
    'MEDIUM': 'bg-amber-100 text-amber-700 border-amber-200',
    'LOW': 'bg-emerald-100 text-emerald-700 border-emerald-200'
  };

  const level = (data.attention_level || 'LOW').toUpperCase();
  const badgeClass = badgeColors[level] || badgeColors.LOW;
  const conf = data.confidence_score;
  const confColor = conf >= 75 ? 'text-emerald-600' : (conf >= 40 ? 'text-amber-600' : 'text-rose-500');

  let html = `
    <div class="space-y-2 animate-fadeIn">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}">${level}</span>
        ${conf != null ? `<span class="text-[10px] font-mono font-bold ${confColor}">${conf}%</span>` : ''}
      </div>
      <p class="text-xs font-bold text-primary leading-snug">${data.clean_summary || data.summary || ''}</p>
      <p class="text-[11px] text-secondary leading-snug italic">${data.attention_reason || ''}</p>
  `;

  const hasRisks = data.risks && data.risks.length > 0;
  const hasSteps = data.recommended_next_steps && data.recommended_next_steps.length > 0;

  if (hasRisks || hasSteps) {
    html += `
      <button onclick="toggleInsight(this)" class="text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 text-indigo-700 font-semibold transition-colors mt-1 block">▼ Risks & Next Steps</button>
      <div class="insight-expansion border-t border-indigo-100/50 mt-2">
        <div class="insight-inner space-y-2 pt-2">
    `;
    
    if (hasRisks) {
      html += `<div><p class="text-[10px] font-bold text-amber-700 mb-1 tracking-wide uppercase">⚠ Risks</p><ul class="space-y-1">`;
      data.risks.forEach(r => html += `<li class="text-[11px] text-primary flex gap-1.5 items-start leading-snug"><span class="text-amber-500 mt-0.5 shrink-0">•</span><span>${r}</span></li>`);
      html += `</ul></div>`;
    }

    if (hasSteps) {
      html += `<div><p class="text-[10px] font-bold text-emerald-700 mb-1 tracking-wide uppercase">🎯 Next Steps</p><ul class="space-y-1">`;
      data.recommended_next_steps.forEach(s => html += `<li class="text-[11px] text-primary flex gap-1.5 items-start leading-snug"><span class="text-emerald-500 mt-0.5 shrink-0">•</span><span>${s}</span></li>`);
      html += `</ul></div>`;
    }

    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}

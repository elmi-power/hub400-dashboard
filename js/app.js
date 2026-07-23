"use strict";

const CONFIG_KEY = "csvDashboardConfig";

const el = (id) => document.getElementById(id);

const dropzone = el("dropzone");
const csvInput = el("csvInput");
const saveToRepo = el("saveToRepo");
const uploadStatus = el("uploadStatus");
const fileList = el("fileList");
const refreshBtn = el("refreshBtn");
const settingsBtn = el("settingsBtn");
const settingsDialog = el("settingsDialog");
const settingsForm = el("settingsForm");
const cfgOwner = el("cfgOwner");
const cfgRepo = el("cfgRepo");
const cfgBranch = el("cfgBranch");
const cfgToken = el("cfgToken");
const clearTokenBtn = el("clearTokenBtn");
const cancelSettingsBtn = el("cancelSettingsBtn");

const datasetSection = el("datasetSection");
const datasetName = el("datasetName");
const statsRow = el("statsRow");
const chartType = el("chartType");
const xField = el("xField");
const yFields = el("yFields");
const renderChartBtn = el("renderChartBtn");
const chartCanvas = el("chartCanvas");
const dataTable = el("dataTable");

let currentRows = [];
let currentFields = [];
let chartInstance = null;

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function getConfig() {
  return loadConfig();
}

function openSettings() {
  const cfg = loadConfig();
  cfgOwner.value = cfg.owner || "";
  cfgRepo.value = cfg.repo || "";
  cfgBranch.value = cfg.branch || "main";
  cfgToken.value = cfg.token || "";
  settingsDialog.showModal();
}

settingsBtn.addEventListener("click", openSettings);
cancelSettingsBtn.addEventListener("click", () => settingsDialog.close());

clearTokenBtn.addEventListener("click", () => {
  const cfg = loadConfig();
  delete cfg.token;
  saveConfig(cfg);
  cfgToken.value = "";
});

settingsForm.addEventListener("submit", (e) => {
  const cfg = {
    owner: cfgOwner.value.trim(),
    repo: cfgRepo.value.trim(),
    branch: cfgBranch.value.trim() || "main",
    token: cfgToken.value.trim(),
  };
  saveConfig(cfg);
  settingsDialog.close();
  refreshFileList();
});

// ---------- GitHub API ----------

function ghHeaders(accept) {
  const cfg = getConfig();
  const headers = { Accept: accept || "application/vnd.github+json" };
  if (cfg.token) headers.Authorization = `token ${cfg.token}`;
  return headers;
}

async function listRepoCsvFiles() {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo) return [];
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/data?ref=${encodeURIComponent(cfg.branch || "main")}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`GitHub API Fehler (${res.status})`);
  }
  const items = await res.json();
  return items.filter((i) => i.type === "file" && i.name.toLowerCase().endsWith(".csv"));
}

async function fetchRepoFileText(path) {
  const cfg = getConfig();
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch || "main")}`;
  const res = await fetch(url, { headers: ghHeaders("application/vnd.github.raw") });
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (${res.status})`);
  return res.text();
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function commitCsvToRepo(filename, content) {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo) throw new Error("Bitte zuerst Owner/Repo in den Einstellungen setzen.");
  if (!cfg.token) throw new Error("Bitte einen GitHub Token in den Einstellungen hinterlegen, um speichern zu können.");

  const path = `data/${filename}`;
  const branch = cfg.branch || "main";
  const base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;

  let sha;
  const existing = await fetch(`${base}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders() });
  if (existing.ok) {
    const json = await existing.json();
    sha = json.sha;
  }

  const res = await fetch(base, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Upload ${filename} via CSV Dashboard`,
      content: utf8ToBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Commit fehlgeschlagen (${res.status})`);
  }
}

// ---------- Sidebar file list ----------

async function refreshFileList() {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo) {
    fileList.innerHTML = `<li class="hint">Repo in Einstellungen konfigurieren…</li>`;
    return;
  }
  fileList.innerHTML = `<li class="hint">Lade…</li>`;
  try {
    const files = await listRepoCsvFiles();
    if (!files.length) {
      fileList.innerHTML = `<li class="hint">Noch keine CSVs im data/-Ordner.</li>`;
      return;
    }
    fileList.innerHTML = "";
    files.forEach((f) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = f.name;
      btn.addEventListener("click", () => loadFromRepo(f, btn));
      li.appendChild(btn);
      fileList.appendChild(li);
    });
  } catch (err) {
    fileList.innerHTML = `<li class="hint">${err.message}</li>`;
  }
}

async function loadFromRepo(fileMeta, btnEl) {
  document.querySelectorAll(".file-list button").forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  try {
    const text = await fetchRepoFileText(fileMeta.path);
    parseAndRender(fileMeta.name, text);
  } catch (err) {
    setStatus(err.message, true);
  }
}

refreshBtn.addEventListener("click", refreshFileList);

// ---------- Upload handling ----------

function setStatus(msg, isError) {
  uploadStatus.textContent = msg;
  uploadStatus.className = "status" + (isError ? " error" : msg ? " success" : "");
}

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
csvInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  setStatus("Lese Datei…");
  const reader = new FileReader();
  reader.onload = async () => {
    const text = reader.result;
    parseAndRender(file.name, text);
    if (saveToRepo.checked) {
      try {
        setStatus("Speichere im Repo…");
        await commitCsvToRepo(file.name, text);
        setStatus(`"${file.name}" im Repo gespeichert.`);
        refreshFileList();
      } catch (err) {
        setStatus(err.message, true);
      }
    } else {
      setStatus("");
    }
  };
  reader.onerror = () => setStatus("Datei konnte nicht gelesen werden.", true);
  reader.readAsText(file);
}

// ---------- Parsing & rendering ----------

function parseAndRender(name, text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors && parsed.errors.length) {
    console.warn("CSV Parse-Warnungen:", parsed.errors);
  }
  currentRows = parsed.data;
  currentFields = parsed.meta.fields || [];
  renderDataset(name, currentRows, currentFields);
}

function isNumericField(field) {
  return currentRows.some((r) => typeof r[field] === "number");
}

function renderDataset(name, rows, fields) {
  datasetSection.classList.remove("hidden");
  datasetName.textContent = `${name} — ${rows.length} Zeilen, ${fields.length} Spalten`;

  renderStats(rows, fields);
  populateFieldSelectors(fields);
  renderTable(rows, fields);
  renderChart();
}

function renderStats(rows, fields) {
  statsRow.innerHTML = "";
  const numericFields = fields.filter(isNumericField);

  addStatCard("Zeilen", rows.length);
  addStatCard("Spalten", fields.length);

  numericFields.slice(0, 4).forEach((field) => {
    const values = rows.map((r) => r[field]).filter((v) => typeof v === "number");
    if (!values.length) return;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    addStatCard(`Ø ${field}`, avg.toFixed(2));
  });
}

function addStatCard(label, value) {
  const card = document.createElement("div");
  card.className = "stat-card";
  card.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>`;
  statsRow.appendChild(card);
}

function populateFieldSelectors(fields) {
  xField.innerHTML = "";
  yFields.innerHTML = "";
  fields.forEach((f) => {
    const opt1 = document.createElement("option");
    opt1.value = f;
    opt1.textContent = f;
    xField.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = f;
    opt2.textContent = f;
    yFields.appendChild(opt2);
  });

  const numericFields = fields.filter(isNumericField);
  const nonNumeric = fields.find((f) => !numericFields.includes(f));
  if (nonNumeric) xField.value = nonNumeric;
  Array.from(yFields.options).forEach((opt) => {
    opt.selected = numericFields.includes(opt.value);
  });
}

function renderTable(rows, fields) {
  const preview = rows.slice(0, 100);
  const thead = `<thead><tr>${fields.map((f) => `<th>${escapeHtml(f)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${preview
    .map((r) => `<tr>${fields.map((f) => `<td>${escapeHtml(r[f])}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  dataTable.innerHTML = thead + tbody;
}

function escapeHtml(val) {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderChart() {
  if (!currentRows.length) return;
  const type = chartType.value;
  const x = xField.value;
  const ySelected = Array.from(yFields.selectedOptions).map((o) => o.value);
  if (!ySelected.length) return;

  const labels = currentRows.map((r) => r[x]);
  const palette = ["#4f6df5", "#f5734f", "#2e9e5b", "#c94fdc", "#f5c14f", "#4fd0f5"];

  let datasets;
  if (type === "pie") {
    datasets = [
      {
        label: ySelected[0],
        data: currentRows.map((r) => r[ySelected[0]]),
        backgroundColor: currentRows.map((_, i) => palette[i % palette.length]),
      },
    ];
  } else {
    datasets = ySelected.map((f, i) => ({
      label: f,
      data: type === "scatter" ? currentRows.map((r) => ({ x: r[x], y: r[f] })) : currentRows.map((r) => r[f]),
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      fill: false,
      tension: 0.25,
    }));
  }

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(chartCanvas, {
    type,
    data: { labels: type === "pie" ? currentRows.map((r) => r[x]) : labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: type === "pie" ? {} : { x: { title: { display: true, text: x } } },
    },
  });
}

renderChartBtn.addEventListener("click", renderChart);

// ---------- Init ----------

refreshFileList();

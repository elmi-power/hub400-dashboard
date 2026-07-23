"use strict";

const el = (id) => document.getElementById(id);

const DEFAULT_SITES = [
  { slug: "edzards-reisen", name: "Edzards Reisen" },
  { slug: "niddatal", name: "Niddatal" },
];

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseFromSlug(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------- State ----------------

let sites = DEFAULT_SITES.slice();
let currentSiteSlug = null;
let siteFileCache = {}; // slug -> { days: { 'YYYY-MM-DD': {path,name} }, others: [{path,name}] }
let selectedDays = new Set();

let currentGenericRows = [];
let currentGenericFields = [];
let genericChart = null;

// ---------------- Site picker ----------------

const siteChips = el("siteChips");
const dayChips = el("dayChips");
const otherFilesList = el("otherFilesList");
const essSection = el("essSection");
const genericSection = el("genericSection");
const emptyState = el("emptyState");

function renderSiteChips() {
  siteChips.innerHTML = "";
  sites.forEach((site) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (site.slug === currentSiteSlug ? " active" : "");
    btn.textContent = site.name;
    btn.addEventListener("click", () => selectSite(site.slug));
    siteChips.appendChild(btn);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "chip chip-add";
  addBtn.textContent = "+ Neue hinzufügen";
  addBtn.addEventListener("click", () => newSiteDialog.showModal());
  siteChips.appendChild(addBtn);
}

async function refreshSites() {
  try {
    const items = await GitHub.listDir("data");
    const dirs = items.filter((i) => i.type === "dir");
    const known = new Set(sites.map((s) => s.slug));
    for (const dir of dirs) {
      if (known.has(dir.name)) continue;
      let name = titleCaseFromSlug(dir.name);
      try {
        const meta = JSON.parse(await GitHub.fetchText(`data/${dir.name}/site.json`));
        if (meta.name) name = meta.name;
      } catch {
        /* no site.json, fall back to slug title-case */
      }
      sites.push({ slug: dir.name, name });
      known.add(dir.name);
    }
  } catch (err) {
    console.warn("Sites konnten nicht geladen werden:", err.message);
  }
  renderSiteChips();
}

async function selectSite(slug) {
  currentSiteSlug = slug;
  selectedDays = new Set();
  renderSiteChips();
  dayChips.innerHTML = `<span class="hint">Lade…</span>`;
  otherFilesList.innerHTML = "";
  essSection.classList.add("hidden");
  genericSection.classList.add("hidden");
  emptyState.classList.remove("hidden");

  try {
    const files = await loadSiteFiles(slug);
    renderDayChips(files.days);
    renderOtherFiles(files.others);
  } catch (err) {
    dayChips.innerHTML = `<span class="hint">${err.message}</span>`;
  }
}

async function loadSiteFiles(slug) {
  if (siteFileCache[slug]) return siteFileCache[slug];
  const items = await GitHub.listDir(`data/${slug}`);
  const days = {};
  const others = [];
  for (const item of items) {
    if (item.type !== "file" || !item.name.toLowerCase().endsWith(".csv")) continue;
    const date = extractDayFromFilename(item.name);
    if (date) {
      days[date] = { path: item.path, name: item.name };
    } else {
      others.push({ path: item.path, name: item.name });
    }
  }
  const result = { days, others };
  siteFileCache[slug] = result;
  return result;
}

function invalidateSiteCache(slug) {
  delete siteFileCache[slug];
}

// ---------------- New site dialog ----------------

const newSiteDialog = el("newSiteDialog");
const newSiteForm = el("newSiteForm");
const newSiteName = el("newSiteName");
const newSiteError = el("newSiteError");

el("cancelNewSiteBtn").addEventListener("click", () => newSiteDialog.close());

newSiteForm.addEventListener("submit", async (e) => {
  newSiteError.textContent = "";
  const name = newSiteName.value.trim();
  if (!name) return;
  const slug = slugify(name);
  if (sites.some((s) => s.slug === slug)) {
    newSiteDialog.close();
    newSiteName.value = "";
    selectSite(slug);
    return;
  }
  try {
    await GitHub.commitFile(`data/${slug}/site.json`, JSON.stringify({ name }, null, 2), `Add site "${name}"`);
    sites.push({ slug, name });
    newSiteDialog.close();
    newSiteName.value = "";
    renderSiteChips();
    selectSite(slug);
  } catch (err) {
    newSiteError.textContent = err.message;
  }
});

// ---------------- Day picker ----------------

function dateRangeInclusive(minStr, maxStr) {
  // Use UTC throughout: mixing a local-time Date with toISOString() (UTC)
  // silently shifts/drops days whenever the browser isn't in UTC.
  const out = [];
  const cur = new Date(`${minStr}T00:00:00Z`);
  const end = new Date(`${maxStr}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function renderDayChips(days) {
  const dates = Object.keys(days).sort();
  if (!dates.length) {
    dayChips.innerHTML = `<span class="hint">Noch keine datierten CSVs für diese Site.</span>`;
    return;
  }
  const range = dateRangeInclusive(dates[0], dates[dates.length - 1]);
  dayChips.innerHTML = "";
  range.forEach((date) => {
    const available = !!days[date];
    const btn = document.createElement("button");
    btn.className = "chip day-chip" + (available ? "" : " missing") + (selectedDays.has(date) ? " active" : "");
    btn.textContent = date.slice(5); // MM-DD
    btn.title = date;
    if (!available) btn.disabled = true;
    else {
      btn.addEventListener("click", () => {
        if (selectedDays.has(date)) selectedDays.delete(date);
        else selectedDays.add(date);
        renderDayChips(days);
        loadSelectedDays(days);
      });
    }
    dayChips.appendChild(btn);
  });
}

function renderOtherFiles(others) {
  otherFilesList.innerHTML = "";
  if (!others.length) return;
  others.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = f.name;
    btn.addEventListener("click", async () => {
      try {
        const text = await GitHub.fetchText(f.path);
        loadCsvText(f.name, text);
      } catch (err) {
        setUploadStatus(err.message, true);
      }
    });
    otherFilesList.appendChild(btn);
  });
}

// Guards against out-of-order async completions: if the user toggles a day
// again before a previous fetch resolves, only the *latest* click's result
// may touch the DOM — otherwise an earlier, slower load can finish last and
// overwrite/hide what the current selection should show.
let loadDaysGeneration = 0;

async function loadSelectedDays(days) {
  const myGeneration = ++loadDaysGeneration;

  if (!selectedDays.size) {
    essSection.classList.add("hidden");
    genericSection.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  try {
    const sortedDates = Array.from(selectedDays).sort();
    const texts = await Promise.all(sortedDates.map((d) => GitHub.fetchText(days[d].path)));
    if (myGeneration !== loadDaysGeneration) return; // superseded by a newer selection

    let allRows = [];
    texts.forEach((text, idx) => {
      const rows = parseEssCsv(text, sortedDates[idx]);
      if (rows) allRows = allRows.concat(rows);
    });
    const series = buildEssSeries(allRows);
    renderEssDashboard(series);
    essSection.classList.remove("hidden");
    genericSection.classList.add("hidden");
  } catch (err) {
    if (myGeneration !== loadDaysGeneration) return;
    setUploadStatus(err.message, true);
  }
}

// ---------------- Upload ----------------

const dropzone = el("dropzone");
const csvInput = el("csvInput");
const saveToRepo = el("saveToRepo");
const uploadStatus = el("uploadStatus");

function setUploadStatus(msg, isError) {
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
  setUploadStatus("Lese Datei…");
  const reader = new FileReader();
  reader.onload = async () => {
    const text = reader.result;
    loadCsvText(file.name, text);

    if (saveToRepo.checked) {
      if (!currentSiteSlug) {
        setUploadStatus("Bitte zuerst eine Site auswählen, um zu speichern.", true);
        return;
      }
      try {
        setUploadStatus("Speichere im Repo…");
        await GitHub.commitFile(`data/${currentSiteSlug}/${file.name}`, text, `Upload ${file.name} via Dashboard`);
        setUploadStatus(`"${file.name}" bei ${sites.find((s) => s.slug === currentSiteSlug)?.name} gespeichert.`);
        invalidateSiteCache(currentSiteSlug);
        const files = await loadSiteFiles(currentSiteSlug);
        renderDayChips(files.days);
        renderOtherFiles(files.others);
      } catch (err) {
        setUploadStatus(err.message, true);
      }
    } else {
      setUploadStatus("");
    }
  };
  reader.onerror = () => setUploadStatus("Datei konnte nicht gelesen werden.", true);
  reader.readAsText(file);
}

function loadCsvText(filename, text) {
  const firstLine = (text.split(/\r?\n/)[0] || "");
  if (looksLikeEssFile(firstLine)) {
    const date = extractDayFromFilename(filename) || new Date().toISOString().slice(0, 10);
    const rows = parseEssCsv(text, date);
    const series = buildEssSeries(rows || []);
    renderEssDashboard(series);
    essSection.classList.remove("hidden");
    genericSection.classList.add("hidden");
    emptyState.classList.add("hidden");
  } else {
    parseAndRenderGeneric(filename, text);
    essSection.classList.add("hidden");
    genericSection.classList.remove("hidden");
    emptyState.classList.add("hidden");
  }
}

// ---------------- Generic fallback dashboard (non-ESS CSVs) ----------------

const datasetName = el("datasetName");
const statsRow = el("statsRow");
const chartTypeSel = el("chartType");
const xFieldSel = el("xField");
const yFieldsSel = el("yFields");
const dataTable = el("dataTable");

function parseAndRenderGeneric(name, text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  currentGenericRows = parsed.data;
  currentGenericFields = parsed.meta.fields || [];
  datasetName.textContent = `${name} — ${currentGenericRows.length} Zeilen, ${currentGenericFields.length} Spalten`;
  renderGenericStats();
  populateGenericFieldSelectors();
  renderGenericTable();
  renderGenericChart();
}

function isNumericField(field) {
  return currentGenericRows.some((r) => typeof r[field] === "number");
}

function renderGenericStats() {
  statsRow.innerHTML = "";
  addStatCard("Zeilen", currentGenericRows.length);
  addStatCard("Spalten", currentGenericFields.length);
  currentGenericFields
    .filter(isNumericField)
    .slice(0, 4)
    .forEach((field) => {
      const values = currentGenericRows.map((r) => r[field]).filter((v) => typeof v === "number");
      if (!values.length) return;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      addStatCard(`Ø ${field}`, avg.toFixed(2));
    });
}

function addStatCard(label, value) {
  const card = document.createElement("div");
  card.className = "stat-card";
  card.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>`;
  statsRow.appendChild(card);
}

function populateGenericFieldSelectors() {
  xFieldSel.innerHTML = "";
  yFieldsSel.innerHTML = "";
  currentGenericFields.forEach((f) => {
    const o1 = document.createElement("option");
    o1.value = f;
    o1.textContent = f;
    xFieldSel.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = f;
    o2.textContent = f;
    yFieldsSel.appendChild(o2);
  });
  const numericFields = currentGenericFields.filter(isNumericField);
  const nonNumeric = currentGenericFields.find((f) => !numericFields.includes(f));
  if (nonNumeric) xFieldSel.value = nonNumeric;
  Array.from(yFieldsSel.options).forEach((opt) => {
    opt.selected = numericFields.includes(opt.value);
  });
}

function renderGenericTable() {
  const preview = currentGenericRows.slice(0, 100);
  const thead = `<thead><tr>${currentGenericFields.map((f) => `<th>${escapeHtml(f)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${preview
    .map((r) => `<tr>${currentGenericFields.map((f) => `<td>${escapeHtml(r[f])}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  dataTable.innerHTML = thead + tbody;
}

function escapeHtml(val) {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderGenericChart() {
  if (!currentGenericRows.length) return;
  const type = chartTypeSel.value;
  const x = xFieldSel.value;
  const ySelected = Array.from(yFieldsSel.selectedOptions).map((o) => o.value);
  if (!ySelected.length) return;

  const labels = currentGenericRows.map((r) => r[x]);
  const palette = [ELMI_COLORS.purple, ELMI_COLORS.red, ELMI_COLORS.orange, ELMI_COLORS.magenta];

  let datasets;
  if (type === "pie") {
    datasets = [
      {
        label: ySelected[0],
        data: currentGenericRows.map((r) => r[ySelected[0]]),
        backgroundColor: currentGenericRows.map((_, i) => palette[i % palette.length]),
      },
    ];
  } else {
    datasets = ySelected.map((f, i) => ({
      label: f,
      data: type === "scatter" ? currentGenericRows.map((r) => ({ x: r[x], y: r[f] })) : currentGenericRows.map((r) => r[f]),
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      fill: false,
      tension: 0.25,
    }));
  }

  if (genericChart) genericChart.destroy();
  genericChart = new Chart(el("genericChartCanvas"), {
    type,
    data: { labels: type === "pie" ? currentGenericRows.map((r) => r[x]) : labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: type === "pie" ? {} : { x: { title: { display: true, text: x } } },
    },
  });
}

el("renderChartBtn").addEventListener("click", renderGenericChart);

// ---------------- Settings (token only) ----------------

const settingsDialog = el("settingsDialog");
el("settingsBtn").addEventListener("click", () => {
  el("cfgToken").value = GitHub.getToken();
  settingsDialog.showModal();
});
el("cancelSettingsBtn").addEventListener("click", () => settingsDialog.close());
el("clearTokenBtn").addEventListener("click", () => {
  GitHub.setToken("");
  el("cfgToken").value = "";
});
el("settingsForm").addEventListener("submit", () => {
  GitHub.setToken(el("cfgToken").value.trim());
  settingsDialog.close();
});

// ---------------- Init ----------------

function initApp() {
  renderSiteChips();
  refreshSites();
}

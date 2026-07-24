"use strict";

// ESS*_RunData_Day[...] exports don't have a 100% stable column layout
// between sites/firmware versions (columns get added/removed/renamed - e.g.
// "PCS_Tmax" is missing in some exports, and the combined field at the end
// is sometimes named "...P_EMS" and sometimes ".../3/4"). So instead of
// fixed positional indices, we resolve each file's column positions from
// its own header row every time.
function looksLikeEssFile(headerLine) {
  return ["[BatRack]:BmsIdx", "PackV", "PackA"].every((token) => headerLine.includes(token));
}

function resolveEssColumns(headerFields) {
  const bmsIdx = headerFields.indexOf("[BatRack]:BmsIdx");
  if (bmsIdx === -1) return null;
  return {
    TIME: 0,
    BMS_IDX: bmsIdx,
    SOC: headerFields.indexOf("SOC", bmsIdx),
    PACK_V: headerFields.indexOf("PackV", bmsIdx),
    PACK_A: headerFields.indexOf("PackA", bmsIdx),
    PAC_OUT: headerFields.indexOf("PacOut"),
    // e.g. "[PC]:Tmax/Pauxload/P_EMS" or "[PC]:Tmax/Pauxload/3/4" - the
    // 3rd pipe-separated value in the corresponding data cell is always
    // the EMS setpoint regardless of what this column happens to be titled.
    PC_COMBINED: headerFields.findIndex((h) => h.startsWith("[PC]:Tmax/Pauxload")),
  };
}

// "..._RunData_Day[2026-07-23 00_00_00]_2026-07-23 08_31_13.csv" -> "2026-07-23"
function extractDayFromFilename(filename) {
  const m = filename.match(/Day\[(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseEssCsv(text, fallbackDate) {
  const lines = text.split(/\r?\n/);
  const headerFields = (lines[0] || "").split(",");
  if (!looksLikeEssFile(lines[0] || "")) return null;

  const col = resolveEssColumns(headerFields);
  if (!col || col.SOC === -1 || col.PACK_V === -1 || col.PACK_A === -1) return null;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    if (f.length < headerFields.length - 2) continue; // tolerate a trailing blank field
    const time = f[col.TIME];
    if (!time) continue;
    const ts = new Date(`${fallbackDate}T${time}`);
    if (isNaN(ts.getTime())) continue;

    const bms = f[col.BMS_IDX];
    const soc = parseFloat(f[col.SOC]);
    const packV = parseFloat(f[col.PACK_V]);
    const packA = parseFloat(f[col.PACK_A]);
    const pacOut = col.PAC_OUT !== -1 ? parseFloat(f[col.PAC_OUT]) : NaN;
    const pcParts = col.PC_COMBINED !== -1 ? (f[col.PC_COMBINED] || "").split("|") : [];
    const pEms = pcParts.length >= 3 ? parseFloat(pcParts[2]) : NaN;

    rows.push({
      ts,
      bms: bms === "1" ? 1 : bms === "0" ? 0 : null,
      soc: isNaN(soc) ? null : soc,
      power: isNaN(packV) || isNaN(packA) ? null : (packV * packA) / 1000, // kW
      pacOut: isNaN(pacOut) ? null : pacOut,
      pEms: isNaN(pEms) ? null : pEms,
    });
  }
  return rows;
}

// Merge already-parsed row arrays (e.g. from multiple selected days) and
// derive the chart-ready series from them.
function buildEssSeries(allRows) {
  const rows = allRows.slice().sort((a, b) => a.ts - b.ts);

  const pack0Power = [];
  const pack1Power = [];
  const pack0Soc = [];
  const pack1Soc = [];
  const battTotal = [];
  const socCombined = [];
  const pacOutSeries = [];

  let lastPower = { 0: null, 1: null };
  let lastSoc = { 0: null, 1: null };
  let lastPacOut = { 0: null, 1: null };
  let lastEms = null;

  let i = 0;
  while (i < rows.length) {
    const groupTs = rows[i].ts.getTime();
    let j = i;
    while (j < rows.length && rows[j].ts.getTime() === groupTs) {
      const r = rows[j];
      if (r.bms === 0 || r.bms === 1) {
        if (r.power !== null) {
          lastPower[r.bms] = r.power;
          (r.bms === 0 ? pack0Power : pack1Power).push({ x: r.ts, y: r.power });
        }
        if (r.soc !== null) {
          lastSoc[r.bms] = r.soc;
          (r.bms === 0 ? pack0Soc : pack1Soc).push({ x: r.ts, y: r.soc });
        }
        if (r.pacOut !== null) lastPacOut[r.bms] = r.pacOut;
      }
      if (r.pEms !== null) lastEms = r.pEms;
      j++;
    }

    const ts = rows[i].ts;
    if (lastPower[0] !== null || lastPower[1] !== null) {
      battTotal.push({ x: ts, y: (lastPower[0] || 0) + (lastPower[1] || 0) });
    }
    if (lastSoc[0] !== null || lastSoc[1] !== null) {
      const known = [lastSoc[0], lastSoc[1]].filter((v) => v !== null);
      socCombined.push({ x: ts, y: known.reduce((a, b) => a + b, 0) / known.length });
    }
    if (lastPacOut[0] !== null || lastPacOut[1] !== null) {
      pacOutSeries.push({ x: ts, y: (lastPacOut[0] || 0) + (lastPacOut[1] || 0) });
    }

    i = j;
  }

  return {
    pack0Power,
    pack1Power,
    pack0Soc,
    pack1Soc,
    battTotal,
    socCombined,
    pacOutSeries,
    emsSetpoint: lastEms,
    range: rows.length ? { min: rows[0].ts, max: rows[rows.length - 1].ts } : null,
  };
}

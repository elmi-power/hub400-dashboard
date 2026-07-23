"use strict";

// Fixed column layout for ESS*_RunData_Day[...] exports (0-based indices).
// These files have duplicate/odd header names (e.g. "Psum" appears twice
// under different bracket groups), so we address columns positionally
// instead of relying on the header row.
const ESS_COL = {
  TIME: 0,
  BMS_IDX: 13,
  SOC: 16,
  PACK_V: 22,
  PACK_A: 23,
  PAC_OUT: 36,
  PC_COMBINED: 93, // "Tmax|Pauxload|P_EMS"
};

const ESS_HEADER_SIGNATURE = ["[BatRack]:BmsIdx", "P_EMS"];

function looksLikeEssFile(headerLine) {
  return ESS_HEADER_SIGNATURE.every((token) => headerLine.includes(token));
}

// "..._RunData_Day[2026-07-23 00_00_00]_2026-07-23 08_31_13.csv" -> "2026-07-23"
function extractDayFromFilename(filename) {
  const m = filename.match(/Day\[(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseEssCsv(text, fallbackDate) {
  const lines = text.split(/\r?\n/);
  const header = lines[0] || "";
  if (!looksLikeEssFile(header)) return null;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    if (f.length < 40) continue;
    const time = f[ESS_COL.TIME];
    if (!time) continue;
    const ts = new Date(`${fallbackDate}T${time}`);
    if (isNaN(ts.getTime())) continue;

    const bms = f[ESS_COL.BMS_IDX];
    const soc = parseFloat(f[ESS_COL.SOC]);
    const packV = parseFloat(f[ESS_COL.PACK_V]);
    const packA = parseFloat(f[ESS_COL.PACK_A]);
    const pacOut = parseFloat(f[ESS_COL.PAC_OUT]);
    const pcParts = (f[ESS_COL.PC_COMBINED] || "").split("|");
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
  let lastPacOutTs = null;
  let lastEms = null;

  let i = 0;
  while (i < rows.length) {
    const groupTs = rows[i].ts.getTime();
    let j = i;
    let pacOutVal = null;
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
      }
      if (r.pacOut !== null) pacOutVal = r.pacOut;
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
    if (pacOutVal !== null && groupTs !== lastPacOutTs) {
      pacOutSeries.push({ x: ts, y: pacOutVal });
      lastPacOutTs = groupTs;
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

"use strict";

const ELMI_COLORS = {
  orange: "#f7941d",
  red: "#ee1c25",
  magenta: "#c6168d",
  purple: "#6a1b9a",
  purpleDark: "#3a0f52",
};

(function registerZoomPlugin() {
  const zoomGlobal = window.ChartZoom || window["chartjs-plugin-zoom"];
  if (zoomGlobal && window.Chart && window.Chart.register) {
    try {
      window.Chart.register(zoomGlobal);
    } catch (e) {
      /* already registered by the UMD bundle itself */
    }
  }
})();

let essCharts = {};

function destroyEssCharts() {
  Object.values(essCharts).forEach((c) => c && c.destroy());
  essCharts = {};
}

function zoomOptions(rangeMin, rangeMax) {
  return {
    pan: { enabled: false },
    zoom: {
      drag: {
        enabled: true,
        backgroundColor: "rgba(108,134,255,0.25)",
        borderColor: "rgba(108,134,255,0.7)",
        borderWidth: 1,
      },
      mode: "x",
    },
    limits: { x: { min: rangeMin?.getTime?.(), max: rangeMax?.getTime?.() } },
  };
}

function attachRightClickReset(canvas, chart) {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    chart.resetZoom();
  });
}

function baseTimeChart(canvasId, datasets, { rangeMin, rangeMax, yLabel, y1Label, stacked } = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const scales = {
    x: {
      type: "time",
      time: { tooltipFormat: "dd.MM.yyyy HH:mm:ss" },
      min: rangeMin,
      max: rangeMax,
      ticks: { maxRotation: 0 },
    },
    y: { title: { display: !!yLabel, text: yLabel || "" } },
  };
  if (y1Label) {
    scales.y1 = {
      position: "right",
      title: { display: true, text: y1Label },
      grid: { drawOnChartArea: false },
    };
  }

  const chart = new Chart(ctx, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      parsing: false,
      spanGaps: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      scales,
      plugins: {
        legend: { display: datasets.length > 1 },
        zoom: zoomOptions(rangeMin, rangeMax),
      },
    },
  });
  attachRightClickReset(ctx, chart);
  return chart;
}

function renderEssDashboard(series) {
  destroyEssCharts();
  const rangeMin = series.range ? series.range.min : undefined;
  const rangeMax = series.range ? series.range.max : undefined;

  essCharts.battTotal = baseTimeChart(
    "chartBattTotal",
    [{ label: "Batterieleistung gesamt (kW)", data: series.battTotal, borderColor: ELMI_COLORS.purple, backgroundColor: ELMI_COLORS.purple, borderWidth: 2, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax, yLabel: "kW" }
  );

  essCharts.pacOut = baseTimeChart(
    "chartPacOut",
    [{ label: "PacOut (kW)", data: series.pacOutSeries, borderColor: ELMI_COLORS.red, backgroundColor: ELMI_COLORS.red, borderWidth: 2, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax, yLabel: "kW" }
  );

  essCharts.socCombined = baseTimeChart(
    "chartSocCombined",
    [{ label: "SOC kombiniert (%)", data: series.socCombined, borderColor: ELMI_COLORS.magenta, backgroundColor: ELMI_COLORS.magenta, borderWidth: 2, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax, yLabel: "%" }
  );

  essCharts.emsCompare = baseTimeChart(
    "chartEmsCompare",
    [
      { label: "PacOut (kW)", data: series.pacOutSeries, borderColor: ELMI_COLORS.red, backgroundColor: ELMI_COLORS.red, borderWidth: 2, pointRadius: 0, tension: 0.15, yAxisID: "y" },
      { label: "EMS Setpoint (kW)", data: series.emsSetpointSeries, borderColor: ELMI_COLORS.orange, backgroundColor: ELMI_COLORS.orange, borderWidth: 2, pointRadius: 0, tension: 0.15, yAxisID: "y" },
      { label: "SOC kombiniert (%)", data: series.socCombined, borderColor: ELMI_COLORS.magenta, backgroundColor: ELMI_COLORS.magenta, borderWidth: 2, pointRadius: 0, tension: 0.15, yAxisID: "y1" },
    ],
    { rangeMin, rangeMax, yLabel: "kW", y1Label: "%" }
  );

  essCharts.pack0Power = baseTimeChart(
    "chartPack0Power",
    [{ label: "Pack 1 Leistung (kW)", data: series.pack0Power, borderColor: ELMI_COLORS.orange, backgroundColor: ELMI_COLORS.orange, borderWidth: 1.5, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax }
  );
  essCharts.pack1Power = baseTimeChart(
    "chartPack1Power",
    [{ label: "Pack 2 Leistung (kW)", data: series.pack1Power, borderColor: ELMI_COLORS.purple, backgroundColor: ELMI_COLORS.purple, borderWidth: 1.5, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax }
  );
  essCharts.pack0Soc = baseTimeChart(
    "chartPack0Soc",
    [{ label: "Pack 1 SOC (%)", data: series.pack0Soc, borderColor: ELMI_COLORS.red, backgroundColor: ELMI_COLORS.red, borderWidth: 1.5, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax }
  );
  essCharts.pack1Soc = baseTimeChart(
    "chartPack1Soc",
    [{ label: "Pack 2 SOC (%)", data: series.pack1Soc, borderColor: ELMI_COLORS.magenta, backgroundColor: ELMI_COLORS.magenta, borderWidth: 1.5, pointRadius: 0, tension: 0.15 }],
    { rangeMin, rangeMax }
  );
}

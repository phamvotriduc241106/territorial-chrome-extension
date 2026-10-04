/**
 * Automated Standalone SVG Match Report & Visual Telemetry Generator
 * Generates high-definition vector dashboards from replay JSON logs.
 * Pure Node.js (Zero external npm libraries).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function generateSvgDashboard(replayPath, outputPath) {
  if (!fs.existsSync(replayPath)) {
    console.error(`Replay file not found: ${replayPath}`);
    return;
  }

  const replay = JSON.parse(fs.readFileSync(replayPath, 'utf8'));
  const meta = replay.metadata;
  const w = meta.width;
  const h = meta.height;
  const grid = new Int8Array(meta.initialGrid);

  // Reconstruct final grid
  for (const t of replay.ticks) {
    if (t.deltas) {
      for (let i = 0; i < t.deltas.length; i += 2) {
        grid[t.deltas[i]] = t.deltas[i + 1];
      }
    }
  }

  // Player Color Palette
  const colors = [
    '#22222a', // 0: Neutral (dark charcoal)
    '#e63946', // 1: Player 1 (Crimson)
    '#457b9d', // 2: Player 2 (Cerulean)
    '#2a9d8f', // 3: Player 3 (Teal)
    '#e76f51', // 4: Player 4 (Coral)
    '#9b5de5', // 5: Player 5 (Amethyst)
    '#f15bb5', // 6: Player 6 (Magenta)
    '#00bbf9'  // 7: Player 7 (Cyan)
  ];
  const waterColor = '#0f172a'; // -1: Water (Deep navy)

  // Canvas Dimensions
  const svgW = 1200;
  const svgH = 800;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%" style="background:#090d16; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Header Banner -->
  <rect x="20" y="20" width="1160" height="70" rx="8" fill="url(#headerGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)"/>
  <text x="45" y="52" fill="#38bdf8" font-size="22" font-weight="700" letter-spacing="0.5">TERRITORIAL.IO ENGINE V2.2 — AUTONOMOUS REPLAY TELEMETRY</text>
  <text x="45" y="74" fill="#94a3b8" font-size="13">Map: <tspan fill="#f1f5f9" font-weight="600">${meta.mapName}</tspan> | Dimensions: ${w}×${h} | Duration: ${meta.totalTicks || replay.ticks.length} Ticks | Winner: <tspan fill="#4ade80" font-weight="700">${meta.winner ? meta.winner.name : 'Completed'}</tspan></text>

  <!-- Left Panel: 2D Spatial Map -->
  <rect x="20" y="110" width="600" height="420" rx="8" fill="url(#panelGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)"/>
  <text x="40" y="138" fill="#f1f5f9" font-size="16" font-weight="600">Final Territorial Distribution (2D Matrix)</text>
  <g transform="translate(40, 155)">
`;

  // Draw Grid Cells
  const cellW = 560 / w;
  const cellH = 350 / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x];
      let fill = waterColor;
      if (v >= 0) fill = colors[v % colors.length];
      svg += `    <rect x="${(x * cellW).toFixed(2)}" y="${(y * cellH).toFixed(2)}" width="${(cellW + 0.3).toFixed(2)}" height="${(cellH + 0.3).toFixed(2)}" fill="${fill}"/>\n`;
    }
  }

  svg += `  </g>

  <!-- Right Panel: Territory Progression Chart -->
  <rect x="640" y="110" width="540" height="420" rx="8" fill="url(#panelGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)"/>
  <text x="660" y="138" fill="#f1f5f9" font-size="16" font-weight="600">Territory Over Time (Macroeconomic Expansion)</text>
  <g transform="translate(660, 160)">
    <!-- Chart Grid Lines -->
    <line x1="40" y1="310" x2="500" y2="310" stroke="#334155" stroke-width="1"/>
    <line x1="40" y1="210" x2="500" y2="210" stroke="#334155" stroke-dasharray="4,4" stroke-width="1"/>
    <line x1="40" y1="110" x2="500" y2="110" stroke="#334155" stroke-dasharray="4,4" stroke-width="1"/>
    <line x1="40" y1="10"  x2="500" y2="10"  stroke="#334155" stroke-dasharray="4,4" stroke-width="1"/>

    <text x="30" y="315" fill="#64748b" font-size="10" text-anchor="end">0</text>
    <text x="30" y="215" fill="#64748b" font-size="10" text-anchor="end">100</text>
    <text x="30" y="115" fill="#64748b" font-size="10" text-anchor="end">200</text>
    <text x="30" y="15"  fill="#64748b" font-size="10" text-anchor="end">300</text>
`;

  // Draw Player Territory Series
  const numTicks = replay.ticks.length;
  const pCount = replay.players.length;
  for (let pi = 0; pi < pCount; pi++) {
    const p = replay.players[pi];
    const color = colors[(p.id) % colors.length];
    const points = [];
    for (let ti = 0; ti < numTicks; ti += Math.max(1, Math.floor(numTicks / 100))) {
      const tickData = replay.ticks[ti];
      const pData = tickData.players.find(o => o.id === p.id);
      if (pData) {
        const px = 40 + (ti / (numTicks - 1)) * 460;
        const py = 310 - Math.min(300, (pData.territory / 300) * 300);
        points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
      }
    }
    if (points.length > 1) {
      svg += `    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>\n`;
    }
  }

  svg += `  </g>

  <!-- Bottom Panel: Final Player Telemetry Table -->
  <rect x="20" y="550" width="1160" height="230" rx="8" fill="url(#panelGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)"/>
  <text x="45" y="582" fill="#f1f5f9" font-size="16" font-weight="600">Performance Telemetry & Tactical Metrics</text>

  <!-- Table Header -->
  <g transform="translate(45, 605)">
    <rect x="0" y="0" width="1110" height="28" fill="#1e293b" rx="4"/>
    <text x="20"  y="19" fill="#94a3b8" font-size="12" font-weight="700">PLAYER</text>
    <text x="260" y="19" fill="#94a3b8" font-size="12" font-weight="700">ENGINE POLICY</text>
    <text x="480" y="19" fill="#94a3b8" font-size="12" font-weight="700">FINAL TERRITORY</text>
    <text x="640" y="19" fill="#94a3b8" font-size="12" font-weight="700">LIQUID BALANCE</text>
    <text x="800" y="19" fill="#94a3b8" font-size="12" font-weight="700">NAVAL LANDINGS</text>
    <text x="960" y="19" fill="#94a3b8" font-size="12" font-weight="700">CHOKEPOINTS CUT</text>
  </g>
`;

  // Table Rows
  const lastTick = replay.ticks[replay.ticks.length - 1];
  for (let pi = 0; pi < replay.players.length; pi++) {
    const p = replay.players[pi];
    const pLast = lastTick.players.find(o => o.id === p.id) || {};
    const rowY = 645 + pi * 28;
    const color = colors[(p.id) % colors.length];

    svg += `  <g transform="translate(45, ${rowY})">
    <circle cx="10" cy="9" r="5" fill="${color}"/>
    <text x="25" y="14" fill="#f8fafc" font-size="13" font-weight="600">${p.name}</text>
    <text x="260" y="14" fill="#cbd5e1" font-size="13">${p.name.includes('V2') ? 'V2.2 Mathematical Kernel' : 'V1 Heuristic'}</text>
    <text x="480" y="14" fill="#38bdf8" font-size="13" font-weight="600">${pLast.territory || 0} px</text>
    <text x="640" y="14" fill="#4ade80" font-size="13">${pLast.balance || 0}</text>
    <text x="800" y="14" fill="#fbbf24" font-size="13">${pLast.naval || 0}</text>
    <text x="960" y="14" fill="#f43f5e" font-size="13">${pLast.cuts || 0}</text>
  </g>\n`;
  }

  svg += `</svg>`;

  fs.writeFileSync(outputPath, svg, 'utf8');
  console.log(`[SVG Report] Successfully generated dashboard to: ${outputPath}`);
}

// Generate reports for all recorded replays
const reports = [
  { in: 'experiments/replay-archipelago.json', out: 'experiments/archipelago-dashboard.svg' },
  { in: 'experiments/replay-europe.json',      out: 'experiments/europe-dashboard.svg' },
  { in: 'experiments/replay-world.json',       out: 'experiments/world-dashboard.svg' }
];

for (const r of reports) {
  generateSvgDashboard(path.join(__dirname, '..', r.in), path.join(__dirname, '..', r.out));
}

'use strict';

/* ============================================================
   TABLAS DE REFERENCIA
   ============================================================ */
const SHUTTER_TABLE = {
   5: { 30:19.3, 50:11.6, 80:7.2, 110:5.3, 130:4.5 },
  10: { 30:9.7,  50:5.8,  80:3.6, 110:2.6, 130:2.2 },
  15: { 30:6.5,  50:3.9,  80:2.4, 110:1.8, 130:1.5 },
  20: { 30:4.9,  50:2.9,  80:1.8, 110:1.3, 130:1.1 },
  25: { 30:4.0,  50:2.4,  80:1.5, 110:1.1, 130:0.9 },
  30: { 30:3.4,  50:2.0,  80:1.3, 110:0.9, 130:0.8 },
};
const TABLE_ANGLES = [5, 10, 15, 20, 25, 30];
const TABLE_SPEEDS = [30, 50, 80, 110, 130];

const MIN_CAPTURE = { 10:4, 30:7, 50:11, 80:24, 100:27, 130:30 };
const MIN_SPEEDS  = [10, 30, 50, 80, 100, 130];

const LANE_COLORS = {
  1: '#00d4aa',
  2: '#ffa940',
  3: '#ff6b9d',
  4: '#a78bfa',
};
const LANE_NAMES = {
  1: 'Carril cercano',
  2: 'Carril 2',
  3: 'Carril 3',
  4: 'Carril lejano',
};

/* ============================================================
   STATE
   ============================================================ */
let state = {
  h:      4.0,
  dc:     15.0,
  w:      3.5,
  v:      80,
  lanes:  1,
};

/* ============================================================
   MATH ENGINE
   ============================================================ */

/** Distancia lateral al centro del carril N (1-based) desde la cámara */
function laneOffset(laneIndex, laneWidth) {
  // Carril 1: 0.5w, Carril 2: 1.5w, etc.
  return (laneIndex - 0.5) * laneWidth;
}

function calcDt(h, dr) {
  return Math.sqrt(h * h + dr * dr);
}

function calcPhi(dt, dc) {
  return (Math.atan(dt / dc) * 180) / Math.PI;
}

/** Marca X: distancia horizontal en planta desde proyección de cámara hasta punto de captura */
function calcMarkX(dr, dc) {
  return Math.sqrt(dr * dr + dc * dc);
}

function selectTableAngle(phi) {
  for (const a of TABLE_ANGLES) { if (phi <= a) return a; }
  return TABLE_ANGLES[TABLE_ANGLES.length - 1];
}

function selectTableSpeed(v) {
  for (const s of TABLE_SPEEDS) { if (v <= s) return s; }
  return TABLE_SPEEDS[TABLE_SPEEDS.length - 1];
}

function getShutter(phi, v) {
  const ta = selectTableAngle(phi);
  const ts = selectTableSpeed(v);
  return { shutter: SHUTTER_TABLE[ta][ts], tableAngle: ta, tableSpeed: ts };
}

function getMinCapture(v) {
  if (v <= MIN_SPEEDS[0]) return MIN_CAPTURE[MIN_SPEEDS[0]];
  if (v >= MIN_SPEEDS[MIN_SPEEDS.length - 1]) return MIN_CAPTURE[MIN_SPEEDS[MIN_SPEEDS.length - 1]];
  for (let i = 0; i < MIN_SPEEDS.length - 1; i++) {
    const s0 = MIN_SPEEDS[i], s1 = MIN_SPEEDS[i+1];
    if (v >= s0 && v <= s1) {
      const t = (v - s0) / (s1 - s0);
      return MIN_CAPTURE[s0] + t * (MIN_CAPTURE[s1] - MIN_CAPTURE[s0]);
    }
  }
  return MIN_CAPTURE[MIN_SPEEDS[0]];
}

/** Calcula todos los datos para todos los carriles */
function computeAll() {
  const { h, dc, w, v, lanes } = state;
  const minDc = getMinCapture(v);
  const captureOk = dc >= minDc;

  const results = [];
  for (let i = 1; i <= lanes; i++) {
    const dr  = laneOffset(i, w);
    const dt  = calcDt(h, dr);
    const phi = calcPhi(dt, dc);
    const markX = calcMarkX(dr, dc);
    const { shutter, tableAngle, tableSpeed } = getShutter(phi, v);
    results.push({ lane: i, dr, dt, phi, markX, shutter, tableAngle, tableSpeed, captureOk, minDc });
  }
  return results;
}

/* ============================================================
   SLIDER LOGIC
   ============================================================ */
function updateSliderFill(sliderId, fillId, min, max, val) {
  const pct = ((val - min) / (max - min)) * 100;
  const fill = document.getElementById(fillId);
  if (fill) fill.style.width = pct + '%';
}

function bindSlider(id, fillId, key, decimals, min, max) {
  const el = document.getElementById(id);
  const valEl = document.getElementById('val-' + key);
  if (!el) return;

  const refresh = () => {
    const v = parseFloat(el.value);
    state[key] = v;
    if (valEl) valEl.textContent = v.toFixed(decimals);
    updateSliderFill(id, fillId, min, max, v);
    // flash accent
    if (valEl) {
      valEl.style.color = '#ffffff';
      setTimeout(() => { valEl.style.color = ''; }, 180);
    }
    runCalculation();
  };
  el.addEventListener('input', refresh);
  // Init fill
  updateSliderFill(id, fillId, min, max, parseFloat(el.value));
}

function bindLaneButtons() {
  document.querySelectorAll('.lane-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lane-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.lanes = parseInt(btn.dataset.lanes);
      runCalculation();
    });
  });
}

/* ============================================================
   LANE CARDS RENDER
   ============================================================ */
function renderLaneCards(results) {
  const container = document.getElementById('lane-cards');
  container.innerHTML = '';

  results.forEach((r, idx) => {
    const color = LANE_COLORS[r.lane];
    const name  = r.lane === 1 ? 'Carril cercano' :
                  r.lane === results.length && results.length > 1 ? 'Carril lejano' :
                  `Carril ${r.lane}`;
    const isOk  = r.phi <= 30;
    const gaugeW = Math.min((r.phi / 90) * 100, 100);
    const gaugeColor = r.phi <= 30 ? color : (r.phi <= 45 ? '#ffa940' : '#ff4f4f');

    const captureWarnHTML = !r.captureOk
      ? `<div class="card-capture-warn visible">
           ⚠ dc = ${state.dc.toFixed(1)} m &lt; mínimo recomendado de ${r.minDc.toFixed(1)} m para ${state.v} km/h
         </div>`
      : '';

    const card = document.createElement('div');
    card.className = 'lane-card';
    card.setAttribute('data-lane', r.lane);
    card.style.animationDelay = `${idx * 0.07}s`;

    card.innerHTML = `
      <div class="card-header">
        <div class="card-badge">${name}</div>
        <div class="card-lane-num">Carril ${r.lane}</div>
      </div>

      <div class="card-dr-label">d_r (offset lateral)</div>
      <div class="card-dr-val">${r.dr.toFixed(2)} <span>m</span></div>

      <div class="card-metrics">
        <div class="metric-box">
          <div class="metric-label">Ángulo φ</div>
          <div class="metric-value" style="color:${gaugeColor}">${r.phi.toFixed(1)}<span>°</span></div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Marca "X"</div>
          <div class="metric-value">${r.markX.toFixed(2)}<span>m</span></div>
        </div>
      </div>

      <div class="card-shutter">
        <div>
          <div class="card-shutter-label">Shutter máximo recomendado</div>
          <div class="card-shutter-val">${r.shutter.toFixed(1)} <span>ms</span></div>
        </div>
        <div style="text-align:right">
          <div class="card-shutter-label">Tabla φ / v</div>
          <div style="font-family:var(--font-m);font-size:11px;color:var(--text-mid)">${r.tableAngle}° / ${r.tableSpeed} km/h</div>
        </div>
      </div>

      <div class="card-gauge-wrap">
        <div class="card-gauge-track">
          <div class="card-gauge-fill" style="width:${gaugeW}%;background:${gaugeColor}"></div>
        </div>
        <div class="card-gauge-label" style="color:${gaugeColor}">${r.phi.toFixed(1)}°</div>
      </div>

      <div class="card-status ${isOk ? 'ok' : 'warn'}">
        ${isOk
          ? `✓ Ángulo correcto (${r.phi.toFixed(1)}° ≤ 30°)`
          : `⚠ Ángulo fuera de rango (${r.phi.toFixed(1)}° > 30°)`}
      </div>
      ${captureWarnHTML}
    `;

    container.appendChild(card);
  });
}

/* ============================================================
   RESULTS META
   ============================================================ */
function updateMeta(results) {
  const meta = document.getElementById('results-meta');
  if (meta) {
    meta.textContent = `${state.lanes} carril${state.lanes > 1 ? 'es' : ''} · dc = ${state.dc.toFixed(1)} m · v = ${state.v} km/h`;
  }

  // Param chips
  const dt1 = results[0] ? results[0].dt.toFixed(2) + ' m' : '—';
  setInner('chip-dt1', dt1);
  setInner('chip-dc', state.dc.toFixed(1) + ' m');
  setInner('chip-v', state.v + ' km/h');
}

function setInner(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

/* ============================================================
   SHUTTER TABLE HIGHLIGHT
   ============================================================ */
function highlightShutterTable(tableAngle, tableSpeed) {
  document.querySelectorAll('#shutter-table tbody tr').forEach(tr => tr.classList.remove('row-active'));
  document.querySelectorAll('#shutter-table thead th').forEach(th => th.classList.remove('col-active'));

  const row = document.querySelector(`#shutter-table tbody tr[data-angle="${tableAngle}"]`);
  if (row) row.classList.add('row-active');

  const colIdx = TABLE_SPEEDS.indexOf(tableSpeed) + 1;
  const ths = document.querySelectorAll('#shutter-table thead th');
  if (ths[colIdx]) ths[colIdx].classList.add('col-active');
}

/* ============================================================
   DISTANCE TABLE
   ============================================================ */
function updateDistanceTable(dc) {
  MIN_SPEEDS.forEach(speed => {
    const cell = document.getElementById(`dst-${speed}`);
    if (!cell) return;
    const minD = MIN_CAPTURE[speed];
    if (dc >= minD) {
      cell.textContent = '✔ OK';
      cell.className = 'dst-status dst-ok';
    } else {
      cell.textContent = `✘ dc < ${minD}m`;
      cell.className = 'dst-status dst-bad';
    }
  });
}

/* ============================================================
   CANVAS DIAGRAM (top-view bird's-eye)
   ============================================================ */
const DIAG_LANE_COLORS_RGBA = {
  1: 'rgba(0,212,170,',
  2: 'rgba(255,169,64,',
  3: 'rgba(255,107,157,',
  4: 'rgba(167,139,250,',
};

function drawDiagram(results) {
  const canvas = document.getElementById('diagram-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#060f1c';
  ctx.fillRect(0, 0, W, H);

  const { h, dc, w, lanes } = state;
  const totalRoadWidth = lanes * w;

  // Padding and scale
  const padLeft = 64, padRight = 20, padTop = 30, padBottom = 40;
  const drawW = W - padLeft - padRight;
  const drawH = H - padTop - padBottom;

  // Max horizontal range we need to display
  const maxDr = laneOffset(lanes, w) + w * 0.6;
  const maxDc = dc * 1.15;

  const scaleX = drawW / maxDc;
  const scaleY = drawH / (maxDr * 2);
  const scale = Math.min(scaleX, scaleY);

  // Origin: camera position (left-center)
  const ox = padLeft;
  const oy = H / 2;

  // Convert world → canvas
  const wx = (x) => ox + x * scale;
  const wy = (y) => oy - y * scale; // y is lateral (upward = closer lane)

  /* ── Grid lines ── */
  ctx.strokeStyle = 'rgba(26,48,72,0.7)';
  ctx.lineWidth = 1;
  // Vertical grid (distance)
  for (let d = 5; d <= dc * 1.1; d += 5) {
    ctx.beginPath(); ctx.moveTo(wx(d), padTop); ctx.lineTo(wx(d), H - padBottom);
    ctx.stroke();
    ctx.fillStyle = 'rgba(58,90,116,0.7)';
    ctx.font = '9px Share Tech Mono';
    ctx.textAlign = 'center';
    ctx.fillText(d + 'm', wx(d), H - padBottom + 14);
  }
  // Horizontal axis
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(W - padRight, oy); ctx.stroke();

  /* ── Road lanes ── */
  for (let i = 1; i <= lanes; i++) {
    const centerDr = laneOffset(i, w);
    const laneTop  = oy - (centerDr + w/2) * scale;
    const laneH    = w * scale;
    const col = DIAG_LANE_COLORS_RGBA[i] || 'rgba(100,100,100,';

    // Lane fill
    ctx.fillStyle = col + '0.06)';
    ctx.fillRect(ox, laneTop, drawW, laneH);

    // Lane borders
    ctx.strokeStyle = col + '0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(ox, laneTop); ctx.lineTo(W - padRight, laneTop); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, laneTop + laneH); ctx.lineTo(W - padRight, laneTop + laneH); ctx.stroke();
    ctx.setLineDash([]);

    // Lane center line
    ctx.strokeStyle = col + '0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(ox, wy(centerDr)); ctx.lineTo(W - padRight, wy(centerDr)); ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── For each lane: draw angle ray + capture point ── */
  results.forEach(r => {
    const col = DIAG_LANE_COLORS_RGBA[r.lane] || 'rgba(100,100,100,';
    const hexCol = LANE_COLORS[r.lane] || '#888';

    // Angle ray from camera
    const px = wx(r.dc);
    const py = wy(r.dr);

    // Ray
    ctx.strokeStyle = col + '0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);

    // Lateral offset line (camera → road center perpendicular)
    ctx.strokeStyle = col + '0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, py); ctx.stroke();
    ctx.setLineDash([]);

    // Capture point circle
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = col + '0.2)';
    ctx.fill();
    ctx.strokeStyle = hexCol;
    ctx.lineWidth = 2;
    ctx.stroke();

    // dc line (ground)
    ctx.strokeStyle = col + '0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);

    // Angle arc at camera
    const arcR = 28 + r.lane * 6;
    const startAngle = 0;
    const endAngle = -Math.atan2(r.dr, r.dc);
    ctx.beginPath();
    ctx.arc(ox, oy, arcR, startAngle, endAngle, true);
    ctx.strokeStyle = col + '0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Angle label
    const midA = endAngle / 2;
    const lx = ox + (arcR + 10) * Math.cos(midA);
    const ly = oy + (arcR + 10) * Math.sin(midA);
    ctx.fillStyle = hexCol;
    ctx.font = 'bold 11px Share Tech Mono';
    ctx.textAlign = 'center';
    ctx.fillText(r.phi.toFixed(1) + '°', lx, ly);

    // Capture point label
    ctx.fillStyle = hexCol;
    ctx.font = '9px Share Tech Mono';
    ctx.textAlign = 'left';
    ctx.fillText(r.markX.toFixed(1) + 'm', px + 8, py - 4);
  });

  /* ── Camera icon ── */
  ctx.fillStyle = 'rgba(0,212,170,0.15)';
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 1.5;
  // Camera body
  const cw = 22, ch = 14;
  ctx.beginPath();
  ctx.roundRect(ox - cw, oy - ch/2, cw, ch, 3);
  ctx.fill(); ctx.stroke();
  // Lens
  ctx.beginPath();
  ctx.arc(ox, oy, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,212,170,0.4)'; ctx.fill();
  ctx.strokeStyle = '#00d4aa'; ctx.stroke();

  // Camera label
  ctx.fillStyle = '#00d4aa';
  ctx.font = '9px Share Tech Mono';
  ctx.textAlign = 'center';
  ctx.fillText('CAM', ox - cw/2, oy + ch/2 + 12);

  /* ── Axis labels ── */
  ctx.fillStyle = 'rgba(58,90,116,0.9)';
  ctx.font = '9px Share Tech Mono';
  ctx.textAlign = 'left';
  ctx.fillText('← dc (distancia de captura)', ox + 8, H - padBottom + 28);
}

/* ============================================================
   DIAGRAM LEGEND
   ============================================================ */
function updateDiagramLegend(results) {
  const el = document.getElementById('diagram-legend');
  if (!el) return;
  el.innerHTML = results.map(r => {
    const name = r.lane === 1 ? 'Carril cercano' :
                 r.lane === state.lanes && state.lanes > 1 ? 'Carril lejano' :
                 `Carril ${r.lane}`;
    return `<div class="legend-item">
      <span class="legend-dot" style="background:${LANE_COLORS[r.lane]}"></span>${name}
    </div>`;
  }).join('');
}

/* ============================================================
   MAIN CALCULATION
   ============================================================ */
function runCalculation() {
  const results = computeAll();

  renderLaneCards(results);
  updateMeta(results);
  drawDiagram(results);
  updateDiagramLegend(results);

  // Highlight first lane in tables (most critical = highest angle = last lane)
  const worst = results.reduce((a, b) => b.phi > a.phi ? b : a, results[0]);
  highlightShutterTable(worst.tableAngle, worst.tableSpeed);
  updateDistanceTable(state.dc);
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  bindSlider('sl-h',  'fill-h',  'h',  1, 0.5, 10);
  bindSlider('sl-dc', 'fill-dc', 'dc', 1, 3,   50);
  bindSlider('sl-w',  'fill-w',  'w',  2, 2,   5);
  bindSlider('sl-v',  'fill-v',  'v',  0, 10,  130);

  bindLaneButtons();

  // Canvas resize observer for responsive diagram
  const canvas = document.getElementById('diagram-canvas');
  if (canvas) {
    const ro = new ResizeObserver(() => {
      const wrap = canvas.parentElement;
      if (!wrap) return;
      const newW = Math.floor(wrap.clientWidth - 16);
      const newH = Math.floor(newW * (300/460));
      if (canvas.width !== newW) {
        canvas.width = newW;
        canvas.height = newH;
        drawDiagram(computeAll());
      }
    });
    ro.observe(canvas.parentElement);
  }

  runCalculation();
});

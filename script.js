
const MAX_RADIUS_MM = 75;
const RECOMMENDED_RADIUS_MM = 67;
const DIE_COUNT = 9;
const SNAP_DISTANCE_MM = 1;

const stage = document.getElementById('stage');
const wafer = document.getElementById('wafer');
const tray = document.getElementById('tray');
const dieSettings = document.getElementById('dieSettings');
const rotateBtn = document.getElementById('rotateBtn');
const sendToTrayBtn = document.getElementById('sendToTrayBtn');
const resetAllBtn = document.getElementById('resetAllBtn');
const selectedLabel = document.getElementById('selectedLabel');
const selectedMeta = document.getElementById('selectedMeta');

const placedCountEl = document.getElementById('placedCount');
const recommendedCountEl = document.getElementById('recommendedCount');
const extendedCountEl = document.getElementById('extendedCount');
const invalidCountEl = document.getElementById('invalidCount');
const layoutStatusEl = document.getElementById('layoutStatus');

const defaultSizes = [
  [40.5, 33.24], [35.25, 42.64], [41, 33.98], [41, 51.93], [30, 25.45],
  [30, 24.73], [41, 31.90], [25.27, 20.92], [30.32, 24]
];

let selectedId = null;
let dragState = null;
const dies = [];

function getWaferMetrics() {
  const stageRect = stage.getBoundingClientRect();
  const waferRect = wafer.getBoundingClientRect();
  const cx = waferRect.left - stageRect.left + waferRect.width / 2;
  const cy = waferRect.top - stageRect.top + waferRect.height / 2;
  const pxPerMm = (waferRect.width / 2) / MAX_RADIUS_MM;
  return { cx, cy, pxPerMm, radiusPx: waferRect.width / 2 };
}

function getTrayRectRelative() {
  const s = stage.getBoundingClientRect();
  const t = tray.getBoundingClientRect();
  return {
    left: t.left - s.left,
    top: t.top - s.top,
    right: t.right - s.left,
    bottom: t.bottom - s.top,
    width: t.width,
    height: t.height
  };
}

function initSettings() {
  dieSettings.innerHTML = '';
  for (let i = 0; i < DIE_COUNT; i++) {
    const row = document.createElement('div');
    row.className = 'die-row';
    row.innerHTML = `
      <strong>D${i + 1}</strong>
      <div class="field">
        <label>Width (mm)</label>
        <input data-id="${i + 1}" data-dim="width" type="number" min="1" max="150" step="0.01" value="${defaultSizes[i][0]}">
      </div>
      <div class="field">
        <label>Height (mm)</label>
        <input data-id="${i + 1}" data-dim="height" type="number" min="1" max="150" step="0.01" value="${defaultSizes[i][1]}">
      </div>
    `;
    dieSettings.appendChild(row);
  }

  dieSettings.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', e => {
      const id = Number(e.target.dataset.id);
      const dim = e.target.dataset.dim;
      const value = Math.max(1, Number(e.target.value) || 1);
      const die = dies.find(d => d.id === id);
      die[dim] = value;
      renderDie(die);
      evaluateLayout();
      updateSelectedPanel();
    });
  });
}

function initDies() {
  dies.splice(0, dies.length);
  for (let i = 0; i < DIE_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'die tray-state';
    el.textContent = `D${i + 1}`;
    stage.appendChild(el);

    const die = {
      id: i + 1,
      width: defaultSizes[i][0],
      height: defaultSizes[i][1],
      rotation: 0,
      x: 0,
      y: 0,
      placed: false,
      el,
      status: 'tray'
    };
    dies.push(die);

    el.addEventListener('pointerdown', e => onPointerDown(e, die));
    el.addEventListener('click', () => selectDie(die.id));
  }
  arrangeTray();
  evaluateLayout();
}

function arrangeTray() {
  const r = getTrayRectRelative();
  const cols = 2;
  const gapX = 108;
  const gapY = 72;
  const startX = r.left + 28;
  const startY = r.top + 82;

  dies.forEach((die, idx) => {
    if (die.placed) return;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    die.x = startX + col * gapX;
    die.y = startY + row * gapY;
    renderDie(die, true);
  });
}

function renderDie(die, trayScale = !die.placed) {
  const { pxPerMm } = getWaferMetrics();
  const scale = trayScale ? Math.min(pxPerMm, 1.5) : pxPerMm;
  const wPx = die.width * scale;
  const hPx = die.height * scale;

  die.el.style.width = `${wPx}px`;
  die.el.style.height = `${hPx}px`;
  die.el.style.left = `${die.x - wPx / 2}px`;
  die.el.style.top = `${die.y - hPx / 2}px`;
  die.el.style.transform = `rotate(${die.rotation}deg)`;
  die.el.dataset.placed = die.placed ? 'true' : 'false';
}

function renderAll() {
  dies.forEach(d => renderDie(d));
}

function selectDie(id) {
  selectedId = id;
  dies.forEach(d => d.el.classList.toggle('selected', d.id === id));
  rotateBtn.disabled = false;
  sendToTrayBtn.disabled = false;
  updateSelectedPanel();
}

function updateSelectedPanel() {
  const die = dies.find(d => d.id === selectedId);
  if (!die) {
    selectedLabel.textContent = 'Selected: none';
    selectedMeta.textContent = 'Click a die to select it.';
    return;
  }

  selectedLabel.textContent = `Selected: D${die.id}`;
  if (die.placed) {
    const { cx, cy, pxPerMm } = getWaferMetrics();
    const xMm = (die.x - cx) / pxPerMm;
    const yMm = -(die.y - cy) / pxPerMm;
    selectedMeta.textContent = `${die.width.toFixed(2)} × ${die.height.toFixed(2)} mm • x ${xMm.toFixed(1)} mm • y ${yMm.toFixed(1)} mm • ${die.rotation}°`;
  } else {
    selectedMeta.textContent = `${die.width.toFixed(2)} × ${die.height.toFixed(2)} mm • in tray • ${die.rotation}°`;
  }
}

function onPointerDown(e, die) {
  e.preventDefault();
  selectDie(die.id);
  die.el.setPointerCapture(e.pointerId);

  const stageRect = stage.getBoundingClientRect();
  const pointerX = e.clientX - stageRect.left;
  const pointerY = e.clientY - stageRect.top;

  dragState = {
    die,
    pointerId: e.pointerId,
    offsetX: pointerX - die.x,
    offsetY: pointerY - die.y
  };

  die.el.addEventListener('pointermove', onPointerMove);
  die.el.addEventListener('pointerup', onPointerUp);
  die.el.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const stageRect = stage.getBoundingClientRect();
  dragState.die.x = e.clientX - stageRect.left - dragState.offsetX;
  dragState.die.y = e.clientY - stageRect.top - dragState.offsetY;
  dragState.die.placed = !pointInTray(dragState.die.x, dragState.die.y);
  snapDieToNeighbors(dragState.die);
  renderDie(dragState.die);
  evaluateLayout();
  updateSelectedPanel();
}

function onPointerUp(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const die = dragState.die;
  die.el.releasePointerCapture?.(e.pointerId);
  die.el.removeEventListener('pointermove', onPointerMove);
  die.el.removeEventListener('pointerup', onPointerUp);
  die.el.removeEventListener('pointercancel', onPointerUp);

  die.placed = !pointInTray(die.x, die.y);
  if (!die.placed) {
    arrangeTray();
  } else {
    snapDieToNeighbors(die);
    renderDie(die);
  }

  dragState = null;
  evaluateLayout();
  updateSelectedPanel();
}

function pointInTray(x, y) {
  const r = getTrayRectRelative();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function snapDieToNeighbors(die) {
  if (!die.placed) return;

  const { pxPerMm } = getWaferMetrics();
  const snapDistance = SNAP_DISTANCE_MM * pxPerMm;
  const rotated = die.rotation % 180 !== 0;
  const halfWidth = (rotated ? die.height : die.width) * pxPerMm / 2;
  const halfHeight = (rotated ? die.width : die.height) * pxPerMm / 2;
  let bestX = snapDistance;
  let bestY = snapDistance;
  let snappedX = die.x;
  let snappedY = die.y;

  dies.forEach(other => {
    if (!other.placed || other.id === die.id) return;

    const otherRotated = other.rotation % 180 !== 0;
    const combinedHalfWidth = halfWidth + (otherRotated ? other.height : other.width) * pxPerMm / 2;
    const combinedHalfHeight = halfHeight + (otherRotated ? other.width : other.height) * pxPerMm / 2;

    if (Math.abs(die.y - other.y) < combinedHalfHeight) {
      for (const targetX of [other.x - combinedHalfWidth, other.x + combinedHalfWidth]) {
        const distance = Math.abs(die.x - targetX);
        if (distance < bestX) {
          bestX = distance;
          snappedX = targetX;
        }
      }
    }

    if (Math.abs(die.x - other.x) < combinedHalfWidth) {
      for (const targetY of [other.y - combinedHalfHeight, other.y + combinedHalfHeight]) {
        const distance = Math.abs(die.y - targetY);
        if (distance < bestY) {
          bestY = distance;
          snappedY = targetY;
        }
      }
    }
  });

  die.x = snappedX;
  die.y = snappedY;
}

function getDieCornersMm(die) {
  const { cx, cy, pxPerMm } = getWaferMetrics();
  const centerX = (die.x - cx) / pxPerMm;
  const centerY = -(die.y - cy) / pxPerMm;

  const w = die.width;
  const h = die.height;
  const angle = die.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const pts = [
    [-w/2, -h/2], [w/2, -h/2],
    [w/2, h/2], [-w/2, h/2]
  ];

  return pts.map(([x, y]) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos
  }));
}

function polygonAxes(poly) {
  const axes = [];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
    const normal = { x: -edge.y, y: edge.x };
    const len = Math.hypot(normal.x, normal.y) || 1;
    axes.push({ x: normal.x / len, y: normal.y / len });
  }
  return axes;
}

function project(poly, axis) {
  const dots = poly.map(p => p.x * axis.x + p.y * axis.y);
  return { min: Math.min(...dots), max: Math.max(...dots) };
}

function polygonsOverlap(a, b) {
  const axes = [...polygonAxes(a), ...polygonAxes(b)];
  for (const axis of axes) {
    const pa = project(a, axis);
    const pb = project(b, axis);
    if (pa.max <= pb.min || pb.max <= pa.min) return false;
  }
  return true;
}

function evaluateLayout() {
  const placed = dies.filter(d => d.placed);
  const cornersMap = new Map();
  placed.forEach(d => cornersMap.set(d.id, getDieCornersMm(d)));

  const overlaps = new Set();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (polygonsOverlap(cornersMap.get(placed[i].id), cornersMap.get(placed[j].id))) {
        overlaps.add(placed[i].id);
        overlaps.add(placed[j].id);
      }
    }
  }

  let recommended = 0;
  let extended = 0;
  let invalid = 0;

  dies.forEach(die => {
    die.el.classList.remove('recommended-state', 'extended-state', 'invalid-state', 'tray-state');

    if (!die.placed) {
      die.status = 'tray';
      die.el.classList.add('tray-state');
      return;
    }

    const corners = cornersMap.get(die.id);
    const maxCornerRadius = Math.max(...corners.map(p => Math.hypot(p.x, p.y)));

    if (overlaps.has(die.id) || maxCornerRadius > MAX_RADIUS_MM + 1e-9) {
      die.status = 'invalid';
      die.el.classList.add('invalid-state');
      invalid++;
    } else if (maxCornerRadius <= RECOMMENDED_RADIUS_MM + 1e-9) {
      die.status = 'recommended';
      die.el.classList.add('recommended-state');
      recommended++;
    } else {
      die.status = 'extended';
      die.el.classList.add('extended-state');
      extended++;
    }
  });

  placedCountEl.textContent = `${placed.length} / ${DIE_COUNT}`;
  recommendedCountEl.textContent = recommended;
  extendedCountEl.textContent = extended;
  invalidCountEl.textContent = invalid;

  layoutStatusEl.classList.remove('valid', 'warning', 'invalid');

  if (invalid > 0) {
    layoutStatusEl.textContent = 'INVALID — overlap or outside R = 75 mm';
    layoutStatusEl.classList.add('invalid');
  } else if (placed.length < DIE_COUNT) {
    layoutStatusEl.textContent = 'IN PROGRESS — place all 9 dies';
  } else if (extended > 0) {
    layoutStatusEl.textContent = 'VALID — extended area used';
    layoutStatusEl.classList.add('warning');
  } else {
    layoutStatusEl.textContent = 'VALID — all dies inside R = 67 mm';
    layoutStatusEl.classList.add('valid');
  }
}

rotateBtn.addEventListener('click', () => {
  const die = dies.find(d => d.id === selectedId);
  if (!die) return;
  die.rotation = (die.rotation + 90) % 360;
  renderDie(die);
  evaluateLayout();
  updateSelectedPanel();
});

sendToTrayBtn.addEventListener('click', () => {
  const die = dies.find(d => d.id === selectedId);
  if (!die) return;
  die.placed = false;
  arrangeTray();
  evaluateLayout();
  updateSelectedPanel();
});

resetAllBtn.addEventListener('click', () => {
  selectedId = null;
  rotateBtn.disabled = true;
  sendToTrayBtn.disabled = true;

  dies.forEach((d, idx) => {
    d.width = defaultSizes[idx][0];
    d.height = defaultSizes[idx][1];
    d.rotation = 0;
    d.placed = false;
    d.el.classList.remove('selected');
  });

  dieSettings.querySelectorAll('input').forEach(input => {
    const id = Number(input.dataset.id);
    const dim = input.dataset.dim;
    input.value = dies[id - 1][dim];
  });

  arrangeTray();
  evaluateLayout();
  updateSelectedPanel();
});

window.addEventListener('resize', () => {
  if (!dragState) {
    arrangeTray();
    renderAll();
    evaluateLayout();
    updateSelectedPanel();
  }
});

initSettings();
initDies();

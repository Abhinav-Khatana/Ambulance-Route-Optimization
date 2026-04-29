const API = 'http://localhost:8765';

const MULT  = [1.0, 1.7, 2.8];
const TCOL  = ['#0b9275', '#dc9f35', '#df4255'];
const TLBL  = ['Clear', 'Moderate', 'Heavy'];

let svgEl, edgeGroupEl, nodeGroupEl, routeGroupEl, markerGroupEl;
let svgAmbuEl = null;
let svgEdgeEls = [];
let svgRouteEls = [];
let graphNodes = [], graphEdges = [];
let hospitals  = [], selHospId = null;
let selectedRoadEdgeId = null;
let backendOK  = false;
let edgeTraffic = [];
let autoTrafficOn = true;
let autoTrafficTimer = null;
let autoRecalcTimer = null;
let computeInProgress = false;
let lastRouteRequest = null;
let manualTrafficOverrides = new Set();
let autoRecalcEnabled = true;
const AUTO_TRAFFIC_MS = 10000;
const AUTO_RECALC_DEBOUNCE_MS = 700;

let routeLayers = svgRouteEls;
let edgeLayers  = svgEdgeEls;

setInterval(() => {
  document.getElementById('clk').textContent =
    new Date().toLocaleTimeString('en-IN', {hour12:false});
}, 1000);

const BOUNDS = { minLat:30.260, maxLat:30.385, minLng:77.930, maxLng:78.115 };
const VW = 900, VH = 700;
const ROAD_SNAP_SVG_PX = 24;

function toSVG(lat, lng) {
  return [
    (lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng) * VW,
    (BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat) * VH
  ];
}

function fromSVGClick(clientX, clientY) {
  const {x, y} = clientToSVGPoint(clientX, clientY);
  return {
    lat: BOUNDS.maxLat - y / VH * (BOUNDS.maxLat - BOUNDS.minLat),
    lng: BOUNDS.minLng + x / VW * (BOUNDS.maxLng - BOUNDS.minLng)
  };
}

function clientToSVGPoint(clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / rect.width * VW,
    y: (clientY - rect.top)  / rect.height * VH
  };
}

function fromSVGPoint(x, y) {
  return {
    lat: BOUNDS.maxLat - y / VH * (BOUNDS.maxLat - BOUNDS.minLat),
    lng: BOUNDS.minLng + x / VW * (BOUNDS.maxLng - BOUNDS.minLng)
  };
}

function projectPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  const dist = Math.hypot(px - x, py - y);
  return { x, y, t, dist };
}

function snapToNearestRoad(svgX, svgY, maxDist = ROAD_SNAP_SVG_PX) {
  if (!graphEdges.length || !graphNodes.length) return null;

  const nodeMap = {};
  graphNodes.forEach(n => nodeMap[n.id] = n);

  let best = null;
  graphEdges.forEach(edge => {
    const u = nodeMap[edge.u];
    const v = nodeMap[edge.v];
    if (!u || !v) return;

    const [x1, y1] = toSVG(u.lat, u.lng);
    const [x2, y2] = toSVG(v.lat, v.lng);
    const projected = projectPointToSegment(svgX, svgY, x1, y1, x2, y2);
    if (!best || projected.dist < best.dist) {
      best = { ...projected, edge, u, v };
    }
  });

  if (!best || best.dist > maxDist) return null;
  return { ...best, ...fromSVGPoint(best.x, best.y) };
}

function placeAmbuOnNearestRoad(lat, lng, maxDist = ROAD_SNAP_SVG_PX) {
  const [x, y] = toSVG(lat, lng);
  const snapped = snapToNearestRoad(x, y, maxDist);
  if (!snapped) return null;
  placeAmbu(snapped.lat, snapped.lng);
  return snapped;
}

function svgNS(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const tipEl = document.getElementById('svgTip') ||
              (() => { const d = document.createElement('div'); d.id='svgTip'; document.body.appendChild(d); return d; })();

function showTip(html, x, y) {
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  const mapRect = document.getElementById('map').getBoundingClientRect();
  tipEl.style.left = Math.min(x - mapRect.left + 14, mapRect.width - 210) + 'px';
  tipEl.style.top  = Math.max(y - mapRect.top  - 10, 5) + 'px';
}
function hideTip() { tipEl.style.display = 'none'; }

function initMap() {
  svgEl        = document.getElementById('graphSVG');
  edgeGroupEl  = document.getElementById('edgeGroup');
  nodeGroupEl  = document.getElementById('nodeGroup');
  routeGroupEl = document.getElementById('routeGroup');
  markerGroupEl= document.getElementById('markerGroup');


  svgEl.addEventListener('click', e => {
    if (e.target.dataset.noint) return;
    const {x, y} = clientToSVGPoint(e.clientX, e.clientY);
    const snapped = snapToNearestRoad(x, y);
    if (!snapped) {
      toast(graphEdges.length ? 'Click closer to a mapped road' : 'Road network is not loaded yet', 'er');
      return;
    }
    placeAmbu(snapped.lat, snapped.lng);
    toast(`Ambulance snapped to ${snapped.edge.road}`, 'ok');
  });

  placeAmbu(30.31654, 77.99128);
}

function placeAmbu(lat, lng) {
  document.getElementById('s-lat').value = lat.toFixed(5);
  document.getElementById('s-lng').value = lng.toFixed(5);
  document.getElementById('s-lat').classList.add('ok');
  document.getElementById('s-lng').classList.add('ok');

  if (svgAmbuEl) svgAmbuEl.remove();

  const [cx, cy] = toSVG(lat, lng);
  const g = svgNS('g', {});


  const ring = svgNS('circle', { cx, cy, r: 12, fill: 'rgba(223,63,82,.14)',
    stroke: 'rgba(223,63,82,.36)', 'stroke-width': 1.5 });
  ring.classList.add('ambu-ring');


  const dot = svgNS('circle', { cx, cy, r: 8, fill: '#df4255',
    stroke: '#fff', 'stroke-width': 2.5, filter:'url(#glow-red)' });


  const txt = svgNS('text', { x: cx, y: cy, 'text-anchor': 'middle',
    'dominant-baseline': 'central', 'font-size': 7, 'font-weight': 'bold',
    fill: '#fff', 'font-family': 'Arial,sans-serif', 'pointer-events': 'none' });
  txt.textContent = 'A';


  const hit = svgNS('circle', { cx, cy, r: 14, fill: 'transparent' });
  hit.dataset.noint = '1';
  hit.addEventListener('mousemove', ev =>
    showTip(`<b>Ambulance</b><br>GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, ev.clientX, ev.clientY));
  hit.addEventListener('mouseleave', hideTip);

  g.appendChild(ring); g.appendChild(dot); g.appendChild(txt); g.appendChild(hit);
  markerGroupEl.appendChild(g);
  svgAmbuEl = g;
}

async function checkBackend() {
  try {
    const r = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw 0;
    const d = await r.json();
    backendOK = true;
    document.getElementById('be-led').className = 'led';
    document.getElementById('be-lbl').textContent = `Backend OK · ${d.nodes}N ${d.edges}E`;
    document.getElementById('offline').classList.remove('on');
    return true;
  } catch {
    backendOK = false;
    document.getElementById('be-led').className = 'led err';
    document.getElementById('be-lbl').textContent = 'Backend Offline';
    document.getElementById('offline').classList.add('on');
    return false;
  }
}

async function loadGraph() {
  const r = await fetch(`${API}/api/graph`);
  const d = await r.json();
  graphNodes = d.nodes;
  graphEdges = d.edges;


  manualTrafficOverrides.clear();
  edgeTraffic = new Array(graphEdges.length).fill(0);
  seedAutoTraffic(true);


  while (nodeGroupEl.firstChild) nodeGroupEl.removeChild(nodeGroupEl.firstChild);

  graphNodes.forEach(n => {
    const [cx, cy] = toSVG(n.lat, n.lng);
    const g = svgNS('g', {});

    const dot = svgNS('circle', { cx, cy, r: 3.5,
      fill: '#94a8b8', stroke: '#ffffff', 'stroke-width': 1 });

    const hit = svgNS('circle', { cx, cy, r: 7, fill: 'transparent' });
    hit.style.cursor = 'default';
    hit.addEventListener('mousemove', ev =>
      showTip(`<b>${n.name}</b><br>Node #${n.id}<br>${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}`,
               ev.clientX, ev.clientY));
    hit.addEventListener('mouseleave', hideTip);

    g.appendChild(dot); g.appendChild(hit);
    nodeGroupEl.appendChild(g);
  });

  const curLat = parseFloat(document.getElementById('s-lat').value);
  const curLng = parseFloat(document.getElementById('s-lng').value);
  if (Number.isFinite(curLat) && Number.isFinite(curLng)) {
    placeAmbuOnNearestRoad(curLat, curLng, 9999);
  }
}

function drawAllEdges() {

  while (edgeGroupEl.firstChild) edgeGroupEl.removeChild(edgeGroupEl.firstChild);
  svgEdgeEls = [];

  const nodeMap = {};
  graphNodes.forEach(n => nodeMap[n.id] = n);

  graphEdges.forEach(e => {
    const nu = nodeMap[e.u], nv = nodeMap[e.v];
    if (!nu || !nv) return;

    const lvl  = edgeTraffic[e.id] || 0;
    const col  = TCOL[lvl];
    const wgt  = [2, 3.5, 5][lvl];
    const opac = [0.45, 0.75, 0.95][lvl];

    const [x1, y1] = toSVG(nu.lat, nu.lng);
    const [x2, y2] = toSVG(nv.lat, nv.lng);

    const g = svgNS('g', {});


    const vis = svgNS('line', { x1, y1, x2, y2,
      stroke: col, 'stroke-width': wgt, opacity: opac, 'stroke-linecap': 'round' });
    g.appendChild(vis);


    const hit = svgNS('line', { x1, y1, x2, y2,
      stroke: 'transparent', 'stroke-width': 14 });
    hit.style.cursor = 'pointer';
    hit.dataset.noint = '1';

    const edgeId = e.id;
    hit.addEventListener('click', ev => {
      ev.stopPropagation();
      if (ev.ctrlKey || ev.metaKey) {
        cycleEdgeTraffic(edgeId);
        return;
      }
      const {x, y} = clientToSVGPoint(ev.clientX, ev.clientY);
      const snap = snapToNearestRoad(x, y, 9999);
      if (!snap) return;
      placeAmbu(snap.lat, snap.lng);
      toast(`Ambulance snapped to ${snap.edge.road}`, 'ok');
    });
    hit.addEventListener('mousemove', ev => {
      const curLvl = edgeTraffic[edgeId] || 0;
      showTip(`<b>${e.road}</b><br>${TLBL[curLvl]} traffic · ${e.km.toFixed(2)} km<br>
               <span style="color:var(--dimmer);font-size:9px">Click to place ambulance · Ctrl-click for traffic</span>`,
               ev.clientX, ev.clientY);
    });
    hit.addEventListener('mouseleave', hideTip);
    g.appendChild(hit);

    edgeGroupEl.appendChild(g);
    svgEdgeEls.push(g);
  });

  edgeLayers = svgEdgeEls;
}

function cycleEdgeTraffic(edgeId) {
  edgeTraffic[edgeId] = (edgeTraffic[edgeId] + 1) % 3;
  drawAllEdges();
  restoreRouteLayers();
  scheduleAutoRecompute('cycle-edge');
}

function restoreRouteLayers() {

}

function scheduleAutoRecompute(reason = '') {
  if (!autoRecalcEnabled) return;
  if (!backendOK || selHospId === null || !lastRouteRequest || computeInProgress) return;
  if (autoRecalcTimer) clearTimeout(autoRecalcTimer);
  autoRecalcTimer = setTimeout(() => {
    autoRecalcTimer = null;
    if (!autoRecalcEnabled || !backendOK || selHospId === null || !lastRouteRequest || computeInProgress) return;
    compute(lastRouteRequest, true);
  }, AUTO_RECALC_DEBOUNCE_MS);
}

function weightedTrafficLevel() {
  const r = Math.random();
  if (r < 0.58) return 0;
  if (r < 0.86) return 1;
  return 2;
}

function updateAutoTrafficUI() {
  const btn = document.getElementById('auto-traffic-btn');
  const pill = document.getElementById('auto-traffic-pill');
  const chk = document.getElementById('auto-recalc-toggle');
  if (btn) btn.textContent = autoTrafficOn ? 'Auto traffic: ON' : 'Auto traffic: OFF';
  if (pill) {
    pill.textContent = autoTrafficOn ? 'LIVE' : 'PAUSED';
    pill.className = autoTrafficOn ? 'auto-pill' : 'auto-pill off';
  }
  if (chk) chk.checked = autoRecalcEnabled;
}

function seedAutoTraffic(silent = true) {
  if (!graphEdges.length) return;
  graphEdges.forEach(e => {
    if (manualTrafficOverrides.has(e.id)) return;
    edgeTraffic[e.id] = weightedTrafficLevel();
  });
  drawAllEdges();
  restoreRouteLayers();
  renderTrafficControls();
  updateAutoTrafficUI();
  if (!silent) toast('Automatic traffic refreshed', 'in');
  scheduleAutoRecompute('auto-traffic');
}

function refreshAutoTraffic() {
  seedAutoTraffic(false);
}

function toggleAutoTraffic() {
  autoTrafficOn = !autoTrafficOn;
  updateAutoTrafficUI();
  toast(autoTrafficOn ? 'Automatic traffic enabled' : 'Automatic traffic paused', autoTrafficOn ? 'ok' : 'in');
}

function setAutoRecalcEnabled(on) {
  autoRecalcEnabled = !!on;
  updateAutoTrafficUI();
  toast(autoRecalcEnabled ? 'Auto recalculate enabled' : 'Auto recalculate paused', autoRecalcEnabled ? 'ok' : 'in');
  if (autoRecalcEnabled) scheduleAutoRecompute('toggle-auto-recalc');
}

function clearAllTraffic() {
  if (!graphEdges.length) return;
  edgeTraffic = new Array(graphEdges.length).fill(0);
  manualTrafficOverrides.clear();
  drawAllEdges();
  restoreRouteLayers();
  renderTrafficControls();
  toast('All traffic cleared', 'ok');
  scheduleAutoRecompute('clear-traffic');
}

function startAutoTrafficLoop() {
  if (autoTrafficTimer) clearInterval(autoTrafficTimer);
  autoTrafficTimer = setInterval(() => {
    if (autoTrafficOn) seedAutoTraffic(true);
  }, AUTO_TRAFFIC_MS);
}

function renderTrafficControls() {
  const roadSel = document.getElementById('road-select');
  const trafficSel = document.getElementById('traffic-select');
  if (!roadSel || !trafficSel) return;

  roadSel.innerHTML = '';
  const nodeMap = {};
  graphNodes.forEach(n => nodeMap[n.id] = n);

  graphEdges.forEach(e => {
    const nu = nodeMap[e.u], nv = nodeMap[e.v];
    if (!nu || !nv) return;
    const opt = document.createElement('option');
    opt.value = String(e.id);
    opt.textContent = `${e.road} (#${e.id})`;
    roadSel.appendChild(opt);
  });

  if (graphEdges.length) {
    if (selectedRoadEdgeId === null || !graphEdges.some(e => e.id === selectedRoadEdgeId)) {
      selectedRoadEdgeId = graphEdges[0].id;
    }
    roadSel.value = String(selectedRoadEdgeId);
    trafficSel.value = String(edgeTraffic[selectedRoadEdgeId] || 0);
  }

  roadSel.onchange = () => {
    selectedRoadEdgeId = parseInt(roadSel.value, 10);
    trafficSel.value = String(edgeTraffic[selectedRoadEdgeId] || 0);
  };
}

function applyManualTraffic() {
  const roadSel = document.getElementById('road-select');
  const trafficSel = document.getElementById('traffic-select');
  if (!roadSel || !trafficSel || !graphEdges.length) return;

  const edgeId = parseInt(roadSel.value, 10);
  const lvl = parseInt(trafficSel.value, 10);
  if (Number.isNaN(edgeId) || Number.isNaN(lvl)) return;

  selectedRoadEdgeId = edgeId;
  manualTrafficOverrides.add(edgeId);
  edgeTraffic[edgeId] = lvl;
  drawAllEdges();
  restoreRouteLayers();
  renderTrafficControls();
  toast(`Road ${edgeId} set to ${TLBL[lvl]} traffic`, 'ok');
  scheduleAutoRecompute('manual-traffic');
}

async function loadHospitals() {
  const r = await fetch(`${API}/api/hospitals`);
  hospitals = await r.json();
  renderHospList();
  plotHospMarkers();
  renderTrafficControls();
  updateAutoTrafficUI();
}

function renderHospList() {
  const c = document.getElementById('h-list');
  c.innerHTML = '';
  hospitals.forEach(h => {
    const d = document.createElement('div');
    d.className = 'hc'; d.id = `hc${h.id}`;
    d.innerHTML = `<div class="hc-name">${h.name}</div>
      <div class="hc-ph">Phone ${h.phone}</div>
      <div class="hc-sp">${h.speciality} · ${h.beds} beds</div>`;
    d.onclick = () => pickHosp(h.id);
    c.appendChild(d);
  });
}

function plotHospMarkers() {


  if (!plotHospMarkers._els) plotHospMarkers._els = [];
  plotHospMarkers._els.forEach(el => el.remove());
  plotHospMarkers._els = [];

  hospitals.forEach(h => {
    const [cx, cy] = toSVG(h.lat, h.lng);
    const g = svgNS('g', {});


    const rect = svgNS('rect', {
      x: cx - 7, y: cy - 7, width: 14, height: 14,
      rx: 3, fill: '#0b9275', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 1.5
    });

    const txt = svgNS('text', { x: cx, y: cy, 'text-anchor': 'middle',
      'dominant-baseline': 'central', 'font-size': 7.5, 'font-weight': 'bold',
      fill: '#ffffff', 'font-family': 'Arial,sans-serif', 'pointer-events': 'none' });
    txt.textContent = 'H';

    const hit = svgNS('rect', { x: cx - 11, y: cy - 11, width: 22, height: 22,
      fill: 'transparent' });
    hit.style.cursor = 'pointer';
    hit.dataset.noint = '1';
    const hId = h.id;
    hit.addEventListener('click', ev => { ev.stopPropagation(); pickHosp(hId); });
    hit.addEventListener('mousemove', ev =>
      showTip(`<b>${h.name}</b><br>${h.phone}<br>${h.speciality} · ${h.beds} beds`,
               ev.clientX, ev.clientY));
    hit.addEventListener('mouseleave', hideTip);

    g.appendChild(rect); g.appendChild(txt); g.appendChild(hit);
    markerGroupEl.appendChild(g);
    plotHospMarkers._els.push(g);
  });
}

function pickHosp(id) {
  selHospId = id;
  document.querySelectorAll('.hc').forEach(c => c.classList.remove('on'));
  const el = document.getElementById(`hc${id}`);
  if (el) { el.classList.add('on'); el.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
  const h = hospitals.find(x => x.id === id);
  if (h) toast(`Selected: ${h.name}`, 'in');
}

function autoGPS() {
  if (!navigator.geolocation) return toast('Geolocation not available', 'er');
  toast('Detecting GPS…', 'in');
  navigator.geolocation.getCurrentPosition(
    p => {
      const snapped = placeAmbuOnNearestRoad(p.coords.latitude, p.coords.longitude, 9999);
      if (!snapped) {
        toast('Road network is not loaded yet', 'er');
        return;
      }
      toast(`GPS snapped to ${snapped.edge.road}`, 'ok');
    },
    () => toast('Using default location (Clement Town)', 'in')
  );
}

function resetSteps() {
  for (let i = 0; i < 5; i++) {
    document.getElementById(`s${i}`).className = 'ap-n';
    document.getElementById(`t${i}`).className = 'ap-t';
  }
}

async function animSteps() {
  for (let i = 0; i < 5; i++) {
    document.getElementById(`s${i}`).className = 'ap-n run';
    document.getElementById(`t${i}`).className = 'ap-t run';
    await wait(300);
    document.getElementById(`s${i}`).className = 'ap-n ok';
    document.getElementById(`t${i}`).className = 'ap-t ok';
  }
}

async function compute(preset = null, autoTriggered = false) {
  if (computeInProgress) return;
  if (!backendOK) { toast('Backend offline - start server.exe', 'er'); return; }
  if (selHospId === null) { toast('Select a destination hospital first', 'er'); return; }

  const srcLat = preset ? preset.srcLat : parseFloat(document.getElementById('s-lat').value);
  const srcLng = preset ? preset.srcLng : parseFloat(document.getElementById('s-lng').value);
  if (isNaN(srcLat) || isNaN(srcLng)) { toast('Enter valid coordinates', 'er'); return; }

  computeInProgress = true;
  lastRouteRequest = { srcLat, srcLng, hospital_id: selHospId };

  setLoad(true, 'Phase 1 — Building weighted graph…', 'Applying per-edge traffic multipliers');
  resetSteps();
  animSteps();
  await wait(280);

  setLoad(true, "Phase 2 — Dijkstra's Algorithm…", 'Min-heap exploration of all nodes');
  await wait(400);

  setLoad(true, 'Phase 3 — A* Search…', 'Haversine heuristic + D* upper-bound pruning');


  const edgeMult = graphEdges.map(e => MULT[edgeTraffic[e.id] || 0]);

  let data;
  try {
    const res = await fetch(`${API}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        src_lat: srcLat,
        src_lng: srcLng,
        hospital_id: selHospId,
        edge_mult: edgeMult
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    setLoad(false);
    computeInProgress = false;
    toast(`Request failed: ${e.message}`, 'er');
    return;
  }

  setLoad(false);
  computeInProgress = false;

  if (!data.found) {
    computeInProgress = false;
    toast(`No route: ${data.error || 'Unknown error'}`, 'er');
    return;
  }

  drawRoute(data, srcLat, srcLng);
  renderResult(data);
  updateStats(data);
  document.getElementById('mbadge').textContent = 'A* OPTIMAL ROUTE COMPUTED';

  const h = hospitals.find(x => x.id === selHospId);
  toast(`${h.name} — ${data.time_min.toFixed(1)} min · ${data.distance_km.toFixed(2)} km`, 'ok');
  computeInProgress = false;
}

function drawRoute(data, srcLat, srcLng) {

  while (routeGroupEl.firstChild) routeGroupEl.removeChild(routeGroupEl.firstChild);
  svgRouteEls = [];

  const h = hospitals.find(x => x.id === selHospId);

  const sameCoord = (a, b) =>
    Math.abs(a[0] - b[0]) < 0.00001 && Math.abs(a[1] - b[1]) < 0.00001;


  let gpsCoords = (data.path_nodes && data.path_nodes.length > 0)
    ? data.path_nodes.map(n => [n.lat, n.lng])
    : [[srcLat, srcLng], [h.lat, h.lng]];

  const srcCoord = [srcLat, srcLng];
  const hospCoord = h ? [h.lat, h.lng] : null;
  const hasSourceConnector = gpsCoords.length > 0 && !sameCoord(srcCoord, gpsCoords[0]);
  if (hasSourceConnector) gpsCoords.unshift(srcCoord);
  const hasHospitalConnector = hospCoord && gpsCoords.length > 0 && !sameCoord(hospCoord, gpsCoords[gpsCoords.length - 1]);
  if (hasHospitalConnector) gpsCoords.push(hospCoord);


  const pts = gpsCoords.map(([lat, lng]) => toSVG(lat, lng));
  const ptStr = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  if (pts.length > 1) {
    const shadow = svgNS('polyline', { points: ptStr, fill: 'none',
      stroke: '#17201f', 'stroke-width': 11, opacity: 0.22,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke' });
    const halo = svgNS('polyline', { points: ptStr, fill: 'none',
      stroke: '#ffffff', 'stroke-width': 7, opacity: 0.96,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke' });
    routeGroupEl.appendChild(shadow); svgRouteEls.push(shadow);
    routeGroupEl.appendChild(halo); svgRouteEls.push(halo);
  }


  if (data.path_ids && data.path_ids.length > 1) {
    for (let i = 0; i < data.path_ids.length - 1; i++) {
      const u = data.path_ids[i], v = data.path_ids[i + 1];
      const edge = graphEdges.find(e => (e.u===u&&e.v===v)||(e.u===v&&e.v===u));
      const lvl  = edge ? (edgeTraffic[edge.id] || 0) : 0;
      const segCol = TCOL[lvl];


      const pointOffset = hasSourceConnector ? 1 : 0;
      const [x1, y1] = pts[i + pointOffset];
      const [x2, y2] = pts[i + pointOffset + 1];
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;


      const glowSeg = svgNS('line', { x1, y1, x2, y2,
        stroke: segCol, 'stroke-width': 16, opacity: 0.18,
        'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
      routeGroupEl.appendChild(glowSeg); svgRouteEls.push(glowSeg);


      const border = svgNS('line', { x1, y1, x2, y2,
        stroke: '#fff', 'stroke-width': 5.5, opacity: 0.85,
        'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
      routeGroupEl.appendChild(border); svgRouteEls.push(border);


      const core = svgNS('line', { x1, y1, x2, y2,
        stroke: segCol, 'stroke-width': 3,
        'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
      routeGroupEl.appendChild(core); svgRouteEls.push(core);
    }
  } else {

    const glow = svgNS('polyline', { points: ptStr, fill: 'none',
      stroke: 'rgba(223,63,82,.18)', 'stroke-width': 16,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke' });
    const border = svgNS('polyline', { points: ptStr, fill: 'none',
      stroke: '#fff', 'stroke-width': 5.5, opacity: 0.9,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke' });
    const core = svgNS('polyline', { points: ptStr, fill: 'none',
      stroke: '#df4255', 'stroke-width': 3,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke' });
    [glow, border, core].forEach(el => { routeGroupEl.appendChild(el); svgRouteEls.push(el); });
  }

  if (hasSourceConnector && pts.length > 1) {
    const [x1, y1] = pts[0];
    const [x2, y2] = pts[1];
    const srcCore = svgNS('line', { x1, y1, x2, y2,
      stroke: '#df4255', 'stroke-width': 3.5,
      'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
    routeGroupEl.appendChild(srcCore); svgRouteEls.push(srcCore);
  }

  if (hasHospitalConnector && pts.length > 1) {
    const [x1, y1] = pts[pts.length - 2];
    const [x2, y2] = pts[pts.length - 1];
    const dstCore = svgNS('line', { x1, y1, x2, y2,
      stroke: '#0b9275', 'stroke-width': 3.5,
      'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
    routeGroupEl.appendChild(dstCore); svgRouteEls.push(dstCore);
  }


  if (data.path_nodes) {
    data.path_nodes.forEach((n, i) => {
      const isFirst = i === 0, isLast = i === data.path_nodes.length - 1;
      const col = isFirst ? '#0b9275' : isLast ? '#df4255' : '#dc9f35';
      const r   = (isFirst || isLast) ? 6 : 4;
      const [cx, cy] = toSVG(n.lat, n.lng);

      const dot = svgNS('circle', { cx, cy, r,
        fill: col, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.5 });
      routeGroupEl.appendChild(dot); svgRouteEls.push(dot);


      const hitR = svgNS('circle', { cx, cy, r: r + 6, fill: 'transparent' });
      hitR.dataset.noint = '1';
      hitR.addEventListener('mousemove', ev =>
        showTip(`<b>${n.name}</b><br>Step ${i+1}/${data.path_nodes.length}`, ev.clientX, ev.clientY));
      hitR.addEventListener('mouseleave', hideTip);
      routeGroupEl.appendChild(hitR); svgRouteEls.push(hitR);
    });
  }


  const [sx, sy] = pts[0];
  const srcDot = svgNS('circle', { cx: sx, cy: sy, r: 7,
    fill: '#df4255', stroke: '#fff', 'stroke-width': 2.5,
    filter: 'url(#glow-red)' });
  routeGroupEl.appendChild(srcDot); svgRouteEls.push(srcDot);


  const [hx, hy] = pts[pts.length - 1];
  const hospRect = svgNS('rect', { x: hx - 11, y: hy - 11, width: 22, height: 22,
    rx: 4, fill: '#0b9275', stroke: '#fff', 'stroke-width': 2.5,
    filter: 'url(#glow-green)' });
  const hospTxt = svgNS('text', { x: hx, y: hy, 'text-anchor': 'middle',
    'dominant-baseline': 'central', 'font-size': 9, 'font-weight': 'bold',
    fill: '#ffffff', 'font-family': 'Arial,sans-serif', 'pointer-events': 'none' });
  hospTxt.textContent = 'H';
  routeGroupEl.appendChild(hospRect); svgRouteEls.push(hospRect);
  routeGroupEl.appendChild(hospTxt); svgRouteEls.push(hospTxt);

  svgEl.appendChild(routeGroupEl);
  svgEl.appendChild(markerGroupEl);
  routeLayers = svgRouteEls;
}

function renderResult(data) {
  const h = hospitals.find(x => x.id === selHospId);
  const prun = data.dij_explored > 0
    ? ((1 - data.ast_explored / data.dij_explored) * 100).toFixed(1)
    : 0;
  const nodes = data.path_nodes || [];


  let heavyEdges = 0, modEdges = 0;
  if (data.path_ids && data.path_ids.length > 1) {
    const nodeMap = {};
    graphNodes.forEach(n => nodeMap[n.id] = n);
    for (let i = 0; i < data.path_ids.length - 1; i++) {
      const u = data.path_ids[i], v = data.path_ids[i+1];
      const e = graphEdges.find(e => (e.u===u&&e.v===v)||(e.u===v&&e.v===u));
      if (e) {
        const lvl = edgeTraffic[e.id] || 0;
        if (lvl === 2) heavyEdges++;
        else if (lvl === 1) modEdges++;
      }
    }
  }

  document.getElementById('rp').innerHTML = `
    <div class="rp-inner">
      <div class="rp-h">Optimal Route Found</div>
      <div class="rp-hosp">${h.name}</div>

      <div class="sg">
        <div class="sb">
          <div class="sb-l">ETA</div>
          <div class="sb-v cr">${data.time_min.toFixed(1)}<span style="font-size:11px;color:var(--dimmer)"> min</span></div>
        </div>
        <div class="sb">
          <div class="sb-l">DISTANCE</div>
          <div class="sb-v ca">${data.distance_km.toFixed(2)}<span style="font-size:11px;color:var(--dimmer)"> km</span></div>
        </div>
      </div>

      <div class="at">
        <div class="at-row"><span class="at-k">Algorithm chain</span><span class="at-v cb">Dijkstra → A*</span></div>
        <div class="at-row"><span class="at-k">Dijkstra nodes explored</span><span class="at-v ca">${data.dij_explored}</span></div>
        <div class="at-row"><span class="at-k">Dijkstra edge relaxations</span><span class="at-v ca">${data.dij_relaxed}</span></div>
        <div class="at-row"><span class="at-k">A* nodes explored</span><span class="at-v cg">${data.ast_explored}</span></div>
        <div class="at-row"><span class="at-k">A* edge relaxations</span><span class="at-v cg">${data.ast_relaxed}</span></div>
        <div class="at-row"><span class="at-k">States pruned by D*</span><span class="at-v cg">${data.ast_pruned}</span></div>
        <div class="at-row"><span class="at-k">Search space reduction</span><span class="at-v cg">${prun}%</span></div>
        <div class="at-row"><span class="at-k">BFS nodes explored</span><span class="at-v cb">${data.bfs_explored}</span></div>
        <div class="at-row"><span class="at-k">Path segments</span><span class="at-v" style="color:var(--white)">${nodes.length}</span></div>
        <div class="at-row"><span class="at-k">Heavy traffic roads</span>
          <span class="at-v" style="color:${heavyEdges>0?'var(--red)':'var(--green)'}">${heavyEdges}</span></div>
        <div class="at-row"><span class="at-k">Moderate traffic roads</span>
          <span class="at-v" style="color:${modEdges>0?'var(--amber)':'var(--green)'}">${modEdges}</span></div>
      </div>

      <div class="path-box">
        <div class="pb-h">A* PATH THROUGH GRAPH</div>
        <div class="pb-nodes">
          ${nodes.map((n, i) => `
            <span class="pn ${i===0?'s':i===nodes.length-1?'e':''}">${n.name}</span>
            ${i < nodes.length-1 ? '<span class="parr">›</span>' : ''}
          `).join('')}
          ${nodes.length === 0 ? '<span class="pn s">Direct (same node)</span>' : ''}
        </div>
      </div>

      <button class="btn-gmap" onclick="openGoogleMaps()">Open in Google Maps</button>
    </div>`;
}

function updateStats(data) {
  const prun = data.dij_explored > 0
    ? ((1 - data.ast_explored / data.dij_explored) * 100).toFixed(1) + '%'
    : '—';
  document.getElementById('s-eta').textContent  = data.time_min.toFixed(1) + ' min';
  document.getElementById('s-dist').textContent = data.distance_km.toFixed(2) + ' km';
  document.getElementById('s-dij').textContent  = data.dij_explored + ' nodes';
  document.getElementById('s-ast').textContent  = data.ast_explored + ' nodes';
  document.getElementById('s-prun').textContent = prun;
  const bfsEl = document.getElementById('s-bfs');
  if (bfsEl) bfsEl.textContent = (typeof data.bfs_explored === 'number' ? data.bfs_explored + ' nodes' : '—');
}

function openGoogleMaps() {
  const h = hospitals.find(x => x.id === selHospId);
  if (!h) return;
  const lat = document.getElementById('s-lat').value;
  const lng = document.getElementById('s-lng').value;
  window.open(`https://www.google.com/maps/dir/${lat},${lng}/${h.lat},${h.lng}?travelmode=driving`, '_blank');
}

function setLoad(on, t = '', s = '') {
  document.getElementById('loader').classList.toggle('on', on);
  if (t) document.getElementById('ld-t').textContent = t;
  if (s) document.getElementById('ld-s').textContent = s;
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function toast(msg, type = 'in') {
  const b = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  b.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 3800);
}

document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') compute(); });

async function boot() {
  initMap();
  const chk = document.getElementById('auto-recalc-toggle');
  if (chk) autoRecalcEnabled = chk.checked;
  updateAutoTrafficUI();
  startAutoTrafficLoop();

  const ok = await checkBackend();
  if (ok) {
    await loadGraph();
    await loadHospitals();
    startAutoTrafficLoop();
    toast('SAROS ready — click roads to set traffic levels', 'ok');
  } else {

    loadFallback();
    startAutoTrafficLoop();
    toast('Backend offline - start server.exe', 'er');
  }

  setInterval(async () => {
    const was = backendOK;
    await checkBackend();
    if (!was && backendOK) {
      await loadGraph();
      await loadHospitals();
      toast('Backend reconnected!', 'ok');
    }
  }, 8000);
}

function loadFallback() {
  hospitals = [
    {id:0, name:"Doon Hospital (Govt.)",           lat:30.31952,lng:78.02898,phone:"0135-2659999",speciality:"Govt. Multi-specialty",      beds:500},
    {id:1, name:"Max Super Speciality Hospital",    lat:30.34424,lng:77.99812,phone:"0135-6677000",speciality:"Super-specialty / Trauma",   beds:400},
    {id:2, name:"Shri Mahant Indiresh Hospital",    lat:30.30881,lng:78.04548,phone:"0135-2763200",speciality:"Multi-specialty",            beds:700},
    {id:3, name:"Synergy Hospital",                 lat:30.32452,lng:77.99602,phone:"0135-2761010",speciality:"Emergency & Trauma",         beds:150},
    {id:4, name:"GRD Hospital",                     lat:30.33098,lng:78.00502,phone:"0135-2675555",speciality:"Orthopaedics & General",     beds:200},
    {id:5, name:"Kailash Hospital",                 lat:30.31202,lng:77.98202,phone:"0135-2768900",speciality:"General Surgery",            beds:120},
    {id:6, name:"Avicenna Hospital",                lat:30.34602,lng:78.01752,phone:"0135-2771234",speciality:"Multi-specialty",            beds:180},
    {id:7, name:"IVY Hospital",                     lat:30.30952,lng:78.02102,phone:"0135-2789900",speciality:"Cardiology & Neurology",     beds:160},
    {id:8, name:"Columbia Asia Hospital",           lat:30.30802,lng:77.97702,phone:"0135-6676767",speciality:"Emergency & Multi-specialty",beds:250},
    {id:9, name:"Himalayan Institute Hospital",     lat:30.27998,lng:78.06498,phone:"0135-2471200",speciality:"Medical College Hospital",   beds:600},
    {id:10,name:"Pacific Hospital",                 lat:30.31500,lng:77.97800,phone:"0135-2780000",speciality:"General Surgery & Medicine", beds:180},
    {id:11,name:"Care Institute of Medical Sciences",lat:30.30000,lng:77.99500,phone:"0135-2550000",speciality:"Multi-specialty",           beds:220},
    {id:12,name:"Shri Guru Ram Rai Hospital",       lat:30.31000,lng:78.03800,phone:"0135-2761500",speciality:"Multi-specialty Hospital",   beds:300},
    {id:13,name:"Wingreens Hospital",               lat:30.35200,lng:78.04500,phone:"0135-2773000",speciality:"Trauma & Emergency",         beds:150},
    {id:14,name:"Shivalik Hospital",                lat:30.35200,lng:77.99200,phone:"0135-2710000",speciality:"Neurology & Cardiology",     beds:200},
  ];
  renderHospList();
  plotHospMarkers();
  renderTrafficControls();
}

boot();

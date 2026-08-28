import { firebaseConfig, useEmulators } from './firebase-config.js';
import { renderJazz, renderTitles } from './channel.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator,
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

'use strict';

const configured = useEmulators || (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY');
let db = null;
let currentUid = null;

// no-ops until attachSync() runs after sign-in; every mutation path calls these instead of
// touching localStorage directly, so Firestore (synced across devices) is the source of truth
async function fsSetItem(name, item) {
  if (!configured || !currentUid) return false;
  try {
    await setDoc(doc(db, 'users', currentUid, name, item.id), item);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}
async function fsDeleteItem(name, id) {
  if (!configured || !currentUid) return false;
  try {
    await deleteDoc(doc(db, 'users', currentUid, name, id));
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}
async function setNotes(text) {
  if (!configured || !currentUid) return;
  try {
    await setDoc(doc(db, 'users', currentUid, 'meta', 'notes'), { text }, { merge: true });
  } catch {
    flashError('Could not sync notes');
  }
}
async function setRoomDoc(data) {
  if (!configured || !currentUid) return;
  try {
    await setDoc(doc(db, 'users', currentUid, 'meta', 'room'), data);
  } catch (err) {
    console.error(err);
  }
}
async function setPref(key, value) {
  if (!configured || !currentUid) return;
  try {
    await setDoc(doc(db, 'users', currentUid, 'meta', 'prefs'), { [key]: value }, { merge: true });
  } catch (err) {
    console.error(err);
  }
}

/* ---------------- storage helpers (local cache only — Firestore is the source of truth) ---------------- */
const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const state = {
  notes: load('sw_notes', ''),
  events: load('sw_events', []),
  memories: load('sw_memories', []),
  wishlist: load('sw_wishlist', []),
  links: load('sw_links', []),
  decor: load('sw_decor', []),
  decorSize: load('sw_decorSize', 'medium'),
  linksSize: load('sw_linksSize', 'medium'),
  room: load('sw_room', null),
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const saveIndicator = document.getElementById('saveIndicator');
let saveTimer = null;
function flashSaved(text = 'Saved', isError = false) {
  saveIndicator.textContent = text;
  saveIndicator.classList.toggle('error', isError);
  saveIndicator.classList.add('show');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveIndicator.classList.remove('show'), isError ? 2600 : 1200);
}
const flashError = (text) => flashSaved(text, true);

const syncStatusEl = document.getElementById('syncStatus');
function setSyncStatus(status) {
  syncStatusEl.className = 'sync-status ' + status;
  syncStatusEl.textContent = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing…' : 'Offline';
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ================= pixel coffee shop scene (SkyeLens / home view) ================= */
// declared before the tabs section since activateTab() (called during initial boot,
// possibly with a #home deep link) needs startPixelScene/stopPixelScene to already exist
const sceneCanvas = document.getElementById('pixelScene');
const sceneCtx = sceneCanvas.getContext('2d');
sceneCtx.imageSmoothingEnabled = false;

// the room is the whole screen: height is fixed so the furniture keeps its scale,
// width follows the viewport so pixels stay square and the floor runs off to the right
const SCENE_H = 200;
const SCENE_MIN_W = 245;
let SCENE_W = SCENE_MIN_W;
sceneCanvas.width = SCENE_W;
sceneCanvas.height = SCENE_H;
const FLOOR_Y = 178;

/* ---- clickable characters in the scene ----
   each hotspot owns a hit box, a silhouette path traced around its sprite, and
   the lines it says; the outline/name/bubble DOM is shared and repositioned */
const JUKEBOX_TRACKS = [
  'now playing — "espresso dreams"',
  'now playing — "slow morning, no plans"',
  'now playing — "two sugars"',
  'now playing — "rain on the window"',
  'now playing — "last call, one more song"',
];

const SCENE_HOTSPOTS = [
  {
    id: 'barista',
    name: 'coffee guy',
    bbox: { x: 47, y: 121, w: 16, h: 35 },
    outline: 'M50,122 L60,122 L60,130 L62,130 L62,156 L48,156 L48,130 L50,130 Z',
    lines: ["hey, what's up", 'usual for you?', 'fresh pot just landed', 'take a seat, i got you'],
  },
  {
    id: 'regular',
    name: 'the regular',
    bbox: { x: 80, y: 160, w: 8, h: 18 },
    outline: 'M81,160 L87,160 L87,165 L88,165 L88,174 L87,174 L87,178 L85,178 L85,174 L83,174 L83,178 L81,178 L81,174 L80,174 L80,165 L81,165 Z',
    lines: ['this is my table', 'been here since open', 'shh, i’m reading', 'best seat in the shop'],
  },
  {
    id: 'jukebox',
    name: 'jukebox',
    bbox: { x: 219, y: 143, w: 16, h: 35 },
    outline: 'M222,144 L232,144 L232,148 L235,148 L235,178 L219,178 L219,148 L222,148 Z',
    lines: JUKEBOX_TRACKS,
  },
];

const sceneOutlineEl = document.getElementById('sceneOutline');
const sceneOutlinePathEl = document.getElementById('sceneOutlinePath');
const sceneHotspotNameEl = document.getElementById('sceneHotspotName');
const sceneHotspotBubbleEl = document.getElementById('sceneHotspotBubble');
let sceneBubbleTimeoutId = null;
let sceneHoveredId = null;
const hotspotLineIndex = {};

// widen the pixel grid to match the wrap's aspect so the scene fills the screen.
// re-checked periodically from the frame loop because the view's entry animation
// puts a transform on #view-home, which briefly makes this fixed wrap measure
// against the view instead of the viewport and report no height.
function resizeScene() {
  const wrap = sceneCanvas.parentElement;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return; // no box yet — try again next check
  const next = Math.max(SCENE_MIN_W, Math.round(SCENE_H * (w / h)));
  if (next === SCENE_W && sceneCanvas.width === next) return;
  SCENE_W = next;
  sceneCanvas.width = SCENE_W;
  sceneCanvas.height = SCENE_H;
  sceneCtx.imageSmoothingEnabled = false; // resizing the backing store resets this
  sceneOutlineEl.setAttribute('viewBox', `0 0 ${SCENE_W} ${SCENE_H}`);
}

function sceneClientToLogical(clientX, clientY) {
  const rect = sceneCanvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (SCENE_W / rect.width),
    y: (clientY - rect.top) * (SCENE_H / rect.height),
  };
}

function pointInBox(px, py, box) {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

function hotspotAt(px, py) {
  return SCENE_HOTSPOTS.find(h => pointInBox(px, py, h.bbox)) || null;
}

const pctX = (v) => (v / SCENE_W * 100) + '%';
const pctY = (v) => (v / SCENE_H * 100) + '%';

function showHotspotHover(hotspot) {
  if (!hotspot) {
    sceneHoveredId = null;
    sceneOutlineEl.classList.remove('visible');
    sceneHotspotNameEl.classList.remove('visible');
    return;
  }
  if (sceneHoveredId === hotspot.id) return;
  sceneHoveredId = hotspot.id;
  sceneOutlinePathEl.setAttribute('d', hotspot.outline);
  sceneHotspotNameEl.textContent = hotspot.name;
  sceneHotspotNameEl.style.left = pctX(hotspot.bbox.x + hotspot.bbox.w / 2);
  sceneHotspotNameEl.style.top = pctY(hotspot.bbox.y + hotspot.bbox.h);
  sceneOutlineEl.classList.add('visible');
  sceneHotspotNameEl.classList.add('visible');
}

function sayHotspotLine(hotspot) {
  const i = (hotspotLineIndex[hotspot.id] ?? -1) + 1;
  hotspotLineIndex[hotspot.id] = i;
  sceneHotspotBubbleEl.textContent = hotspot.lines[i % hotspot.lines.length];
  sceneHotspotBubbleEl.style.left = pctX(hotspot.bbox.x + hotspot.bbox.w / 2);
  sceneHotspotBubbleEl.style.top = pctY(hotspot.bbox.y);
  sceneHotspotBubbleEl.classList.add('visible');
  if (sceneBubbleTimeoutId) clearTimeout(sceneBubbleTimeoutId);
  sceneBubbleTimeoutId = setTimeout(() => sceneHotspotBubbleEl.classList.remove('visible'), 2600);
}

sceneCanvas.addEventListener('mousemove', (e) => {
  const p = sceneClientToLogical(e.clientX, e.clientY);
  const hit = hotspotAt(p.x, p.y);
  showHotspotHover(hit);
  sceneCanvas.style.cursor = hit ? 'pointer' : 'default';
});
sceneCanvas.addEventListener('mouseleave', () => {
  showHotspotHover(null);
  sceneCanvas.style.cursor = 'default';
});

sceneCanvas.addEventListener('click', (e) => {
  const p = sceneClientToLogical(e.clientX, e.clientY);
  const hit = hotspotAt(p.x, p.y);
  if (hit) sayHotspotLine(hit);
});

const SCENE_COLORS = {
  lightCord: '#221a13',
  lightGlow: '255,206,133',
  counterFront: '#4a2f21',
  counterTop: '#6e4632',
  counterShelf: '#241b14',
  shelfA: '#e8d9c4',
  shelfB: '#4a2f21',
  plantPot: '#6b4230',
  plantLeaf: '#5a7a4a',
  machineBody: '#332720',
  machineLight: '#e8b563',
  apron: '#8a5a3b',
  skin: '#d9b98f',
  cloth: '#f4ede3',
  mug: '#e8d9c4',
  coffee: '#3a2416',
  tableWood: '#6e4632',
  tableLeg: '#4a2f21',
  jukeboxBody: '#4a2f21',
  jukeboxTrim: '#6e4632',
  jukeboxPanelA: '#e8b563',
  jukeboxPanelB: '#7a3b32',
  jukeboxPanelC: '#5a8a7a',
  note: '#e8d9c4',
};

function scenePx(x, y, w, h, color) {
  sceneCtx.fillStyle = color;
  sceneCtx.fillRect(Math.round(x), Math.round(y), w, h);
}

/* ---- day/night: the shop takes on the colour of the real hour outside ---- */
const AMBIENCE_KEYS = [
  { h: 0,  tint: [26, 38, 84],    alpha: 0.44, light: 1.00 },
  { h: 5,  tint: [40, 46, 92],    alpha: 0.40, light: 0.95 },
  { h: 7,  tint: [214, 132, 92],  alpha: 0.20, light: 0.55 },
  { h: 10, tint: [255, 244, 216], alpha: 0.07, light: 0.28 },
  { h: 15, tint: [255, 240, 208], alpha: 0.07, light: 0.28 },
  { h: 18, tint: [236, 146, 74],  alpha: 0.20, light: 0.60 },
  { h: 20, tint: [70, 60, 112],   alpha: 0.34, light: 0.90 },
  { h: 24, tint: [26, 38, 84],    alpha: 0.44, light: 1.00 },
];

function getAmbience(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  let a = AMBIENCE_KEYS[0], b = AMBIENCE_KEYS[AMBIENCE_KEYS.length - 1];
  for (let i = 0; i < AMBIENCE_KEYS.length - 1; i++) {
    if (h >= AMBIENCE_KEYS[i].h && h <= AMBIENCE_KEYS[i + 1].h) {
      a = AMBIENCE_KEYS[i];
      b = AMBIENCE_KEYS[i + 1];
      break;
    }
  }
  const span = b.h - a.h;
  const k = span <= 0 ? 0 : (h - a.h) / span;
  const mix = (x, y) => x + (y - x) * k;
  return {
    tint: [mix(a.tint[0], b.tint[0]), mix(a.tint[1], b.tint[1]), mix(a.tint[2], b.tint[2])],
    alpha: mix(a.alpha, b.alpha),
    light: mix(a.light, b.light),
  };
}

/* ---- hourly disco: on the hour the ball drops and the whole shop dances ---- */
const PARTY_MS = 60000;
const PARTY_DROP_MS = 2600;
const PARTY_LIFT_MS = 4000;
const PARTY_BALL_REST_Y = 46;
const PARTY_BALL_TOP_Y = -16;
const PARTY_BALL_R = 8;

// the ball hangs dead centre of the screen, wherever the edges happen to be
const partyBallX = () => Math.round(SCENE_W / 2);

// milliseconds into the current party, or null the other 59 minutes of the hour
function getPartyElapsed() {
  const now = new Date();
  if (now.getMinutes() !== 0) return null;
  return now.getSeconds() * 1000 + now.getMilliseconds();
}

function partyBallY(elapsed) {
  if (elapsed < PARTY_DROP_MS) {
    const p = 1 - Math.pow(1 - elapsed / PARTY_DROP_MS, 3);
    return PARTY_BALL_TOP_Y + (PARTY_BALL_REST_Y - PARTY_BALL_TOP_Y) * p;
  }
  const liftStart = PARTY_MS - PARTY_LIFT_MS;
  if (elapsed > liftStart) {
    const p = Math.min(1, (elapsed - liftStart) / PARTY_LIFT_MS);
    return PARTY_BALL_REST_Y + (PARTY_BALL_TOP_Y - PARTY_BALL_REST_Y) * (p * p);
  }
  return PARTY_BALL_REST_Y;
}

function drawDiscoBall(t, elapsed) {
  const cy = partyBallY(elapsed);
  const cx = partyBallX();
  scenePx(cx, 0, 1, Math.max(0, Math.round(cy - PARTY_BALL_R)), SCENE_COLORS.lightCord);
  for (let gy = -PARTY_BALL_R; gy < PARTY_BALL_R; gy += 2) {
    for (let gx = -PARTY_BALL_R; gx < PARTY_BALL_R; gx += 2) {
      if (gx * gx + gy * gy > PARTY_BALL_R * PARTY_BALL_R) continue;
      const lum = 0.45 + 0.55 * Math.abs(Math.sin(gx * 0.55 + gy * 0.4 + t / 90));
      const hue = Math.round((t / 7 + gx * 22 + gy * 12) % 360);
      scenePx(cx + gx, cy + gy, 2, 2, `hsl(${hue},72%,${Math.round(28 + lum * 46)}%)`);
    }
  }
}

function drawPartyBeams(t, elapsed, strength) {
  const cy = partyBallY(elapsed);
  const cx = partyBallX();
  const reach = SCENE_W + SCENE_H;
  sceneCtx.save();
  sceneCtx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI / 2 + Math.sin(t / 1300 + i * 1.25) * 0.95;
    const hue = Math.round((t / 9 + i * 72) % 360);
    sceneCtx.fillStyle = `hsla(${hue},85%,60%,${(0.075 * strength).toFixed(3)})`;
    sceneCtx.beginPath();
    sceneCtx.moveTo(cx, cy);
    sceneCtx.lineTo(cx + Math.cos(ang - 0.11) * reach, cy + Math.sin(ang - 0.11) * reach);
    sceneCtx.lineTo(cx + Math.cos(ang + 0.11) * reach, cy + Math.sin(ang + 0.11) * reach);
    sceneCtx.closePath();
    sceneCtx.fill();
  }
  sceneCtx.restore();
}

// how far into "everyone is dancing" we are: 0 before the ball lands, 1 mid-party
function partyDanceStrength(elapsed) {
  if (elapsed == null) return 0;
  const inRamp = Math.min(1, elapsed / PARTY_DROP_MS);
  const liftStart = PARTY_MS - PARTY_LIFT_MS;
  const outRamp = elapsed > liftStart ? Math.max(0, 1 - (elapsed - liftStart) / PARTY_LIFT_MS) : 1;
  return Math.min(inRamp, outRamp);
}

const partyBob = (t, seed) => -Math.round(Math.abs(Math.sin(t / 150 + seed)) * 3);

function drawDanceArms(x, y, w, color, t, seed) {
  const up = Math.sin(t / 150 + seed) > 0;
  scenePx(x - 2, up ? y : y + 4, 2, 4, color);
  scenePx(x + w, up ? y + 4 : y, 2, 4, color);
}

function drawSceneRoom(t, ambience) {
  // no walls or floor fill — the site's own background shows through; just
  // string a few warm hanging lights across the open space above the furniture
  [45, 120, 220].forEach((lx, i) => {
    scenePx(lx, 0, 1, 15, SCENE_COLORS.lightCord);
    const flicker = 0.65 + 0.35 * Math.sin(t / 1300 + i * 1.4);
    // lamps burn brighter the darker it is outside
    const glow = Math.min(1, flicker * (0.45 + ambience.light * 0.75));
    sceneCtx.fillStyle = `rgba(${SCENE_COLORS.lightGlow},${glow.toFixed(2)})`;
    sceneCtx.fillRect(lx - 2, 15, 5, 4);
  });
}

function drawSceneCounter(t, dance = 0) {
  // shelf/backsplash — kept short so the barista stands out in clear space to its right
  scenePx(8, 124, 56, 30, SCENE_COLORS.counterShelf);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      scenePx(12 + col * 7, 130 + row * 11, 3, 6, (row + col) % 2 === 0 ? SCENE_COLORS.shelfA : SCENE_COLORS.shelfB);
    }
  }

  // plant
  scenePx(6, 148, 8, 6, SCENE_COLORS.plantPot);
  scenePx(6, 142, 4, 6, SCENE_COLORS.plantLeaf);
  scenePx(10, 140, 5, 7, SCENE_COLORS.plantLeaf);
  scenePx(8, 138, 4, 5, SCENE_COLORS.plantLeaf);

  // espresso machine
  scenePx(24, 144, 14, 10, SCENE_COLORS.machineBody);
  const blink = 0.5 + 0.5 * Math.sin(t / 500);
  sceneCtx.fillStyle = `rgba(232,181,99,${blink.toFixed(2)})`;
  sceneCtx.fillRect(29, 146, 2, 2);

  // barista behind the counter (torso only — counter front hides the rest)
  const bob = dance > 0 ? partyBob(t, 0) * dance : 0;
  scenePx(52, 124 + bob, 6, 2, SCENE_COLORS.machineBody); // hair, dark for a clear silhouette top
  scenePx(52, 126 + bob, 6, 6, SCENE_COLORS.skin);
  scenePx(50, 132 + bob, 10, 22, SCENE_COLORS.apron);
  if (dance > 0) {
    drawDanceArms(50, 134 + bob, 10, SCENE_COLORS.apron, t, 0);
  } else {
    // still wiping down the same mug he was wiping an hour ago
    scenePx(59, 146, 4, 4, SCENE_COLORS.mug);
    scenePx(60, 147, 2, 2, SCENE_COLORS.coffee);
    const wipeFrame = Math.floor(t / 300) % 2;
    scenePx(wipeFrame === 0 ? 58 : 61, 145, 2, 2, SCENE_COLORS.cloth);
  }

  // counter top + front (drawn last so it hides the barista's lower half)
  scenePx(4, 154, 64, 2, SCENE_COLORS.counterTop);
  scenePx(4, 156, 64, FLOOR_Y - 156, SCENE_COLORS.counterFront);
}

function drawSceneCup(cx, topY) {
  scenePx(cx - 2, topY - 4, 4, 4, SCENE_COLORS.mug);
  scenePx(cx - 1, topY - 4, 2, 1, SCENE_COLORS.coffee);
}

function drawSceneTable(cx) {
  const topY = FLOOR_Y - 10;
  scenePx(cx - 6, topY, 12, 2, SCENE_COLORS.tableWood);
  scenePx(cx - 1, topY + 2, 2, 8, SCENE_COLORS.tableLeg);
  drawSceneCup(cx, topY);
}

function drawSceneJukebox(t, dance = 0) {
  // the whole cabinet rocks along once the party starts
  const shake = dance > 0 ? Math.round(Math.sin(t / 110) * 1.5 * dance) : 0;
  scenePx(219 + shake, FLOOR_Y - 30, 16, 30, SCENE_COLORS.jukeboxTrim);
  scenePx(221 + shake, FLOOR_Y - 28, 12, 26, SCENE_COLORS.jukeboxBody);
  scenePx(222 + shake, FLOOR_Y - 34, 10, 5, SCENE_COLORS.jukeboxTrim);
  scenePx(223 + shake, FLOOR_Y - 24, 8, 12, SCENE_COLORS.jukeboxPanelA);
  const rate = dance > 0 ? 130 : 400;
  const blinkA = Math.sin(t / rate) > 0;
  const blinkB = Math.sin(t / rate + 2) > 0;
  const blinkC = Math.sin(t / rate + 4) > 0;
  scenePx(224 + shake, FLOOR_Y - 22, 2, 2, blinkA ? SCENE_COLORS.jukeboxPanelB : SCENE_COLORS.jukeboxTrim);
  scenePx(227 + shake, FLOOR_Y - 22, 2, 2, blinkB ? SCENE_COLORS.jukeboxPanelC : SCENE_COLORS.jukeboxTrim);
  scenePx(230 + shake, FLOOR_Y - 22, 2, 2, blinkC ? SCENE_COLORS.jukeboxPanelB : SCENE_COLORS.jukeboxTrim);
}

// ---- particles: coffee steam (multiple cups) + jukebox musical notes ----
const steamSpots = [
  { x: 95, y: FLOOR_Y - 14, lastSpawn: 0 },
  { x: 150, y: FLOOR_Y - 14, lastSpawn: 233 },
  { x: 205, y: FLOOR_Y - 14, lastSpawn: 466 },
];
let sceneSteam = [];

function updateSceneSteam(t, dt) {
  steamSpots.forEach(spot => {
    if (t - spot.lastSpawn > 750) {
      spot.lastSpawn = t;
      sceneSteam.push({ x: spot.x + (Math.random() * 2 - 1), y: spot.y, age: 0 });
    }
  });
  sceneSteam.forEach(p => {
    p.age += dt;
    p.y -= dt * 0.006;
    p.x += Math.sin(p.age / 300) * 0.05;
  });
  sceneSteam = sceneSteam.filter(p => p.age < 1800);
}

function drawSceneSteam() {
  sceneSteam.forEach(p => {
    const a = Math.max(0, 1 - p.age / 1800) * 0.5;
    sceneCtx.fillStyle = `rgba(232,224,212,${a.toFixed(2)})`;
    sceneCtx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  });
}

let sceneNotes = [];
let lastNoteSpawn = 0;

function updateSceneNotes(t, dt, dance = 0) {
  if (t - lastNoteSpawn > (dance > 0 ? 220 : 900)) {
    lastNoteSpawn = t;
    sceneNotes.push({ x: 227, y: FLOOR_Y - 35, age: 0 });
  }
  sceneNotes.forEach(n => {
    n.age += dt;
    n.y -= dt * 0.009;
    n.x += dt * 0.006;
  });
  sceneNotes = sceneNotes.filter(n => n.age < 2200);
}

function drawSceneNotes() {
  sceneNotes.forEach(n => {
    const a = Math.max(0, 1 - n.age / 2200);
    sceneCtx.fillStyle = `rgba(232,217,196,${a.toFixed(2)})`;
    const x = Math.round(n.x), y = Math.round(n.y);
    sceneCtx.fillRect(x, y, 2, 2);
    sceneCtx.fillRect(x + 1, y - 3, 1, 3);
  });
}

// ---- customers walking the floor, sized clearly bigger than the furniture ----
const scenePeople = [
  // the regular: speed 0 keeps him parked at his table, still keeps his feet planted
  { x: 80, dir: 1, speed: 0, still: true, minX: 80, maxX: 80, bodyColor: '#6b4230', headColor: '#e8d9c4', shoeColor: '#2c2018' },
  // starts right of the regular so it never parks on top of him
  { x: 110, dir: 1, speed: 10, minX: 104, maxX: 142, bodyColor: '#c9976a', headColor: '#e8d9c4', shoeColor: '#2c2018' },
  { x: 200, dir: -1, speed: 8, minX: 145, maxX: 218, bodyColor: '#4a6b7a', headColor: '#d9b98f', shoeColor: '#241b14' },
];

function updateScenePeople(dt, dance = 0) {
  if (dance > 0) return; // nobody's going anywhere, they're dancing
  scenePeople.forEach(p => {
    p.x += p.dir * p.speed * dt / 1000;
    if (p.x > p.maxX) { p.x = p.maxX; p.dir = -1; }
    if (p.x < p.minX) { p.x = p.minX; p.dir = 1; }
  });
}

function drawScenePerson(p, t, dance = 0) {
  const x = Math.round(p.x);
  const baseY = FLOOR_Y - 18;
  const bob = dance > 0 ? partyBob(t, p.x) * dance : 0;
  const y = baseY + bob;
  scenePx(x + 1, y, 6, 5, p.headColor);
  scenePx(x, y + 5, 8, 9, p.bodyColor);
  if (dance > 0) drawDanceArms(x, y + 6, 8, p.bodyColor, t, p.x);
  // feet stay planted on the floor while dancing, so only the body bounces
  const frame = p.still && dance === 0 ? 0 : Math.floor(t / (dance > 0 ? 150 : 220)) % 2;
  const step = dance > 0 ? (frame === 0 ? 1 : -1) : (p.dir > 0 ? 1 : -1);
  if (frame === 0) {
    scenePx(x + 1, baseY + 14, 2, 4, p.shoeColor);
    scenePx(x + 5, baseY + 14, 2, 4, p.shoeColor);
  } else {
    scenePx(x + 1 + step, baseY + 14, 2, 4, p.shoeColor);
    scenePx(x + 5 - step, baseY + 14, 2, 4, p.shoeColor);
  }
}

let sceneRunning = false;
let sceneRafId = null;
let sceneLastT = null;

const sceneClockTimeEl = document.getElementById('sceneClockTime');
const sceneClockSecEl = document.getElementById('sceneClockSec');
const sceneClockAmPmEl = document.getElementById('sceneClockAmPm');
let sceneClockIntervalId = null;

function updateSceneClockEl() {
  const now = new Date();
  const rawHours = now.getHours();
  let hours = rawHours % 12;
  if (hours === 0) hours = 12;
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  sceneClockTimeEl.textContent = `${hours}:${minutes}`;
  sceneClockSecEl.textContent = `:${seconds}`;
  sceneClockAmPmEl.textContent = rawHours < 12 ? 'AM' : 'PM';
}

let sceneResizeTick = 0;

function sceneFrame(t) {
  if (!sceneRunning) return;
  if (sceneLastT == null) sceneLastT = t;
  const dt = Math.min(t - sceneLastT, 60);
  sceneLastT = t;

  if (sceneResizeTick++ % 15 === 0) resizeScene();

  const partyElapsed = getPartyElapsed();
  const dance = partyDanceStrength(partyElapsed);
  const ambience = getAmbience();

  updateSceneSteam(t, dt);
  updateSceneNotes(t, dt, dance);
  updateScenePeople(dt, dance);

  sceneCtx.clearRect(0, 0, SCENE_W, SCENE_H);
  drawSceneRoom(t, ambience);
  drawSceneCounter(t, dance);
  drawSceneTable(95);
  drawSceneTable(150);
  drawSceneTable(205);
  drawSceneJukebox(t, dance);
  drawSceneSteam();
  drawSceneNotes();
  scenePeople.forEach(p => drawScenePerson(p, t, dance));
  if (partyElapsed != null) drawDiscoBall(t, partyElapsed);

  // tint only the pixels we actually drew, so the page background stays untouched
  sceneCtx.save();
  sceneCtx.globalCompositeOperation = 'source-atop';
  if (dance > 0) {
    const hue = Math.round((t / 6) % 360);
    sceneCtx.fillStyle = `hsla(${hue},70%,55%,${(0.30 * dance).toFixed(3)})`;
    sceneCtx.fillRect(0, 0, SCENE_W, SCENE_H);
  }
  const [r, g, b] = ambience.tint;
  const ambientAlpha = ambience.alpha * (1 - dance * 0.88);
  sceneCtx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${ambientAlpha.toFixed(3)})`;
  sceneCtx.fillRect(0, 0, SCENE_W, SCENE_H);
  sceneCtx.restore();

  // beams are light in the air, so they go over everything and ignore the tint
  if (partyElapsed != null && dance > 0) drawPartyBeams(t, partyElapsed, dance);

  sceneRafId = requestAnimationFrame(sceneFrame);
}

function startPixelScene() {
  if (sceneRunning) return;
  sceneRunning = true;
  sceneLastT = null;
  resizeScene(); // the wrap only has a box once the home view is showing
  sceneRafId = requestAnimationFrame(sceneFrame);
  updateSceneClockEl();
  sceneClockIntervalId = setInterval(updateSceneClockEl, 1000);
}
function stopPixelScene() {
  sceneRunning = false;
  if (sceneRafId) cancelAnimationFrame(sceneRafId);
  if (sceneClockIntervalId) clearInterval(sceneClockIntervalId);
}

/* ================= room (3D visualiser, lazily loaded) ================= */
const roomCanvas = document.getElementById('roomCanvas');
const roomStatus = document.getElementById('roomStatus');
const roomSelectedEl = document.getElementById('roomSelected');
let roomApi = null;
let roomBooting = false;
let roomSaveTimer = null;

function queueRoomSave(data) {
  state.room = data;
  save('sw_room', data);
  clearTimeout(roomSaveTimer);
  roomSaveTimer = setTimeout(() => setRoomDoc(data), 600);
}

function fillSwatches(el, colors, onPick) {
  el.innerHTML = '';
  colors.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.dataset.color = c;
    b.title = c;
    b.addEventListener('click', () => onPick(c));
    el.append(b);
  });
}

function markActiveSwatch(el, color) {
  el.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', (b.dataset.color || '').toLowerCase() === (color || '').toLowerCase()));
}

async function ensureRoom() {
  if (roomApi || roomBooting) return roomApi;
  roomBooting = true;
  try {
    const mod = await import('./room.js');
    const { CATALOG, PALETTE, DEFAULT_ROOM } = mod;

    roomApi = mod.createRoomScene({
      canvas: roomCanvas,
      onChange: queueRoomSave,
      onSelect: (item) => {
        roomSelectedEl.hidden = !item;
        if (!item) return;
        const spec = CATALOG[item.type];
        document.getElementById('roomSelName').textContent = spec.label;
        markActiveSwatch(document.getElementById('roomSwatches'), item.color);
        document.getElementById('roomColorInput').value = item.color;
        const rot = Math.round(((item.rotY || 0) * 180 / Math.PI + 360) % 360);
        document.getElementById('roomRot').value = rot;
        document.getElementById('roomRotVal').textContent = rot + '°';
        // wall pieces slide along their wall instead of turning freely
        document.getElementById('roomRotField').hidden = spec.mount === 'wall';
        const sc = Math.round((item.scale || 1) * 100);
        document.getElementById('roomScale').value = sc;
        document.getElementById('roomScaleVal').textContent = sc + '%';
      },
    });

    // add-a-piece buttons
    const addGrid = document.getElementById('roomAddGrid');
    Object.entries(CATALOG).forEach(([type, spec]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = spec.label;
      b.addEventListener('click', () => roomApi.addItem(type));
      addGrid.append(b);
    });

    fillSwatches(document.getElementById('roomSwatches'), PALETTE, (c) => {
      roomApi.patchSelected({ color: c });
      document.getElementById('roomColorInput').value = c;
    });
    fillSwatches(document.getElementById('roomWallSwatches'), PALETTE, (c) => {
      roomApi.setColors({ wallColor: c });
      markActiveSwatch(document.getElementById('roomWallSwatches'), c);
    });
    fillSwatches(document.getElementById('roomFloorSwatches'), PALETTE, (c) => {
      roomApi.setColors({ floorColor: c });
      markActiveSwatch(document.getElementById('roomFloorSwatches'), c);
    });

    document.getElementById('roomColorInput').addEventListener('input', (e) =>
      roomApi.patchSelected({ color: e.target.value }));
    document.getElementById('roomRot').addEventListener('input', (e) => {
      document.getElementById('roomRotVal').textContent = e.target.value + '°';
      roomApi.patchSelected({ rotY: Number(e.target.value) * Math.PI / 180 });
    });
    document.getElementById('roomScale').addEventListener('input', (e) => {
      document.getElementById('roomScaleVal').textContent = e.target.value + '%';
      roomApi.patchSelected({ scale: Number(e.target.value) / 100 });
    });
    document.getElementById('roomDelete').addEventListener('click', () => roomApi.deleteSelected());
    document.getElementById('roomReset').addEventListener('click', () => {
      roomApi.reset();
      syncRoomPanel(roomApi.getState());
    });

    [['roomW', 'w', 'roomWVal'], ['roomD', 'd', 'roomDVal'], ['roomH', 'h', 'roomHVal']].forEach(([id, key, valId]) => {
      document.getElementById(id).addEventListener('input', (e) => {
        document.getElementById(valId).textContent = e.target.value + ' ft';
        roomApi.setDims({ [key]: Number(e.target.value) });
      });
    });

    document.querySelectorAll('[data-room-view]').forEach(btn => {
      btn.addEventListener('click', () => roomApi.setView(btn.dataset.roomView));
    });

    roomApi.setState(state.room || DEFAULT_ROOM(), { keepCamera: false });
    syncRoomPanel(roomApi.getState());
    roomStatus.classList.add('hidden');
  } catch (err) {
    console.error(err);
    roomStatus.classList.remove('hidden');
    roomStatus.textContent = 'Could not load the 3D view — check your connection and refresh.';
  } finally {
    roomBooting = false;
  }
  return roomApi;
}

// pushes room state into the panel controls (after load, reset, or a synced change)
function syncRoomPanel(data) {
  if (!data) return;
  const set = (id, valId, v, unit) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
    const lab = document.getElementById(valId);
    if (lab) lab.textContent = v + unit;
  };
  set('roomW', 'roomWVal', data.dims.w, ' ft');
  set('roomD', 'roomDVal', data.dims.d, ' ft');
  set('roomH', 'roomHVal', data.dims.h, ' ft');
  markActiveSwatch(document.getElementById('roomWallSwatches'), data.wallColor);
  markActiveSwatch(document.getElementById('roomFloorSwatches'), data.floorColor);
}

function startRoom() {
  ensureRoom().then(api => api && api.start());
}
function stopRoom() {
  if (roomApi) roomApi.stop();
}

/* ---------------- tabs ---------------- */
const tabsEl = document.getElementById('tabs');
const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabGlow = document.getElementById('tabGlow');
const views = Array.from(document.querySelectorAll('.view'));

function positionGlow(tab) {
  const tRect = tab.getBoundingClientRect();
  const pRect = tabsEl.getBoundingClientRect();
  tabGlow.style.left = (tRect.left - pRect.left + 10) + 'px';
  tabGlow.style.width = (tRect.width - 20) + 'px';
}

function activateTab(name, { skipHash } = {}) {
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  views.forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  const active = tabButtons.find(b => b.dataset.view === name);
  tabGlow.classList.toggle('hidden', !active);
  if (active) positionGlow(active);
  if (!skipHash) history.replaceState(null, '', '#' + name);
  if (name === 'home') startPixelScene(); else stopPixelScene();
  if (name === 'room') startRoom(); else stopRoom();
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.view));
});

document.getElementById('brandHome').addEventListener('click', () => activateTab('home'));

window.addEventListener('resize', () => {
  const active = tabButtons.find(b => b.classList.contains('active'));
  if (active) positionGlow(active);
  if (sceneRunning) resizeScene();
});

/* ---------------- channel reference tabs (static content, rendered once) ---------------- */
renderJazz(document.getElementById('jazzBody'));
renderTitles(document.getElementById('titlesBody'));

const validViews = ['notes', 'events', 'memories', 'wishlist', 'links', 'decor', 'jazz', 'titles', 'room', 'home'];
const initialView = (location.hash || '').replace('#', '');
activateTab(validViews.includes(initialView) ? initialView : 'notes', { skipHash: true });
requestAnimationFrame(() => {
  const active = tabButtons.find(b => b.classList.contains('active'));
  if (active) positionGlow(active);
});

window.addEventListener('hashchange', () => {
  const v = location.hash.replace('#', '');
  if (validViews.includes(v)) activateTab(v, { skipHash: true });
});

/* ---------------- notes ---------------- */
const notesArea = document.getElementById('notesArea');
notesArea.value = state.notes;
let notesTimer = null;
notesArea.addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    state.notes = notesArea.value;
    save('sw_notes', state.notes);
    setNotes(state.notes);
  }, 400);
});

/* ---------------- shared url helper ---------------- */
function normalizeUrl(raw) {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

/* ---------------- tags ---------------- */
// "a, b ,, A" -> ["a","b"] — trimmed, lowercased, de-duped, capped so a card stays readable
function parseTags(raw) {
  if (!raw) return [];
  const seen = new Set();
  return raw.split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s.length <= 24 && !seen.has(s) && seen.add(s))
    .slice(0, 6);
}

const tagFilters = { wishlist: null, links: null };

function buildTagChips(item) {
  if (!item.tags || !item.tags.length) return null;
  const row = document.createElement('div');
  row.className = 'tag-row';
  item.tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    row.append(chip);
  });
  return row;
}

function renderTagFilter(kind, storeKey, rerender) {
  const el = document.getElementById(`${kind}TagFilter`);
  if (!el) return;
  const counts = new Map();
  state[storeKey].forEach(item => (item.tags || []).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));

  el.innerHTML = '';
  if (!counts.size) {
    el.classList.remove('show');
    return;
  }
  el.classList.add('show');

  const active = tagFilters[kind];
  const mkBtn = (label, tag) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-filter-btn' + (active === tag ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      tagFilters[kind] = active === tag ? null : tag;
      rerender();
    });
    return btn;
  };

  el.append(mkBtn('All', null));
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([tag, n]) => el.append(mkBtn(`${tag} · ${n}`, tag)));
}

const matchesTagFilter = (kind, item) => {
  const active = tagFilters[kind];
  return !active || (item.tags || []).includes(active);
};

/* ---------------- generic composer (events / memories / wishlist) ---------------- */
function wireComposer(kind, storeKey, { hasLink = false, hasTags = false, render } = {}) {
  const openBtn = document.querySelector(`[data-open="${kind}"]`);
  const composer = document.getElementById(`composer-${kind}`);
  const cancelBtn = document.querySelector(`[data-cancel="${kind}"]`);
  const saveBtn = document.querySelector(`[data-save="${kind}"]`);
  const titleInput = document.getElementById(`${kind}-title`);
  const descInput = document.getElementById(`${kind}-desc`);
  const linkInput = hasLink ? document.getElementById(`${kind}-link`) : null;
  const tagsInput = hasTags ? document.getElementById(`${kind}-tags`) : null;

  function closeComposer() {
    composer.classList.remove('open');
    openBtn.classList.remove('is-open');
    titleInput.value = '';
    descInput.value = '';
    if (linkInput) { linkInput.value = ''; linkInput.style.borderColor = ''; }
    if (tagsInput) tagsInput.value = '';
  }

  openBtn.addEventListener('click', () => {
    const isOpen = composer.classList.toggle('open');
    openBtn.classList.toggle('is-open', isOpen);
    if (isOpen) titleInput.focus();
    else closeComposer();
  });

  cancelBtn.addEventListener('click', closeComposer);

  async function commit() {
    const title = titleInput.value.trim();
    const desc = descInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    let link = null;
    if (linkInput && linkInput.value.trim()) {
      link = normalizeUrl(linkInput.value);
      if (!link) {
        linkInput.style.borderColor = 'rgba(226,114,91,0.6)';
        linkInput.focus();
        setTimeout(() => { linkInput.style.borderColor = ''; }, 900);
        return;
      }
    }

    const tags = tagsInput ? parseTags(tagsInput.value) : [];
    closeComposer();
    const item = { id: uid(), title, desc, link, tags, createdAt: Date.now() };
    const ok = await fsSetItem(storeKey, item);
    if (ok) flashSaved();
    else flashError('Could not save — check your connection');
  }

  saveBtn.addEventListener('click', commit);
  [titleInput, descInput, linkInput, tagsInput].filter(Boolean).forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
      if (e.key === 'Escape') closeComposer();
    });
  });
}

// builds the shared title/link/desc/meta card used by Events, Wishlist and Memories
function buildEntryCard(item, extraClass, onDelete) {
  const card = document.createElement('div');
  card.className = extraClass ? `card ${extraClass}` : 'card';
  card.dataset.id = item.id;
  if (item.mood) card.style.setProperty('--mood', moodColor(item.mood));
  card.classList.toggle('has-mood', !!item.mood);

  const top = document.createElement('div');
  top.className = 'card-top';
  const h3 = document.createElement('h3');
  h3.textContent = item.title;
  const delBtn = document.createElement('button');
  delBtn.className = 'card-delete';
  delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  delBtn.addEventListener('click', () => {
    card.classList.add('removing');
    setTimeout(onDelete, 260);
  });
  top.append(h3, delBtn);

  if (item.link) {
    const openLink = document.createElement('a');
    openLink.className = 'card-link';
    openLink.href = item.link;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      new URL(item.link).hostname.replace(/^www\./, '');
    card.append(top, openLink);
  } else {
    card.append(top);
  }

  const p = document.createElement('p');
  p.textContent = item.desc || '';
  if (item.desc) card.append(p);

  const tagRow = buildTagChips(item);
  if (tagRow) card.append(tagRow);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = fmtDate(item.createdAt);
  card.append(meta);
  return card;
}

function renderList(kind, storeKey) {
  const listEl = document.getElementById(`list-${kind}`);
  const emptyEl = document.getElementById(`empty-${kind}`);
  if (kind in tagFilters) renderTagFilter(kind, storeKey, () => renderList(kind, storeKey));
  const items = state[storeKey].filter(item => !(kind in tagFilters) || matchesTagFilter(kind, item));
  listEl.innerHTML = '';
  emptyEl.classList.toggle('show', items.length === 0);

  items.forEach((item, i) => {
    const card = buildEntryCard(item, '', () => fsDeleteItem(storeKey, item.id));
    card.style.animationDelay = Math.min(i * 40, 300) + 'ms';
    listEl.append(card);
  });
}

// memories get a fun scrapbook timeline instead of a flat grid, grouped by month and sorted newest-first
function renderMemories() {
  const listEl = document.getElementById('list-memories');
  const emptyEl = document.getElementById('empty-memories');
  const items = [...state.memories].sort((a, b) => b.createdAt - a.createdAt);
  listEl.innerHTML = '';
  emptyEl.classList.toggle('show', items.length === 0);

  const groups = new Map();
  items.forEach(item => {
    const label = new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  });

  let i = 0;
  groups.forEach((groupItems, label) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'timeline-group';

    const marker = document.createElement('div');
    marker.className = 'timeline-marker';

    const labelEl = document.createElement('div');
    labelEl.className = 'timeline-group-label';
    labelEl.textContent = label;

    const entriesEl = document.createElement('div');
    entriesEl.className = 'timeline-entries';

    groupItems.forEach(item => {
      const tilt = (i % 2 === 0 ? -1 : 1) * (1.1 + (i % 3) * 0.4);
      const wrap = document.createElement('div');
      wrap.className = 'tilt-wrap';
      wrap.style.setProperty('--tilt', tilt + 'deg');
      const card = buildEntryCard(item, 'memory-card', () => fsDeleteItem('memories', item.id));
      card.style.animationDelay = Math.min(i * 40, 300) + 'ms';
      card.append(buildMemoryThumb(item));
      wrap.append(card);
      entriesEl.append(wrap);
      i++;
    });

    groupEl.append(marker, labelEl, entriesEl);
    listEl.append(groupEl);
  });
}

/* ---------------- memory thumb: photo, emoji, or nothing, picked from a small corner popover ---------------- */
const MEMORY_EMOJIS = ['🎉', '✈️', '🏖️', '🎂', '📷', '🎵', '❤️', '🍕', '🌟', '🎓', '🐾', '🌅', '🎄', '🥳'];
const MEMORY_MOODS = [
  { id: 'joy', label: 'Joy', color: '#e8b563' },
  { id: 'calm', label: 'Calm', color: '#5a8a7a' },
  { id: 'love', label: 'Love', color: '#c96a7a' },
  { id: 'adventure', label: 'Adventure', color: '#4a6b7a' },
  { id: 'bittersweet', label: 'Bittersweet', color: '#8a5a3b' },
];
const moodColor = (id) => (MEMORY_MOODS.find(m => m.id === id) || {}).color || 'transparent';
let closeOpenMemoryPopover = null;

function buildMemoryThumb(item) {
  const wrap = document.createElement('div');
  wrap.className = 'memory-thumb-wrap';

  const thumb = document.createElement('button');
  thumb.type = 'button';
  thumb.className = 'memory-thumb' + (item.photo || item.emoji ? '' : ' is-empty');
  thumb.setAttribute('aria-label', 'Add a photo or emoji to this memory');

  if (item.photo) {
    const img = document.createElement('img');
    img.src = item.photo;
    img.alt = '';
    thumb.append(img);
  } else if (item.emoji) {
    thumb.textContent = item.emoji;
  } else {
    thumb.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }

  thumb.addEventListener('click', (e) => {
    e.stopPropagation();
    if (closeOpenMemoryPopover) {
      const wasThisOne = wrap.dataset.open === 'true';
      closeOpenMemoryPopover();
      if (wasThisOne) return;
    }
    openMemoryPopover(wrap, item);
  });

  wrap.append(thumb);
  return wrap;
}

function openMemoryPopover(wrap, item) {
  const popover = document.createElement('div');
  popover.className = 'memory-thumb-popover';

  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  MEMORY_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      fsSetItem('memories', { ...item, emoji, photo: null });
      close();
    });
    grid.append(btn);
  });

  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'popover-upload';
  uploadLabel.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4M12 4 7.5 8.5M12 4l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Upload Photo';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  fileInput.addEventListener('click', e => e.stopPropagation());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 480, 0.75);
      const ok = await fsSetItem('memories', { ...item, photo: dataUrl, emoji: null });
      if (!ok) flashError('Could not save — too large or offline');
    } catch {
      flashError("Couldn't read that photo");
    }
    close();
  });
  uploadLabel.append(fileInput);

  // mood: tints the card's edge so the timeline reads at a glance
  const moodRow = document.createElement('div');
  moodRow.className = 'mood-row';
  MEMORY_MOODS.forEach(mood => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mood-dot' + (item.mood === mood.id ? ' active' : '');
    btn.style.setProperty('--mood', mood.color);
    btn.title = mood.label;
    btn.setAttribute('aria-label', mood.label);
    btn.addEventListener('click', () => {
      fsSetItem('memories', { ...item, mood: item.mood === mood.id ? null : mood.id });
      close();
    });
    moodRow.append(btn);
  });

  popover.append(grid, moodRow, uploadLabel);

  if (item.photo || item.emoji || item.mood) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'popover-remove';
    removeBtn.textContent = 'Clear';
    removeBtn.addEventListener('click', () => {
      fsSetItem('memories', { ...item, photo: null, emoji: null, mood: null });
      close();
    });
    popover.append(removeBtn);
  }

  popover.addEventListener('click', e => e.stopPropagation());
  wrap.append(popover);
  wrap.dataset.open = 'true';

  function onOutsideClick() { close(); }
  function close() {
    popover.remove();
    wrap.dataset.open = 'false';
    document.removeEventListener('click', onOutsideClick);
    if (closeOpenMemoryPopover === close) closeOpenMemoryPopover = null;
  }
  document.addEventListener('click', onOutsideClick);
  closeOpenMemoryPopover = close;
}

wireComposer('events', 'events');
wireComposer('memories', 'memories', { render: renderMemories });
wireComposer('wishlist', 'wishlist', { hasLink: true, hasTags: true });
renderList('events', 'events');
renderMemories();
renderList('wishlist', 'wishlist');

/* ---------------- links (shared card builder, used by Links + Decor) ---------------- */

function buildLinkCard(item, i, onDelete) {
  const card = document.createElement('div');
  card.className = 'card link-card';
  card.dataset.id = item.id;
  card.style.animationDelay = Math.min(i * 40, 300) + 'ms';

  const hit = document.createElement('a');
  hit.className = 'link-open-hit';
  hit.href = item.url;
  hit.target = '_blank';
  hit.rel = 'noopener noreferrer';
  hit.setAttribute('aria-label', item.domain);

  const thumb = document.createElement('div');
  thumb.className = 'link-thumb';
  const shimmer = document.createElement('div');
  shimmer.className = 'shimmer';
  const fallback = document.createElement('div');
  fallback.className = 'link-fallback';
  fallback.textContent = (item.domain || '?').charAt(0).toUpperCase();
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.src = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=500&h=310`;
  let retries = 0;
  img.addEventListener('load', () => {
    // mshots returns a tiny placeholder while it generates the real shot; retry a few times
    if (img.naturalWidth <= 1 && retries < 4) {
      retries++;
      setTimeout(() => { img.src = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=500&h=310&r=${retries}`; }, 1500);
      return;
    }
    img.classList.add('loaded');
    shimmer.remove();
    fallback.remove();
  });
  img.addEventListener('error', () => { shimmer.remove(); img.remove(); });
  thumb.append(shimmer, fallback, img);

  const delBtn = document.createElement('button');
  delBtn.className = 'card-delete';
  delBtn.style.zIndex = 2;
  delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  delBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.add('removing');
    setTimeout(() => onDelete(), 260);
  });

  const body = document.createElement('div');
  body.className = 'link-body';
  const favicon = document.createElement('img');
  favicon.className = 'link-favicon';
  favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(item.domain)}`;
  favicon.alt = '';
  const info = document.createElement('div');
  info.className = 'link-info';
  const titleEl = document.createElement('div');
  titleEl.className = 'link-title';
  titleEl.textContent = item.domain;
  const domainEl = document.createElement('div');
  domainEl.className = 'link-domain';
  domainEl.textContent = item.url.replace(/^https?:\/\//, '');
  info.append(titleEl, domainEl);
  body.append(favicon, info);

  card.append(hit, thumb, delBtn, body);
  const tagRow = buildTagChips(item);
  if (tagRow) card.append(tagRow);
  return card;
}

function renderLinks() {
  const listEl = document.getElementById('list-links');
  const emptyEl = document.getElementById('empty-links');
  renderTagFilter('links', 'links', renderLinks);
  const items = state.links.filter(item => matchesTagFilter('links', item));
  listEl.innerHTML = '';
  emptyEl.classList.toggle('show', items.length === 0);

  items.forEach((item, i) => {
    const card = buildLinkCard(item, i, () => fsDeleteItem('links', item.id));
    listEl.append(card);
  });
}

const linkForm = document.getElementById('linkForm');
const linkInput = document.getElementById('linkInput');
const linkTagsInput = document.getElementById('linkTagsInput');
linkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const href = normalizeUrl(linkInput.value);
  if (!href) {
    linkInput.focus();
    linkInput.style.borderColor = 'rgba(226,114,91,0.6)';
    setTimeout(() => { linkInput.style.borderColor = ''; }, 900);
    return;
  }
  const domain = new URL(href).hostname.replace(/^www\./, '');
  const tags = parseTags(linkTagsInput.value);
  linkInput.value = '';
  linkTagsInput.value = '';
  const ok = await fsSetItem('links', { id: uid(), url: href, domain, tags, createdAt: Date.now() });
  if (ok) flashSaved();
  else flashError('Could not save — check your connection');
});

renderLinks();

/* ---------------- room decor (links + uploaded photos, masonry) ---------------- */

function buildPhotoCard(item, i, onDelete) {
  const card = document.createElement('div');
  card.className = 'card photo-card';
  card.style.animationDelay = Math.min(i * 40, 300) + 'ms';

  const img = document.createElement('img');
  img.src = item.dataUrl;
  img.loading = 'lazy';
  img.alt = '';

  const delBtn = document.createElement('button');
  delBtn.className = 'card-delete';
  delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  delBtn.addEventListener('click', () => {
    card.classList.add('removing');
    setTimeout(() => onDelete(), 260);
  });

  card.append(img, delBtn);
  return card;
}

function renderDecor() {
  const listEl = document.getElementById('list-decor');
  const emptyEl = document.getElementById('empty-decor');
  const items = state.decor;
  listEl.innerHTML = '';
  emptyEl.classList.toggle('show', items.length === 0);

  items.forEach((item, i) => {
    const onDelete = () => fsDeleteItem('decor', item.id);
    const card = item.kind === 'photo' ? buildPhotoCard(item, i, onDelete) : buildLinkCard(item, i, onDelete);
    listEl.append(card);
  });
}

async function addDecorItem(item) {
  const ok = await fsSetItem('decor', item);
  if (ok) flashSaved();
  else flashError('Could not save — too large or offline');
  return ok;
}

const decorLinkForm = document.getElementById('decorLinkForm');
const decorLinkInput = document.getElementById('decorLinkInput');
decorLinkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const href = normalizeUrl(decorLinkInput.value);
  if (!href) {
    decorLinkInput.focus();
    decorLinkInput.style.borderColor = 'rgba(226,114,91,0.6)';
    setTimeout(() => { decorLinkInput.style.borderColor = ''; }, 900);
    return;
  }
  const domain = new URL(href).hostname.replace(/^www\./, '');
  decorLinkInput.value = '';
  addDecorItem({ id: uid(), kind: 'link', url: href, domain, createdAt: Date.now() });
});

function compressImage(file, maxDim = 1000, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('bad image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

const decorPhotoInput = document.getElementById('decorPhotoInput');
decorPhotoInput.addEventListener('change', async () => {
  const files = Array.from(decorPhotoInput.files || []).filter(f => f.type.startsWith('image/'));
  for (const file of files) {
    try {
      const dataUrl = await compressImage(file);
      const ok = await addDecorItem({ id: uid(), kind: 'photo', dataUrl, createdAt: Date.now() });
      if (!ok) break;
    } catch {
      flashError("Couldn't read that photo");
    }
  }
  decorPhotoInput.value = '';
});

function applySizeUI(toggleId, targetEl, size) {
  const buttons = document.querySelectorAll(`#${toggleId} .size-btn`);
  targetEl.dataset.size = size;
  buttons.forEach(b => b.classList.toggle('active', b.dataset.size === size));
}

function wireSizeToggle(toggleId, targetEl, prefKey, initial) {
  const buttons = Array.from(document.querySelectorAll(`#${toggleId} .size-btn`));
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const size = btn.dataset.size;
      applySizeUI(toggleId, targetEl, size);
      state[prefKey] = size;
      save('sw_' + prefKey, size);
      setPref(prefKey, size);
    });
  });
  applySizeUI(toggleId, targetEl, initial);
}
wireSizeToggle('decorSizeToggle', document.getElementById('list-decor'), 'decorSize', state.decorSize);
wireSizeToggle('linksSizeToggle', document.getElementById('list-links'), 'linksSize', state.linksSize);

renderDecor();

/* ================= global search ================= */
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchBtn = document.getElementById('searchBtn');

const SEARCH_SECTIONS = [
  { key: 'events', view: 'events', label: 'Events', fields: i => [i.title, i.desc] },
  { key: 'memories', view: 'memories', label: 'Memories', fields: i => [i.title, i.desc] },
  { key: 'wishlist', view: 'wishlist', label: 'Wishlist', fields: i => [i.title, i.desc, ...(i.tags || [])] },
  { key: 'links', view: 'links', label: 'Links', fields: i => [i.domain, i.url, ...(i.tags || [])] },
  { key: 'decor', view: 'decor', label: 'Decor', fields: i => [i.domain, i.url] },
];

function openSearch() {
  searchOverlay.classList.add('show');
  searchInput.value = '';
  runSearch('');
  searchInput.focus();
}
function closeSearch() {
  searchOverlay.classList.remove('show');
}

// pulls the matching line out of the notes blob so the result shows real context
function noteMatches(q) {
  if (!state.notes) return [];
  return state.notes.split('\n')
    .map((line, idx) => ({ line: line.trim(), idx }))
    .filter(l => l.line && l.line.toLowerCase().includes(q))
    .slice(0, 5);
}

function jumpToResult(view, id) {
  closeSearch();
  activateTab(view);
  if (!id) return;
  requestAnimationFrame(() => {
    const card = document.querySelector(`#view-${view} [data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('search-hit');
    setTimeout(() => card.classList.remove('search-hit'), 1600);
  });
}

function addResultRow(parent, { label, sub, view, id }) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'search-result';
  const main = document.createElement('span');
  main.className = 'search-result-main';
  main.textContent = label;
  const meta = document.createElement('span');
  meta.className = 'search-result-sub';
  meta.textContent = sub;
  row.append(main, meta);
  row.addEventListener('click', () => jumpToResult(view, id));
  parent.append(row);
}

function runSearch(raw) {
  const q = raw.trim().toLowerCase();
  searchResults.innerHTML = '';

  if (!q) {
    const hint = document.createElement('div');
    hint.className = 'search-hint';
    hint.textContent = 'Type to search across everything you\'ve saved.';
    searchResults.append(hint);
    return;
  }

  let total = 0;

  const noteHits = noteMatches(q);
  if (noteHits.length) {
    const group = document.createElement('div');
    group.className = 'search-group';
    const h = document.createElement('div');
    h.className = 'search-group-label';
    h.textContent = 'Notes';
    group.append(h);
    noteHits.forEach(hit => {
      addResultRow(group, { label: hit.line.slice(0, 90), sub: `line ${hit.idx + 1}`, view: 'notes', id: null });
      total++;
    });
    searchResults.append(group);
  }

  SEARCH_SECTIONS.forEach(section => {
    const hits = (state[section.key] || []).filter(item =>
      section.fields(item).filter(Boolean).some(f => String(f).toLowerCase().includes(q)));
    if (!hits.length) return;
    const group = document.createElement('div');
    group.className = 'search-group';
    const h = document.createElement('div');
    h.className = 'search-group-label';
    h.textContent = section.label;
    group.append(h);
    hits.slice(0, 8).forEach(item => {
      addResultRow(group, {
        label: item.title || item.domain || 'Untitled',
        sub: item.desc ? item.desc.slice(0, 70) : (item.tags || []).join(' · ') || fmtDate(item.createdAt),
        view: section.view,
        id: item.id,
      });
      total++;
    });
    searchResults.append(group);
  });

  if (!total) {
    const none = document.createElement('div');
    none.className = 'search-hint';
    none.textContent = `Nothing matches “${raw.trim()}”.`;
    searchResults.append(none);
  }
}

searchBtn.addEventListener('click', openSearch);
searchInput.addEventListener('input', () => runSearch(searchInput.value));
searchOverlay.addEventListener('click', (e) => { if (e.target === searchOverlay) closeSearch(); });

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (e.key === 'Escape' && searchOverlay.classList.contains('show')) {
    closeSearch();
    return;
  }
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.key === '/' && !typing && !appShell.classList.contains('hidden')) {
    e.preventDefault();
    openSearch();
  }
});

/* ================= Firebase sync ================= */

const authGate = document.getElementById('authGate');
const appShell = document.getElementById('appShell');
const authTitle = document.getElementById('authTitle');
const authSub = document.querySelector('.auth-sub');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmit = document.getElementById('authSubmit');
const authSwitch = document.getElementById('authSwitch');
const signOutBtn = document.getElementById('signOutBtn');

function showApp(show) {
  appShell.classList.toggle('hidden', !show);
  authGate.classList.toggle('show', !show);
}

if (!configured) {
  showApp(false);
  authTitle.textContent = 'Setup needed';
  authSub.textContent = 'This site needs a Firebase project connected before it can sync. See firebase-config.js for setup steps.';
  authForm.style.display = 'none';
  authSwitch.style.display = 'none';
  setSyncStatus('offline');
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  let authMode = 'signin';
  authSwitch.addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    const isSignin = authMode === 'signin';
    authTitle.textContent = isSignin ? 'Sign In' : 'Create Account';
    authSubmit.textContent = isSignin ? 'Sign In' : 'Create Account';
    authSwitch.textContent = isSignin ? "Need an account? Sign up" : 'Already have an account? Sign in';
    authError.textContent = '';
  });

  function friendlyAuthError(code) {
    const map = {
      'auth/invalid-email': "That email doesn't look right.",
      'auth/user-not-found': 'No account with that email — try signing up.',
      'auth/wrong-password': 'Wrong password.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/email-already-in-use': 'An account already exists — try signing in.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/too-many-requests': 'Too many attempts — wait a bit and try again.',
      'auth/network-request-failed': 'Network error — check your connection.',
    };
    return map[code] || 'Something went wrong. Try again.';
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    authSubmit.disabled = true;
    try {
      if (authMode === 'signin') {
        await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
      }
    } catch (err) {
      authError.textContent = friendlyAuthError(err.code);
    } finally {
      authSubmit.disabled = false;
    }
  });

  signOutBtn.addEventListener('click', () => signOut(auth));

  let unsubscribers = [];
  function teardown() {
    unsubscribers.forEach(u => u());
    unsubscribers = [];
  }

  const renderers = {
    events: () => renderList('events', 'events'),
    memories: renderMemories,
    wishlist: () => renderList('wishlist', 'wishlist'),
    links: renderLinks,
    decor: renderDecor,
  };

  function attachSync(uid) {
    currentUid = uid;
    setSyncStatus('syncing');

    Object.keys(renderers).forEach(name => {
      const q = query(collection(db, 'users', uid, name), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, snap => {
        state[name] = snap.docs.map(d => d.data());
        save('sw_' + name, state[name]);
        renderers[name]();
        setSyncStatus('synced');
      }, err => {
        console.error(err);
        setSyncStatus('offline');
      });
      unsubscribers.push(unsub);
    });

    const unsubNotes = onSnapshot(doc(db, 'users', uid, 'meta', 'notes'), snap => {
      const text = snap.exists() ? (snap.data().text || '') : '';
      state.notes = text;
      save('sw_notes', text);
      if (document.activeElement !== notesArea) notesArea.value = text;
    }, err => console.error(err));
    unsubscribers.push(unsubNotes);

    const unsubRoom = onSnapshot(doc(db, 'users', uid, 'meta', 'room'), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      state.room = data;
      save('sw_room', data);
      // don't stomp the layout mid-drag; the local copy is already this change
      if (roomApi && !document.getElementById('view-room').classList.contains('active')) {
        roomApi.setState(data);
        syncRoomPanel(data);
      }
    }, err => console.error(err));
    unsubscribers.push(unsubRoom);

    const unsubPrefs = onSnapshot(doc(db, 'users', uid, 'meta', 'prefs'), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.decorSize && data.decorSize !== state.decorSize) {
        state.decorSize = data.decorSize;
        save('sw_decorSize', data.decorSize);
        applySizeUI('decorSizeToggle', document.getElementById('list-decor'), data.decorSize);
      }
      if (data.linksSize && data.linksSize !== state.linksSize) {
        state.linksSize = data.linksSize;
        save('sw_linksSize', data.linksSize);
        applySizeUI('linksSizeToggle', document.getElementById('list-links'), data.linksSize);
      }
    }, err => console.error(err));
    unsubscribers.push(unsubPrefs);
  }

  onAuthStateChanged(auth, (user) => {
    teardown();
    authError.textContent = '';
    if (!user) {
      currentUid = null;
      showApp(false);
      setSyncStatus('offline');
      return;
    }
    showApp(true);
    attachSync(user.uid);
  });
}

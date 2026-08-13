import { firebaseConfig, useEmulators } from './firebase-config.js';
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

const SCENE_W = 245, SCENE_H = 200;
sceneCanvas.width = SCENE_W;
sceneCanvas.height = SCENE_H;
const FLOOR_Y = 178;

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
  chairWood: '#4a2f21',
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

function drawSceneRoom(t) {
  // no walls or floor fill — the site's own background shows through; just
  // string a few warm hanging lights across the open space above the furniture
  [45, 120, 220].forEach((lx, i) => {
    scenePx(lx, 0, 1, 15, SCENE_COLORS.lightCord);
    const glow = 0.65 + 0.35 * Math.sin(t / 1300 + i * 1.4);
    sceneCtx.fillStyle = `rgba(${SCENE_COLORS.lightGlow},${glow.toFixed(2)})`;
    sceneCtx.fillRect(lx - 2, 15, 5, 4);
  });
}

function drawSceneCounter(t) {
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
  scenePx(52, 124, 6, 2, SCENE_COLORS.machineBody); // hair, dark for a clear silhouette top
  scenePx(52, 126, 6, 6, SCENE_COLORS.skin);
  scenePx(50, 132, 10, 22, SCENE_COLORS.apron);
  scenePx(59, 146, 4, 4, SCENE_COLORS.mug);
  scenePx(60, 147, 2, 2, SCENE_COLORS.coffee);
  const wipeFrame = Math.floor(t / 300) % 2;
  scenePx(wipeFrame === 0 ? 58 : 61, 145, 2, 2, SCENE_COLORS.cloth);

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

function drawSeatedPerson(cx, colors) {
  const seatY = FLOOR_Y - 8;
  scenePx(cx - 4, seatY, 8, 8, SCENE_COLORS.chairWood);
  scenePx(cx - 3, seatY - 15, 6, 6, colors.headColor);
  scenePx(cx - 4, seatY - 9, 8, 9, colors.bodyColor);
}

function drawSceneJukebox(t) {
  scenePx(219, FLOOR_Y - 30, 16, 30, SCENE_COLORS.jukeboxTrim);
  scenePx(221, FLOOR_Y - 28, 12, 26, SCENE_COLORS.jukeboxBody);
  scenePx(222, FLOOR_Y - 34, 10, 5, SCENE_COLORS.jukeboxTrim);
  scenePx(223, FLOOR_Y - 24, 8, 12, SCENE_COLORS.jukeboxPanelA);
  const blinkA = Math.sin(t / 400) > 0;
  const blinkB = Math.sin(t / 400 + 2) > 0;
  const blinkC = Math.sin(t / 400 + 4) > 0;
  scenePx(224, FLOOR_Y - 22, 2, 2, blinkA ? SCENE_COLORS.jukeboxPanelB : SCENE_COLORS.jukeboxTrim);
  scenePx(227, FLOOR_Y - 22, 2, 2, blinkB ? SCENE_COLORS.jukeboxPanelC : SCENE_COLORS.jukeboxTrim);
  scenePx(230, FLOOR_Y - 22, 2, 2, blinkC ? SCENE_COLORS.jukeboxPanelB : SCENE_COLORS.jukeboxTrim);
}

// ---- particles: coffee steam (multiple cups) + jukebox musical notes ----
const steamSpots = [
  { x: 95, y: FLOOR_Y - 14, lastSpawn: 0 },
  { x: 150, y: FLOOR_Y - 14, lastSpawn: 233 },
  { x: 205, y: FLOOR_Y - 14, lastSpawn: 466 },
  { x: 260, y: FLOOR_Y - 26, lastSpawn: 350 },
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

function updateSceneNotes(t, dt) {
  if (t - lastNoteSpawn > 900) {
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
  { x: 70, dir: 1, speed: 10, minX: 66, maxX: 140, bodyColor: '#c9976a', headColor: '#e8d9c4', shoeColor: '#2c2018' },
  { x: 200, dir: -1, speed: 8, minX: 145, maxX: 218, bodyColor: '#4a6b7a', headColor: '#d9b98f', shoeColor: '#241b14' },
];

function updateScenePeople(dt) {
  scenePeople.forEach(p => {
    p.x += p.dir * p.speed * dt / 1000;
    if (p.x > p.maxX) { p.x = p.maxX; p.dir = -1; }
    if (p.x < p.minX) { p.x = p.minX; p.dir = 1; }
  });
}

function drawScenePerson(p, t) {
  const x = Math.round(p.x);
  const y = FLOOR_Y - 18;
  const frame = Math.floor(t / 220) % 2;
  scenePx(x + 1, y, 6, 5, p.headColor);
  scenePx(x, y + 5, 8, 9, p.bodyColor);
  const step = p.dir > 0 ? 1 : -1;
  if (frame === 0) {
    scenePx(x + 1, y + 14, 2, 4, p.shoeColor);
    scenePx(x + 5, y + 14, 2, 4, p.shoeColor);
  } else {
    scenePx(x + 1 + step, y + 14, 2, 4, p.shoeColor);
    scenePx(x + 5 - step, y + 14, 2, 4, p.shoeColor);
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

function sceneFrame(t) {
  if (!sceneRunning) return;
  if (sceneLastT == null) sceneLastT = t;
  const dt = Math.min(t - sceneLastT, 60);
  sceneLastT = t;

  updateSceneSteam(t, dt);
  updateSceneNotes(t, dt);
  updateScenePeople(dt);

  sceneCtx.clearRect(0, 0, SCENE_W, SCENE_H);
  drawSceneRoom(t);
  drawSceneCounter(t);
  drawSceneTable(95);
  drawSeatedPerson(86, { headColor: '#e8d9c4', bodyColor: '#5c3a29' });
  drawSceneTable(150);
  drawSceneTable(205);
  drawSceneJukebox(t);
  drawSceneSteam();
  drawSceneNotes();
  scenePeople.forEach(p => drawScenePerson(p, t));

  sceneRafId = requestAnimationFrame(sceneFrame);
}

function startPixelScene() {
  if (sceneRunning) return;
  sceneRunning = true;
  sceneLastT = null;
  sceneRafId = requestAnimationFrame(sceneFrame);
  updateSceneClockEl();
  sceneClockIntervalId = setInterval(updateSceneClockEl, 1000);
}
function stopPixelScene() {
  sceneRunning = false;
  if (sceneRafId) cancelAnimationFrame(sceneRafId);
  if (sceneClockIntervalId) clearInterval(sceneClockIntervalId);
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
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.view));
});

document.getElementById('brandHome').addEventListener('click', () => activateTab('home'));

window.addEventListener('resize', () => {
  const active = tabButtons.find(b => b.classList.contains('active'));
  if (active) positionGlow(active);
});

const validViews = ['notes', 'events', 'memories', 'wishlist', 'links', 'decor', 'home'];
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

/* ---------------- generic composer (events / memories / wishlist) ---------------- */
function wireComposer(kind, storeKey, { hasLink = false, render } = {}) {
  const openBtn = document.querySelector(`[data-open="${kind}"]`);
  const composer = document.getElementById(`composer-${kind}`);
  const cancelBtn = document.querySelector(`[data-cancel="${kind}"]`);
  const saveBtn = document.querySelector(`[data-save="${kind}"]`);
  const titleInput = document.getElementById(`${kind}-title`);
  const descInput = document.getElementById(`${kind}-desc`);
  const linkInput = hasLink ? document.getElementById(`${kind}-link`) : null;

  function closeComposer() {
    composer.classList.remove('open');
    openBtn.classList.remove('is-open');
    titleInput.value = '';
    descInput.value = '';
    if (linkInput) { linkInput.value = ''; linkInput.style.borderColor = ''; }
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

    closeComposer();
    const item = { id: uid(), title, desc, link, createdAt: Date.now() };
    const ok = await fsSetItem(storeKey, item);
    if (ok) flashSaved();
    else flashError('Could not save — check your connection');
  }

  saveBtn.addEventListener('click', commit);
  [titleInput, descInput, linkInput].filter(Boolean).forEach(el => {
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

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = fmtDate(item.createdAt);
  card.append(meta);
  return card;
}

function renderList(kind, storeKey) {
  const listEl = document.getElementById(`list-${kind}`);
  const emptyEl = document.getElementById(`empty-${kind}`);
  const items = state[storeKey];
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

  popover.append(grid, uploadLabel);

  if (item.photo || item.emoji) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'popover-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      fsSetItem('memories', { ...item, photo: null, emoji: null });
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
wireComposer('wishlist', 'wishlist', { hasLink: true });
renderList('events', 'events');
renderMemories();
renderList('wishlist', 'wishlist');

/* ---------------- links (shared card builder, used by Links + Decor) ---------------- */

function buildLinkCard(item, i, onDelete) {
  const card = document.createElement('div');
  card.className = 'card link-card';
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
  return card;
}

function renderLinks() {
  const listEl = document.getElementById('list-links');
  const emptyEl = document.getElementById('empty-links');
  const items = state.links;
  listEl.innerHTML = '';
  emptyEl.classList.toggle('show', items.length === 0);

  items.forEach((item, i) => {
    const card = buildLinkCard(item, i, () => fsDeleteItem('links', item.id));
    listEl.append(card);
  });
}

const linkForm = document.getElementById('linkForm');
const linkInput = document.getElementById('linkInput');
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
  linkInput.value = '';
  const ok = await fsSetItem('links', { id: uid(), url: href, domain, createdAt: Date.now() });
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

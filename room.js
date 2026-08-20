/* SkyeLens — 3D room visualiser.
   Imported lazily the first time the Room tab is opened, so a slow CDN never
   delays the rest of the site. One world unit = one foot. */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* ---------------- catalog ----------------
   size is [width, height, depth] in feet, with the piece facing +z.
   mount 'floor' pieces sit anywhere on the carpet; mount 'wall' pieces snap to
   the nearest wall, at `atY` feet off the floor (0 = standing on the floor). */
export const CATALOG = {
  bed:        { label: 'Bed (full)',    mount: 'floor', size: [4.5, 2.0, 6.25], color: '#8a6f5c' },
  nightstand: { label: 'Nightstand',    mount: 'floor', size: [1.6, 2.0, 1.4],  color: '#7a5c46' },
  dresser:    { label: 'Dresser',       mount: 'floor', size: [3.2, 3.0, 1.6],  color: '#7a5c46' },
  desk:       { label: 'Desk',          mount: 'floor', size: [4.0, 2.5, 2.0],  color: '#8a6f5c' },
  computerDesk: { label: 'Desk + PC',   mount: 'floor', size: [4.2, 4.0, 1.9],  color: '#3a3632' },
  cubeShelf:  { label: 'Cube shelf',    mount: 'floor', size: [5.0, 3.0, 1.3],  color: '#3d332c' },
  chair:      { label: 'Chair',         mount: 'floor', size: [1.6, 3.0, 1.6],  color: '#5c5750' },
  shelf:      { label: 'Bookshelf',     mount: 'floor', size: [2.6, 5.0, 1.1],  color: '#7a5c46' },
  rug:        { label: 'Rug',           mount: 'floor', size: [5.0, 0.1, 7.0],  color: '#9a5f4e' },
  plant:      { label: 'Plant',         mount: 'floor', size: [1.6, 4.0, 1.6],  color: '#5a7a4a' },
  lamp:       { label: 'Floor lamp',    mount: 'floor', size: [1.2, 5.0, 1.2],  color: '#e0d6c4' },
  closet:     { label: 'Closet mirror', mount: 'wall',  size: [5.0, 7.0, 1.8],  color: '#efece6', atY: 0 },
  door:       { label: 'Door',          mount: 'wall',  size: [3.0, 6.75, 0.35], color: '#efece6', atY: 0 },
  window:     { label: 'Window',        mount: 'wall',  size: [6.0, 4.0, 0.3],  color: '#efece6', atY: 2.4 },
  mirror:     { label: 'Mirror',        mount: 'wall',  size: [2.0, 4.5, 0.16], color: '#8a6f5c', atY: 1.4 },
  tv:         { label: 'TV',            mount: 'wall',  size: [4.0, 2.3, 0.28], color: '#1e1e20', atY: 3.4 },
  poster:     { label: 'Poster',        mount: 'wall',  size: [2.0, 3.0, 0.08], color: '#c9976a', atY: 3.6 },
  awards:     { label: 'Awards wall',   mount: 'wall',  size: [3.0, 2.8, 0.08], color: '#f2efe8', atY: 3.0 },
};

export const PALETTE = [
  '#ffffff', '#f4f1ec', '#e8e0d4', '#c9b9a3',
  '#c9976a', '#8a6f5c', '#8a5a3b', '#5c3a29',
  '#7a3b32', '#9a5f4e', '#4a6b7a', '#5a7a4a',
  '#8f8f96', '#5c5750', '#2c2a28', '#1e1e20',
];

let idSeq = 0;
const newId = () => 'r' + Date.now().toString(36) + (idSeq++).toString(36);

export function makeItem(type, patch = {}) {
  const spec = CATALOG[type];
  return {
    id: newId(),
    type,
    color: spec.color,
    scale: 1,
    ...(spec.mount === 'wall'
      ? { wall: 'north', along: 0 }
      : { x: 0, z: 0, rotY: 0 }),
    ...patch,
  };
}

/* Their room, as described: full bed in the top-left, door bottom-right, window
   on the wall across from it, closet mirror to the left of the door. */
export const DEFAULT_ROOM = () => ({
  dims: { w: 13, d: 12, h: 8 },
  wallColor: '#f4f1ec',
  floorColor: '#b6a894',
  items: [
    // headboard against the left wall, so the foot of the bed points at the right wall
    makeItem('bed', { x: -3.375, z: -3.7, rotY: Math.PI / 2 }),
    // the shelf runs out from the left wall as a divider: bed behind it, desk in front
    makeItem('cubeShelf', { x: -4.0, z: -0.65, rotY: 0 }),
    makeItem('computerDesk', { x: -5.55, z: 2.4, rotY: Math.PI / 2 }),
    makeItem('window', { wall: 'north', along: 1.6 }),
    makeItem('awards', { wall: 'north', along: -3.2 }),
    makeItem('door', { wall: 'south', along: 4.5 }),
    makeItem('closet', { wall: 'south', along: 0 }),
    makeItem('rug', { x: 2.5, z: 0.5, rotY: 0 }),
  ],
});

/* ---------------- mesh builders ----------------
   every builder returns a Group with y=0 at the bottom of the piece. */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0,
  emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1,
  transparent: o.transparent ?? false, opacity: o.opacity ?? 1,
});

function box(w, h, d, color, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.material || mat(color, o));
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  return m;
}

// not quite a perfect mirror: a little diffuse left in keeps it from going pure
// black when you look at it edge-on or straight down from the floor plan view
const MIRROR_MAT = () => new THREE.MeshStandardMaterial({ color: '#dfe9ef', roughness: 0.09, metalness: 0.82 });

function buildBed(w, h, d, color) {
  const g = new THREE.Group();
  const frame = box(w, 0.75, d, color); frame.position.y = 0.375; g.add(frame);
  const mattress = box(w - 0.22, 0.7, d - 0.3, '#f3efe6'); mattress.position.set(0, 1.1, 0.1); g.add(mattress);
  const head = box(w, 2.3, 0.22, color); head.position.set(0, 1.15, -d / 2 + 0.11); g.add(head);
  const blanket = box(w - 0.16, 0.22, d * 0.6, '#8a5a3b'); blanket.position.set(0, 1.53, d / 2 - d * 0.3 - 0.15); g.add(blanket);
  [-1, 1].forEach(s => {
    const p = box(w / 2 - 0.4, 0.34, 1.1, '#ffffff');
    p.position.set(s * (w / 4), 1.62, -d / 2 + 0.95);
    g.add(p);
  });
  return g;
}

function buildNightstand(w, h, d, color) {
  const g = new THREE.Group();
  const body = box(w, h - 0.3, d, color); body.position.y = (h - 0.3) / 2 + 0.3; g.add(body);
  [-1, 1].forEach(s => [-1, 1].forEach(t => {
    const leg = box(0.14, 0.3, 0.14, '#3d2f24');
    leg.position.set(s * (w / 2 - 0.14), 0.15, t * (d / 2 - 0.14));
    g.add(leg);
  }));
  const drawer = box(w - 0.3, 0.5, 0.05, '#efe7da');
  drawer.position.set(0, h - 0.75, d / 2 + 0.01); g.add(drawer);
  return g;
}

function buildDresser(w, h, d, color) {
  const g = new THREE.Group();
  const body = box(w, h, d, color); body.position.y = h / 2; g.add(body);
  for (let i = 0; i < 3; i++) {
    const dr = box(w - 0.4, h / 3 - 0.22, 0.05, '#efe7da');
    dr.position.set(0, h - (i + 0.5) * (h / 3), d / 2 + 0.01);
    g.add(dr);
  }
  return g;
}

function buildDesk(w, h, d, color) {
  const g = new THREE.Group();
  const top = box(w, 0.16, d, color); top.position.y = h - 0.08; g.add(top);
  [-1, 1].forEach(s => [-1, 1].forEach(t => {
    const leg = box(0.14, h - 0.16, 0.14, '#3d2f24');
    leg.position.set(s * (w / 2 - 0.12), (h - 0.16) / 2, t * (d / 2 - 0.12));
    g.add(leg);
  }));
  return g;
}

// the battlestation: long desk against the wall, two monitors, keyboard, tower
function buildComputerDesk(w, h, d, color) {
  const g = new THREE.Group();
  const deskH = 2.4;
  const top = box(w, 0.14, d, color);
  top.position.y = deskH - 0.07; g.add(top);
  [-1, 1].forEach(s => {
    const side = box(0.16, deskH - 0.14, d - 0.2, color);
    side.position.set(s * (w / 2 - 0.1), (deskH - 0.14) / 2, 0);
    g.add(side);
  });

  const screenMat = new THREE.MeshStandardMaterial({
    color: '#16324a', roughness: 0.2, metalness: 0.3,
    emissive: '#1f4f74', emissiveIntensity: 0.9,
  });
  // monitors scale with the desk so a narrower one doesn't overhang the edges
  const mW = Math.min(1.9, w * 0.44);
  const mOff = Math.min(1.05, w * 0.24);
  [-1, 1].forEach(s => {
    const m = new THREE.Group();
    const bezel = box(mW, mW * 0.61, 0.07, '#1c1a19'); bezel.position.y = 0.9; m.add(bezel);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(mW * 0.92, mW * 0.52), screenMat);
    scr.position.set(0, 0.9, 0.045); m.add(scr);
    const stand = box(0.16, 0.55, 0.16, '#1c1a19'); stand.position.y = 0.3; m.add(stand);
    const foot = box(mW * 0.42, 0.06, 0.5, '#1c1a19'); foot.position.y = 0.03; m.add(foot);
    m.position.set(s * mOff, deskH, -d / 2 + 0.6);
    m.rotation.y = -s * 0.2;
    g.add(m);
  });

  const kb = box(1.7, 0.07, 0.55, '#232022'); kb.position.set(-0.3, deskH + 0.04, 0.35); g.add(kb);
  const mouse = box(0.28, 0.09, 0.42, '#232022'); mouse.position.set(0.95, deskH + 0.05, 0.35); g.add(mouse);

  const tower = box(0.8, 1.6, 1.5, '#1c1a19'); tower.position.set(w / 2 - 0.75, 0.8, 0); g.add(tower);
  const glow = box(0.07, 1.15, 0.07, '#c9976a', { emissive: '#c9976a', emissiveIntensity: 2.4 });
  glow.position.set(w / 2 - 1.15, 0.8, 0.45); g.add(glow);
  return g;
}

// cube organiser used as a divider; gains a second row of cubbies once it's tall
function buildCubeShelf(w, h, d, color) {
  const g = new THREE.Group();
  const shell = box(w, h, d, color); shell.position.y = h / 2; g.add(shell);
  const rows = h > 2.2 ? 2 : 1;
  const cols = Math.max(2, Math.round(w / 1.6));
  const padX = 0.24, padY = 0.24, gap = 0.12;
  const cw = (w - padX * 2 - gap * (cols - 1)) / cols;
  const ch = (h - padY * 2 - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const inner = box(cw, ch, 0.06, '#15120f');
      inner.position.set(
        -w / 2 + padX + cw / 2 + c * (cw + gap),
        padY + ch / 2 + r * (ch + gap),
        d / 2 + 0.006);
      g.add(inner);
    }
  }
  return g;
}

// the wall by the window: calendar board, framed certificates, a couple of medals
function buildAwards(w, h, d, color) {
  const g = new THREE.Group();
  const panel = (fx, fy, fw, fh, frameCol, faceCol) => {
    const pw = w * fw, ph = h * fh;
    const px = -w / 2 + w * fx, py = h * fy;
    const frame = box(pw, ph, d, frameCol);
    frame.position.set(px, py, 0); g.add(frame);
    const face = box(pw - Math.min(0.13, pw * 0.2), ph - Math.min(0.13, ph * 0.2), d * 0.5, faceCol);
    face.position.set(px, py, d * 0.55); g.add(face);
  };

  panel(0.27, 0.70, 0.46, 0.50, '#cfc7b8', color);
  const banner = box(w * 0.42, h * 0.09, d * 0.6, '#2f4f7a');
  banner.position.set(-w / 2 + w * 0.27, h * 0.87, d * 0.6); g.add(banner);

  panel(0.66, 0.74, 0.24, 0.20, '#2a2724', '#efe7d6');
  panel(0.66, 0.46, 0.24, 0.20, '#2a2724', '#efe7d6');
  panel(0.87, 0.60, 0.20, 0.17, '#6b5a3a', '#efe7d6');

  [0.44, 0.53].forEach((fx, i) => {
    const rx = -w / 2 + w * fx;
    const ribbon = box(0.08, h * 0.2, 0.04, i ? '#7a3b32' : '#2f4f7a');
    ribbon.position.set(rx, h * 0.5, d * 0.7); g.add(ribbon);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 18),
      mat('#c9a227', { metalness: 0.85, roughness: 0.3 }));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(rx, h * 0.37, d * 0.75); g.add(disc);
  });
  return g;
}

function buildChair(w, h, d, color) {
  const g = new THREE.Group();
  const seat = box(w, 0.16, d, color); seat.position.y = h * 0.5; g.add(seat);
  const back = box(w, h * 0.45, 0.14, color); back.position.set(0, h * 0.72, -d / 2 + 0.07); g.add(back);
  [-1, 1].forEach(s => [-1, 1].forEach(t => {
    const leg = box(0.12, h * 0.5, 0.12, '#3d2f24');
    leg.position.set(s * (w / 2 - 0.1), h * 0.25, t * (d / 2 - 0.1));
    g.add(leg);
  }));
  return g;
}

function buildShelf(w, h, d, color) {
  const g = new THREE.Group();
  [-1, 1].forEach(s => {
    const side = box(0.14, h, d, color);
    side.position.set(s * (w / 2 - 0.07), h / 2, 0);
    g.add(side);
  });
  const back = box(w, h, 0.06, color); back.position.set(0, h / 2, -d / 2 + 0.03); g.add(back);
  const shelves = 4;
  for (let i = 0; i <= shelves; i++) {
    const sh = box(w - 0.28, 0.1, d - 0.08, color);
    sh.position.set(0, (i / shelves) * (h - 0.1) + 0.05, 0);
    g.add(sh);
  }
  const bookCols = ['#7a3b32', '#4a6b7a', '#5a7a4a', '#c9976a', '#e8e0d4'];
  for (let i = 1; i <= shelves; i++) {
    for (let b = 0; b < 5; b++) {
      const bh = 0.55 + Math.random() * 0.3;
      const bk = box(0.16, bh, d - 0.35, bookCols[(i + b) % bookCols.length]);
      bk.position.set(-w / 2 + 0.35 + b * 0.22, (i - 1) / shelves * (h - 0.1) + 0.1 + bh / 2, 0);
      g.add(bk);
    }
  }
  return g;
}

function buildRug(w, h, d, color) {
  const g = new THREE.Group();
  const base = box(w, h, d, color, { cast: false, roughness: 1 });
  base.position.y = h / 2; g.add(base);
  const inner = box(w - 0.7, h * 0.6, d - 0.7, '#ffffff', { cast: false, roughness: 1 });
  inner.material.color.set(color).offsetHSL(0, -0.05, 0.12);
  inner.position.y = h + 0.005; g.add(inner);
  return g;
}

function buildPlant(w, h, color) {
  const g = new THREE.Group();
  const potH = h * 0.28;
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(w * 0.34, w * 0.26, potH, 18),
    mat('#8a5a3b'));
  pot.castShadow = true; pot.receiveShadow = true;
  pot.position.y = potH / 2; g.add(pot);
  const leafMat = mat(color, { roughness: 0.7 });
  for (let i = 0; i < 7; i++) {
    const r = w * (0.3 + Math.random() * 0.2);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), leafMat);
    leaf.castShadow = true;
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * w * 0.22, potH + h * 0.3 + Math.sin(i * 1.7) * h * 0.16, Math.sin(a) * w * 0.22);
    g.add(leaf);
  }
  return g;
}

function buildLamp(w, h, color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.46, 0.12, 20), mat('#3d3831', { metalness: 0.4, roughness: 0.45 }));
  base.castShadow = true; base.position.y = 0.06; g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h - 1.1, 12), mat('#3d3831', { metalness: 0.5, roughness: 0.4 }));
  pole.castShadow = true; pole.position.y = (h - 1.1) / 2; g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(w * 0.5, w * 0.62, 1.0, 22, 1, true),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.35 }));
  shade.position.y = h - 0.55; g.add(shade);
  const bulb = new THREE.PointLight(0xffe9c4, 6, 14, 2);
  bulb.position.y = h - 0.7; g.add(bulb);
  return g;
}

function buildCloset(w, h, d, color) {
  const g = new THREE.Group();
  const body = box(w, h, d, color); body.position.y = h / 2; g.add(body);
  const mirrorMat = MIRROR_MAT();
  const panelW = w / 2 - 0.24;
  [-1, 1].forEach(s => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(panelW, h - 0.5), mirrorMat);
    p.position.set(s * (w / 4), h / 2, d / 2 + 0.012);
    g.add(p);
  });
  const split = box(0.09, h - 0.3, 0.05, '#cfc7ba');
  split.position.set(0, h / 2, d / 2 + 0.02); g.add(split);
  return g;
}

function buildDoor(w, h, d, color) {
  const g = new THREE.Group();
  const casing = box(w + 0.34, h + 0.17, d, color);
  casing.position.y = (h + 0.17) / 2; g.add(casing);
  const slab = box(w, h, d * 0.55, '#ffffff');
  slab.material.color.set(color).offsetHSL(0, 0, -0.04);
  slab.position.set(0, h / 2, d * 0.3); g.add(slab);
  [0.28, 0.68].forEach(f => {
    const panel = box(w - 0.7, h * 0.3, 0.04, '#ffffff');
    panel.material.color.set(color).offsetHSL(0, 0, -0.1);
    panel.position.set(0, h * f, d * 0.58);
    g.add(panel);
  });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat('#c9a227', { metalness: 0.9, roughness: 0.25 }));
  knob.position.set(w / 2 - 0.32, h * 0.45, d * 0.62); g.add(knob);
  return g;
}

function buildWindow(w, h, d, color) {
  const g = new THREE.Group();
  const frame = box(w + 0.34, h + 0.34, d, color);
  frame.position.y = h / 2; g.add(frame);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    color: '#cfe4f2', roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.5, emissive: '#c2dcee', emissiveIntensity: 0.6,
  }));
  glass.position.set(0, h / 2, d / 2 + 0.012); g.add(glass);
  const bar = box(0.1, h, 0.06, color); bar.position.set(0, h / 2, d / 2 + 0.03); g.add(bar);
  const bar2 = box(w, 0.1, 0.06, color); bar2.position.set(0, h / 2, d / 2 + 0.03); g.add(bar2);
  const sill = box(w + 0.6, 0.16, d + 0.4, color); sill.position.set(0, -0.08, 0.1); g.add(sill);

  // blackout panels drawn back to the sides, leaving the middle clear
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, w + 1.1, 10),
    mat('#2a2724', { metalness: 0.6, roughness: 0.4 }));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, h + 0.62, d / 2 + 0.16); g.add(rod);
  [-1, 1].forEach(s => {
    const panel = box(w * 0.34, h + 0.95, 0.11, '#1c1a19', { roughness: 0.95 });
    panel.position.set(s * (w / 2 - w * 0.15), h / 2 + 0.12, d / 2 + 0.16);
    g.add(panel);
  });
  return g;
}

function buildMirror(w, h, d, color) {
  const g = new THREE.Group();
  const frame = box(w, h, d, color); frame.position.y = h / 2; g.add(frame);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.26, h - 0.26), MIRROR_MAT());
  glass.position.set(0, h / 2, d / 2 + 0.012); g.add(glass);
  return g;
}

function buildTv(w, h, d, color) {
  const g = new THREE.Group();
  const body = box(w, h, d, color); body.position.y = h / 2; g.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.18, h - 0.18),
    new THREE.MeshStandardMaterial({ color: '#10141a', roughness: 0.16, metalness: 0.5 }));
  screen.position.set(0, h / 2, d / 2 + 0.012); g.add(screen);
  return g;
}

function buildPoster(w, h, d, color) {
  const g = new THREE.Group();
  const frame = box(w, h, d, '#2c2a28'); frame.position.y = h / 2; g.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.16, h - 0.16), mat(color, { roughness: 0.95 }));
  art.position.set(0, h / 2, d / 2 + 0.01); g.add(art);
  return g;
}

function buildItemMesh(item) {
  const spec = CATALOG[item.type];
  const s = item.scale || 1;
  const [w, h, d] = spec.size.map(v => v * s);
  const c = item.color || spec.color;
  switch (item.type) {
    case 'bed': return buildBed(w, h, d, c);
    case 'nightstand': return buildNightstand(w, h, d, c);
    case 'dresser': return buildDresser(w, h, d, c);
    case 'desk': return buildDesk(w, h, d, c);
    case 'computerDesk': return buildComputerDesk(w, h, d, c);
    case 'cubeShelf': return buildCubeShelf(w, h, d, c);
    case 'awards': return buildAwards(w, h, d, c);
    case 'chair': return buildChair(w, h, d, c);
    case 'shelf': return buildShelf(w, h, d, c);
    case 'rug': return buildRug(w, h, d, c);
    case 'plant': return buildPlant(w, h, c);
    case 'lamp': return buildLamp(w, h, c);
    case 'closet': return buildCloset(w, h, d, c);
    case 'door': return buildDoor(w, h, d, c);
    case 'window': return buildWindow(w, h, d, c);
    case 'mirror': return buildMirror(w, h, d, c);
    case 'tv': return buildTv(w, h, d, c);
    case 'poster': return buildPoster(w, h, d, c);
    default: return buildDresser(w, h, d, c);
  }
}

/* ---------------- procedural textures / environment ---------------- */
function makeCarpetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 198 + Math.random() * 57;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.42, '#efe9de');
  grd.addColorStop(0.56, '#b3a897');
  grd.addColorStop(1, '#4b443c');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 16, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/* ---------------- the scene ---------------- */
const WALLS = ['north', 'south', 'west', 'east'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createRoomScene({ canvas, onSelect, onChange }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);

  // lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa89a86, 1.15));
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xfff3e2, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xdCE8f5, 0.55);
  scene.add(fill);

  // room shell
  const carpetTex = makeCarpetTexture();
  const floorMat = new THREE.MeshStandardMaterial({ color: '#b6a894', map: carpetTex, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 0.95, side: THREE.FrontSide });
  const wallMeshes = {};
  WALLS.forEach(w => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
    m.receiveShadow = true;
    wallMeshes[w] = m;
    scene.add(m);
  });

  const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0xc9976a);
  selectionBox.visible = false;
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  scene.add(selectionBox);

  let state = DEFAULT_ROOM();
  let selectedId = null;
  const objects = new Map();   // id -> { group, sig }
  let running = false, rafId = null;

  /* ---- camera rig (small hand-rolled orbit, no addon needed) ---- */
  const rig = { theta: 0.62, phi: 1.03, radius: 24, target: new THREE.Vector3(0, 3, 0) };
  function applyCamera() {
    const { theta, phi, radius, target } = rig;
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
  }

  function frameRoom() {
    const { w, d, h } = state.dims;
    rig.target.set(0, h * 0.38, 0);
    rig.radius = Math.max(w, d) * 1.75;
    applyCamera();
  }

  function setView(name) {
    const { w, d, h } = state.dims;
    rig.target.set(0, h * 0.38, 0);
    if (name === 'top') {
      rig.theta = 0; rig.phi = 0.08; rig.radius = Math.max(w, d) * 1.5;
      rig.target.set(0, 0, 0);
    } else if (name === 'door') {
      // stand just inside the doorway and look back across the room
      rig.theta = 0.30; rig.phi = 1.42; rig.radius = d * 0.86;
      rig.target.set(-w * 0.1, h * 0.42, -d * 0.1);
    } else if (name === 'bed') {
      rig.theta = -0.75; rig.phi = 1.06; rig.radius = Math.max(w, d) * 1.5;
    } else {
      rig.theta = 0.62; rig.phi = 1.03; rig.radius = Math.max(w, d) * 1.75;
    }
    applyCamera();
  }

  /* ---- geometry from state ---- */
  function rebuildShell() {
    const { w, d, h } = state.dims;
    floor.geometry.dispose();
    floor.geometry = new THREE.PlaneGeometry(w, d);
    carpetTex.repeat.set(w * 1.6, d * 1.6);
    floorMat.color.set(state.floorColor);
    wallMat.color.set(state.wallColor);

    const place = (m, gw, gh, pos, rotY) => {
      m.geometry.dispose();
      m.geometry = new THREE.PlaneGeometry(gw, gh);
      m.position.set(pos[0], h / 2, pos[2]);
      m.rotation.y = rotY;
    };
    place(wallMeshes.north, w, h, [0, 0, -d / 2], 0);
    place(wallMeshes.south, w, h, [0, 0, d / 2], Math.PI);
    place(wallMeshes.west, d, h, [-w / 2, 0, 0], Math.PI / 2);
    place(wallMeshes.east, d, h, [w / 2, 0, 0], -Math.PI / 2);

    const span = Math.max(w, d);
    sun.position.set(w * 0.55, h * 2.4, -d * 0.75);
    sun.target.position.set(0, 0, d * 0.15);
    const s = span * 1.1;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: span * 6 });
    sun.shadow.camera.updateProjectionMatrix();
    fill.position.set(-w, h * 1.5, d);
  }

  // where a piece sits, given the room size
  function placeObject(group, item) {
    const spec = CATALOG[item.type];
    const s = item.scale || 1;
    const [iw, ih, idp] = spec.size.map(v => v * s);
    const { w, d } = state.dims;
    if (spec.mount === 'wall') {
      const halfSpan = (item.wall === 'north' || item.wall === 'south') ? w / 2 : d / 2;
      const along = clamp(item.along ?? 0, -halfSpan + iw / 2, halfSpan - iw / 2);
      const y = spec.atY || 0;
      if (item.wall === 'north') { group.position.set(along, y, -d / 2 + idp / 2); group.rotation.y = 0; }
      else if (item.wall === 'south') { group.position.set(along, y, d / 2 - idp / 2); group.rotation.y = Math.PI; }
      else if (item.wall === 'west') { group.position.set(-w / 2 + idp / 2, y, along); group.rotation.y = Math.PI / 2; }
      else { group.position.set(w / 2 - idp / 2, y, along); group.rotation.y = -Math.PI / 2; }
    } else {
      const r = Math.abs(item.rotY || 0) % Math.PI;
      const swap = r > Math.PI * 0.25 && r < Math.PI * 0.75;
      const halfW = (swap ? idp : iw) / 2;
      const halfD = (swap ? iw : idp) / 2;
      group.position.set(
        clamp(item.x ?? 0, -w / 2 + halfW, w / 2 - halfW), 0,
        clamp(item.z ?? 0, -d / 2 + halfD, d / 2 - halfD));
      group.rotation.y = item.rotY || 0;
    }
  }

  const sigOf = (item) => [item.type, item.color, item.scale].join('|');

  function syncItems() {
    const seen = new Set();
    state.items.forEach(item => {
      seen.add(item.id);
      let rec = objects.get(item.id);
      const sig = sigOf(item);
      if (rec && rec.sig !== sig) { disposeGroup(rec.group); scene.remove(rec.group); rec = null; }
      if (!rec) {
        const group = buildItemMesh(item);
        group.userData.itemId = item.id;
        scene.add(group);
        rec = { group, sig };
        objects.set(item.id, rec);
      }
      placeObject(rec.group, item);
    });
    [...objects.keys()].forEach(id => {
      if (seen.has(id)) return;
      const rec = objects.get(id);
      disposeGroup(rec.group);
      scene.remove(rec.group);
      objects.delete(id);
    });
    refreshSelectionBox();
  }

  function disposeGroup(group) {
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }

  function refreshSelectionBox() {
    const rec = selectedId && objects.get(selectedId);
    if (!rec) { selectionBox.visible = false; return; }
    selectionBox.setFromObject(rec.group);
    selectionBox.visible = true;
  }

  const findItem = (id) => state.items.find(i => i.id === id) || null;

  function emit() {
    if (onChange) onChange(getState());
  }

  /* ---- picking + dragging ---- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let mode = null;              // 'orbit' | 'drag'
  let dragId = null, dragOffset = new THREE.Vector3(), moved = false;
  let lastPx = 0, lastPy = 0;

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function pickItem() {
    raycaster.setFromCamera(pointer, camera);
    const groups = [...objects.values()].filter(r => r.group.visible).map(r => r.group);
    const hits = raycaster.intersectObjects(groups, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && o.userData.itemId === undefined) o = o.parent;
    return o ? o.userData.itemId : null;
  }

  function floorPoint() {
    raycaster.setFromCamera(pointer, camera);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(floorPlane, p) ? p : null;
  }

  function onPointerDown(e) {
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId);
    setPointer(e);
    moved = false;
    lastPx = e.clientX; lastPy = e.clientY;
    const id = e.shiftKey ? null : pickItem();
    if (id) {
      select(id);
      const rec = objects.get(id);
      const p = floorPoint();
      if (p) dragOffset.set(rec.group.position.x - p.x, 0, rec.group.position.z - p.z);
      dragId = id;
      mode = 'drag';
    } else {
      mode = 'orbit';
    }
  }

  function onPointerMove(e) {
    if (!mode) return;
    const dx = e.clientX - lastPx, dy = e.clientY - lastPy;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    lastPx = e.clientX; lastPy = e.clientY;
    setPointer(e);

    if (mode === 'orbit') {
      if (e.shiftKey) {
        // pan across the floor
        const panScale = rig.radius * 0.0016;
        const right = new THREE.Vector3(Math.cos(rig.theta), 0, -Math.sin(rig.theta));
        const fwd = new THREE.Vector3(Math.sin(rig.theta), 0, Math.cos(rig.theta));
        rig.target.addScaledVector(right, -dx * panScale).addScaledVector(fwd, -dy * panScale);
      } else {
        rig.theta -= dx * 0.006;
        rig.phi = clamp(rig.phi - dy * 0.006, 0.06, 1.52);
      }
      applyCamera();
      return;
    }

    const item = findItem(dragId);
    const p = floorPoint();
    if (!item || !p) return;
    const spec = CATALOG[item.type];
    if (spec.mount === 'wall') {
      // snap to whichever wall the cursor is nearest
      const { w, d } = state.dims;
      const cand = [
        { wall: 'north', dist: Math.abs(p.z + d / 2), along: p.x },
        { wall: 'south', dist: Math.abs(p.z - d / 2), along: p.x },
        { wall: 'west', dist: Math.abs(p.x + w / 2), along: p.z },
        { wall: 'east', dist: Math.abs(p.x - w / 2), along: p.z },
      ].sort((a, b) => a.dist - b.dist)[0];
      item.wall = cand.wall;
      item.along = cand.along;
    } else {
      item.x = p.x + dragOffset.x;
      item.z = p.z + dragOffset.z;
    }
    placeObject(objects.get(dragId).group, item);
    refreshSelectionBox();
  }

  function onPointerUp(e) {
    if (mode === 'drag' && moved) emit();
    if (mode === 'orbit' && !moved) select(null);
    mode = null; dragId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function onWheel(e) {
    e.preventDefault();
    rig.radius = clamp(rig.radius * (1 + Math.sign(e.deltaY) * 0.09), 2.5, 90);
    applyCamera();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function select(id) {
    selectedId = id;
    refreshSelectionBox();
    if (onSelect) onSelect(id ? findItem(id) : null);
  }

  /* ---- wall pieces hide with the wall they're on, so the dollhouse view stays readable ---- */
  const inward = {
    north: new THREE.Vector3(0, 0, 1), south: new THREE.Vector3(0, 0, -1),
    west: new THREE.Vector3(1, 0, 0), east: new THREE.Vector3(-1, 0, 0),
  };
  function updateWallVisibility() {
    const { w, d } = state.dims;
    const origin = { north: -d / 2, south: d / 2, west: -w / 2, east: w / 2 };
    const facing = {};
    WALLS.forEach(name => {
      const n = inward[name];
      const along = (name === 'north' || name === 'south') ? camera.position.z : camera.position.x;
      facing[name] = (along - origin[name]) * (n.z || n.x) > 0;
    });
    state.items.forEach(item => {
      const rec = objects.get(item.id);
      if (!rec || CATALOG[item.type].mount !== 'wall') return;
      rec.group.visible = facing[item.wall] !== false;
    });
    if (selectedId) {
      const rec = objects.get(selectedId);
      if (rec && !rec.group.visible) selectionBox.visible = false;
      else if (rec) selectionBox.visible = true;
    }
  }

  /* ---- loop ---- */
  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function tick() {
    if (!running) return;
    resize();
    updateWallVisibility();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  /* ---- public API ---- */
  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setState(next, { keepCamera = true } = {}) {
    state = {
      dims: { ...DEFAULT_ROOM().dims, ...(next && next.dims) },
      wallColor: (next && next.wallColor) || '#f4f1ec',
      floorColor: (next && next.floorColor) || '#b6a894',
      items: ((next && next.items) || []).filter(i => i && CATALOG[i.type]),
    };
    if (selectedId && !findItem(selectedId)) select(null);
    rebuildShell();
    syncItems();
    if (!keepCamera) frameRoom();
    applyCamera();
  }

  function addItem(type) {
    const spec = CATALOG[type];
    let item;
    if (spec.mount === 'wall') {
      item = makeItem(type, { wall: 'north', along: 0 });
    } else {
      // walk outward from the middle until we find a clear-ish spot
      let x = 0, z = 0;
      for (let r = 0; r < 8; r++) {
        const busy = state.items.some(o => CATALOG[o.type].mount === 'floor' &&
          Math.hypot((o.x ?? 0) - x, (o.z ?? 0) - z) < 2.2);
        if (!busy) break;
        x = Math.cos(r * 1.9) * (1.6 + r * 0.7);
        z = Math.sin(r * 1.9) * (1.6 + r * 0.7);
      }
      item = makeItem(type, { x, z, rotY: 0 });
    }
    state.items.push(item);
    syncItems();
    select(item.id);
    emit();
    return item;
  }

  function patchSelected(patch) {
    const item = findItem(selectedId);
    if (!item) return;
    Object.assign(item, patch);
    syncItems();
    if (onSelect) onSelect(item);
    emit();
  }

  function deleteSelected() {
    if (!selectedId) return;
    state.items = state.items.filter(i => i.id !== selectedId);
    select(null);
    syncItems();
    emit();
  }

  function setDims(patch) {
    Object.assign(state.dims, patch);
    rebuildShell();
    syncItems();
    emit();
  }

  function setColors(patch) {
    Object.assign(state, patch);
    rebuildShell();
    emit();
  }

  function reset() {
    setState(DEFAULT_ROOM(), { keepCamera: false });
    select(null);
    emit();
  }

  setState(state, { keepCamera: false });

  return {
    start() { if (!running) { running = true; resize(); rafId = requestAnimationFrame(tick); } },
    stop() { running = false; if (rafId) cancelAnimationFrame(rafId); },
    setState, getState, addItem, patchSelected, deleteSelected,
    setDims, setColors, setView, reset, select, resize,
    getSelected: () => findItem(selectedId),
    dispose() {
      this.stop();
      objects.forEach(r => disposeGroup(r.group));
      renderer.dispose();
    },
  };
}

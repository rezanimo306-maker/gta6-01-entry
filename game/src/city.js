// city.js — procedural Solcosta: a sun-soaked coastal city built fresh at load.
// One clear job: generate the whole city (roads, blocks, buildings, palms,
// landmarks, beach) and hand the other systems its road network, colliders
// and mission locations. No textures are loaded: facades are painted on
// canvases at runtime.
import * as THREE from 'three';

export const BLOCK = 56;      // building block size
export const ROAD = 16;       // road width
export const PITCH = BLOCK + ROAD; // 72, distance between road centre lines
export const GRID = 9;        // 9 x 9 blocks
export const HALF = (GRID * PITCH) / 2; // 324, city edge

const PALETTE = [
  0xf2e3c6, 0xe8b48a, 0xd98f6a, 0xf7ead0, 0xc9d6cf,
  0xe5c9a8, 0xdfa07a, 0xead9b8, 0xc7b299, 0xf0d9a0,
];
const TOWER_COLORS = [0x9fc4d8, 0xd8b89f, 0xb8c4cc, 0xe8c9a0];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint a building facade: warm plaster + a grid of windows, some lit. */
function facadeTexture(base, floors, cols, rand) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, 128, 10);
  const ww = 128 / cols, hh = 236 / floors;
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < cols; k++) {
      const lit = rand() < 0.22;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(30,45,70,0.85)';
      g.fillRect(6 + k * ww, 16 + f * hh, ww - 10, hh - 10);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(6 + k * ww, 16 + f * hh, ww - 10, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Asphalt with a dashed centre line, tiled along the road. */
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33343a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3d3e46';
  for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8d24a';
  g.fillRect(62, 8, 4, 44); g.fillRect(62, 76, 4, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.rand = mulberry32(1337);
    this.colliders = [];   // {minX,maxX,minZ,maxZ} building footprints
    this.roadLines = [];   // centre-line coordinates, both axes
    this.landmarks = {};
    this.group = new THREE.Group();
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildLandmarks();
    this.buildBeach();
    this.buildPalms();
    scene.add(this.group);
  }

  buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 260, HALF * 2 + 260),
      new THREE.MeshLambertMaterial({ color: 0x9a8f7a }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.05;
    g.receiveShadow = true;
    this.group.add(g);
  }

  buildRoads() {
    const tex = roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: tex });
    const len = HALF * 2 + ROAD;
    for (let i = 0; i <= GRID; i++) {
      const at = -HALF + i * PITCH;
      this.roadLines.push(at);
      // road along X
      const rx = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD), roadMat.clone());
      rx.material.map = tex.clone();
      rx.material.map.repeat.set(len / 32, 1);
      rx.material.map.needsUpdate = true;
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(0, 0.02, at);
      rx.receiveShadow = true;
      this.group.add(rx);
      // road along Z
      const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, len), roadMat.clone());
      rz.material.map = tex.clone();
      rz.material.map.repeat.set(1, len / 32);
      rz.material.map.needsUpdate = true;
      rz.rotation.x = -Math.PI / 2;
      rz.position.set(at, 0.02, 0);
      rz.receiveShadow = true;
      this.group.add(rz);
    }
  }

  addBuilding(cx, cz, w, h, d, color, floors, cols) {
    const tex = facadeTexture('#' + color.toString(16).padStart(6, '0'), floors, cols, this.rand);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    // flat roof cap
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
      new THREE.MeshLambertMaterial({ color: 0x6b5a48 }),
    );
    roof.position.set(cx, h + 0.4, cz);
    roof.castShadow = true;
    this.group.add(roof);
    this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return mesh;
  }

  buildBlocks() {
    const rand = this.rand;
    // Blocks reserved for landmarks (garage, police HQ, hospital, mansion, docks).
    const reserved = new Set(['0,0', '8,0', '8,8', '4,0', '8,6', '8,7']);
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        if (reserved.has(`${i},${j}`)) continue;
        const bx = -HALF + i * PITCH + ROAD / 2;
        const bz = -HALF + j * PITCH + ROAD / 2;
        // downtown towers near the centre
        const downtown = Math.abs(i - 4) <= 1 && Math.abs(j - 4) <= 1;
        const n = downtown ? 1 : 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const w = 14 + rand() * 22;
          const d = 14 + rand() * 22;
          const cx = bx + 6 + rand() * (BLOCK - 12 - w) + w / 2;
          const cz = bz + 6 + rand() * (BLOCK - 12 - d) + d / 2;
          if (downtown) {
            const h = 70 + rand() * 55;
            this.addBuilding(cx, cz, w, h, d, TOWER_COLORS[Math.floor(rand() * TOWER_COLORS.length)], Math.floor(h / 7), 5);
          } else {
            const h = 9 + rand() * 26;
            const floors = Math.max(2, Math.floor(h / 6));
            this.addBuilding(cx, cz, w, h, d, PALETTE[Math.floor(rand() * PALETTE.length)], floors, 4);
          }
        }
      }
    }
  }

  buildLandmarks() {
    // Vera's garage — SW corner, orange roof, the mission hub.
    this.addBuilding(-HALF + 28, -HALF + 28, 34, 10, 22, 0xe8823a, 2, 6);
    this.landmarks.garage = new THREE.Vector3(-HALF + 28, 0, -HALF + 52);
    // Solcosta PD headquarters — SE corner.
    this.addBuilding(HALF - 28, -HALF + 28, 30, 16, 24, 0x4a6a9a, 3, 6);
    this.landmarks.policeHQ = new THREE.Vector3(HALF - 28, 0, -HALF + 52);
    // General hospital — NE corner.
    this.addBuilding(HALF - 28, HALF - 28, 30, 14, 24, 0xe8e8e8, 3, 6);
    this.landmarks.hospital = new THREE.Vector3(HALF - 28, 0, HALF - 52);
    // The docks — east edge warehouses + containers.
    this.addBuilding(HALF - 40, HALF - 120, 22, 12, 40, 0x8a7a5a, 2, 5);
    this.addBuilding(HALF - 40, HALF - 70, 22, 12, 40, 0x7a6a5a, 2, 5);
    this.landmarks.docks = new THREE.Vector3(HALF - 44, 0, HALF - 95);
    // Vane mansion — north edge, big villa with a gold car outside.
    this.addBuilding(0, -HALF + 24, 44, 14, 26, 0xf0e0b8, 2, 8);
    this.landmarks.mansion = new THREE.Vector3(0, 0, -HALF + 52);
    // Player start: in front of the garage.
    this.landmarks.playerStart = new THREE.Vector3(-HALF + 28, 0, -HALF + 66);
    // Container stacks at the docks for cover.
    const contMat = new THREE.MeshLambertMaterial({ color: 0xb04030 });
    const contMat2 = new THREE.MeshLambertMaterial({ color: 0x3a6ab0 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 3), i % 2 ? contMat : contMat2);
      m.position.set(HALF - 60 + (i % 3) * 14, 1.5 + Math.floor(i / 3) * 3.2, HALF - 120 + Math.floor(i / 3) * 8);
      m.castShadow = true;
      this.group.add(m);
      this.colliders.push({ minX: m.position.x - 6, maxX: m.position.x + 6, minZ: m.position.z - 1.5, maxZ: m.position.z + 1.5 });
    }
  }

  buildBeach() {
    // Sand strip + sea along the south edge (z > HALF).
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 260, 90),
      new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.01, HALF + 45);
    sand.receiveShadow = true;
    this.group.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 260, 200),
      new THREE.MeshLambertMaterial({ color: 0x2a7ab8 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, HALF + 190);
    this.group.add(sea);
  }

  buildPalms() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });
    const rand = this.rand;
    for (let i = 0; i < 90; i++) {
      const onXRoad = rand() < 0.5;
      const line = this.roadLines[Math.floor(rand() * this.roadLines.length)];
      const along = -HALF + rand() * HALF * 2;
      const x = onXRoad ? along : line + (rand() < 0.5 ? -10 : 10);
      const z = onXRoad ? line + (rand() < 0.5 ? -10 : 10) : along;
      if (Math.abs(x) > HALF || Math.abs(z) > HALF) continue;
      const h = 6 + rand() * 4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), trunkMat);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = true;
      this.group.add(trunk);
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), leafMat);
      top.position.set(x, h + 1, z);
      top.castShadow = true;
      this.group.add(top);
    }
  }

  // ---- queries used by traffic, pedestrians, police, missions ----

  randomRoadPoint() {
    const r = this.rand;
    const horizontal = r() < 0.5;
    const line = this.roadLines[Math.floor(r() * this.roadLines.length)];
    const along = -HALF + 8 + r() * (HALF * 2 - 16);
    return horizontal ? { x: along, z: line, axis: 'x' } : { x: line, z: along, axis: 'z' };
  }

  nearestRoadPoint(x, z) {
    let best = null, bestD = Infinity;
    for (const line of this.roadLines) {
      const d = Math.min(Math.abs(x - line), Math.abs(z - line));
      if (d < bestD) { bestD = d; best = line; }
    }
    return Math.abs(x - best) < Math.abs(z - best) ? { x: best, z, axis: 'z' } : { x, z: best, axis: 'x' };
  }

  isOnRoad(x, z) {
    for (const line of this.roadLines) {
      if (Math.abs(x - line) < ROAD / 2 - 1 || Math.abs(z - line) < ROAD / 2 - 1) return true;
    }
    return false;
  }

  /** Push a circle (x,z,r) out of every building AABB. Returns corrected x,z. */
  resolveCollision(x, z, r) {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the smallest penetration axis
          const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
          else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
        }
      }
    }
    return { x, z };
  }

  hitsBuilding(x, z, r) {
    for (const c of this.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }
}

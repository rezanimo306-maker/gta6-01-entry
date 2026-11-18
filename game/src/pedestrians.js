// pedestrians.js — the people of Solcosta: walkers on the sidewalks who stroll,
// scatter when a car screams past or a shot rings out, and sometimes wave.
// One clear job: ambient foot traffic that makes the city feel alive.
import * as THREE from 'three';

const SHIRTS = [0xe85a5a, 0x5a8ae8, 0x5ae88a, 0xe8d25a, 0x9a5ae8, 0xe8e8e8, 0x333333, 0xe89a5a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

function buildPedMesh(rand) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rand() * SHIRTS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: SKINS[Math.floor(rand() * SKINS.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), pants);
  legL.position.set(-0.14, 0.33, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armL.position.set(-0.36, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(armR);
  return { group: g, legL, legR, armL, armR };
}

export class Pedestrians {
  constructor(scene, city, count) {
    this.city = city;
    this.list = [];
    this.rand = Math.random;
    for (let i = 0; i < count; i++) {
      const p = city.randomRoadPoint();
      // stand on the sidewalk edge of the road
      const off = (Math.random() < 0.5 ? -1 : 1) * 9.5;
      const x = p.axis === 'x' ? p.x : p.x + off;
      const z = p.axis === 'x' ? p.z + off : p.z;
      const built = buildPedMesh(Math.random);
      const ped = {
        group: built.group,
        legL: built.legL, legR: built.legR,
        pos: new THREE.Vector3(x, 0, z),
        heading: Math.random() * Math.PI * 2,
        speed: 1.1 + Math.random() * 0.9,
        panic: 0,
        walkPhase: Math.random() * 6,
        axis: p.axis,
      };
      ped.group.position.copy(ped.pos);
      scene.add(ped.group);
      this.list.push(ped);
    }
  }

  /** Something scary happened at (x,z): nearby peds run away. */
  scare(x, z, radius = 22) {
    for (const p of this.list) {
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < radius) {
        p.panic = 3 + Math.random() * 2;
        p.heading = Math.atan2(p.pos.x - x, p.pos.z - z);
      }
    }
  }

  update(dt, playerPos, cars) {
    for (const p of this.list) {
      if (p.panic > 0) {
        p.panic -= dt;
        p.speed = 4.5;
      } else {
        p.speed = 1.1 + Math.sin(p.walkPhase * 0.1) * 0.3;
      }
      // wander: mostly along the sidewalk, occasional turn
      if (Math.random() < 0.004) p.heading += (Math.random() - 0.5) * 2.4;
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      let nx = p.pos.x + fx * p.speed * dt;
      let nz = p.pos.z + fz * p.speed * dt;
      const fixed = this.city.resolveCollision(nx, nz, 0.5);
      if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
        p.heading += Math.PI * 0.7;
        nx = fixed.x; nz = fixed.z;
      }
      // stay inside the city
      if (Math.abs(nx) > 330 || Math.abs(nz) > 330) p.heading += Math.PI;
      nx = Math.max(-330, Math.min(330, nx));
      nz = Math.max(-330, Math.min(330, nz));
      p.pos.x = nx; p.pos.z = nz;
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.heading;
      // walk cycle
      p.walkPhase += dt * (p.panic > 0 ? 14 : 7);
      const swing = Math.sin(p.walkPhase) * 0.55;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
    }
  }

  /** Nearest pedestrian within range of a point (for punching). */
  nearest(x, z, range) {
    let best = null, bestD = range;
    for (const p of this.list) {
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}

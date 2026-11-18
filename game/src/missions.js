// missions.js — the story of SOLCOSTA: five jobs for the fixer Vera Kross,
// from stealing your first car to taking kingpin Silas Vane's gold sports car.
// One clear job: objectives, progression, rewards, and the mission marker.
import * as THREE from 'three';
import { Car } from './cars.js';

function buildGangsterMesh() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), red);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  legL.position.set(-0.14, 0.33, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  // a pistol in the right hand
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.4, 1.0, 0.3);
  g.add(gun);
  return { group: g, legL, legR };
}

export const MISSION_DEFS = [
  {
    id: 'first-wheels', title: 'Job 1 — First Wheels', reward: 250,
    brief: 'Vera needs wheels. Steal any car on the street, then bring it to her garage.',
    steps: [
      { text: 'Steal a car', sub: 'Walk up to a car and press E', done: (g) => g.player.inCar !== null },
      { text: 'Drive to Vera’s garage', sub: 'Follow the yellow beacon', done: (g) => g.atTarget(10) },
    ],
  },
  {
    id: 'harbor-run', title: 'Job 2 — Harbor Run', reward: 500, timeLimit: 100,
    brief: 'A package waits at the docks. Pick it up and deliver it to the garage — fast.',
    steps: [
      { text: 'Pick up the package at the docks', sub: 'Reach the yellow beacon', done: (g) => g.atTarget(8) },
      { text: 'Deliver the package to the garage', sub: 'Beat the clock', done: (g) => g.atTarget(10) },
    ],
  },
  {
    id: 'payback', title: 'Job 3 — Payback at the Docks', reward: 800,
    brief: 'The Harbor Kings jumped Vera’s courier. Take out all three of them at the docks. Vera left you a pistol — press 2.',
    steps: [
      { text: 'Take out the Harbor Kings (0/3)', sub: 'Fists or pistol — your call', done: (g) => g.missions.gangstersDown >= 3 },
    ],
  },
  {
    id: 'the-getaway', title: 'Job 4 — The Getaway', reward: 1000,
    brief: 'The PD is all over you. Lose the heat — get the wanted level down to zero.',
    steps: [
      { text: 'Lose the cops', sub: 'Break line of sight and stay hidden', done: (g) => g.police.stars === 0 },
    ],
  },
  {
    id: 'king-of-solcosta', title: 'Job 5 — King of Solcosta', reward: 2500,
    brief: 'Silas Vane’s gold sports car sits outside his mansion. Steal it, outrun everything, bring it to the garage.',
    steps: [
      { text: 'Steal Vane’s gold car', sub: 'It is parked outside the mansion', done: (g) => g.player.inCar === g.missions.goldCar },
      { text: 'Bring the gold car to the garage', sub: 'The whole PD will chase you', done: (g) => g.atTarget(10) },
    ],
  },
];

export class Missions {
  constructor(ctx) {
    this.g = ctx; // game context: scene, city, player, police, combat, traffic, audio
    this.index = 0;         // which mission is current
    this.step = 0;
    this.active = false;
    this.timer = 0;
    this.gangsters = [];
    this.gangstersDown = 0;
    this.goldCar = null;
    this.target = null;     // Vector3 the beacon points at
    // beacon: a glowing pillar + ring so the objective is always visible
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.35 });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beaconMat);
    this.beacon.visible = false;
    ctx.scene.add(this.beacon);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    this.ring = ring;
    ring.visible = false;
    ctx.scene.add(ring);
  }

  get def() { return MISSION_DEFS[this.index]; }
  get done() { return this.index >= MISSION_DEFS.length; }

  setTarget(pos) {
    this.target = pos ? pos.clone() : null;
    this.beacon.visible = !!pos;
    this.ring.visible = !!pos;
    if (pos) {
      this.beacon.position.set(pos.x, 30, pos.z);
      this.ring.position.set(pos.x, 0.15, pos.z);
    }
  }

  start(index) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.timer = this.def.timeLimit || 0;
    this.gangstersDown = 0;
    this.clearGangsters();
    const g = this.g;
    if (this.def.id === 'first-wheels') {
      this.setTarget(g.city.landmarks.garage);
    } else if (this.def.id === 'harbor-run') {
      this.setTarget(g.city.landmarks.docks);
    } else if (this.def.id === 'payback') {
      g.player.weapon = 'pistol';
      this.setTarget(g.city.landmarks.docks);
      this.spawnGangsters();
    } else if (this.def.id === 'the-getaway') {
      g.police.setWanted(3);
      this.setTarget(null);
    } else if (this.def.id === 'king-of-solcosta') {
      const m = g.city.landmarks.mansion;
      this.goldCar = new Car(g.scene, 'sports', m.x + 14, m.z + 18, Math.PI / 2, 0xd8b020);
      this.goldCar.isTraffic = true;
      this.goldCar.parked = true;
      this.goldCar.cruise = 0;
      g.traffic.cars.push(this.goldCar);
      this.setTarget(new THREE.Vector3(m.x + 14, 0, m.z + 18));
    }
    g.audio.pickup();
    return this.def;
  }

  spawnGangsters() {
    const docks = this.g.city.landmarks.docks;
    // in the open yard WEST of the dock warehouses — never inside a building
    // (the old spots put one gangster inside the south warehouse, where the
    // player could never see or shoot him and Job 3 could never complete)
    const spots = [
      [docks.x - 20, docks.z + 1], [docks.x - 15, docks.z + 26], [docks.x - 20, docks.z + 51],
    ];
    for (const [x, z] of spots) {
      const built = buildGangsterMesh();
      const gang = {
        group: built.group, legL: built.legL, legR: built.legR,
        pos: new THREE.Vector3(x, 0, z),
        heading: Math.random() * Math.PI * 2,
        health: 60, alive: true, radius: 0.9, walkPhase: 0,
        shootCooldown: 1 + Math.random(),
        onHit: () => {}, onDeath: () => { this.gangstersDown++; this.g.audio.crash(); },
      };
      gang.group.position.copy(gang.pos);
      this.g.scene.add(gang.group);
      this.gangsters.push(gang);
    }
  }

  clearGangsters() {
    for (const gang of this.gangsters) this.g.scene.remove(gang.group);
    this.gangsters = [];
  }

  update(dt) {
    if (!this.active || this.done) return null;
    const g = this.g;
    const def = this.def;
    // timer missions
    if (def.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = false;
        return { type: 'failed', reason: 'Out of time — Vera is not happy. Try the job again.' };
      }
    }
    // gangsters fight back
    for (const gang of this.gangsters) {
      if (!gang.alive) continue;
      const dx = g.player.pos.x - gang.pos.x, dz = g.player.pos.z - gang.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 30) {
        gang.heading = Math.atan2(dx, dz);
        gang.shootCooldown -= dt;
        if (gang.shootCooldown <= 0) {
          gang.shootCooldown = 1.1 + Math.random() * 0.7;
          const from = gang.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
          g.combat.showTracer(from, g.player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)));
          if (Math.random() < 0.4) {
            g.player.damage(6);
            g.audio.gunshot();
          }
        }
      }
      gang.group.position.copy(gang.pos);
      gang.group.rotation.y = gang.heading;
    }
    // beacon pulse
    if (this.beacon.visible) {
      const s = 1 + Math.sin(performance.now() / 300) * 0.08;
      this.beacon.scale.set(s, 1, s);
    }
    // step progression
    const stepDef = def.steps[this.step];
    if (!stepDef) return null;
    if (stepDef.done(g)) {
      this.step++;
      g.audio.pickup();
      if (this.step >= def.steps.length) {
        return this.complete();
      }
      // next step retargets
      if (def.id === 'harbor-run' && this.step === 1) this.setTarget(g.city.landmarks.garage);
      if (def.id === 'king-of-solcosta' && this.step === 1) {
        g.police.setWanted(4);
        this.setTarget(g.city.landmarks.garage);
      }
    }
    return null;
  }

  complete() {
    const g = this.g;
    const reward = this.def.reward;
    g.money += reward;
    this.active = false;
    this.setTarget(null);
    this.clearGangsters();
    g.audio.missionDone();
    const finished = this.index;
    this.index++;
    return { type: 'complete', reward, finished };
  }

  reset() {
    this.clearGangsters();
    if (this.goldCar) {
      const i = this.g.traffic.cars.indexOf(this.goldCar);
      if (i >= 0) this.g.traffic.cars.splice(i, 1);
      this.g.scene.remove(this.goldCar.group);
      this.goldCar = null;
    }
    this.active = false;
    this.step = 0;
    this.setTarget(null);
  }
}

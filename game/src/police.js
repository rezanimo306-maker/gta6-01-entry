// police.js — the Solcosta PD: the wanted level, pursuit cars that ram, and
// foot officers who chase the player down. One clear job: make crime have
// consequences, and make escaping feel earned.
import * as THREE from 'three';
import { Car } from './cars.js';

function buildCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.34), navy);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), navy);
  cap.position.y = 1.8;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), navy);
  legL.position.set(-0.14, 0.33, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  return { group: g, legL, legR };
}

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.stars = 0;
    this.cars = [];
    this.cops = [];
    this.hideTimer = 0;
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.ramCooldown = 0;
  }

  setWanted(n) {
    this.stars = Math.max(0, Math.min(5, n));
    if (this.stars === 0) { this.hideTimer = 0; this.bustTimer = 0; }
  }

  addHeat(n) {
    if (n > 0) {
      this.setWanted(this.stars + n);
      this.hideTimer = 0;
    }
  }

  clear() {
    for (const c of this.cars) this.scene.remove(c.group);
    for (const c of this.cops) this.scene.remove(c.group);
    this.cars = [];
    this.cops = [];
    this.setWanted(0);
  }

  spawnCarNear(playerPos) {
    // spawn on a road 70–110 units away from the player
    for (let tries = 0; tries < 12; tries++) {
      const p = this.city.randomRoadPoint();
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d > 70 && d < 130) {
        const car = new Car(this.scene, 'police', p.x, p.z, Math.random() * Math.PI * 2);
        this.cars.push(car);
        return car;
      }
    }
    return null;
  }

  spawnFootCop(playerPos) {
    const built = buildCopMesh();
    const angle = Math.random() * Math.PI * 2;
    const cop = {
      group: built.group, legL: built.legL, legR: built.legR,
      pos: new THREE.Vector3(playerPos.x + Math.cos(angle) * 26, 0, playerPos.z + Math.sin(angle) * 26),
      heading: 0, health: 50, alive: true, radius: 0.8, walkPhase: 0,
      onHit: () => {}, onDeath: () => {},
    };
    cop.group.position.copy(cop.pos);
    this.scene.add(cop.group);
    this.cops.push(cop);
    return cop;
  }

  /** Wanted decay + spawning + pursuit. Returns 'busted' when the player is caught. */
  update(dt, player, playerCar, onBusted) {
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    const playerPos = playerCar ? playerCar.pos : player.pos;
    const wanted = this.stars;

    // spawn pressure: more stars, more cars; foot cops when the player is on foot
    if (wanted > 0) {
      this.spawnTimer -= dt;
      const wantCars = Math.min(1 + wanted, 6);
      const wantCops = playerCar ? 0 : Math.min(wanted, 3);
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 2.2;
        if (this.cars.length < wantCars) this.spawnCarNear(playerPos);
        if (this.cops.length < wantCops) this.spawnFootCop(playerPos);
      }
    }

    // pursuit cars: steer at the player, ram the player's car
    for (const car of this.cars) {
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.4));
      const throttle = dist > 6 ? 1 : 0.4;
      car.drive(dt, throttle, steer, false, this.city);
      if (playerCar && dist < 4.5 && this.ramCooldown <= 0) {
        // ram: shove the player's car away and scrub its speed
        playerCar.speed *= 0.72;
        playerCar.pos.x += (dx / dist) * 1.6 + (Math.random() - 0.5) * 1.2;
        playerCar.pos.z += (dz / dist) * 1.6 + (Math.random() - 0.5) * 1.2;
        this.ramCooldown = 0.8;
      }
      // a cruiser that lost the player respawns on a road near the chase
      if (dist > 220) {
        for (let tries = 0; tries < 10; tries++) {
          const p = this.city.randomRoadPoint();
          const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
          if (d > 60 && d < 120) { car.pos.set(p.x, 0, p.z); break; }
        }
      }
    }

    // foot cops: run at the player, grab them when close
    let touching = false;
    for (const cop of this.cops) {
      if (!cop.alive) continue;
      const dx = player.pos.x - cop.pos.x, dz = player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += dh * Math.min(1, dt * 6);
      const speed = playerCar ? 5.5 : 7.2;
      cop.pos.x += Math.sin(cop.heading) * speed * dt;
      cop.pos.z += Math.cos(cop.heading) * speed * dt;
      const fixed = this.city.resolveCollision(cop.pos.x, cop.pos.z, 0.5);
      cop.pos.x = fixed.x; cop.pos.z = fixed.z;
      cop.group.position.copy(cop.pos);
      cop.group.rotation.y = cop.heading;
      cop.walkPhase += dt * 11;
      cop.legL.rotation.x = Math.sin(cop.walkPhase) * 0.6;
      cop.legR.rotation.x = -Math.sin(cop.walkPhase) * 0.6;
      if (dist < 2.1 && !playerCar) {
        touching = true;
        player.damage(14 * dt);
      }
    }
    // remove dead cops
    for (let i = this.cops.length - 1; i >= 0; i--) {
      if (!this.cops[i].alive) {
        this.scene.remove(this.cops[i].group);
        this.cops.splice(i, 1);
      }
    }

    if (touching) {
      this.bustTimer += dt;
      if (this.bustTimer > 1.6) {
        this.bustTimer = 0;
        if (onBusted) onBusted();
        return 'busted';
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }

    // escape: no police near + time passing cools the heat off, one star at a time
    if (wanted > 0) {
      let nearest = Infinity;
      for (const c of this.cars) nearest = Math.min(nearest, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
      for (const c of this.cops) if (c.alive) nearest = Math.min(nearest, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
      if (nearest > 42) {
        this.hideTimer += dt;
        if (this.hideTimer > 14) {
          this.hideTimer = 0;
          this.setWanted(wanted - 1);
        }
      } else {
        this.hideTimer = 0;
      }
    }
    return null;
  }
}

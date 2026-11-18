// player.js — Milo Reyes on foot: third-person walking, sprinting, jumping,
// punching, and getting in and out of cars. One clear job: the body the
// player drives when they are not driving.
import * as THREE from 'three';

function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  // hair
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.72;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), jeans);
  legL.position.set(-0.15, 0.35, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), jacket);
  armL.position.set(-0.4, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  return { group: g, legL, legR, armL, armR };
}

export class Player {
  constructor(scene, start) {
    const built = buildPlayerMesh();
    this.group = built.group;
    this.legL = built.legL; this.legR = built.legR;
    this.armL = built.armL; this.armR = built.armR;
    this.pos = start.clone();
    this.heading = 0;
    this.vy = 0;
    this.onGround = true;
    this.health = 100;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.inCar = null; // Car instance or null
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = Infinity;
    this.shootCooldown = 0;
    scene.add(this.group);
    this.syncMesh();
  }

  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.group.visible = this.inCar === null;
  }

  /** Move on foot. axes {x strafe, y forward} relative to camera yaw. */
  walk(dt, axes, sprint, jump, camYaw, city) {
    if (this.inCar) return;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    const speed = sprint ? 11 : 6.5;
    // Movement relative to camera yaw. Camera sits at player + (sin,cos)*dist,
    // so camera forward is (-sin,-cos) and camera right is (cos,-sin).
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let mx = axes.x * cos - axes.y * sin;
    let mz = -axes.x * sin - axes.y * cos;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      // turn smoothly toward the move direction
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 12);
      let nx = this.pos.x + mx * speed * dt;
      let nz = this.pos.z + mz * speed * dt;
      const fixed = city.resolveCollision(nx, nz, 0.6);
      this.pos.x = fixed.x; this.pos.z = fixed.z;
      this.pos.x = Math.max(-335, Math.min(335, this.pos.x));
      this.pos.z = Math.max(-335, Math.min(335, this.pos.z));
      this.walkPhase += dt * (sprint ? 13 : 9);
    }
    // gravity + jump
    if (jump && this.onGround) {
      this.vy = 7.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    }
    const swing = len > 0.01 ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      this.armR.rotation.x = -1.8 * Math.max(0, this.punchTimer / 0.28);
    }
    this.syncMesh();
  }

  /** Throw a punch: returns true if the swing happened. */
  punch() {
    if (this.inCar || this.punchCooldown > 0) return false;
    this.punchCooldown = 0.45;
    this.punchTimer = 0.28;
    return true;
  }

  /** Fire the pistol: returns true if a shot left the barrel. */
  shoot() {
    if (this.inCar || this.weapon !== 'pistol' || this.shootCooldown > 0) return false;
    this.shootCooldown = 0.28;
    this.punchTimer = 0.18;
    return true;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }

  enterCar(car) {
    this.inCar = car;
    car.isPlayer = true;
    this.syncMesh();
  }

  exitCar() {
    if (!this.inCar) return null;
    const car = this.inCar;
    car.isPlayer = false;
    this.inCar = null;
    // step out to the driver's side
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    this.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    this.heading = car.heading;
    this.syncMesh();
    return car;
  }
}

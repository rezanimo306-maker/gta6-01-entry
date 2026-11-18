// combat.js — fists and firearms in Solcosta. One clear job: resolve attacks
// (punches, pistol shots) against pedestrians, gangsters and police, and draw
// the tracer + impact feedback. No movement or AI lives here.
import * as THREE from 'three';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    // reusable tracer line
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
    this.tracer.visible = false;
    this.tracerTimer = 0;
    scene.add(this.tracer);
    // impact puff
    this.impact = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    );
    this.impact.visible = false;
    this.impactTimer = 0;
    scene.add(this.impact);
  }

  showTracer(from, to) {
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = 0.07;
  }

  showImpact(at) {
    this.impact.position.copy(at);
    this.impact.visible = true;
    this.impactTimer = 0.15;
  }

  update(dt) {
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
    if (this.impactTimer > 0) {
      this.impactTimer -= dt;
      if (this.impactTimer <= 0) this.impact.visible = false;
    }
  }

  /**
   * A pistol shot from `origin` along `dir` (unit). `targets` are objects with
   * {pos: Vector3, radius, health, onHit(dmg), alive}. Returns the target hit
   * (or null). Walls block shots: the ray stops at the first building AABB.
   */
  shoot(origin, dir, range, damage, targets, city) {
    // march the ray in steps; cheap and good enough for a browser game
    const step = 0.5;
    const p = origin.clone();
    const wallHit = { x: 0, z: 0 };
    for (let d = 0; d < range; d += step) {
      p.addScaledVector(dir, step);
      if (city.hitsBuilding(p.x, p.z, 0.1)) {
        wallHit.x = p.x; wallHit.z = p.z;
        this.showTracer(origin, new THREE.Vector3(p.x, p.y, p.z));
        this.showImpact(new THREE.Vector3(p.x, p.y, p.z));
        return null;
      }
      for (const t of targets) {
        if (!t.alive) continue;
        const dx = t.pos.x - p.x, dz = t.pos.z - p.z;
        const dy = (t.pos.y + 1.1) - p.y;
        if (dx * dx + dz * dz < t.radius * t.radius && Math.abs(dy) < 1.6) {
          this.showTracer(origin, new THREE.Vector3(p.x, p.y, p.z));
          this.showImpact(new THREE.Vector3(p.x, p.y, p.z));
          t.health -= damage;
          if (t.health <= 0) { t.alive = false; if (t.onDeath) t.onDeath(); }
          else if (t.onHit) t.onHit(damage);
          return t;
        }
      }
    }
    const end = origin.clone().addScaledVector(dir, range);
    this.showTracer(origin, end);
    return null;
  }

  /**
   * A punch in front of the player: anything within 1.6 units and a 100°
   * cone takes damage. Returns the first target hit.
   */
  punch(origin, heading, damage, targets) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const t of targets) {
      if (!t.alive) continue;
      const dx = t.pos.x - origin.x, dz = t.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.9 || d < 0.01) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.35) continue;
      t.health -= damage;
      if (t.health <= 0) { t.alive = false; if (t.onDeath) t.onDeath(); }
      else if (t.onHit) t.onHit(damage);
      return t;
    }
    return null;
  }
}

// cars.js — cars of Solcosta: the factory that builds every vehicle mesh,
// arcade driving physics for the player's car, and traffic AI that keeps the
// city moving. One clear job: everything with four wheels.
import * as THREE from 'three';

export const CAR_TYPES = {
  sedan: { maxSpeed: 26, accel: 14, color: 0x4a6a9a, length: 4.4, width: 1.9 },
  taxi: { maxSpeed: 25, accel: 13, color: 0xf2c200, length: 4.4, width: 1.9 },
  sports: { maxSpeed: 35, accel: 19, color: 0xd8b020, length: 4.2, width: 2.0 },
  truck: { maxSpeed: 19, accel: 9, color: 0x7a6a5a, length: 6.0, width: 2.2 },
  police: { maxSpeed: 31, accel: 17, color: 0x1a1a22, length: 4.5, width: 1.9 },
};

const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x141414 });

/** Build a low-poly car from boxes. Returns { group, wheels, frontWheels }. */
export function buildCarMesh(typeName, colorOverride = null) {
  const spec = CAR_TYPES[typeName] || CAR_TYPES.sedan;
  const color = colorOverride ?? spec.color;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const L = spec.length, W = spec.width;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.75, L), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.62, L * 0.48), glassMat);
  cabin.position.set(0, 1.28, -L * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  // headlights + taillights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x888866 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2211, emissive: 0x550000 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    hl.position.set(s * (W / 2 - 0.3), 0.66, L / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(s * (W / 2 - 0.3), 0.66, -L / 2 - 0.02);
    g.add(tl);
  }
  if (typeName === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x332200 }));
    sign.position.set(0, 1.72, -L * 0.06);
    g.add(sign);
  }
  if (typeName === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.66, -L * 0.06);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    red.position.set(-0.28, 1.78, -L * 0.06);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    blue.position.set(0.28, 1.78, -L * 0.06);
    g.add(blue);
    // white doors
    const door = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.5, L * 0.5),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    door.position.set(0, 0.62, 0);
    g.add(door);
  }
  // wheels
  const wheels = [];
  const frontWheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * (W / 2 - 0.05), 0.36, sz * (L / 2 - 0.75));
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
    if (sz > 0) frontWheels.push(w);
  }
  return { group: g, wheels, frontWheels, spec };
}

export class Car {
  constructor(scene, typeName, x, z, heading, colorOverride = null) {
    const built = buildCarMesh(typeName, colorOverride);
    this.typeName = typeName;
    this.spec = built.spec;
    this.group = built.group;
    this.wheels = built.wheels;
    this.frontWheels = built.frontWheels;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPlayer = false;
    this.isPolice = typeName === 'police';
    this.isTraffic = false;
    this.alive = true;
    this.wheelSpin = 0;
    scene.add(this.group);
    this.syncMesh();
  }

  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  /** Arcade driving step. axes {y: throttle -1..1}, steer -1..1, handbrake. */
  drive(dt, throttle, steerInput, handbrake, city) {
    const spec = this.spec;
    if (throttle > 0) this.speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -26 : -8) * dt; // brake, then reverse
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    }
    const maxF = spec.maxSpeed, maxR = 9;
    this.speed = Math.max(-maxR, Math.min(maxF, this.speed));
    // steering bites harder at low speed, fades at top speed
    const speedFactor = Math.min(1, Math.abs(this.speed) / 10);
    const grip = handbrake ? 0.45 : 1;
    const turnRate = 1.9 * speedFactor * grip * (this.speed < 0 ? -1 : 1);
    this.heading += steerInput * turnRate * dt * (handbrake ? 1.5 : 1);
    if (handbrake) this.speed *= Math.max(0, 1 - 1.6 * dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let nx = this.pos.x + fx * this.speed * dt;
    let nz = this.pos.z + fz * this.speed * dt;
    if (city) {
      const fixed = city.resolveCollision(nx, nz, 1.6);
      // a hard hit against a building scrubs speed — and the car slides
      // along the wall instead of wedging into it nose-first
      if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
        let px = fixed.x - nx, pz = fixed.z - nz;
        const pl = Math.hypot(px, pz) || 1;
        px /= pl; pz /= pl; // wall normal (push-out direction)
        const tx = -pz, tz = px; // wall tangent
        const fx0 = Math.sin(this.heading), fz0 = Math.cos(this.heading);
        const dot = fx0 * tx + fz0 * tz;
        const slideX = dot >= 0 ? tx : -tx;
        const slideZ = dot >= 0 ? tz : -tz;
        const targetHeading = Math.atan2(slideX, slideZ);
        let dh = targetHeading - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.heading += dh * Math.min(1, dt * 6);
        if (Math.abs(this.speed) > 8) this.speed *= 0.55;
        nx = fixed.x; nz = fixed.z;
      }
      nx = Math.max(-HALF_CITY, Math.min(HALF_CITY, nx));
      nz = Math.max(-HALF_CITY, Math.min(HALF_CITY + 60, nz));
    }
    this.pos.x = nx; this.pos.z = nz;
    // wheels
    this.wheelSpin += (this.speed * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.frontWheels) w.rotation.y = steerInput * 0.42;
    this.syncMesh();
  }
}

export const HALF_CITY = 340;

/** Traffic: cars that cruise the road grid and turn at intersections. */
export class Traffic {
  constructor(scene, city, count) {
    this.city = city;
    this.cars = [];
    const types = ['sedan', 'sedan', 'taxi', 'sedan', 'truck', 'sedan', 'taxi'];
    for (let i = 0; i < count; i++) {
      const p = city.randomRoadPoint();
      const heading = p.axis === 'x' ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
        : (Math.random() < 0.5 ? 0 : Math.PI);
      const car = new Car(scene, types[i % types.length], p.x, p.z, heading,
        0x333333 + Math.floor(Math.random() * 0xaaaaaa));
      car.isTraffic = true;
      car.axis = p.axis;
      car.dir = Math.random() < 0.5 ? 1 : -1;
      car.cruise = 9 + Math.random() * 5;
      car.waitAtLight = 0;
      this.cars.push(car);
    }
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      // parked cars (steal targets, the gold car) never drive themselves
      if (car.parked) { car.syncMesh(); continue; }
      // car ahead? brake.
      let blocked = false;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 7 && Math.abs(Math.sin(car.heading) * dx + Math.cos(car.heading) * dz) > 0) {
          const ahead = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          if (ahead > 0 && ahead < 8 && Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading)) < 2.5) {
            blocked = true;
          }
        }
      }
      if (playerCar) {
        const dx = playerCar.pos.x - car.pos.x, dz = playerCar.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 9) {
          const ahead = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          if (ahead > 0 && ahead < 9) blocked = true;
        }
      }
      const target = blocked ? 0 : car.cruise;
      car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 10 * dt);
      // steer along the road axis, with a gentle wobble; turn at intersections
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let nx = car.pos.x + fx * car.speed * dt;
      let nz = car.pos.z + fz * car.speed * dt;
      const fixed = this.city.resolveCollision(nx, nz, 1.6);
      if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
        // hit a building: reverse the heading and pick a new line
        car.heading += Math.PI;
        car.pos.x = fixed.x; car.pos.z = fixed.z;
      } else {
        car.pos.x = nx; car.pos.z = nz;
      }
      // at an intersection, sometimes turn onto the cross road
      const nearLine = (v) => {
        for (const line of this.city.roadLines) if (Math.abs(v - line) < 2.5) return line;
        return null;
      };
      const cross = car.axis === 'x' ? nearLine(car.pos.x) : nearLine(car.pos.z);
      if (cross !== null && Math.random() < 0.02) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.heading = car.axis === 'x'
          ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
          : (Math.random() < 0.5 ? 0 : Math.PI);
      }
      // keep inside the city
      car.pos.x = Math.max(-HALF_CITY, Math.min(HALF_CITY, car.pos.x));
      car.pos.z = Math.max(-HALF_CITY, Math.min(HALF_CITY, car.pos.z));
      car.wheelSpin += (car.speed * dt) / 0.36;
      for (const w of car.wheels) w.rotation.x = car.wheelSpin;
      car.syncMesh();
    }
  }

  /** A random parked-looking car near a road, for the player to steal. */
  spawnParked(scene, near) {
    const p = this.city.randomRoadPoint();
    const types = ['sedan', 'taxi', 'sports'];
    const car = new Car(scene, types[Math.floor(Math.random() * types.length)], p.x, p.z,
      p.axis === 'x' ? Math.PI / 2 : 0, 0x333333 + Math.floor(Math.random() * 0xaaaaaa));
    car.isTraffic = true;
    car.axis = p.axis;
    car.cruise = 0;
    car.parked = true;
    this.cars.push(car);
    return car;
  }
}

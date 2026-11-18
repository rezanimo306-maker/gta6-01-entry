// main.js — SOLCOSTA: bootstrap, game loop, camera and the rules that wire
// every system together. One clear job: run the game. The city, cars,
// police, missions, combat, HUD and audio each own their own file.
import * as THREE from 'three';
import { City, HALF } from './city.js';
import { Car, Traffic } from './cars.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions, MISSION_DEFS } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave } from './save.js';

const SKY_TOP = 0x3a7ab8;
const SKY_HORIZON = 0xffd9a0;

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted | wasted | storydone
    this.money = 0;
    this.missionsDone = 0;
    this.bestMoney = 0;
    const save = loadSave();
    if (save) {
      this.money = save.money;
      this.missionsDone = Math.min(save.missionsDone, MISSION_DEFS.length);
      this.bestMoney = save.bestMoney;
    }
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 11;
    this.missionStartDelay = 0;
    this.endTimer = 0;
    this.stealCooldown = 0;
    this.hornCooldown = 0;
    this.debug = {};

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game';
    document.getElementById('app').appendChild(this.renderer.domElement);

    // scene, sky, lights
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2c98a, 200, 760);
    this.buildSky();
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9));
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);

    // world + systems
    this.city = new City(this.scene);
    this.player = new Player(this.scene, this.city.landmarks.playerStart);
    this.traffic = new Traffic(this.scene, this.city, 16);
    this.peds = new Pedestrians(this.scene, this.city, 26);
    this.police = new Police(this.scene, this.city);
    this.combat = new Combat(this.scene);
    this.hud = new HUD(this.city);
    this.audio = new AudioEngine();
    this.input = new Input(this.renderer.domElement);
    this.missions = new Missions(this);
    // a few parked cars to steal right away
    for (let i = 0; i < 4; i++) this.traffic.spawnParked(this.scene);
    // mission context helpers the missions call
    this.atTarget = (radius) => {
      if (!this.missions.target) return false;
      const p = this.player.inCar ? this.player.inCar.pos : this.player.pos;
      return Math.hypot(p.x - this.missions.target.x, p.z - this.missions.target.z) < radius;
    };

    this.buildMenu();
    this.bindButtons();
    this.exposeDebug();
    window.addEventListener('resize', () => this.onResize());
    this.clock = new THREE.Clock();
    this.simTime = 0; // simulated seconds (capped dt), for tests and pacing
    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(1100, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(SKY_TOP) },
        horizon: { value: new THREE.Color(SKY_HORIZON) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.6, h)), 1.0); }',
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  buildMenu() {
    const list = document.getElementById('missionList');
    list.innerHTML = MISSION_DEFS.map((m, i) => {
      const cls = i < this.missionsDone ? 'done' : i === this.missionsDone ? 'now' : '';
      const mark = i < this.missionsDone ? '✓' : i === this.missionsDone ? '►' : '·';
      return `<div class="${cls}">${mark} ${m.title} — $${m.reward}</div>`;
    }).join('');
    document.getElementById('startBtn').textContent =
      this.missionsDone >= MISSION_DEFS.length ? 'FREE ROAM — ALL JOBS DONE'
      : this.missionsDone > 0 ? `CONTINUE — JOB ${this.missionsDone + 1}` : 'START ENGINE';
  }

  bindButtons() {
    document.getElementById('startBtn').addEventListener('click', () => this.startGame());
    document.getElementById('resumeBtn').addEventListener('click', () => this.setState('playing'));
    document.getElementById('restartBtn').addEventListener('click', () => this.restartDay());
    document.getElementById('endBtn').addEventListener('click', () => this.recover());
  }

  exposeDebug() {
    // Test hook for headless play-testing (screenshots, verification). It only
    // reads and drives the same public game state a player could reach.
    window.__solcosta = {
      game: this,
      state: () => this.state,
      money: () => this.money,
      wanted: () => this.police.stars,
      mission: () => (this.missions.done ? 'done' : MISSION_DEFS[this.missions.index].id),
      startMission: (i) => { this.missions.reset(); this.missions.start(i); },
      setWanted: (n) => this.police.setWanted(n),
      teleport: (x, z) => {
        if (this.player.inCar) { this.player.inCar.pos.set(x, 0, z); this.player.inCar.speed = 0; }
        else this.player.pos.set(x, 0, z);
      },
      giveCar: (type) => {
        const p = this.player.inCar ? this.player.inCar.pos : this.player.pos;
        const car = new Car(this.scene, type || 'sports', p.x + 4, p.z + 4, 0);
        car.parked = true;
        this.traffic.cars.push(car);
        return car;
      },
    };
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setState(next) {
    this.state = next;
    document.getElementById('menu').classList.toggle('hidden', next !== 'menu');
    document.getElementById('pauseMenu').classList.toggle('hidden', next !== 'paused');
    document.getElementById('endScreen').classList.toggle('hidden',
      next !== 'busted' && next !== 'wasted' && next !== 'storydone');
  }

  startGame() {
    this.audio.ensure();
    this.audio.click();
    this.setState('playing');
    if (this.missionsDone >= MISSION_DEFS.length) {
      this.hud.toast('All jobs done — free roam. Solcosta is yours.', 5);
      return;
    }
    this.missions.start(this.missionsDone);
    this.hud.toast(this.missions.def.brief, 5);
  }

  restartDay() {
    this.audio.click();
    this.police.clear();
    this.missions.reset();
    this.player.health = 100;
    this.player.pos.copy(this.city.landmarks.playerStart);
    this.player.heading = 0;
    if (this.player.inCar) { this.player.inCar.isPlayer = false; this.player.inCar = null; }
    this.player.syncMesh();
    this.missionsDone = 0;
    this.money = 0;
    this.buildMenu();
    this.setState('playing');
    this.missions.start(0);
    this.hud.toast(this.missions.def.brief, 5);
  }

  recover() {
    // after BUSTED or WASTED: lose 10% of the cash, back on the streets
    this.money = Math.floor(this.money * 0.9);
    this.player.health = 100;
    this.player.heal(100);
    this.police.setWanted(0);
    this.player.pos.copy(this.city.landmarks.hospital);
    this.player.heading = 0;
    if (this.player.inCar) { this.player.inCar.isPlayer = false; this.player.inCar = null; }
    this.player.syncMesh();
    this.setState('playing');
    this.save();
    this.hud.toast('Back on the streets. Vera is waiting.', 4);
  }

  save() {
    writeSave({ money: this.money, missionsDone: this.missionsDone, bestMoney: this.bestMoney });
  }

  // ---- frame loop ----
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.simTime += dt;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu') this.updateMenuScene(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  updateMenuScene(dt) {
    // slow orbit around downtown behind the menu
    const t = performance.now() / 1000;
    const cx = Math.sin(t * 0.05) * 180, cz = Math.cos(t * 0.05) * 180;
    this.camera.position.set(cx, 90, cz);
    this.camera.lookAt(0, 20, 0);
    this.traffic.update(dt, null);
    this.peds.update(dt, this.player.pos, []);
  }

  update(dt) {
    const input = this.input;
    const player = this.player;
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    this.hornCooldown = Math.max(0, this.hornCooldown - dt);

    // pause
    if (input.pressed('Escape')) { this.setState('paused'); return; }
    // camera orbit from mouse
    const md = input.takeMouseDelta();
    this.camYaw -= md.dx * 0.004;
    this.camPitch = Math.max(0.08, Math.min(0.9, this.camPitch + md.dy * 0.003));

    // weapons
    if (input.pressed('Digit1')) { player.weapon = 'fists'; this.hud.toast('Fists', 1); }
    if (input.pressed('Digit2')) {
      player.weapon = 'pistol';
      this.hud.toast('Pistol — click to shoot', 1.5);
    }
    if (input.pressed('KeyH') && player.inCar && this.hornCooldown <= 0) {
      this.audio.horn();
      this.hornCooldown = 0.6;
    }

    // --- driving / walking ---
    const axes = input.moveAxes();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    if (player.inCar) {
      const car = player.inCar;
      // ease the camera behind the car when the player is not orbiting
      // (camera sits opposite the travel direction, so the car drives away
      // from the viewer — a chase cam, not a front cam)
      if (Math.abs(md.dx) < 1) {
        let dh = car.heading + Math.PI - this.camYaw;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.camYaw += dh * Math.min(1, dt * 1.8);
      }
      car.drive(dt, axes.y, -axes.x, sprint, this.city);
      this.audio.setEngine(Math.abs(car.speed) / car.spec.maxSpeed, true);
      this.checkCarVsPeds(car);
      this.checkCarVsTraffic(car);
      if (input.pressed('KeyE')) this.exitCurrentCar();
    } else {
      player.walk(dt, axes, sprint, input.down('Space'), this.camYaw, this.city);
      this.audio.setEngine(0, false);
      if (input.pressed('KeyE') && this.stealCooldown <= 0) this.tryStealCar();
      if (input.pressed('KeyF')) this.doPunch();
      if (input.takeClick() && player.weapon === 'pistol') this.doShoot();
      this.checkTrafficVsPlayer();
    }
    // punch / shoot also work from the car? No — on foot only (handled above).

    // --- world systems ---
    this.traffic.update(dt, player.inCar);
    this.peds.update(dt, player.pos, this.traffic.cars);
    this.combat.update(dt);
    const policeResult = this.police.update(dt, player, player.inCar, () => this.onBusted());
    if (policeResult === 'busted') return;
    this.audio.siren(dt, this.police.stars);

    // --- missions ---
    if (this.missionStartDelay > 0) {
      this.missionStartDelay -= dt;
      if (this.missionStartDelay <= 0 && !this.missions.done) {
        this.missions.start(this.missionsDone);
        this.hud.toast(this.missions.def.brief, 5);
      }
    }
    const mResult = this.missions.update(dt);
    if (mResult) {
      if (mResult.type === 'complete') this.onMissionComplete(mResult);
      else if (mResult.type === 'failed') {
        this.hud.toast(mResult.reason, 5);
        this.audio.busted();
        this.missionStartDelay = 2.5;
        this.missions.reset();
      }
    }

    // --- death ---
    if (player.health <= 0) { this.onWasted(); return; }

    // --- camera + sun follow ---
    this.updateCamera(dt);
    const focus = player.inCar ? player.inCar.pos : player.pos;
    this.sun.position.set(focus.x + 180, 260, focus.z + 120);
    this.sun.target.position.set(focus.x, 0, focus.z);

    // --- HUD ---
    this.updateHUD(dt);
  }

  updateCamera(dt) {
    const focus = this.player.inCar ? this.player.inCar.pos : this.player.pos;
    const dist = this.player.inCar ? this.camDist + 3 : this.camDist;
    // pull the camera in when a building is in the way
    let d = dist;
    for (let i = 0; i < 5; i++) {
      const cx = focus.x + Math.sin(this.camYaw) * d;
      const cz = focus.z + Math.cos(this.camYaw) * d;
      if (!this.city.hitsBuilding(cx, cz, 1.2)) break;
      d *= 0.75;
    }
    const y = 2 + Math.sin(this.camPitch) * d + (this.player.inCar ? 1.5 : 0);
    const tx = focus.x + Math.sin(this.camYaw) * d;
    const tz = focus.z + Math.cos(this.camYaw) * d;
    this.camera.position.lerp(new THREE.Vector3(tx, y, tz), Math.min(1, dt * 10));
    this.camera.lookAt(focus.x, focus.y + 2.2, focus.z);
  }

  updateHUD(dt) {
    const player = this.player;
    const car = player.inCar;
    const def = this.missions.active ? this.missions.def : null;
    const stepDef = def ? def.steps[this.missions.step] : null;
    let hint = '';
    if (!car) {
      const near = this.nearestCar(4.5);
      hint = near ? 'Press E to steal the car' : 'WASD to move — find a car and press E';
    } else {
      hint = 'WASD drive — Shift handbrake — E get out — H horn';
    }
    this.hud.update(dt, {
      health: player.health,
      money: this.money,
      weapon: player.weapon,
      wanted: this.police.stars,
      objective: stepDef ? stepDef.text : (this.missions.done ? 'All jobs done — Solcosta is yours' : 'Talk to Vera — start a job'),
      objectiveSub: stepDef ? stepDef.sub : '',
      missionTimer: this.missions.active && this.missions.def.timeLimit ? this.missions.timer : 0,
      speedKmh: car ? Math.abs(car.speed) * 3.6 : 0,
      inCar: !!car,
      carName: car ? car.typeName : '',
      hint,
      showCrosshair: !car && player.weapon === 'pistol',
      player, playerCar: car,
      policeCars: this.police.cars,
      cops: this.police.cops,
      gangsters: this.missions.gangsters,
      trafficCars: this.traffic.cars,
      target: this.missions.target,
    });
  }

  nearestCar(range) {
    const p = this.player.pos;
    let best = null, bestD = range;
    for (const car of this.traffic.cars) {
      if (!car.parked && car.speed > 2) continue; // only steal stopped / parked cars
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  tryStealCar() {
    const car = this.nearestCar(4.5);
    if (!car) return;
    this.stealCooldown = 0.7;
    // taking a car the city saw you take is a crime
    this.police.addHeat(1);
    this.player.enterCar(car);
    car.parked = false;
    car.cruise = 0;
    // remove it from traffic control while the player drives it
    const i = this.traffic.cars.indexOf(car);
    if (i >= 0) this.traffic.cars.splice(i, 1);
    this.audio.crash();
    this.hud.toast('Car stolen! The PD noticed. (+1 ★)', 3);
    this.peds.scare(this.player.pos.x, this.player.pos.z, 18);
  }

  exitCurrentCar() {
    const car = this.player.exitCar();
    if (!car) return;
    car.speed = 0;
    this.traffic.cars.push(car);
    car.parked = true;
    car.cruise = 0;
    this.stealCooldown = 0.7;
  }

  doPunch() {
    if (!this.player.punch()) return false;
    this.audio.punch();
    const origin = this.player.pos;
    const targets = [
      ...this.missions.gangsters,
      ...this.police.cops,
      ...this.peds.list.map((p) => ({ ...p, health: 30, alive: true, radius: 0.8,
        onHit: () => {}, onDeath: () => { this.peds.scare(p.pos.x, p.pos.z, 20); } })),
    ];
    const hit = this.combat.punch(origin, this.player.heading, 34, targets);
    if (hit) {
      this.peds.scare(origin.x, origin.z, 20);
      if (this.missions.gangsters.includes(hit)) this.police.addHeat(0);
      else this.police.addHeat(1);
    }
    return true;
  }

  doShoot() {
    if (!this.player.shoot()) return false;
    this.audio.gunshot();
    const origin = this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    // shoot toward the camera's aim: from the camera through the screen centre
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = Math.max(-0.4, Math.min(0.4, dir.y));
    dir.normalize();
    const targets = [...this.missions.gangsters, ...this.police.cops];
    const hit = this.combat.shoot(origin, dir, 90, 34, targets, this.city);
    if (hit) this.police.addHeat(0);
    this.peds.scare(origin.x, origin.z, 26);
    return true;
  }

  checkCarVsPeds(car) {
    if (Math.abs(car.speed) < 5) return;
    for (let i = this.peds.list.length - 1; i >= 0; i--) {
      const p = this.peds.list[i];
      const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
      if (d < 2.3) {
        // hit a pedestrian: they are gone, the city saw it
        this.scene.remove(p.group);
        this.peds.list.splice(i, 1);
        this.police.addHeat(1);
        this.audio.crash();
        this.hud.toast('You hit a pedestrian! (+1 ★)', 2.5);
        this.peds.scare(car.pos.x, car.pos.z, 24);
        break;
      }
    }
  }

  checkCarVsTraffic(car) {
    for (const other of this.traffic.cars) {
      const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
      if (d < 3.6 && Math.abs(car.speed) > 6) {
        // shunt: both cars lose speed, sparks of noise
        const push = 2.2;
        const dx = (car.pos.x - other.pos.x) / (d || 1);
        const dz = (car.pos.z - other.pos.z) / (d || 1);
        other.pos.x -= dx * push; other.pos.z -= dz * push;
        car.speed *= 0.7;
        other.speed *= 0.5;
        this.audio.crash();
        if (other.isPolice) this.police.addHeat(1);
      }
    }
  }

  checkTrafficVsPlayer() {
    const player = this.player;
    for (const car of this.traffic.cars) {
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < 1.8 && Math.abs(car.speed) > 3) {
        player.damage(12);
        player.pos.x += (player.pos.x - car.pos.x) / (d || 1) * 2;
        player.pos.z += (player.pos.z - car.pos.z) / (d || 1) * 2;
        this.audio.crash();
        this.hud.toast('Hit by a car!', 2);
        break;
      }
    }
  }

  onMissionComplete(result) {
    this.missionsDone = result.finished + 1;
    this.bestMoney = Math.max(this.bestMoney, this.money);
    this.save();
    this.buildMenu();
    if (this.missions.done) {
      this.hud.toast(`FINAL JOB DONE! +$${result.reward} — you are the King of Solcosta!`, 6);
      this.endTimer = 3;
      setTimeout(() => {
        document.getElementById('endTitle').textContent = 'KING OF SOLCOSTA';
        document.getElementById('endText').textContent =
          `All five jobs done. $${this.money.toLocaleString('en-US')} in the pocket, Vane's gold car in Vera's garage. Solcosta is yours, Milo. Free roam continues — or press the button to keep playing.`;
        document.getElementById('endBtn').textContent = 'KEEP PLAYING';
        this.setState('storydone');
      }, 2500);
    } else {
      this.hud.toast(`Job complete! +$${result.reward}`, 4);
      this.missionStartDelay = 3;
    }
  }

  onBusted() {
    this.audio.busted();
    document.getElementById('endTitle').textContent = 'BUSTED';
    document.getElementById('endText').textContent =
      'The Solcosta PD caught you. They take 10% of your cash and drop you at the hospital. The debt to Vera still stands.';
    document.getElementById('endBtn').textContent = 'BACK ON THE STREETS';
    this.setState('busted');
  }

  onWasted() {
    this.audio.busted();
    document.getElementById('endTitle').textContent = 'WASTED';
    document.getElementById('endText').textContent =
      'You wake up in General Hospital, 10% lighter. Solcosta is still out there.';
    document.getElementById('endBtn').textContent = 'BACK ON THE STREETS';
    this.setState('wasted');
  }
}

// boot
new Game();

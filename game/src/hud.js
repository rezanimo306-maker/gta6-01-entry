// hud.js — the SOLCOSTA HUD: health, money, wanted stars, mission objective,
// speedometer and a live minimap. One clear job: turn game state into pixels
// the player can read at a glance. The minimap is a top-down canvas: roads,
// the player arrow, police, traffic and the mission beacon.
export class HUD {
  constructor(city) {
    this.city = city;
    this.el = {
      health: document.getElementById('healthBar'),
      money: document.getElementById('money'),
      ammo: document.getElementById('ammo'),
      wanted: document.getElementById('wanted'),
      objective: document.getElementById('objective'),
      speedo: document.getElementById('speedo'),
      toast: document.getElementById('toast'),
      hint: document.getElementById('hint'),
      crosshair: document.getElementById('crosshair'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = 0;
    this.lastWanted = -1;
  }

  toast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  update(dt, s) {
    // s: {health, money, weapon, wanted, objective, objectiveSub, speedKmh,
    //     inCar, hint, showCrosshair, player, playerCar, policeCars, cops,
    //     gangsters, target, missionTimer}
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    this.el.health.style.width = `${Math.max(0, s.health)}%`;
    this.el.health.style.background = s.health > 50
      ? 'linear-gradient(90deg,#ff5a3c,#ffb03c)' : 'linear-gradient(90deg,#ff2a1a,#ff5a3c)';
    this.el.money.textContent = `$${s.money.toLocaleString('en-US')}`;
    this.el.ammo.textContent = s.inCar ? '🚗 ' + (s.carName || 'car')
      : s.weapon === 'pistol' ? '🔫 Pistol — click to shoot' : '👊 Fists — F to punch, 2 for pistol';
    // wanted stars
    if (s.wanted !== this.lastWanted) {
      this.lastWanted = s.wanted;
      let html = '';
      for (let i = 0; i < 5; i++) html += i < s.wanted ? '★' : '<span class="dim">★</span>';
      this.el.wanted.innerHTML = html;
    }
    const timer = s.missionTimer > 0 ? ` — ⏱ ${Math.ceil(s.missionTimer)}s` : '';
    this.el.objective.innerHTML = s.objective
      ? `${s.objective}${timer}<span class="sub">${s.objectiveSub || ''}</span>` : '';
    this.el.speedo.innerHTML = s.inCar
      ? `<span class="big">${Math.round(s.speedKmh)}</span> km/h` : '';
    this.el.hint.textContent = s.hint || '';
    this.el.crosshair.style.display = s.showCrosshair ? 'block' : 'none';
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const ctx = this.mapCtx;
    const S = 180, HALF = 340;
    const toMap = (x, z) => [((x + HALF) / (HALF * 2)) * S, ((z + HALF) / (HALF * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    // sea + sand at the bottom edge
    ctx.fillStyle = '#0d2a1a'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2a7ab8';
    const [, seaY] = toMap(0, 324);
    ctx.fillRect(0, seaY, S, S - seaY);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, seaY - 4, S, 4);
    // roads
    ctx.strokeStyle = '#555'; ctx.lineWidth = 4;
    for (const line of this.city.roadLines) {
      const [x1, y1] = toMap(line, -HALF);
      const [x2, y2] = toMap(line, HALF);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-HALF, line);
      const [x4, y4] = toMap(HALF, line);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    // mission target
    if (s.target) dot(s.target.x, s.target.z, '#ffd23c', 6);
    // traffic + gangsters
    for (const c of s.trafficCars || []) dot(c.pos.x, c.pos.z, '#bbbbbb', 2);
    for (const gang of s.gangsters || []) if (gang.alive) dot(gang.pos.x, gang.pos.z, '#ff4444', 3);
    // police
    for (const c of s.policeCars || []) dot(c.pos.x, c.pos.z, '#4488ff', 3);
    for (const c of s.cops || []) if (c.alive) dot(c.pos.x, c.pos.z, '#4488ff', 3);
    // player arrow
    const pp = s.inCar ? s.playerCar.pos : s.player.pos;
    const [px, py] = toMap(pp.x, pp.z);
    const heading = s.inCar ? s.playerCar.heading : s.player.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // north tick
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('N', S / 2 - 4, 12);
  }
}

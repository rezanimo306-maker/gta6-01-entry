// input.js — keyboard + mouse state for SOLCOSTA. One clear job: read devices,
// expose a clean per-frame snapshot. No game logic lives here.
//
// Presses are queued on keydown (not sampled per frame), so a quick tap is
// never lost even when the frame rate is low.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedQueue = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false; // consumed by the game each frame
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.pointerLocked = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat && !this.keys.has(e.code)) this.pressedQueue.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.clicked = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      // Pointer lock gives free-look; if the browser refuses, drag still works.
      if (canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (_err) { /* drag fallback */ }
      }
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  down(code) { return this.keys.has(code); }

  /** WASD + arrows as a -1..1 pair, y forward. */
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return { x, y };
  }

  /** Consume one frame of mouse deltas (orbit camera). */
  takeMouseDelta() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  /** True once for the frame after the key went down (edge trigger). */
  pressed(code) {
    return this.pressedQueue.has(code);
  }

  endFrame() {
    this.pressedQueue.clear();
  }
}

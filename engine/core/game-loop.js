export class GameLoop {
  constructor({ update, render }) { this.update = update; this.render = render; this.running = false; this.lastTime = 0; this.request = null; this.frame = this.frame.bind(this); }
  start() { if (this.running) return; this.running = true; this.lastTime = performance.now(); this.request = requestAnimationFrame(this.frame); }
  stop() { this.running = false; if (this.request !== null) cancelAnimationFrame(this.request); this.request = null; }
  frame(time) { if (!this.running) return; const delta = Math.min(Math.max((time - this.lastTime) / 1000, 0), 0.1); this.lastTime = time; try { this.update(delta); this.render(); if (this.running) this.request = requestAnimationFrame(this.frame); } catch (error) { this.stop(); throw error; } }
}

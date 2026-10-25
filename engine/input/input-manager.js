export class InputManager {
  constructor(bindings = {}) {
    this.bindings = bindings; this.down = new Set(); this.pressed = new Set();
    this.onDown = event => { if (event.target?.closest?.('input,textarea,select,[contenteditable]')) return; if (!this.down.has(event.code)) this.pressed.add(event.code); this.down.add(event.code); };
    this.onUp = event => this.down.delete(event.code);
    this.onBlur = () => { this.down.clear(); this.pressed.clear(); };
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }
  isDown(action) { return this.bindings[action]?.some(code => this.down.has(code)) ?? false; }
  wasPressed(action) { return this.bindings[action]?.some(code => this.pressed.has(code)) ?? false; }
  endFrame() { this.pressed.clear(); }
  dispose() { window.removeEventListener('keydown', this.onDown); window.removeEventListener('keyup', this.onUp); window.removeEventListener('blur', this.onBlur); this.onBlur(); }
}

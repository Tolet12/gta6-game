// Keyboard and mouse state. Modules poll `down(code)` each step; one-shot
// actions use `pressed(code)`, which the main loop clears after every frame.

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.dragging = false;
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); });
    dom.addEventListener('mousedown', (e) => { this.dragging = true; this._lx = e.clientX; this._ly = e.clientY; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - (this._lx ?? e.clientX);
      this.mouseDY += e.clientY - (this._ly ?? e.clientY);
      this._lx = e.clientX; this._ly = e.clientY;
    });
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  pressed(...codes) { return codes.some((c) => this.justPressed.has(c)); }
  // Synthetic key state, used by the screenshot staging to hold the throttle.
  setKey(code, on) { if (on) this.keys.add(code); else this.keys.delete(code); }
  endFrame() { this.justPressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}

// input.js — Centralized Input Handler complying with AGENTS.md
// Controls supported:
// - Directional Movement: Arrow Keys (ArrowUp, ArrowDown, ArrowLeft, ArrowRight) & WASD (KeyW, KeyA, KeyS, KeyD)
// - Primary Action / Start / Pause / Restart: Z / z (KeyZ)
// - Secondary Action (Neon Surge Dash): Space & Mouse Left-Click
// Tracks continuous held state and detects fresh presses without OS key-repeat dependency.
// Clears state on window blur.

class InputManager {
  constructor() {
    this.held = {
      up: false,
      down: false,
      left: false,
      right: false,
      z: false,
      space: false
    };

    // Tracks if action was just triggered this frame (requires release before re-triggering)
    this.justPressedZ = false;
    this.justPressedSpace = false;

    // Internal trackers
    this._keys = {};
    this._mouseHeld = false;

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      // Strictly prevent browser scrolling for movement and action keys
      if (
        e.code === 'Space' ||
        e.key === ' ' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault();
      }

      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code || '';

      const isUp = code === 'ArrowUp' || key === 'arrowup' || code === 'KeyW' || key === 'w';
      const isDown = code === 'ArrowDown' || key === 'arrowdown' || code === 'KeyS' || key === 's';
      const isLeft = code === 'ArrowLeft' || key === 'arrowleft' || code === 'KeyA' || key === 'a';
      const isRight = code === 'ArrowRight' || key === 'arrowright' || code === 'KeyD' || key === 'd';
      const isZ = code === 'KeyZ' || key === 'z';
      const isSpace = code === 'Space' || key === ' ';

      if (isUp) this._keys['up'] = true;
      if (isDown) this._keys['down'] = true;
      if (isLeft) this._keys['left'] = true;
      if (isRight) this._keys['right'] = true;

      if (isZ) {
        if (!this.held.z) {
          this.justPressedZ = true;
        }
        this._keys['z'] = true;
      }

      if (isSpace) {
        if (!this.held.space && !this._mouseHeld) {
          this.justPressedSpace = true;
        }
        this._keys['space'] = true;
      }

      this._syncHeldState();
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code || '';

      const isUp = code === 'ArrowUp' || key === 'arrowup' || code === 'KeyW' || key === 'w';
      const isDown = code === 'ArrowDown' || key === 'arrowdown' || code === 'KeyS' || key === 's';
      const isLeft = code === 'ArrowLeft' || key === 'arrowleft' || code === 'KeyA' || key === 'a';
      const isRight = code === 'ArrowRight' || key === 'arrowright' || code === 'KeyD' || key === 'd';
      const isZ = code === 'KeyZ' || key === 'z';
      const isSpace = code === 'Space' || key === ' ';

      if (isUp) this._keys['up'] = false;
      if (isDown) this._keys['down'] = false;
      if (isLeft) this._keys['left'] = false;
      if (isRight) this._keys['right'] = false;
      if (isZ) this._keys['z'] = false;
      if (isSpace) this._keys['space'] = false;

      this._syncHeldState();
    });

    // Mouse Left-Click dash support
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left-click
        if (!this.held.space && !this._mouseHeld) {
          this.justPressedSpace = true;
        }
        this._mouseHeld = true;
        this.held.space = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this._mouseHeld = false;
        this.held.space = !!this._keys['space'];
      }
    });

    // Reset all held keys if window loses focus
    window.addEventListener('blur', () => {
      this.resetAll();
    });
  }

  _syncHeldState() {
    this.held.up = !!this._keys['up'];
    this.held.down = !!this._keys['down'];
    this.held.left = !!this._keys['left'];
    this.held.right = !!this._keys['right'];
    this.held.z = !!this._keys['z'];
    this.held.space = !!(this._keys['space'] || this._mouseHeld);
  }

  // Consume fresh press for Z
  consumeZ() {
    const wasPressed = this.justPressedZ;
    this.justPressedZ = false;
    return wasPressed;
  }

  // Consume fresh press for Dash (Space or Left-Click)
  consumeSpace() {
    const wasPressed = this.justPressedSpace;
    this.justPressedSpace = false;
    return wasPressed;
  }

  // Call once per frame after logic updates
  update() {
    // Clear one-frame triggers
    this.justPressedZ = false;
    this.justPressedSpace = false;
  }

  resetAll() {
    this._keys = {};
    this._mouseHeld = false;
    this.held.up = false;
    this.held.down = false;
    this.held.left = false;
    this.held.right = false;
    this.held.z = false;
    this.held.space = false;
    this.justPressedZ = false;
    this.justPressedSpace = false;
  }
}

// Global instance
window.input = new InputManager();

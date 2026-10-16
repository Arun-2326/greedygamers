// input.js — Centralized Input Handler complying strictly with AGENTS.md
// ONLY allowed keys: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Z/z, Space.
// Tracks continuous held state and detects fresh presses without OS key-repeat dependency.
// Clears state on window blur. Never binds mouse, click, or touch events.

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

    // Tracks if key was just pressed this frame (requires release before re-triggering)
    this.justPressedZ = false;
    this.justPressedSpace = false;

    // Internal tracker for key state transitions
    this._prevZ = false;
    this._prevSpace = false;

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      // Strictly prevent browser scrolling for arrows and space
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

      const key = e.key;
      const code = e.code;

      if (key === 'ArrowUp' || code === 'ArrowUp') {
        this.held.up = true;
      } else if (key === 'ArrowDown' || code === 'ArrowDown') {
        this.held.down = true;
      } else if (key === 'ArrowLeft' || code === 'ArrowLeft') {
        this.held.left = true;
      } else if (key === 'ArrowRight' || code === 'ArrowRight') {
        this.held.right = true;
      } else if (key === 'z' || key === 'Z' || code === 'KeyZ') {
        if (!this.held.z) {
          this.justPressedZ = true;
        }
        this.held.z = true;
      } else if (key === ' ' || code === 'Space') {
        if (!this.held.space) {
          this.justPressedSpace = true;
        }
        this.held.space = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key;
      const code = e.code;

      if (key === 'ArrowUp' || code === 'ArrowUp') {
        this.held.up = false;
      } else if (key === 'ArrowDown' || code === 'ArrowDown') {
        this.held.down = false;
      } else if (key === 'ArrowLeft' || code === 'ArrowLeft') {
        this.held.left = false;
      } else if (key === 'ArrowRight' || code === 'ArrowRight') {
        this.held.right = false;
      } else if (key === 'z' || key === 'Z' || code === 'KeyZ') {
        this.held.z = false;
      } else if (key === ' ' || code === 'Space') {
        this.held.space = false;
      }
    });

    // Reset all held keys if window loses focus
    window.addEventListener('blur', () => {
      this.resetAll();
    });
  }

  // Consume fresh press for Z
  consumeZ() {
    const wasPressed = this.justPressedZ;
    this.justPressedZ = false;
    return wasPressed;
  }

  // Consume fresh press for Space
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

// input.js — Centralized Input Handler complying strictly with AGENTS.md
// ONLY allowed keys: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Z/z, Space.
// Tracks continuous held state and detects fresh presses without OS key-repeat dependency.
// Clears state on window blur. Never binds mouse, click, or touch events.

class InputManager {
  constructor() {
    this.keyboardHeld = {
      up: false,
      down: false,
      left: false,
      right: false,
      z: false,
      space: false
    };

    this.webcamHeld = {
      up: false,
      down: false,
      left: false,
      right: false,
      z: false,
      space: false
    };

    // Unified held proxy allowing keyboard and webcam to seamlessly merge
    const self = this;
    this.held = {
      get up() { return self.keyboardHeld.up || self.webcamHeld.up; },
      set up(v) { self.keyboardHeld.up = v; },
      get down() { return self.keyboardHeld.down || self.webcamHeld.down; },
      set down(v) { self.keyboardHeld.down = v; },
      get left() { return self.keyboardHeld.left || self.webcamHeld.left; },
      set left(v) { self.keyboardHeld.left = v; },
      get right() { return self.keyboardHeld.right || self.webcamHeld.right; },
      set right(v) { self.keyboardHeld.right = v; },
      get z() { return self.keyboardHeld.z || self.webcamHeld.z; },
      set z(v) { self.keyboardHeld.z = v; },
      get space() { return self.keyboardHeld.space || self.webcamHeld.space; },
      set space(v) { self.keyboardHeld.space = v; }
    };

    // Tracks if key was just pressed this frame (requires release before re-triggering)
    this.justPressedZ = false;
    this.justPressedSpace = false;

    // Internal tracker for key state transitions
    this._prevZ = false;
    this._prevSpace = false;

    this._bindEvents();
  }

  // Webcam integration helpers
  setWebcamDirection(up, down, left, right) {
    this.webcamHeld.up = up;
    this.webcamHeld.down = down;
    this.webcamHeld.left = left;
    this.webcamHeld.right = right;
  }

  setWebcamZ(isHeld) {
    if (isHeld && !this.webcamHeld.z) {
      this.justPressedZ = true;
    }
    this.webcamHeld.z = isHeld;
  }

  setWebcamSpace(isHeld) {
    if (isHeld && !this.webcamHeld.space) {
      this.justPressedSpace = true;
    }
    this.webcamHeld.space = isHeld;
  }

  triggerWebcamZ() {
    this.setWebcamZ(true);
  }

  releaseWebcamZ() {
    this.setWebcamZ(false);
  }

  triggerWebcamSpace() {
    this.setWebcamSpace(true);
  }

  releaseWebcamSpace() {
    this.setWebcamSpace(false);
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
    this.keyboardHeld.up = false;
    this.keyboardHeld.down = false;
    this.keyboardHeld.left = false;
    this.keyboardHeld.right = false;
    this.keyboardHeld.z = false;
    this.keyboardHeld.space = false;
    this.webcamHeld.up = false;
    this.webcamHeld.down = false;
    this.webcamHeld.left = false;
    this.webcamHeld.right = false;
    this.webcamHeld.z = false;
    this.webcamHeld.space = false;
    this.justPressedZ = false;
    this.justPressedSpace = false;
  }
}

// Global instance
window.input = new InputManager();

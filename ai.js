// ai.js — Deterministic Adaptive AI for Neon Core: AI Arena
// Samples player position every 0.5s (up to 40 samples).
// Divides arena into an 8x5 grid, calculates visit bias, and nudges drone waypoints (max 64px).

class AdaptiveAI {
  constructor(arenaWidth, arenaHeight, cols = 8, rows = 5) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
    this.cols = cols;
    this.rows = rows;
    this.resize(arenaWidth, arenaHeight, cols, rows);

    this.sampleInterval = 0.5; // seconds
    this.sampleTimer = 0;
    this.maxSamples = 40;
    this.samples = []; // Array of {x, y, col, row}

    this.dominantCol = -1;
    this.dominantRow = -1;
    this.dominantCenter = null;
    this.biasIntensity = 0; // 0 to 1 based on concentration
    this.maxOffset = 64; // Max waypoint displacement in pixels
  }

  resize(arenaWidth, arenaHeight, cols = 8, rows = 5) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = arenaWidth / cols;
    this.cellHeight = arenaHeight / rows;
  }

  reset() {
    this.samples = [];
    this.sampleTimer = 0;
    this.dominantCol = -1;
    this.dominantRow = -1;
    this.dominantCenter = null;
    this.biasIntensity = 0;
  }

  update(dt, playerX, playerY) {
    this.sampleTimer += dt;
    if (this.sampleTimer >= this.sampleInterval) {
      this.sampleTimer -= this.sampleInterval;
      this._recordSample(playerX, playerY);
      this._analyzeHabits();
    }
  }

  _recordSample(x, y) {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellWidth)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellHeight)));

    this.samples.push({ x, y, col, row });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  _analyzeHabits() {
    if (this.samples.length < 4) {
      this.dominantCol = -1;
      this.dominantRow = -1;
      this.dominantCenter = null;
      this.biasIntensity = 0;
      return;
    }

    const counts = {};
    for (const s of this.samples) {
      const key = `${s.col},${s.row}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    let maxKey = null;
    let maxCount = 0;
    for (const key in counts) {
      if (counts[key] > maxCount) {
        maxCount = counts[key];
        maxKey = key;
      }
    }

    if (maxKey) {
      const [c, r] = maxKey.split(',').map(Number);
      this.dominantCol = c;
      this.dominantRow = r;
      this.dominantCenter = {
        x: (c + 0.5) * this.cellWidth,
        y: (r + 0.5) * this.cellHeight
      };
      // Ratio of samples in dominant cell
      this.biasIntensity = Math.min(1.0, maxCount / (this.samples.length * 0.4));
    }
  }

  // Calculates adapted waypoint given a baseline waypoint
  getAdaptedWaypoint(baseX, baseY) {
    if (!this.dominantCenter || this.biasIntensity <= 0.15) {
      return { x: baseX, y: baseY, offsetX: 0, offsetY: 0 };
    }

    const dx = this.dominantCenter.x - baseX;
    const dy = this.dominantCenter.y - baseY;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) {
      return { x: baseX, y: baseY, offsetX: 0, offsetY: 0 };
    }

    // Direction vector toward player's hotspot
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Nudge proportional to bias intensity, clamped strictly to maxOffset (64px)
    const nudge = Math.min(this.maxOffset, dist * 0.35) * this.biasIntensity;

    const adaptedX = baseX + dirX * nudge;
    const adaptedY = baseY + dirY * nudge;

    return {
      x: Math.max(40, Math.min(this.arenaWidth - 40, adaptedX)),
      y: Math.max(40, Math.min(this.arenaHeight - 40, adaptedY)),
      offsetX: dirX * nudge,
      offsetY: dirY * nudge
    };
  }
}

window.AdaptiveAI = AdaptiveAI;

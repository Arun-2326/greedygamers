// ai.js — Deterministic Adaptive AI & Predictive Grid Lockdown System
// Samples player movement, tracks sector transition frequencies, and forecasts next-move squares.
// Executes high-tension "Sector Lockdowns" with 1.25s advance telegraphs (Rule 3 compliant).

class AdaptiveAI {
  constructor(arenaWidth, arenaHeight, cols = 8, rows = 5, topOffset = 54) {
    this.topOffset = topOffset;
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
    this.cols = cols;
    this.rows = rows;
    this.resize(arenaWidth, arenaHeight, cols, rows, topOffset);

    this.sampleInterval = 0.4;
    this.sampleTimer = 0;
    this.maxSamples = 40;
    this.samples = [];

    this.dominantCol = -1;
    this.dominantRow = -1;
    this.dominantCenter = null;
    this.biasIntensity = 0;
    this.maxOffset = 64;

    // AI Prediction & Sector Lockdown State
    this.lockdown = null;
    this.lockdownTimer = 2.5; // Quick warmup before first prediction
    this.transitions = {};    // Markov transition table: 'col,row' -> { 'col,row': count }
    this.lastCellKey = null;
    this.prevPlayerX = arenaWidth / 2;
    this.prevPlayerY = arenaHeight / 2;
  }

  resize(arenaWidth, arenaHeight, cols = 8, rows = 5, topOffset = 54) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
    this.topOffset = topOffset;
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = arenaWidth / cols;
    this.cellHeight = Math.max(10, (arenaHeight - topOffset) / rows);

    if (this.lockdown) {
      this.lockdown.x = this.lockdown.col * this.cellWidth;
      this.lockdown.y = this.topOffset + this.lockdown.row * this.cellHeight;
      this.lockdown.width = this.cellWidth;
      this.lockdown.height = this.cellHeight;
    }
  }

  reset() {
    this.samples = [];
    this.sampleTimer = 0;
    this.dominantCol = -1;
    this.dominantRow = -1;
    this.dominantCenter = null;
    this.biasIntensity = 0;
    this.lockdown = null;
    this.lockdownTimer = 2.5;
    this.transitions = {};
    this.lastCellKey = null;
  }

  update(dt, playerX, playerY, threatLevel = 1, playerAngle = 0) {
    // 1. Position sampling & habit analysis
    this.sampleTimer += dt;
    if (this.sampleTimer >= this.sampleInterval) {
      this.sampleTimer -= this.sampleInterval;
      this._recordSample(playerX, playerY);
      this._analyzeHabits();
    }

    // 2. Velocity calculation
    const vx = (playerX - this.prevPlayerX) / Math.max(0.001, dt);
    const vy = (playerY - this.prevPlayerY) / Math.max(0.001, dt);
    this.prevPlayerX = playerX;
    this.prevPlayerY = playerY;

    // 3. Update active Lockdown
    if (this.lockdown) {
      this.lockdown.timer += dt;

      if (this.lockdown.state === 'TELEGRAPH') {
        if (this.isPlayerInSquare(playerX, playerY, this.lockdown)) {
          this.lockdown.playerWasInsideDuringTelegraph = true;
        }

        if (this.lockdown.timer >= this.lockdown.telegraphDuration) {
          // Snap shut into locked hazard state!
          this.lockdown.state = 'LOCKED';
          this.lockdown.timer = 0;

          if (this.lockdown.playerWasInsideDuringTelegraph && !this.isPlayerInSquare(playerX, playerY, this.lockdown)) {
            this.lockdown.evaded = true;
          }

          if (window.sound) window.sound.playLockdownSlam();
        }
      } else if (this.lockdown.state === 'LOCKED') {
        if (this.lockdown.timer >= this.lockdown.activeDuration) {
          this.lockdown = null;
          this.lockdownTimer = 0;
        }
      }
    } else {
      // 4. Lockdown cycle timer (scales with threat level)
      const cooldowns = [8.5, 7.8, 6.5, 5.5, 4.5, 3.8];
      const targetCooldown = cooldowns[Math.min(5, Math.max(1, threatLevel))] || 6.0;

      this.lockdownTimer += dt;
      if (this.lockdownTimer >= targetCooldown) {
        this.lockdownTimer = 0;
        this._initiatePredictedLockdown(playerX, playerY, vx, vy, playerAngle);
      }
    }
  }

  _recordSample(x, y) {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellWidth)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.topOffset) / this.cellHeight)));
    const cellKey = `${col},${row}`;

    // Train transition matrix
    if (this.lastCellKey && this.lastCellKey !== cellKey) {
      if (!this.transitions[this.lastCellKey]) {
        this.transitions[this.lastCellKey] = {};
      }
      this.transitions[this.lastCellKey][cellKey] = (this.transitions[this.lastCellKey][cellKey] || 0) + 1;
    }
    this.lastCellKey = cellKey;

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
        y: this.topOffset + (r + 0.5) * this.cellHeight
      };
      this.biasIntensity = Math.min(1.0, maxCount / (this.samples.length * 0.4));
    }
  }

  _initiatePredictedLockdown(playerX, playerY, vx, vy, playerAngle) {
    const currentCol = Math.min(this.cols - 1, Math.max(0, Math.floor(playerX / this.cellWidth)));
    const currentRow = Math.min(this.rows - 1, Math.max(0, Math.floor((playerY - this.topOffset) / this.cellHeight)));
    const currentKey = `${currentCol},${currentRow}`;

    let predCol = currentCol;
    let predRow = currentRow;

    const speed = Math.hypot(vx, vy);

    if (speed > 45) {
      // 1. Moving player: project future destination 1.3 seconds ahead
      const futureX = playerX + vx * 1.3;
      const futureY = playerY + vy * 1.3;
      predCol = Math.min(this.cols - 1, Math.max(0, Math.floor(futureX / this.cellWidth)));
      predRow = Math.min(this.rows - 1, Math.max(0, Math.floor((futureY - this.topOffset) / this.cellHeight)));
    } else if (this.transitions[currentKey]) {
      // 2. Slow / stopped player: use trained transition habits from this cell
      let bestNextKey = null;
      let bestCount = 0;
      for (const nextKey in this.transitions[currentKey]) {
        if (this.transitions[currentKey][nextKey] > bestCount) {
          bestCount = this.transitions[currentKey][nextKey];
          bestNextKey = nextKey;
        }
      }
      if (bestNextKey) {
        const [bc, br] = bestNextKey.split(',').map(Number);
        predCol = bc;
        predRow = br;
      }
    } else {
      // 3. Fallback: project forward along ship facing angle
      const forwardX = playerX + Math.cos(playerAngle) * this.cellWidth;
      const forwardY = playerY + Math.sin(playerAngle) * this.cellHeight;
      predCol = Math.min(this.cols - 1, Math.max(0, Math.floor(forwardX / this.cellWidth)));
      predRow = Math.min(this.rows - 1, Math.max(0, Math.floor((forwardY - this.topOffset) / this.cellHeight)));
    }

    const boxX = predCol * this.cellWidth;
    const boxY = this.topOffset + predRow * this.cellHeight;

    this.lockdown = {
      col: predCol,
      row: predRow,
      x: boxX,
      y: boxY,
      width: this.cellWidth,
      height: this.cellHeight,
      state: 'TELEGRAPH', // Rule 3: 1.25s advance notice (>= 1.0s)
      timer: 0,
      telegraphDuration: 1.25,
      activeDuration: 3.2,
      playerWasInsideDuringTelegraph: this.isPlayerInSquare(playerX, playerY, {
        x: boxX,
        y: boxY,
        width: this.cellWidth,
        height: this.cellHeight
      }),
      evaded: false,
      rewardedEvade: false
    };

    if (window.sound) window.sound.playLockdownWarning();
  }

  isPlayerInSquare(px, py, square) {
    if (!square) return false;
    const pad = 12; // Generous hitbox allowance for player
    return (
      px >= square.x + pad &&
      px <= square.x + square.width - pad &&
      py >= square.y + pad &&
      py <= square.y + square.height - pad
    );
  }

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

    const dirX = dx / dist;
    const dirY = dy / dist;
    const nudge = Math.min(this.maxOffset, dist * 0.35) * this.biasIntensity;

    const adaptedX = baseX + dirX * nudge;
    const adaptedY = baseY + dirY * nudge;

    return {
      x: Math.max(40, Math.min(this.arenaWidth - 40, adaptedX)),
      y: Math.max(80, Math.min(this.arenaHeight - 40, adaptedY)),
      offsetX: dirX * nudge,
      offsetY: dirY * nudge
    };
  }
}

window.AdaptiveAI = AdaptiveAI;

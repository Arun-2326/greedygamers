// ai.js — Deterministic Adaptive AI & Multi-Sector Predictive Grid Lockdown System
// Samples player movement, tracks sector transition frequencies, and forecasts next-move squares.
// Scales simultaneous hazard lockdown squares as score and threat levels climb (1 -> 4 squares).
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

    // AI Prediction & Multi-Sector Lockdown State
    this.lockdowns = [];      // Array of active lockdown square objects
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

    for (const ld of this.lockdowns) {
      ld.x = ld.col * this.cellWidth;
      ld.y = this.topOffset + ld.row * this.cellHeight;
      ld.width = this.cellWidth;
      ld.height = this.cellHeight;
    }
  }

  reset() {
    this.samples = [];
    this.sampleTimer = 0;
    this.dominantCol = -1;
    this.dominantRow = -1;
    this.dominantCenter = null;
    this.biasIntensity = 0;
    this.lockdowns = [];
    this.lockdownTimer = 2.5;
    this.transitions = {};
    this.lastCellKey = null;
  }

  update(dt, playerX, playerY, threatLevel = 1, playerAngle = 0, score = 0) {
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

    // 3. Update all active Lockdowns
    let soundSlamTriggered = false;

    for (let i = this.lockdowns.length - 1; i >= 0; i--) {
      const ld = this.lockdowns[i];
      ld.timer += dt;

      if (ld.state === 'TELEGRAPH') {
        if (this.isPlayerInSquare(playerX, playerY, ld)) {
          ld.playerWasInsideDuringTelegraph = true;
        }

        if (ld.timer >= ld.telegraphDuration) {
          // Snap shut into locked hazard state!
          ld.state = 'LOCKED';
          ld.timer = 0;

          if (ld.playerWasInsideDuringTelegraph && !this.isPlayerInSquare(playerX, playerY, ld)) {
            ld.evaded = true;
          }

          if (!soundSlamTriggered && window.sound) {
            window.sound.playLockdownSlam();
            soundSlamTriggered = true;
          }
        }
      } else if (ld.state === 'LOCKED') {
        if (ld.timer >= ld.activeDuration) {
          this.lockdowns.splice(i, 1);
        }
      }
    }

    // 4. Lockdown cycle timer: initiate wave when all current squares have finished
    if (this.lockdowns.length === 0) {
      const cooldowns = [8.0, 7.2, 6.0, 5.0, 4.2, 3.6];
      const targetCooldown = cooldowns[Math.min(5, Math.max(1, threatLevel))] || 5.5;

      this.lockdownTimer += dt;
      if (this.lockdownTimer >= targetCooldown) {
        this.lockdownTimer = 0;

        // Determine number of hazard lockdown squares based on score and threat level
        let squareCount = 1;
        if (score >= 4500 || threatLevel >= 5) {
          squareCount = 4; // 4 simultaneous squares
        } else if (score >= 2800 || threatLevel >= 4) {
          squareCount = 3; // 3 simultaneous squares
        } else if (score >= 1200 || threatLevel >= 2) {
          squareCount = 2; // 2 simultaneous squares
        }

        this._initiatePredictedLockdowns(playerX, playerY, vx, vy, playerAngle, squareCount);
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

  _initiatePredictedLockdowns(playerX, playerY, vx, vy, playerAngle, count = 1) {
    const currentCol = Math.min(this.cols - 1, Math.max(0, Math.floor(playerX / this.cellWidth)));
    const currentRow = Math.min(this.rows - 1, Math.max(0, Math.floor((playerY - this.topOffset) / this.cellHeight)));
    const currentKey = `${currentCol},${currentRow}`;

    const chosenCells = [];
    const usedKeys = new Set();

    const addCell = (c, r) => {
      const clampedC = Math.min(this.cols - 1, Math.max(0, c));
      const clampedR = Math.min(this.rows - 1, Math.max(0, r));
      const key = `${clampedC},${clampedR}`;
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        chosenCells.push({ col: clampedC, row: clampedR });
        return true;
      }
      return false;
    };

    const speed = Math.hypot(vx, vy);

    // 1. Primary Square: Forward velocity forecast or Markov habit transition
    let p1Col = currentCol;
    let p1Row = currentRow;

    if (speed > 45) {
      const futureX = playerX + vx * 1.35;
      const futureY = playerY + vy * 1.35;
      p1Col = Math.min(this.cols - 1, Math.max(0, Math.floor(futureX / this.cellWidth)));
      p1Row = Math.min(this.rows - 1, Math.max(0, Math.floor((futureY - this.topOffset) / this.cellHeight)));
    } else if (this.transitions[currentKey]) {
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
        p1Col = bc;
        p1Row = br;
      }
    } else {
      const forwardX = playerX + Math.cos(playerAngle) * this.cellWidth;
      const forwardY = playerY + Math.sin(playerAngle) * this.cellHeight;
      p1Col = Math.min(this.cols - 1, Math.max(0, Math.floor(forwardX / this.cellWidth)));
      p1Row = Math.min(this.rows - 1, Math.max(0, Math.floor((forwardY - this.topOffset) / this.cellHeight)));
    }
    addCell(p1Col, p1Row);

    // 2. Square 2: Flanking intercept (cuts off perpendicular escape path)
    if (count >= 2) {
      if (Math.abs(vx) >= Math.abs(vy)) {
        const dir = vy >= 0 ? 1 : -1;
        if (!addCell(p1Col, p1Row + dir)) addCell(p1Col, p1Row - dir);
      } else {
        const dir = vx >= 0 ? 1 : -1;
        if (!addCell(p1Col + dir, p1Row)) addCell(p1Col - dir, p1Row);
      }
    }

    // 3. Square 3: Habit Denier (locks down player's favorite camping hotspot)
    if (count >= 3) {
      if (this.dominantCol >= 0) {
        addCell(this.dominantCol, this.dominantRow);
      } else {
        if (!addCell(p1Col + 1, p1Row)) addCell(p1Col - 1, p1Row);
      }
    }

    // 4. Square 4: Sector Perimeter Intercept
    if (count >= 4) {
      const centerCol = Math.floor(this.cols / 2);
      const centerRow = Math.floor(this.rows / 2);
      if (!addCell(centerCol, centerRow)) {
        if (!addCell(currentCol + 2, currentRow)) addCell(currentCol - 2, currentRow);
      }
    }

    // Construct the active lockdown objects
    for (const cell of chosenCells) {
      const boxX = cell.col * this.cellWidth;
      const boxY = this.topOffset + cell.row * this.cellHeight;

      this.lockdowns.push({
        col: cell.col,
        row: cell.row,
        x: boxX,
        y: boxY,
        width: this.cellWidth,
        height: this.cellHeight,
        state: 'TELEGRAPH', // Rule 3: 1.25s advance notice (>= 1.0s)
        timer: 0,
        telegraphDuration: 1.25,
        activeDuration: 3.0,
        playerWasInsideDuringTelegraph: this.isPlayerInSquare(playerX, playerY, {
          x: boxX,
          y: boxY,
          width: this.cellWidth,
          height: this.cellHeight
        }),
        evaded: false,
        rewardedEvade: false
      });
    }

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

// game.js — Neon Core: AI Arena
// Adheres strictly to AGENTS.md rules. Dynamic full-screen resolution.

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Dynamic Full Screen Setup
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.state = 'TITLE'; // 'TITLE', 'PLAYING', 'GAMEOVER'
    this.ai = new AdaptiveAI(this.width, this.height, 8, 5);

    // High Score Persistence
    this.highScore = parseInt(localStorage.getItem('neon_core_high_score') || '0', 10);
    this.isNewRecord = false;

    // Timing
    this.lastTime = performance.now();
    this.gameOverTimer = 0; // Rule 2: ignore Z for the first 1s of game-over
    this.gameWon = false;

    // Juice & Effects
    this.particles = [];
    this.floatingTexts = [];
    this.playerTrail = [];
    this.shockwaves = [];
    this.screenShake = 0;

    // Game stats
    this.score = 0;
    this.coresCollected = 0;
    this.repairProgress = 0; // 0 to 4
    this.survivalTimer = 150.0; // 2 minutes 30 seconds

    // Combo System (Addictive flow mechanic)
    this.combo = 1;
    this.comboTimer = 0;
    this.comboMaxTime = 3.8;

    // EMP Overdrive state
    this.empTimer = 0;

    // Player state
    this.player = {
      x: this.width / 2,
      y: this.height / 2,
      radius: 18,
      speed: 250,
      integrity: 5,
      maxIntegrity: 5,
      invulnTimer: 0,
      invulnDuration: 2.4, // Rule 3: forgiving 2.4s protection
      vx: 0,
      vy: 0,
      // Space Dash (AGENTS.md compliant: >=2s cooldown, safe secondary action)
      dashCooldown: 0,
      dashMaxCooldown: 2.2,
      dashActiveTimer: 0
    };

    // Cores
    this.cores = [];
    this.coreSpawnTimer = 0;
    this.maxCores = 5;
    this.coreSpawnCounter = 0;

    // Drones
    this.drones = [];

    this._initDrones();

    // Listen for resize to maintain true full-screen experience
    window.addEventListener('resize', () => this.resize());

    // Start game loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.ai.resize(this.width, this.height, 8, 5);

    // Keep player within new bounds
    const pad = 32;
    this.player.x = Math.max(pad, Math.min(this.width - pad, this.player.x));
    this.player.y = Math.max(pad + 54, Math.min(this.height - pad, this.player.y));

    // Update drone routes to match new screen dimensions
    this._updateDroneRoutes();
  }

  _initDrones() {
    this.drones = [
      this._createDrone(this._getRoute1(), 115, 0),
      this._createDrone(this._getRoute2(), 115, 2)
    ];
  }

  _getRoute1() {
    return [
      { x: this.width * 0.15, y: this.height * 0.22 },
      { x: this.width * 0.85, y: this.height * 0.22 },
      { x: this.width * 0.85, y: this.height * 0.52 },
      { x: this.width * 0.15, y: this.height * 0.52 }
    ];
  }

  _getRoute2() {
    return [
      { x: this.width * 0.85, y: this.height * 0.80 },
      { x: this.width * 0.15, y: this.height * 0.80 },
      { x: this.width * 0.28, y: this.height * 0.48 },
      { x: this.width * 0.72, y: this.height * 0.48 }
    ];
  }

  _updateDroneRoutes() {
    if (this.drones.length >= 2) {
      this.drones[0].baseRoute = this._getRoute1();
      this.drones[1].baseRoute = this._getRoute2();
    }
  }

  _createDrone(baseRoute, speed, startIdx) {
    return {
      baseRoute: baseRoute,
      currentWaypointIdx: startIdx,
      x: baseRoute[startIdx].x,
      y: baseRoute[startIdx].y,
      speed: speed,
      radius: 20,
      state: 'MOVING', // 'WARNING' or 'MOVING'
      warningTimer: 0,
      warningDuration: 1.35, // Rule 3: at least 1s warning before route segment
      nextTarget: { x: baseRoute[(startIdx + 1) % baseRoute.length].x, y: baseRoute[(startIdx + 1) % baseRoute.length].y },
      baseTarget: { x: baseRoute[(startIdx + 1) % baseRoute.length].x, y: baseRoute[(startIdx + 1) % baseRoute.length].y }
    };
  }

  startNewGame() {
    this.state = 'PLAYING';
    this.score = 0;
    this.coresCollected = 0;
    this.repairProgress = 0;
    this.survivalTimer = 150.0;
    this.gameOverTimer = 0;
    this.gameWon = false;
    this.isNewRecord = false;
    this.combo = 1;
    this.comboTimer = 0;
    this.empTimer = 0;
    this.screenShake = 0;

    this.player.x = this.width / 2;
    this.player.y = this.height / 2;
    this.player.integrity = 5;
    this.player.invulnTimer = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.dashCooldown = 0;
    this.player.dashActiveTimer = 0;

    this.cores = [];
    this.coreSpawnTimer = 0;
    this.coreSpawnCounter = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.playerTrail = [];
    this.shockwaves = [];

    this.ai.reset();
    this._initDrones();

    // Spawn initial cores
    for (let i = 0; i < 4; i++) {
      this._spawnCore();
    }
  }

  _spawnCore() {
    this.coreSpawnCounter++;
    const margin = 90;
    const x = margin + Math.random() * (this.width - margin * 2);
    const y = margin + 40 + Math.random() * (this.height - margin * 2 - 20);

    const isOverdrive = this.coreSpawnCounter % 5 === 0;

    this.cores.push({
      x,
      y,
      radius: isOverdrive ? 16 : 13,
      isOverdrive: isOverdrive,
      pulse: Math.random() * Math.PI * 2
    });
  }

  loop(currentTime) {
    const dt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    // Reset single-frame inputs
    window.input.update();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // Globally decay screen shake every frame so it never hangs
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    // TITLE SCREEN
    if (this.state === 'TITLE') {
      this.screenShake = 0;
      if (window.input.consumeZ()) {
        this.startNewGame();
      }
      return;
    }

    // GAME OVER SCREEN
    if (this.state === 'GAMEOVER') {
      // Crucial fix: Screen shake is strictly disabled on Game Over
      this.screenShake = 0;
      this.gameOverTimer += dt;

      // Rule 2: Ignore Z for the first 1 second of game-over screen.
      // Require fresh press of Z.
      if (this.gameOverTimer >= 1.0) {
        if (window.input.consumeZ()) {
          this.startNewGame();
        }
      } else {
        // Discard any Z press during the 1-second deadzone
        window.input.consumeZ();
      }
      return;
    }

    // PLAYING STATE
    if (this.state === 'PLAYING') {
      // Countdown survival timer
      this.survivalTimer -= dt;
      if (this.survivalTimer <= 0) {
        this.survivalTimer = 0;
        this.gameWon = true;
        this.state = 'GAMEOVER';
        this.screenShake = 0;
        this.gameOverTimer = 0;
        this._checkHighScore();
        return;
      }

      // EMP Overdrive timer
      if (this.empTimer > 0) {
        this.empTimer -= dt;
      }

      // Combo timer decay
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.combo = 1;
        }
      }

      // Dash cooldown & active state
      if (this.player.dashCooldown > 0) {
        this.player.dashCooldown -= dt;
      }
      if (this.player.dashActiveTimer > 0) {
        this.player.dashActiveTimer -= dt;
      }

      // Safe consumption of Z during gameplay (never harmful)
      window.input.consumeZ();

      // Space Action: Neon Surge Dash (Rule 1 & 2 compliant)
      if (window.input.consumeSpace()) {
        if (this.player.dashCooldown <= 0) {
          this._triggerDash();
        }
      }

      // Continuous player movement from held arrow keys (Rule 2)
      let dx = 0;
      let dy = 0;
      if (window.input.held.left) dx -= 1;
      if (window.input.held.right) dx += 1;
      if (window.input.held.up) dy -= 1;
      if (window.input.held.down) dy += 1;

      // Handle diagonals smoothly
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      // Speed calculation (with dash boost if active)
      let currentSpeed = this.player.speed;
      if (this.player.dashActiveTimer > 0) {
        currentSpeed = this.player.speed * 2.3;
      }

      this.player.x += dx * currentSpeed * dt + this.player.vx * dt;
      this.player.y += dy * currentSpeed * dt + this.player.vy * dt;

      // Player neon trail generation
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0 || this.player.dashActiveTimer > 0) {
        this.playerTrail.push({
          x: this.player.x,
          y: this.player.y,
          radius: this.player.radius,
          alpha: this.player.dashActiveTimer > 0 ? 0.75 : 0.4,
          color: this.player.dashActiveTimer > 0 ? '#ffea00' : '#00f0ff'
        });
      }

      // Knockback decay
      this.player.vx *= Math.pow(0.05, dt);
      this.player.vy *= Math.pow(0.05, dt);

      // Arena bounds clamping with generous borders
      const pad = 30;
      this.player.x = Math.max(pad, Math.min(this.width - pad, this.player.x));
      this.player.y = Math.max(pad + 54, Math.min(this.height - pad, this.player.y));

      // Invulnerability timer decay
      if (this.player.invulnTimer > 0) {
        this.player.invulnTimer -= dt;
      }

      // AI updates (samples player every 0.5s)
      this.ai.update(dt, this.player.x, this.player.y);

      // Core Spawning
      this.coreSpawnTimer += dt;
      if (this.coreSpawnTimer >= 1.7 && this.cores.length < this.maxCores) {
        this.coreSpawnTimer = 0;
        this._spawnCore();
      }

      // Core Collection & Recovery mechanics
      for (let i = this.cores.length - 1; i >= 0; i--) {
        const c = this.cores[i];
        c.pulse += dt * 4;
        const dist = Math.hypot(this.player.x - c.x, this.player.y - c.y);

        // Generous pickup hitbox (Rule 3)
        if (dist < this.player.radius + c.radius + 14) {
          this._collectCore(c, i);
        }
      }

      // Security Drones update
      for (const drone of this.drones) {
        this._updateDrone(drone, dt);

        // Drone collision check
        if (this.player.invulnTimer <= 0 && this.player.dashActiveTimer <= 0) {
          const dist = Math.hypot(this.player.x - drone.x, this.player.y - drone.y);
          if (dist < this.player.radius + drone.radius) {
            this.player.integrity--;
            this.player.invulnTimer = this.player.invulnDuration;
            this.screenShake = 10; // Screen impact during gameplay
            this.combo = 1; // Reset combo on damage

            if (window.sound) window.sound.playHit();

            // Gentle knockback away from drone
            const angle = Math.atan2(this.player.y - drone.y, this.player.x - drone.x);
            this.player.vx = Math.cos(angle) * 260;
            this.player.vy = Math.sin(angle) * 260;

            this._createDamageEffect(this.player.x, this.player.y);
            this._addFloatingText('-1 INTEGRITY', this.player.x, this.player.y - 20, '#ff1744');

            if (this.player.integrity <= 0) {
              this.state = 'GAMEOVER';
              this.gameWon = false;
              this.screenShake = 0; // Fix: Stop shaking immediately upon Game Over!
              this.gameOverTimer = 0;
              this._checkHighScore();
              return;
            }
          }
        }
      }

      // Update Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // Update Trails
      for (let i = this.playerTrail.length - 1; i >= 0; i--) {
        const tr = this.playerTrail[i];
        tr.alpha -= dt * 2.8;
        if (tr.alpha <= 0) {
          this.playerTrail.splice(i, 1);
        }
      }

      // Update Shockwaves
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.radius += dt * sw.speed;
        sw.alpha -= dt * 2.2;
        if (sw.alpha <= 0) {
          this.shockwaves.splice(i, 1);
        }
      }

      // Update Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y -= dt * 38;
        ft.life -= dt;
        if (ft.life <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }
    }
  }

  _triggerDash() {
    this.player.dashCooldown = this.player.dashMaxCooldown;
    this.player.dashActiveTimer = 0.22; // 220ms burst

    if (window.sound) window.sound.playDash();

    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 18,
      speed: 240,
      alpha: 1.0,
      color: '#00f0ff'
    });

    this._addFloatingText('SURGE!', this.player.x, this.player.y - 25, '#00f0ff');
  }

  _collectCore(c, index) {
    let earnedPoints = 100 * this.combo;

    if (c.isOverdrive) {
      earnedPoints = 400 * this.combo;
      this.empTimer = 3.5; // EMP slows drones for 3.5s
      this.screenShake = 6;
      if (window.sound) window.sound.playOverdrivePickup();

      this.shockwaves.push({
        x: c.x,
        y: c.y,
        radius: 15,
        speed: 280,
        alpha: 1.0,
        color: '#ff00ff'
      });

      this._addFloatingText(`OVERDRIVE! +${earnedPoints}`, c.x, c.y - 24, '#ff00ff');
    } else {
      if (window.sound) window.sound.playCorePickup(this.combo);
      this._addFloatingText(this.combo > 1 ? `+${earnedPoints} (x${this.combo})` : `+${earnedPoints}`, c.x, c.y - 18, '#ffea00');
    }

    this.score += earnedPoints;
    this.coresCollected++;
    this.repairProgress++;

    // Refresh combo
    this.combo = Math.min(5, this.combo + 1);
    this.comboTimer = this.comboMaxTime;

    // Check repair threshold: Every 4 cores restores 1 integrity segment (max 5)
    if (this.repairProgress >= 4) {
      this.repairProgress = 0;
      if (this.player.integrity < this.player.maxIntegrity) {
        this.player.integrity++;
        if (window.sound) window.sound.playRepair();
        this._createRepairEffect(this.player.x, this.player.y);
        this._addFloatingText('+1 INTEGRITY RESTORED!', this.player.x, this.player.y - 35, '#00ffcc');
      }
    }

    this._createCollectEffect(c.x, c.y, c.isOverdrive ? '#ff00ff' : '#ffea00');
    this.cores.splice(index, 1);
  }

  _checkHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewRecord = true;
      localStorage.setItem('neon_core_high_score', this.highScore.toString());
    }
  }

  _addFloatingText(text, x, y, color) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 0.85
    });
  }

  _updateDrone(drone, dt) {
    const speedMult = this.empTimer > 0 ? 0.6 : 1.0;

    if (drone.state === 'WARNING') {
      drone.warningTimer += dt;
      if (drone.warningTimer >= drone.warningDuration) {
        drone.state = 'MOVING';
      }
      return;
    }

    if (drone.state === 'MOVING') {
      const dx = drone.nextTarget.x - drone.x;
      const dy = drone.nextTarget.y - drone.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 5) {
        // Reached destination! Prepare next route segment
        drone.currentWaypointIdx = (drone.currentWaypointIdx + 1) % drone.baseRoute.length;
        const nextIdx = (drone.currentWaypointIdx + 1) % drone.baseRoute.length;
        const baseTarget = drone.baseRoute[nextIdx];

        // Apply Adaptive AI nudge (max 64px displacement toward dominant cell)
        const adapted = this.ai.getAdaptedWaypoint(baseTarget.x, baseTarget.y);
        drone.baseTarget = baseTarget;
        drone.nextTarget = adapted;

        // Enter Warning State with magenta route indicator for 1.35s (>= 1.0s reaction time)
        drone.state = 'WARNING';
        drone.warningTimer = 0;
        if (window.sound) window.sound.playTelegraph();
      } else {
        const moveDist = drone.speed * speedMult * dt;
        drone.x += (dx / dist) * moveDist;
        drone.y += (dy / dist) * moveDist;
      }
    }
  }

  _createCollectEffect(x, y, color = '#ffea00') {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const spd = 60 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: color,
        radius: 3.5,
        life: 0.5
      });
    }
  }

  _createRepairEffect(x, y) {
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24;
      const spd = 90 + Math.random() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: '#00ffcc',
        radius: 4.5,
        life: 0.7
      });
    }
  }

  _createDamageEffect(x, y) {
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 130;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: '#ff1744',
        radius: 4.5,
        life: 0.6
      });
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    // Only apply screen shake during active gameplay (never in Game Over / Title)
    if (this.state === 'PLAYING' && this.screenShake > 0.05) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Dark sci-fi arena background
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, this.width, this.height);

    // Neon grid floor
    this._renderGrid(ctx);

    if (this.state === 'TITLE') {
      this._renderTitleScreen(ctx);
    } else if (this.state === 'PLAYING') {
      this._renderGameplay(ctx);
      this._renderHUD(ctx);
    } else if (this.state === 'GAMEOVER') {
      this._renderGameplay(ctx);
      this._renderGameOverScreen(ctx);
    }

    ctx.restore();
  }

  _renderGrid(ctx) {
    const cols = 8;
    const rows = 5;
    const cw = this.width / cols;
    const ch = (this.height - 54) / rows;

    // AI Dominant Region Highlight (Floor Heatmap)
    if (this.ai.dominantCol >= 0 && this.ai.biasIntensity > 0.15) {
      const hx = this.ai.dominantCol * cw;
      const hy = 54 + this.ai.dominantRow * ch;
      ctx.fillStyle = `rgba(255, 0, 128, ${0.14 * this.ai.biasIntensity})`;
      ctx.fillRect(hx, hy, cw, ch);

      ctx.strokeStyle = `rgba(255, 0, 128, ${0.55 * this.ai.biasIntensity})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 4, hy + 4, cw - 8, ch - 8);

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = 'rgba(255, 64, 180, 0.9)';
      ctx.fillText('AI PATROL BIAS ZONE', hx + 10, hy + 10);
      ctx.restore();
    }

    // Grid lines
    ctx.strokeStyle = '#0e1c36';
    ctx.lineWidth = 1;

    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cw, 54);
      ctx.lineTo(c * cw, this.height);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, 54 + r * ch);
      ctx.lineTo(this.width, 54 + r * ch);
      ctx.stroke();
    }

    // Outer arena border glow
    ctx.strokeStyle = this.empTimer > 0 ? '#ff00ff' : '#00f0ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 56, this.width - 20, this.height - 66);
  }

  _renderGameplay(ctx) {
    // Render AI Waypoint Markers on floor
    for (const drone of this.drones) {
      ctx.beginPath();
      ctx.arc(drone.baseTarget.x, drone.baseTarget.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.fill();

      // Adapted waypoint (magenta marker if displaced)
      if (Math.hypot(drone.nextTarget.x - drone.baseTarget.x, drone.nextTarget.y - drone.baseTarget.y) > 2) {
        ctx.beginPath();
        ctx.arc(drone.nextTarget.x, drone.nextTarget.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 128, 0.65)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 0, 128, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(drone.baseTarget.x, drone.baseTarget.y);
        ctx.lineTo(drone.nextTarget.x, drone.nextTarget.y);
        ctx.stroke();
      }

      // Patrol Route Segment Warning (Rule 3: clear telegraph >= 1s reaction)
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = drone.state === 'WARNING' ? '#ff007f' : 'rgba(255, 0, 128, 0.25)';
      ctx.lineWidth = drone.state === 'WARNING' ? 3.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(drone.nextTarget.x, drone.nextTarget.y);
      ctx.stroke();
      ctx.restore();
    }

    // Render Shockwaves
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Render Player Ghost Trails
    for (const tr of this.playerTrail) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, tr.alpha);
      ctx.fillStyle = tr.color;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.radius * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Render Energy Cores
    for (const c of this.cores) {
      const glow = Math.sin(c.pulse) * 4;
      ctx.save();

      if (c.isOverdrive) {
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 18 + glow;
        ctx.fillStyle = '#ff00ff';

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.pulse * 0.7);
        ctx.fillRect(-c.radius, -c.radius, c.radius * 2, c.radius * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-c.radius * 0.45, -c.radius * 0.45, c.radius * 0.9, c.radius * 0.9);
        ctx.restore();
      } else {
        ctx.shadowColor = '#ffeb3b';
        ctx.shadowBlur = 14 + glow;

        ctx.fillStyle = '#ffea00';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Render Security Drones
    for (const drone of this.drones) {
      ctx.save();
      ctx.shadowColor = this.empTimer > 0 ? '#ff00ff' : '#ff1744';
      ctx.shadowBlur = 20;

      ctx.fillStyle = this.empTimer > 0 ? '#b300b3' : '#ff1744';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, drone.radius, 0, Math.PI * 2);
      ctx.fill();

      // Drone inner eye
      ctx.fillStyle = drone.state === 'WARNING' ? '#ffffff' : '#300008';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, drone.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Warning pulse ring around drone
      if (drone.state === 'WARNING') {
        const ringRadius = drone.radius + (drone.warningTimer / drone.warningDuration) * 16;
        ctx.strokeStyle = 'rgba(255, 0, 128, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render Player
    ctx.save();
    const isInvuln = this.player.invulnTimer > 0;
    if (!isInvuln || Math.floor(performance.now() / 90) % 2 === 0) {
      if (this.combo >= 5) {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 26;
        ctx.fillStyle = '#ffd700';
      } else if (this.player.dashActiveTimer > 0) {
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#00f0ff';
      }

      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Space Dash Ready Indicator around player
    if (this.player.dashCooldown <= 0) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Render Floating Texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  _renderHUD(ctx) {
    ctx.save();

    // Top HUD Bar background (Full width)
    ctx.fillStyle = 'rgba(6, 10, 20, 0.96)';
    ctx.fillRect(0, 0, this.width, 54);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 54);
    ctx.lineTo(this.width, 54);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 1. INTEGRITY SECTION
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#8bf0ff';
    ctx.fillText('INTEGRITY:', 24, 27);

    for (let i = 0; i < this.player.maxIntegrity; i++) {
      if (i < this.player.integrity) {
        ctx.fillStyle = this.player.integrity > 2 ? '#00ffcc' : this.player.integrity === 2 ? '#ffb300' : '#ff1744';
      } else {
        ctx.fillStyle = '#1c2838';
      }
      const bx = 120 + i * 24;
      ctx.fillRect(bx, 17, 20, 20);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, 17, 20, 20);
    }

    // 2. REPAIR COUNTER WITH PROGRESS PIPS
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = '#ffea00';
    ctx.fillText(`REPAIR:`, 255, 27);

    for (let p = 0; p < 4; p++) {
      ctx.fillStyle = p < this.repairProgress ? '#ffea00' : '#232f3e';
      ctx.fillRect(320 + p * 14, 19, 10, 16);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(320 + p * 14, 19, 10, 16);
    }

    // 3. SURGE DASH STATUS (SPACE KEY)
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    if (this.player.dashCooldown <= 0) {
      ctx.fillStyle = '#00ffcc';
      ctx.fillText('SPACE: READY', 395, 27);
    } else {
      ctx.fillStyle = '#64748b';
      const pct = Math.ceil(this.player.dashCooldown);
      ctx.fillText(`SPACE: ${pct}s`, 395, 27);
    }

    // 4. SURVIVAL TIME COUNTDOWN
    const mins = Math.floor(this.survivalTimer / 60);
    const secs = Math.floor(this.survivalTimer % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = this.survivalTimer < 30 ? '#ff1744' : '#00f0ff';
    ctx.fillText(`TIME: ${timeStr}`, 520, 27);

    // 5. COMBO MULTIPLIER
    if (this.combo > 1) {
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 8;
      ctx.fillText(`x${this.combo} COMBO`, 680, 27);
      ctx.shadowBlur = 0;

      const barW = 75 * (this.comboTimer / this.comboMaxTime);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(680, 41, barW, 4);
    }

    // 6. SCORE & HIGH SCORE (Right-aligned proportionally)
    ctx.textAlign = 'right';
    ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE: ${this.score}`, this.width - 160, 27);

    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`BEST: ${Math.max(this.score, this.highScore)}`, this.width - 30, 27);

    ctx.restore();
  }

  _renderTitleScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.90)';
    ctx.fillRect(0, 0, this.width, this.height);

    const centerY = this.height / 2;

    // Title
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 54px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEON CORE: AI ARENA', this.width / 2, centerY - 160);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8bf0ff';
    ctx.font = '22px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Futuristic 2D Adaptive Arcade Survival', this.width / 2, centerY - 115);

    // Best Score Display
    if (this.highScore > 0) {
      ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`CURRENT HIGH SCORE: ${this.highScore}`, this.width / 2, centerY - 80);
    }

    // Instructions box
    ctx.fillStyle = '#0c1626';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    const boxW = Math.min(740, this.width - 60);
    const boxH = 225;
    const boxX = (this.width - boxW) / 2;
    const boxY = centerY - 50;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.textAlign = 'left';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CONTROLS (ONLY 6 KEYS ALLOWED):', boxX + 30, boxY + 40);

    ctx.font = '19px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#00ffcc';
    ctx.fillText('• Arrow Keys :', boxX + 30, boxY + 82);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Move Up, Down, Left, Right (Hold for continuous move)', boxX + 180, boxY + 82);

    ctx.fillStyle = '#00ffcc';
    ctx.fillText('• Z Key :', boxX + 30, boxY + 122);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Confirm / Start Game / Restart', boxX + 180, boxY + 122);

    ctx.fillStyle = '#00ffcc';
    ctx.fillText('• Space :', boxX + 30, boxY + 162);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Neon Surge Dash (2.2s cooldown, secondary dodge)', boxX + 180, boxY + 162);

    // Blinking "Press Z to start" (Rule 4 requirement)
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 18;
      ctx.fillText('Press Z to start', this.width / 2, centerY + 230);
    }
    ctx.restore();
  }

  _renderGameOverScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.94)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    const centerY = this.height / 2;

    if (this.gameWon) {
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 50px "Segoe UI", Arial, sans-serif';
      ctx.fillText('SURVIVAL COMPLETE!', this.width / 2, centerY - 140);
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('You outsmarted the adaptive AI arena!', this.width / 2, centerY - 95);
    } else {
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ff1744';
      ctx.font = 'bold 50px "Segoe UI", Arial, sans-serif';
      ctx.fillText('SYSTEM PURGED', this.width / 2, centerY - 140);
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Integrity collapsed under drone patrol.', this.width / 2, centerY - 95);
    }
    ctx.restore();

    // Stats Box
    const sBoxW = Math.min(520, this.width - 60);
    const sBoxH = 180;
    const sBoxX = (this.width - sBoxW) / 2;
    const sBoxY = centerY - 60;

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.gameWon ? '#00ffcc' : '#ff1744';
    ctx.lineWidth = 2;
    ctx.fillRect(sBoxX, sBoxY, sBoxW, sBoxH);
    ctx.strokeRect(sBoxX, sBoxY, sBoxW, sBoxH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`FINAL SCORE: ${this.score}`, this.width / 2, sBoxY + 45);

    if (this.isNewRecord) {
      ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('★ NEW HIGH SCORE RECORD! ★', this.width / 2, sBoxY + 80);
    } else {
      ctx.font = '19px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`ALL-TIME BEST: ${this.highScore}`, this.width / 2, sBoxY + 80);
    }

    const timeSurvived = Math.floor(150.0 - this.survivalTimer);
    const m = Math.floor(timeSurvived / 60);
    const s = timeSurvived % 60;
    ctx.font = '20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`Time Survived: ${m}m ${s}s  |  Cores: ${this.coresCollected}`, this.width / 2, sBoxY + 120);

    ctx.fillStyle = '#ffeb3b';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText(`Adaptive AI Samples Recorded: ${this.ai.samples.length}`, this.width / 2, sBoxY + 155);

    // Rule 2 & 4: Game Over shows score and "Press Z to play again"
    // Ignore Z for the first 1.0 second
    if (this.gameOverTimer < 1.0) {
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#78909c';
      ctx.fillText('ANALYZING COMBAT DATA...', this.width / 2, centerY + 180);
    } else {
      if (Math.floor(performance.now() / 450) % 2 === 0) {
        ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 18;
        ctx.fillText('Press Z to play again', this.width / 2, centerY + 185);
      }
    }
    ctx.restore();
  }
}

// Instantiate game when window loads
window.addEventListener('load', () => {
  window.game = new Game();
});

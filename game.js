// game.js — Neon Core: AI Arena
// Adheres strictly to AGENTS.md rules.

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 600;

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    this.state = 'TITLE'; // 'TITLE', 'PLAYING', 'GAMEOVER'
    this.ai = new AdaptiveAI(CANVAS_WIDTH, CANVAS_HEIGHT, 8, 5);

    // Timing
    this.lastTime = performance.now();
    this.gameOverTimer = 0; // Enforces Rule 2: ignore Z for the first 1s of game-over
    this.gameWon = false;

    // Particles
    this.particles = [];

    // Game stats
    this.score = 0;
    this.coresCollected = 0;
    this.repairProgress = 0; // 0 to 4
    this.survivalTimer = 150.0; // 2 minutes 30 seconds

    // Player state
    this.player = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      radius: 16,
      speed: 230,
      integrity: 5,
      maxIntegrity: 5,
      invulnTimer: 0,
      invulnDuration: 2.4, // Rule 3: forgiving 2.4s protection
      vx: 0,
      vy: 0
    };

    // Cores
    this.cores = [];
    this.coreSpawnTimer = 0;
    this.maxCores = 4;

    // Drones
    this.drones = [];

    this._initDrones();

    // Start game loop
    requestAnimationFrame((t) => this.loop(t));
  }

  _initDrones() {
    // Drone 1: Upper perimeter circuit
    const route1 = [
      { x: 140, y: 130 },
      { x: 820, y: 130 },
      { x: 820, y: 320 },
      { x: 140, y: 320 }
    ];

    // Drone 2: Lower perimeter & cross circuit
    const route2 = [
      { x: 820, y: 470 },
      { x: 140, y: 470 },
      { x: 260, y: 260 },
      { x: 700, y: 260 }
    ];

    this.drones = [
      this._createDrone(route1, 105, 0),
      this._createDrone(route2, 105, 2)
    ];
  }

  _createDrone(baseRoute, speed, startIdx) {
    return {
      baseRoute: baseRoute,
      currentWaypointIdx: startIdx,
      x: baseRoute[startIdx].x,
      y: baseRoute[startIdx].y,
      speed: speed,
      radius: 18,
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

    this.player.x = CANVAS_WIDTH / 2;
    this.player.y = CANVAS_HEIGHT / 2;
    this.player.integrity = 5;
    this.player.invulnTimer = 0;
    this.player.vx = 0;
    this.player.vy = 0;

    this.cores = [];
    this.coreSpawnTimer = 0;
    this.particles = [];

    this.ai.reset();
    this._initDrones();

    // Spawn initial cores
    for (let i = 0; i < 3; i++) {
      this._spawnCore();
    }
  }

  _spawnCore() {
    const margin = 70;
    const x = margin + Math.random() * (CANVAS_WIDTH - margin * 2);
    const y = margin + Math.random() * (CANVAS_HEIGHT - margin * 2);

    this.cores.push({
      x,
      y,
      radius: 12,
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
    // TITLE SCREEN
    if (this.state === 'TITLE') {
      if (window.input.consumeZ()) {
        this.startNewGame();
      }
      return;
    }

    // GAME OVER SCREEN
    if (this.state === 'GAMEOVER') {
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
        this.gameOverTimer = 0;
        return;
      }

      // Safe consumption of Z/Space during gameplay (never harmful)
      window.input.consumeZ();
      window.input.consumeSpace();

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

      // Smooth movement without sudden stops
      this.player.x += dx * this.player.speed * dt + this.player.vx * dt;
      this.player.y += dy * this.player.speed * dt + this.player.vy * dt;

      // Knockback decay
      this.player.vx *= Math.pow(0.05, dt);
      this.player.vy *= Math.pow(0.05, dt);

      // Arena bounds clamping with generous borders
      const pad = 28;
      this.player.x = Math.max(pad, Math.min(CANVAS_WIDTH - pad, this.player.x));
      this.player.y = Math.max(pad + 40, Math.min(CANVAS_HEIGHT - pad, this.player.y));

      // Invulnerability timer decay
      if (this.player.invulnTimer > 0) {
        this.player.invulnTimer -= dt;
      }

      // AI updates (samples player every 0.5s)
      this.ai.update(dt, this.player.x, this.player.y);

      // Core Spawning
      this.coreSpawnTimer += dt;
      if (this.coreSpawnTimer >= 2.0 && this.cores.length < this.maxCores) {
        this.coreSpawnTimer = 0;
        this._spawnCore();
      }

      // Core Collection & Recovery mechanics
      for (let i = this.cores.length - 1; i >= 0; i--) {
        const c = this.cores[i];
        c.pulse += dt * 4;
        const dist = Math.hypot(this.player.x - c.x, this.player.y - c.y);

        // Generous pickup hitbox (Rule 3)
        if (dist < this.player.radius + c.radius + 12) {
          this.score += 100;
          this.coresCollected++;
          this.repairProgress++;

          // Every 4 cores restores 1 integrity segment (max 5)
          if (this.repairProgress >= 4) {
            this.repairProgress = 0;
            if (this.player.integrity < this.player.maxIntegrity) {
              this.player.integrity++;
              this._createRepairEffect(this.player.x, this.player.y);
            }
          }

          this._createCollectEffect(c.x, c.y);
          this.cores.splice(i, 1);
        }
      }

      // Security Drones update
      for (const drone of this.drones) {
        this._updateDrone(drone, dt);

        // Drone collision check
        if (this.player.invulnTimer <= 0) {
          const dist = Math.hypot(this.player.x - drone.x, this.player.y - drone.y);
          // Generous hitbox
          if (dist < this.player.radius + drone.radius) {
            this.player.integrity--;
            this.player.invulnTimer = this.player.invulnDuration;

            // Gentle knockback away from drone
            const angle = Math.atan2(this.player.y - drone.y, this.player.x - drone.x);
            this.player.vx = Math.cos(angle) * 260;
            this.player.vy = Math.sin(angle) * 260;

            this._createDamageEffect(this.player.x, this.player.y);

            if (this.player.integrity <= 0) {
              this.state = 'GAMEOVER';
              this.gameWon = false;
              this.gameOverTimer = 0;
              return;
            }
          }
        }
      }

      // Particles update
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }
  }

  _updateDrone(drone, dt) {
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

      if (dist < 4) {
        // Reached destination! Prepare next route segment
        drone.currentWaypointIdx = (drone.currentWaypointIdx + 1) % drone.baseRoute.length;
        const nextIdx = (drone.currentWaypointIdx + 1) % drone.baseRoute.length;
        const baseTarget = drone.baseRoute[nextIdx];

        // Apply Adaptive AI nudge (Rule-based, max 64px displacement toward dominant cell)
        const adapted = this.ai.getAdaptedWaypoint(baseTarget.x, baseTarget.y);
        drone.baseTarget = baseTarget;
        drone.nextTarget = adapted;

        // Enter Warning State with magenta route indicator for 1.35s (>= 1.0s reaction time)
        drone.state = 'WARNING';
        drone.warningTimer = 0;
      } else {
        const moveDist = drone.speed * dt;
        drone.x += (dx / dist) * moveDist;
        drone.y += (dy / dist) * moveDist;
      }
    }
  }

  _createCollectEffect(x, y) {
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14;
      const spd = 60 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: '#ffea00',
        radius: 3.5,
        life: 0.45
      });
    }
  }

  _createRepairEffect(x, y) {
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      const spd = 90 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: '#00ffcc',
        radius: 4,
        life: 0.6
      });
    }
  }

  _createDamageEffect(x, y) {
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: '#ff1744',
        radius: 4.5,
        life: 0.55
      });
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Dark sci-fi arena background
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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
  }

  _renderGrid(ctx) {
    const cols = 8;
    const rows = 5;
    const cw = CANVAS_WIDTH / cols;
    const ch = CANVAS_HEIGHT / rows;

    // AI Dominant Region Highlight (Floor Heatmap)
    if (this.ai.dominantCol >= 0 && this.ai.biasIntensity > 0.15) {
      const hx = this.ai.dominantCol * cw;
      const hy = this.ai.dominantRow * ch;
      ctx.fillStyle = `rgba(255, 0, 128, ${0.12 * this.ai.biasIntensity})`;
      ctx.fillRect(hx, hy, cw, ch);

      ctx.strokeStyle = `rgba(255, 0, 128, ${0.45 * this.ai.biasIntensity})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 4, hy + 4, cw - 8, ch - 8);

      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillStyle = 'rgba(255, 64, 180, 0.7)';
      ctx.fillText('AI PATROL BIAS ZONE', hx + 12, hy + 24);
    }

    // Grid lines
    ctx.strokeStyle = '#0e1c36';
    ctx.lineWidth = 1;

    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cw, 0);
      ctx.lineTo(c * cw, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * ch);
      ctx.lineTo(CANVAS_WIDTH, r * ch);
      ctx.stroke();
    }

    // Outer arena border glow
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 48, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 58);
  }

  _renderGameplay(ctx) {
    // Render AI Waypoint Markers on floor
    for (const drone of this.drones) {
      // Baseline waypoint (cyan marker)
      ctx.beginPath();
      ctx.arc(drone.baseTarget.x, drone.baseTarget.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.fill();

      // Adapted waypoint (magenta marker if displaced)
      if (
        Math.hypot(drone.nextTarget.x - drone.baseTarget.x, drone.nextTarget.y - drone.baseTarget.y) > 2
      ) {
        ctx.beginPath();
        ctx.arc(drone.nextTarget.x, drone.nextTarget.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 128, 0.55)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 0, 128, 0.4)';
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
      ctx.lineWidth = drone.state === 'WARNING' ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(drone.nextTarget.x, drone.nextTarget.y);
      ctx.stroke();
      ctx.restore();
    }

    // Render Energy Cores
    for (const c of this.cores) {
      const glow = Math.sin(c.pulse) * 4;
      ctx.save();
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
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 18;

      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, drone.radius, 0, Math.PI * 2);
      ctx.fill();

      // Drone inner eye
      ctx.fillStyle = drone.state === 'WARNING' ? '#ffffff' : '#4a0000';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, drone.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Warning pulse ring around drone
      if (drone.state === 'WARNING') {
        const ringRadius = drone.radius + (drone.warningTimer / drone.warningDuration) * 14;
        ctx.strokeStyle = 'rgba(255, 0, 128, 0.8)';
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
    // Blinking effect during invulnerability
    if (!isInvuln || Math.floor(performance.now() / 90) % 2 === 0) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 20;

      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
      ctx.fill();

      // Core white center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _renderHUD(ctx) {
    // Top HUD Bar background
    ctx.fillStyle = 'rgba(6, 10, 20, 0.94)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 46);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 46);
    ctx.lineTo(CANVAS_WIDTH, 46);
    ctx.stroke();

    // High contrast, large fonts readable from 2m away (Rule 4)
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';

    // 1. INTEGRITY (5 Segmented Blocks)
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('INTEGRITY:', 24, 30);

    for (let i = 0; i < this.player.maxIntegrity; i++) {
      if (i < this.player.integrity) {
        ctx.fillStyle = this.player.integrity > 2 ? '#00ffcc' : this.player.integrity === 2 ? '#ffb300' : '#ff1744';
      } else {
        ctx.fillStyle = '#222d3d';
      }
      ctx.fillRect(150 + i * 26, 14, 20, 20);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(150 + i * 26, 14, 20, 20);
    }

    // 2. REPAIR COUNTER
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#ffeb3b';
    ctx.fillText(`REPAIR: ${this.repairProgress}/4`, 305, 30);

    // 3. TIME COUNTDOWN
    const mins = Math.floor(this.survivalTimer / 60);
    const secs = Math.floor(this.survivalTimer % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = this.survivalTimer < 30 ? '#ff1744' : '#00f0ff';
    ctx.fillText(`TIME: ${timeStr}`, 520, 31);

    // 4. SCORE
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE: ${this.score}`, 760, 30);
  }

  _renderTitleScreen(ctx) {
    // Large, high-contrast title screen (Rule 4)
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.88)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Title
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 50px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEON CORE: AI ARENA', CANVAS_WIDTH / 2, 130);
    ctx.restore();

    ctx.fillStyle = '#8bf0ff';
    ctx.font = '20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Futuristic 2D Adaptive Arcade Survival', CANVAS_WIDTH / 2, 175);

    // High contrast instructions box
    ctx.fillStyle = '#0c1626';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    const boxW = 680;
    const boxH = 220;
    const boxX = (CANVAS_WIDTH - boxW) / 2;
    const boxY = 210;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.textAlign = 'left';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CONTROLS (ONLY 6 KEYS ALLOWED):', boxX + 30, boxY + 42);

    ctx.font = '19px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#00ffcc';
    ctx.fillText('• Arrow Keys :', boxX + 30, boxY + 84);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Move Up, Down, Left, Right (Hold for continuous move)', boxX + 175, boxY + 84);

    ctx.fillStyle = '#00ffcc';
    ctx.fillText('• Z Key :', boxX + 30, boxY + 124);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Confirm / Start Game / Restart', boxX + 175, boxY + 124);

    ctx.fillStyle = '#00ffcc';
    ctx.fillText('• Space :', boxX + 30, boxY + 164);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Reserved secondary action (Safe to press)', boxX + 175, boxY + 164);

    // Blinking "Press Z to start" (Rule 4 requirement)
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 18;
      ctx.fillText('Press Z to start', CANVAS_WIDTH / 2, 495);
      ctx.restore();
    }
  }

  _renderGameOverScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';

    if (this.gameWon) {
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
      ctx.fillText('SURVIVAL COMPLETE!', CANVAS_WIDTH / 2, 150);
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('You outsmarted the adaptive AI arena!', CANVAS_WIDTH / 2, 195);
    } else {
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ff1744';
      ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
      ctx.fillText('SYSTEM PURGED', CANVAS_WIDTH / 2, 150);
      ctx.font = '22px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Integrity collapsed under drone patrol.', CANVAS_WIDTH / 2, 195);
    }
    ctx.restore();

    // Stats Box
    const sBoxW = 460;
    const sBoxH = 150;
    const sBoxX = (CANVAS_WIDTH - sBoxW) / 2;
    const sBoxY = 230;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.gameWon ? '#00ffcc' : '#ff1744';
    ctx.lineWidth = 2;
    ctx.fillRect(sBoxX, sBoxY, sBoxW, sBoxH);
    ctx.strokeRect(sBoxX, sBoxY, sBoxW, sBoxH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`FINAL SCORE: ${this.score}`, CANVAS_WIDTH / 2, sBoxY + 45);

    const timeSurvived = Math.floor(150.0 - this.survivalTimer);
    const m = Math.floor(timeSurvived / 60);
    const s = timeSurvived % 60;
    ctx.font = '20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`Time Survived: ${m}m ${s}s  |  Cores Collected: ${this.coresCollected}`, CANVAS_WIDTH / 2, sBoxY + 85);

    ctx.fillStyle = '#ffeb3b';
    ctx.fillText(`AI Movement Samples: ${this.ai.samples.length} recorded`, CANVAS_WIDTH / 2, sBoxY + 120);

    // Rule 2 & 4: Game Over shows score and "Press Z to play again"
    // Ignore Z for the first 1.0 second
    if (this.gameOverTimer < 1.0) {
      ctx.font = '20px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#78909c';
      ctx.fillText('ANALYZING COMBAT DATA...', CANVAS_WIDTH / 2, 450);
    } else {
      if (Math.floor(performance.now() / 450) % 2 === 0) {
        ctx.save();
        ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 18;
        ctx.fillText('Press Z to play again', CANVAS_WIDTH / 2, 455);
        ctx.restore();
      }
    }
  }
}

// Instantiate game when window loads
window.addEventListener('load', () => {
  window.game = new Game();
});

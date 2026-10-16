// game.js — Neon Core: AI Arena
// Adheres strictly to AGENTS.md rules. Endless Survival Mode, Curved Trajectories, Hunter Speed Dash, Arrow Player.

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Dynamic Full Screen Setup
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.state = 'TITLE'; // 'TITLE', 'PLAYING', 'PAUSED', 'GAMEOVER'
    this.ai = new AdaptiveAI(this.width, this.height, 8, 5);

    // High Score Persistence
    this.highScore = parseInt(localStorage.getItem('neon_core_high_score') || '0', 10);
    this.isNewRecord = false;

    // Timing
    this.lastTime = performance.now();
    this.gameOverTimer = 0; // Rule 2: ignore Z for the first 1s of game-over

    // Juice, Tension & Visuals
    this.particles = [];
    this.ambientParticles = [];
    this.floatingTexts = [];
    this.playerTrail = [];
    this.droneTrail = [];
    this.shockwaves = [];
    this.screenShake = 0;
    this.bannerText = '';
    this.bannerTimer = 0;
    this.prevThreatLevel = 1;

    // Initialize 45 ambient floating particles for cybernetic atmosphere
    for (let i = 0; i < 45; i++) {
      this.ambientParticles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: 1 + Math.random() * 2,
        speedY: -0.2 - Math.random() * 0.45,
        alpha: 0.15 + Math.random() * 0.35,
        color: Math.random() > 0.5 ? '#00f0ff' : '#ff00aa'
      });
    }

    // Game stats (Endless Survival Mode)
    this.score = 0;
    this.coresCollected = 0;
    this.repairProgress = 0; // 0 to 4
    this.survivalTime = 0.0; // Counts UP endlessly until player loses

    // Combo System
    this.combo = 1;
    this.comboTimer = 0;
    this.comboMaxTime = 3.8;

    // EMP Overdrive state
    this.empTimer = 0;

    // Player state (Aerodynamic Cyber Arrow)
    this.player = {
      x: this.width / 2,
      y: this.height / 2,
      prevX: this.width / 2,
      prevY: this.height / 2,
      angle: -Math.PI / 2,       // Facing upwards initially
      targetAngle: -Math.PI / 2,
      radius: 18,
      speed: 250,
      integrity: 5,
      maxIntegrity: 5,
      invulnTimer: 0,
      invulnDuration: 1.0, // Harder difficulty: reduced from 2.4s to 1.0s recovery cooldown (Rule 3 compliant)
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

    // Security Drones (Pool of 4 drones unlocked across 5 Threat Levels)
    this.drones = [];
    this._initDrones();

    // Auto-pause when window loses focus (Rule 2 & 4 compliant)
    window.addEventListener('blur', () => {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
      }
    });

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

    // Update all drone routes
    this._updateDroneRoutes();
  }

  _initDrones() {
    this.drones = [
      this._createDrone('Scout Alpha', 'CURRENT', this._getRoute1(), 112, 0, true, '#ff1744', 1),
      this._createDrone('Hunter Omega', 'PREDICTIVE', this._getRoute2(), 112, 2, true, '#ff0055', 1),
      this._createDrone('Viper Phantom', 'CURRENT', this._getRoute3(), 125, 1, true, '#c000ff', 3),
      this._createDrone('Titan Overlord', 'PREDICTIVE', this._getRoute4(), 130, 0, true, '#ff8800', 4)
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

  _getRoute3() {
    return [
      { x: this.width * 0.20, y: this.height * 0.70 },
      { x: this.width * 0.50, y: this.height * 0.25 },
      { x: this.width * 0.80, y: this.height * 0.70 }
    ];
  }

  _getRoute4() {
    return [
      { x: this.width * 0.35, y: this.height * 0.35 },
      { x: this.width * 0.65, y: this.height * 0.35 },
      { x: this.width * 0.65, y: this.height * 0.65 },
      { x: this.width * 0.35, y: this.height * 0.65 }
    ];
  }

  _updateDroneRoutes() {
    if (this.drones.length >= 4) {
      this.drones[0].baseRoute = this._getRoute1();
      this.drones[1].baseRoute = this._getRoute2();
      this.drones[2].baseRoute = this._getRoute3();
      this.drones[3].baseRoute = this._getRoute4();
    }
  }

  _createDrone(name, role, baseRoute, speed, startIdx, isHunter, color, minLevel) {
    return {
      name: name,
      role: role, // 'CURRENT' (tracks where player is) or 'PREDICTIVE' (tracks where player will go)
      isHunter: isHunter,
      color: color,
      minLevel: minLevel,
      baseRoute: baseRoute,
      currentWaypointIdx: startIdx,
      x: baseRoute[startIdx].x,
      y: baseRoute[startIdx].y,
      speed: speed,
      radius: 20,
      state: 'MOVING', // 'WARNING', 'MOVING', 'DASHING'
      warningTimer: 0,
      warningDuration: 1.25, // Rule 3: at least 1s warning before route segment
      isTracking: false,
      isDashing: false,
      rewardedNearMiss: false,
      targetLabel: '',
      // Curved trajectory parameters
      isCurved: false,
      startPoint: { x: baseRoute[startIdx].x, y: baseRoute[startIdx].y },
      controlPoint: { x: baseRoute[startIdx].x, y: baseRoute[startIdx].y },
      endPoint: { x: baseRoute[(startIdx + 1) % baseRoute.length].x, y: baseRoute[(startIdx + 1) % baseRoute.length].y },
      curveT: 0,
      curveLength: 200,
      nextTarget: { x: baseRoute[(startIdx + 1) % baseRoute.length].x, y: baseRoute[(startIdx + 1) % baseRoute.length].y },
      baseTarget: { x: baseRoute[(startIdx + 1) % baseRoute.length].x, y: baseRoute[(startIdx + 1) % baseRoute.length].y }
    };
  }

  getThreatLevel() {
    if (this.score >= 5000 || this.survivalTime >= 180) return 5; // OMEGA MATRIX (All 4 Drones)
    if (this.score >= 3200 || this.survivalTime >= 120) return 4; // VIPER SQUADRON (3 Drones)
    if (this.score >= 1800 || this.survivalTime >= 70)  return 3; // APEX PREDATOR (2 Drones, high aggression)
    if (this.score >= 800  || this.survivalTime >= 30)  return 2; // INTERCEPT SEEKERS (Curved tracking)
    return 1;                                                    // SCOUT SURVEILLANCE
  }

  startNewGame() {
    this.state = 'PLAYING';
    this.score = 0;
    this.coresCollected = 0;
    this.repairProgress = 0;
    this.survivalTime = 0.0;
    this.gameOverTimer = 0;
    this.isNewRecord = false;
    this.combo = 1;
    this.comboTimer = 0;
    this.empTimer = 0;
    this.screenShake = 0;
    this.bannerText = '';
    this.bannerTimer = 0;
    this.prevThreatLevel = 1;

    this.player.x = this.width / 2;
    this.player.y = this.height / 2;
    this.player.prevX = this.player.x;
    this.player.prevY = this.player.y;
    this.player.angle = -Math.PI / 2;
    this.player.targetAngle = -Math.PI / 2;
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
    this.droneTrail = [];
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
    // Update ambient cyber particles
    for (const ap of this.ambientParticles) {
      ap.y += ap.speedY;
      if (ap.y < 0) {
        ap.y = this.height;
        ap.x = Math.random() * this.width;
      }
    }

    // Globally decay screen shake
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

    // PAUSED STATE (Rule 1 Compliant: Z toggles Pause / Resume)
    if (this.state === 'PAUSED') {
      if (window.input.consumeZ()) {
        this.state = 'PLAYING';
      }
      return;
    }

    // GAME OVER SCREEN
    if (this.state === 'GAMEOVER') {
      this.screenShake = 0;
      this.gameOverTimer += dt;

      // Rule 2: Ignore Z for the first 1 second of game-over screen.
      if (this.gameOverTimer >= 1.0) {
        if (window.input.consumeZ()) {
          this.startNewGame();
        }
      } else {
        window.input.consumeZ();
      }
      return;
    }

    // PLAYING STATE (Endless Mode)
    if (this.state === 'PLAYING') {
      // Toggle Pause with Z (AGENTS.md Rule 1 compliant: ONLY allowed 6 keys)
      if (window.input.consumeZ()) {
        this.state = 'PAUSED';
        return;
      }

      // Survival time counts UP endlessly
      this.survivalTime += dt;

      // Track escalating 5 threat levels
      const currentThreat = this.getThreatLevel();
      if (currentThreat !== this.prevThreatLevel) {
        this.prevThreatLevel = currentThreat;
        const threatNames = [
          '',
          'SECURITY LEVEL 1: SCOUT PROTOCOL',
          'SECURITY LEVEL 2: INTERCEPT SEEKERS',
          'SECURITY LEVEL 3: APEX PREDATOR HUNT',
          'SECURITY LEVEL 4: VIPER SQUADRON ARRIVED',
          'SECURITY LEVEL 5: OMEGA MATRIX ENGAGED'
        ];
        this.bannerText = threatNames[currentThreat];
        this.bannerTimer = 2.8;
        this.screenShake = 8;
        if (window.sound) window.sound.playAlert();
      }

      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
      }

      // Heartbeat pulse loop across 5 threat levels
      if (window.sound) {
        window.sound.playHeartbeat(currentThreat);
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

      // Update Player Heading Angle (Aerodynamic Arrow Steering)
      if (dx !== 0 || dy !== 0) {
        this.player.targetAngle = Math.atan2(dy, dx);
      }
      let diff = this.player.targetAngle - this.player.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.player.angle += diff * Math.min(1, dt * 18);

      // Speed calculation (with dash boost if active)
      let currentSpeed = this.player.speed;
      if (this.player.dashActiveTimer > 0) {
        currentSpeed = this.player.speed * 2.3;
      }

      this.player.prevX = this.player.x;
      this.player.prevY = this.player.y;
      this.player.x += dx * currentSpeed * dt + this.player.vx * dt;
      this.player.y += dy * currentSpeed * dt + this.player.vy * dt;

      // Player neon trail generation
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0 || this.player.dashActiveTimer > 0) {
        this.playerTrail.push({
          x: this.player.x,
          y: this.player.y,
          angle: this.player.angle,
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

        if (dist < this.player.radius + c.radius + 14) {
          this._collectCore(c, i);
        }
      }

      // Security Drones update (Only active drones based on current threat level)
      for (const drone of this.drones) {
        if (drone.minLevel > currentThreat) continue;

        this._updateDrone(drone, dt, currentThreat);

        // Near-miss / Close Call adrenaline bonus (Dodging a charging drone)
        if ((drone.state === 'MOVING' || drone.state === 'DASHING') && drone.isTracking && !drone.rewardedNearMiss && this.player.invulnTimer <= 0) {
          const dist = Math.hypot(this.player.x - drone.x, this.player.y - drone.y);
          if (dist < this.player.radius + drone.radius + 40 && dist > this.player.radius + drone.radius) {
            drone.rewardedNearMiss = true;
            // Check if multiple hunters are actively engaged
            const activeHunters = this.drones.filter(d => (d.state === 'DASHING' || d.isTracking) && d.minLevel <= currentThreat).length;
            if (activeHunters >= 2) {
              const pts = 400;
              this.score += pts;
              this._addFloatingText('PINCER EVADED! +400', this.player.x, this.player.y - 32, '#ff00ff');
              this.screenShake = 4;
              if (window.sound) window.sound.playCloseCall();
              this._createRepairEffect(this.player.x, this.player.y);
            } else {
              const pts = drone.isDashing ? 250 : 150;
              this.score += pts;
              this._addFloatingText(drone.isDashing ? 'DASH EVADED! +250' : 'CLOSE CALL! +150', this.player.x, this.player.y - 30, '#00ffcc');
              if (window.sound) window.sound.playCloseCall();
              this._createRepairEffect(this.player.x, this.player.y);
            }
          }
        }

        // Drone collision check
        if (this.player.invulnTimer <= 0 && this.player.dashActiveTimer <= 0) {
          const dist = Math.hypot(this.player.x - drone.x, this.player.y - drone.y);
          if (dist < this.player.radius + drone.radius) {
            this.player.integrity--;
            this.player.invulnTimer = this.player.invulnDuration;
            this.screenShake = 12;
            this.combo = 1;

            if (window.sound) window.sound.playHit();

            // Gentle knockback away from drone
            const angle = Math.atan2(this.player.y - drone.y, this.player.x - drone.x);
            this.player.vx = Math.cos(angle) * 260;
            this.player.vy = Math.sin(angle) * 260;

            this._createDamageEffect(this.player.x, this.player.y);
            this._addFloatingText('-1 INTEGRITY', this.player.x, this.player.y - 20, '#ff1744');

            if (this.player.integrity <= 0) {
              this.state = 'GAMEOVER';
              this.screenShake = 0;
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

      // Update Player Trails
      for (let i = this.playerTrail.length - 1; i >= 0; i--) {
        const tr = this.playerTrail[i];
        tr.alpha -= dt * 2.8;
        if (tr.alpha <= 0) {
          this.playerTrail.splice(i, 1);
        }
      }

      // Update Drone Dash Trails
      for (let i = this.droneTrail.length - 1; i >= 0; i--) {
        const dtr = this.droneTrail[i];
        dtr.alpha -= dt * 3.5;
        if (dtr.alpha <= 0) {
          this.droneTrail.splice(i, 1);
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
      this.empTimer = 4.0; // EMP slows drones for 4.0s
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

  _updateDrone(drone, dt, threatLevel) {
    // Dynamic drone speed scaling based on threat level and score
    const baseSpeeds = [115, 115, 132, 150, 168, 186];
    const baseSpeed = baseSpeeds[threatLevel] || 115;
    const scoreBonusSpeed = Math.min(45, (this.score / 700) * 3.5);

    const speedMult = this.empTimer > 0 ? 0.5 : 1.0;
    const finalSpeed = (baseSpeed + scoreBonusSpeed) * speedMult;

    if (drone.state === 'WARNING') {
      drone.warningTimer += dt;
      if (drone.warningTimer >= drone.warningDuration) {
        // Warning completed! Initiate Dash if Hunter
        if (drone.isHunter && threatLevel >= 2) {
          drone.state = 'DASHING';
          drone.isDashing = true;
          if (window.sound) window.sound.playHunterDash();
        } else {
          drone.state = 'MOVING';
          drone.isDashing = false;
        }
      }
      return;
    }

    if (drone.state === 'MOVING' || drone.state === 'DASHING') {
      // Dash multiplier
      const dashSpeedMult = drone.isDashing ? 2.35 : 1.0;
      const currentMoveSpeed = finalSpeed * dashSpeedMult;

      if (drone.isDashing) {
        // Spawn dash smoke/burn trail
        this.droneTrail.push({
          x: drone.x,
          y: drone.y,
          radius: drone.radius * 0.9,
          color: drone.color,
          alpha: 0.65
        });
      }

      if (drone.isCurved) {
        // Advance along Quadratic Bezier Arc
        drone.curveT += (currentMoveSpeed * dt) / drone.curveLength;
        const t = Math.min(1.0, drone.curveT);

        const inv = 1 - t;
        drone.x = inv * inv * drone.startPoint.x + 2 * inv * t * drone.controlPoint.x + t * t * drone.endPoint.x;
        drone.y = inv * inv * drone.startPoint.y + 2 * inv * t * drone.controlPoint.y + t * t * drone.endPoint.y;

        if (t >= 1.0) {
          this._selectNextDroneWaypoint(drone, threatLevel);
        }
      } else {
        // Linear movement between waypoints
        const dx = drone.nextTarget.x - drone.x;
        const dy = drone.nextTarget.y - drone.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 6) {
          this._selectNextDroneWaypoint(drone, threatLevel);
        } else {
          drone.x += (dx / dist) * currentMoveSpeed * dt;
          drone.y += (dy / dist) * currentMoveSpeed * dt;
        }
      }
    }
  }

  _selectNextDroneWaypoint(drone, threatLevel) {
    drone.rewardedNearMiss = false;
    drone.isDashing = false;

    // Determine if drone should track the player with curved trajectory
    let shouldTrack = false;
    if (threatLevel === 2) {
      shouldTrack = drone.isHunter ? !drone.isTracking : Math.random() < 0.25;
    } else if (threatLevel === 3) {
      shouldTrack = drone.isHunter ? true : Math.random() < 0.5;
    } else if (threatLevel === 4) {
      shouldTrack = drone.isHunter ? true : Math.random() < 0.65;
    } else if (threatLevel >= 5) {
      shouldTrack = drone.isHunter ? true : Math.random() < 0.8;
    }

    drone.startPoint = { x: drone.x, y: drone.y };

    if (shouldTrack) {
      // CURVED PURSUIT TRACKING & SPEED DASH
      drone.isTracking = true;
      drone.isCurved = true;

      let targetX, targetY;

      if (drone.role === 'PREDICTIVE') {
        // PREDICTIVE INTERCEPT: Anticipate where player will go based on velocity & heading
        const pVelX = this.player.x - this.player.prevX;
        const pVelY = this.player.y - this.player.prevY;
        const speed = Math.hypot(pVelX, pVelY);

        if (speed > 0.4) {
          // Player is actively moving: project forward 22 frames
          targetX = this.player.x + pVelX * 22;
          targetY = this.player.y + pVelY * 22;
        } else {
          // Player paused / stationary: intercept ahead in their ship facing angle
          targetX = this.player.x + Math.cos(this.player.angle) * 160;
          targetY = this.player.y + Math.sin(this.player.angle) * 160;
        }
        drone.targetLabel = 'PREDICTED ESCAPE LOCKED';
      } else {
        // CURRENT POSITION PURSUIT: Flush player directly out of their current coordinates
        targetX = this.player.x;
        targetY = this.player.y;
        drone.targetLabel = 'CURRENT TARGET LOCKED';
      }

      // Constrain inside safe arena boundaries
      targetX = Math.max(50, Math.min(this.width - 50, targetX));
      targetY = Math.max(90, Math.min(this.height - 50, targetY));

      drone.endPoint = { x: targetX, y: targetY };
      drone.nextTarget = drone.endPoint;

      // Calculate curved control point (bowed outwards to flank and track along an arc)
      const midX = (drone.startPoint.x + drone.endPoint.x) / 2;
      const midY = (drone.startPoint.y + drone.endPoint.y) / 2;
      const vX = drone.endPoint.x - drone.startPoint.x;
      const vY = drone.endPoint.y - drone.startPoint.y;
      const vLen = Math.hypot(vX, vY) || 1;

      // Perpendicular normal vector
      const nX = -vY / vLen;
      const nY = vX / vLen;

      // Flank curvature: Alternate left/right bowing to create sweeping pincer trajectories
      const bow = (Math.random() > 0.5 ? 1 : -1) * (85 + Math.random() * 80);
      drone.controlPoint = {
        x: Math.max(40, Math.min(this.width - 40, midX + nX * bow)),
        y: Math.max(80, Math.min(this.height - 40, midY + nY * bow))
      };

      const d0 = Math.hypot(drone.controlPoint.x - drone.startPoint.x, drone.controlPoint.y - drone.startPoint.y);
      const d1 = Math.hypot(drone.endPoint.x - drone.controlPoint.x, drone.endPoint.y - drone.controlPoint.y);
      drone.curveLength = Math.max(20, (d0 + d1 + vLen) / 2);
      drone.curveT = 0;

      drone.state = 'WARNING';
      drone.warningTimer = 0;

      if (window.sound) window.sound.playLockOn();
    } else {
      // PATROL NAVIGATION: Follow circuit with Adaptive AI nudge
      drone.isTracking = false;
      drone.isCurved = false;
      drone.targetLabel = 'PATROL TELEGRAPH';

      drone.currentWaypointIdx = (drone.currentWaypointIdx + 1) % drone.baseRoute.length;
      const nextIdx = (drone.currentWaypointIdx + 1) % drone.baseRoute.length;
      const baseTarget = drone.baseRoute[nextIdx];

      const adapted = this.ai.getAdaptedWaypoint(baseTarget.x, baseTarget.y);
      drone.baseTarget = baseTarget;
      drone.nextTarget = adapted;

      drone.state = 'WARNING';
      drone.warningTimer = 0;

      if (window.sound) window.sound.playTelegraph();
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
    // Only apply screen shake during active gameplay
    if (this.state === 'PLAYING' && this.screenShake > 0.05) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
    }

    // Dark sci-fi arena background
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, this.width, this.height);

    // Ambient floating cyber particles in background
    for (const ap of this.ambientParticles) {
      ctx.save();
      ctx.fillStyle = ap.color;
      ctx.globalAlpha = ap.alpha;
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, ap.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Neon grid floor
    this._renderGrid(ctx);

    if (this.state === 'TITLE') {
      this._renderTitleScreen(ctx);
    } else if (this.state === 'PLAYING') {
      this._renderGameplay(ctx);
      this._renderHUD(ctx);
    } else if (this.state === 'PAUSED') {
      this._renderGameplay(ctx);
      this._renderHUD(ctx);
      this._renderPausedScreen(ctx);
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
    const threat = this.getThreatLevel();

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

    // Dynamic Outer Arena Glow based on 5 Threat Levels
    const borderColors = ['#00f0ff', '#00f0ff', '#ffb300', '#ff5500', '#c000ff', '#ff1744'];
    let borderColor = borderColors[threat] || '#00f0ff';
    if (this.empTimer > 0) borderColor = '#ff00ff';

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 56, this.width - 20, this.height - 66);
  }

  _renderGameplay(ctx) {
    const currentThreat = this.getThreatLevel();

    // Render AI Waypoint Markers, Curved Trajectories and Tracking Lasers on floor
    for (const drone of this.drones) {
      if (drone.minLevel > currentThreat) continue;

      if (drone.isTracking) {
        ctx.save();

        if (drone.isCurved) {
          // Render Curved Laser Arc
          ctx.setLineDash([10, 6]);
          ctx.lineDashOffset = -performance.now() / 25;
          ctx.strokeStyle = drone.color;
          ctx.lineWidth = 3.5;

          ctx.beginPath();
          ctx.moveTo(drone.startPoint.x, drone.startPoint.y);
          ctx.quadraticCurveTo(drone.controlPoint.x, drone.controlPoint.y, drone.endPoint.x, drone.endPoint.y);
          ctx.stroke();
        } else {
          // Linear laser
          ctx.setLineDash([10, 6]);
          ctx.lineDashOffset = -performance.now() / 25;
          ctx.strokeStyle = drone.color;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(drone.x, drone.y);
          ctx.lineTo(drone.nextTarget.x, drone.nextTarget.y);
          ctx.stroke();
        }

        // Target Reticle with rotating crosshairs
        const rx = drone.nextTarget.x;
        const ry = drone.nextTarget.y;
        const rot = performance.now() / 350;

        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(rot);
        ctx.strokeStyle = drone.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
          ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
          ctx.stroke();
        }
        ctx.restore();

        // Target warning text
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = drone.color;
        const warningLabel = drone.targetLabel || (drone.isHunter ? 'CURVED DASH INCOMING' : 'TARGET LOCKED');
        ctx.fillText(warningLabel, rx, ry + 36);
        ctx.restore();

        ctx.restore();
      } else {
        // Standard baseline and telegraph
        ctx.beginPath();
        ctx.arc(drone.baseTarget.x, drone.baseTarget.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.fill();

        // Adapted waypoint
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

    // Render Drone Dash Trails
    for (const dtr of this.droneTrail) {
      ctx.save();
      ctx.fillStyle = dtr.color;
      ctx.globalAlpha = Math.max(0, dtr.alpha);
      ctx.beginPath();
      ctx.arc(dtr.x, dtr.y, dtr.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Render Player Ghost Trails (Arrow shape)
    for (const tr of this.playerTrail) {
      ctx.save();
      ctx.translate(tr.x, tr.y);
      ctx.rotate(tr.angle);
      ctx.globalAlpha = Math.max(0, tr.alpha);
      ctx.fillStyle = tr.color;

      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, -12);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 12);
      ctx.closePath();
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
      if (drone.minLevel > currentThreat) continue;

      ctx.save();
      const droneColor = this.empTimer > 0 ? '#b300b3' : drone.color;
      ctx.shadowColor = droneColor;
      ctx.shadowBlur = drone.isDashing ? 32 : 22;

      ctx.fillStyle = droneColor;
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, drone.radius, 0, Math.PI * 2);
      ctx.fill();

      // Drone inner eye
      ctx.fillStyle = (drone.state === 'WARNING' || drone.isDashing) ? '#ffffff' : '#280008';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, drone.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Warning pulse ring around drone
      if (drone.state === 'WARNING') {
        const ringRadius = drone.radius + (drone.warningTimer / drone.warningDuration) * 18;
        ctx.strokeStyle = drone.color;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render Player as an Aerodynamic Cyber Arrow
    this._renderPlayer(ctx);

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

    // Center Escalation Banner
    if (this.bannerTimer > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 20;
      ctx.fillText(this.bannerText, this.width / 2, this.height * 0.38);
      ctx.restore();
    }
  }

  _renderPlayer(ctx) {
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.rotate(this.player.angle);

    const isInvuln = this.player.invulnTimer > 0;
    if (!isInvuln || Math.floor(performance.now() / 90) % 2 === 0) {
      let mainColor = '#00f0ff';
      let glowColor = '#00f0ff';

      if (this.combo >= 5) {
        mainColor = '#ffd700';
        glowColor = '#ffd700';
      } else if (this.player.dashActiveTimer > 0) {
        mainColor = '#ffffff';
        glowColor = '#00ffff';
      }

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 24;

      // Thruster exhaust plumes when moving or dashing
      const isMoving = window.input.held.left || window.input.held.right || window.input.held.up || window.input.held.down;
      if (isMoving || this.player.dashActiveTimer > 0) {
        const plumeLen = this.player.dashActiveTimer > 0 ? 26 + Math.random() * 12 : 14 + Math.random() * 8;
        ctx.fillStyle = this.player.dashActiveTimer > 0 ? '#ffea00' : '#00ffff';

        // Left thruster plume
        ctx.beginPath();
        ctx.moveTo(-16, -7);
        ctx.lineTo(-16 - plumeLen, -7);
        ctx.lineTo(-13, -3);
        ctx.closePath();
        ctx.fill();

        // Right thruster plume
        ctx.beginPath();
        ctx.moveTo(-16, 7);
        ctx.lineTo(-16 - plumeLen, 7);
        ctx.lineTo(-13, 3);
        ctx.closePath();
        ctx.fill();
      }

      // Aerodynamic Futuristic Delta Arrow
      ctx.fillStyle = mainColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;

      ctx.beginPath();
      ctx.moveTo(22, 0);       // Nose / tip
      ctx.lineTo(-15, -15);     // Left wingtip
      ctx.lineTo(-8, -5);       // Left inner notch
      ctx.lineTo(-11, 0);       // Rear center notch
      ctx.lineTo(-8, 5);        // Right inner notch
      ctx.lineTo(-15, 15);      // Right wingtip
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing Cockpit Node
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(3, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Space Dash Ready Indicator around arrow
    if (this.player.dashCooldown <= 0) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
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
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#8bf0ff';
    ctx.fillText('INTEGRITY:', 16, 27);

    for (let i = 0; i < this.player.maxIntegrity; i++) {
      if (i < this.player.integrity) {
        ctx.fillStyle = this.player.integrity > 2 ? '#00ffcc' : this.player.integrity === 2 ? '#ffb300' : '#ff1744';
      } else {
        ctx.fillStyle = '#1c2838';
      }
      const bx = 102 + i * 20;
      ctx.fillRect(bx, 18, 16, 18);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, 18, 16, 18);
    }

    // 2. REPAIR COUNTER
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#ffea00';
    ctx.fillText(`REPAIR:`, 214, 27);

    for (let p = 0; p < 4; p++) {
      ctx.fillStyle = p < this.repairProgress ? '#ffea00' : '#232f3e';
      ctx.fillRect(270 + p * 11, 20, 8, 14);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(270 + p * 11, 20, 8, 14);
    }

    // 3. THREAT LEVEL BADGE (5 Threat Levels)
    const threat = this.getThreatLevel();
    const threatColors = ['#00ffcc', '#00ffcc', '#ffb300', '#ff5500', '#c000ff', '#ff1744'];
    const threatLabels = [
      '',
      'THREAT: LVL 1 [SCOUT]',
      'THREAT: LVL 2 [SEEK]',
      'THREAT: LVL 3 [APEX]',
      'THREAT: LVL 4 [VIPER]',
      'THREAT: LVL 5 [OMEGA]'
    ];
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillStyle = threatColors[threat] || '#00ffcc';
    ctx.fillText(threatLabels[threat], 328, 27);

    // 4. SURVIVAL TIME (Counts UP in Endless Mode)
    const mins = Math.floor(this.survivalTime / 60);
    const secs = Math.floor(this.survivalTime % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`TIME: ${timeStr}`, 495, 27);

    // 5. SPACE / CLICK DASH STATUS WITH KEY HINT
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    if (this.player.dashCooldown <= 0) {
      ctx.fillStyle = '#00ffcc';
      ctx.fillText('[SPACE / CLICK] DASH: READY', 605, 27);
    } else {
      ctx.fillStyle = '#64748b';
      const pct = Math.ceil(this.player.dashCooldown);
      ctx.fillText(`[SPACE / CLICK] DASH: ${pct}s`, 605, 27);
    }

    // 6. PAUSE HINT
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('[Z] PAUSE', 785, 27);

    // 7. COMBO MULTIPLIER
    if (this.combo > 1) {
      ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`x${this.combo}`, 865, 27);
    }

    // 8. SCORE & HIGH SCORE
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE: ${this.score}`, this.width - 150, 27);

    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`BEST: ${Math.max(this.score, this.highScore)}`, this.width - 25, 27);

    ctx.restore();
  }

  _renderPausedScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.85)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = this.height / 2;

    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 50px "Segoe UI", Arial, sans-serif';
    ctx.fillText('GAME PAUSED', this.width / 2, cy - 80);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffea00';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Press Z to resume', this.width / 2, cy - 25);

    // Box with controls reminder
    const bw = Math.min(520, this.width - 60);
    const bh = 140;
    const bx = (this.width - bw) / 2;
    const by = cy + 20;

    ctx.fillStyle = '#0c1626';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.textAlign = 'left';
    ctx.font = '17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('• Arrow Keys / WASD : Directional Movement', bx + 30, by + 35);
    ctx.fillText('• Z Key : Resume Gameplay', bx + 30, by + 70);
    ctx.fillText('• Space / Left Click : Neon Surge Dash (2.2s cooldown)', bx + 30, by + 105);

    ctx.restore();
  }

  _renderTitleScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.90)';
    ctx.fillRect(0, 0, this.width, this.height);

    const centerY = this.height / 2;

    // Glowing Cyber Logo
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 56px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEON CORE: AI ARENA', this.width / 2, centerY - 175);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8bf0ff';
    ctx.font = '22px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Endless Adaptive Cyber Survival Arena', this.width / 2, centerY - 128);

    // Best Score Display with Gold Trophy Accent
    if (this.highScore > 0) {
      ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`★ ALL-TIME HIGH SCORE: ${this.highScore} ★`, this.width / 2, centerY - 92);
    }

    // High contrast instructions panel with Cyber Visual Keycaps
    const boxW = Math.min(760, this.width - 50);
    const boxH = 240;
    const boxX = (this.width - boxW) / 2;
    const boxY = centerY - 65;

    ctx.fillStyle = '#0a1424';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Decorative Sci-Fi Corner Brackets
    ctx.strokeStyle = '#ff00aa';
    ctx.lineWidth = 3;
    const bLen = 16;
    // Top-left
    ctx.beginPath(); ctx.moveTo(boxX, boxY + bLen); ctx.lineTo(boxX, boxY); ctx.lineTo(boxX + bLen, boxY); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(boxX + boxW - bLen, boxY); ctx.lineTo(boxX + boxW, boxY); ctx.lineTo(boxX + boxW, boxY + bLen); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(boxX, boxY + boxH - bLen); ctx.lineTo(boxX, boxY + boxH); ctx.lineTo(boxX + bLen, boxY + boxH); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(boxX + boxW - bLen, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH - bLen); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MISSION CONTROLS (ARROWS / WASD + MOUSE):', boxX + 28, boxY + 36);

    // Visual Keycap Cluster 1: ARROWS / WASD
    this._drawKeycap(ctx, boxX + 28, boxY + 58, 140, 34, '▲▼◀▶ / WASD', '#00f0ff');
    ctx.font = '17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Continuous Directional Movement (Held + Diagonals)', boxX + 180, boxY + 80);

    // Visual Keycap Cluster 2: Z KEY
    this._drawKeycap(ctx, boxX + 28, boxY + 104, 140, 34, 'Z KEY', '#00ffcc');
    ctx.font = '17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Confirm / Start Game / Pause / Resume / Restart', boxX + 180, boxY + 126);

    // Visual Keycap Cluster 3: SPACE / CLICK
    this._drawKeycap(ctx, boxX + 28, boxY + 150, 140, 34, 'SPACE / CLICK', '#ffea00');
    ctx.font = '17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText('Neon Surge Dash (2.2s cooldown, secondary dodge)', boxX + 180, boxY + 172);

    // Feature note
    ctx.font = '14px "Courier New", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('★ ENDLESS SURVIVAL ★ Curved Pursuit Dashes ★ 4 Seeker Drone Classes', boxX + 28, boxY + 215);

    // Blinking "Press Z to start" (Rule 4 requirement)
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffea00';
      ctx.shadowColor = '#ffea00';
      ctx.shadowBlur = 18;
      ctx.fillText('Press Z to start', this.width / 2, centerY + 225);
    }
    ctx.restore();
  }

  _drawKeycap(ctx, x, y, w, h, text, color) {
    ctx.save();
    ctx.fillStyle = '#111d33';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
  }

  _renderGameOverScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.94)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = 'center';
    const centerY = this.height / 2;

    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ff1744';
    ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
    ctx.fillText('SYSTEM PURGED', this.width / 2, centerY - 140);

    ctx.font = '22px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Your cyber core collapsed under the curved drone hunt.', this.width / 2, centerY - 95);
    ctx.restore();

    // Stats Box
    const sBoxW = Math.min(520, this.width - 60);
    const sBoxH = 180;
    const sBoxX = (this.width - sBoxW) / 2;
    const sBoxY = centerY - 60;

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#ff1744';
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
      ctx.fillText('★ NEW ALL-TIME RECORD! ★', this.width / 2, sBoxY + 80);
    } else {
      ctx.font = '19px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`ALL-TIME BEST: ${this.highScore}`, this.width / 2, sBoxY + 80);
    }

    const m = Math.floor(this.survivalTime / 60);
    const s = Math.floor(this.survivalTime % 60);
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

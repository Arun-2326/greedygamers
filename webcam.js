// webcam.js — Adaptive AI Vision Face & Gesture Controller for Neon Core: AI Arena
// Features self-training / adaptive face calibration specifically tuned to the player's face geometry.
// Automatically selects "HP True Vision FHD Camera".
// Maps:
// - Head up / down (Pitch)       -> Up / Down Arrow (held continuously)
// - Turn left / right (Yaw)       -> Left / Right Arrow (held continuously)
// - Open mouth                   -> Z (held continuously, fresh trigger on open)
// - Blink / eyes closed          -> Space (held continuously, triggers 2.0s burst dash)

(function () {
  class AdaptiveWebcamController {
    constructor() {
      this.video = null;
      this.canvas = null;
      this.ctx = null;
      this.stream = null;
      this.isTracking = false;
      this.isMinimized = false;
      this.useMediaPipe = false;
      this.faceMesh = null;
      this.cvLoopStarted = false;

      // Personalized Calibration State ("Training on player's face")
      this.isCalibrating = true;
      this.calibSamples = [];
      this.calibTargetCount = 35; // ~1.2 seconds of samples
      this.calibrated = false;

      // Baselines (personalized to the player's resting face)
      this.baseline = {
        noseX: 0.50,
        noseY: 0.50,
        yaw: 0.0,
        mar: 0.12,
        ear: 0.28
      };

      // Smoothed filter values (Exponential Moving Average)
      this.smooth = {
        noseX: 0.50,
        noseY: 0.50,
        yaw: 0.0,
        mar: 0.12,
        ear: 0.28
      };

      // Relative Thresholds (Dynamically tuned to the player's face)
      this.mouthOpenThreshold = 0.22;
      this.blinkThreshold = 0.18;
      this.deadzoneX = 0.05;
      this.deadzoneY = 0.05;

      // Action State
      this.isMouthOpen = false;
      this.lastZTime = 0;
      this.zDebounce = 450;

      this.isEyeClosed = false;
      this.eyeClosedStart = 0;
      this.lastDashTime = 0;
      this.dashCooldown = 2000; // ms

      this.heldDirs = { up: false, down: false, left: false, right: false };

      this._initDOM();
      this._startWebcam();
      this._initMediaPipe();
    }

    _initDOM() {
      const container = document.createElement('div');
      container.id = 'webcam-container';
      container.innerHTML = `
        <div id="webcam-header">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;">
            <span id="webcam-status-dot"></span>
            <select id="webcam-select" title="Choose Camera"></select>
          </div>
          <button id="webcam-recalib-btn" title="Re-calibrate / Train Face Baseline">TRAIN FACE</button>
          <button id="webcam-toggle-btn" title="Toggle Cam Size">_</button>
        </div>
        <div id="webcam-video-wrap">
          <video id="webcam-video" autoplay playsinline muted></video>
          <canvas id="webcam-canvas" width="320" height="240"></canvas>
          <div id="webcam-hud-notice">
            <div id="notice-title">CALIBRATING FACE DATA...</div>
            <div id="notice-desc" style="font-size:10px;color:#a0aec0;margin-top:4px;">Look straight at camera neutrally</div>
            <div id="notice-bar-wrap" style="width:140px;height:5px;background:rgba(255,255,255,0.15);border-radius:3px;margin-top:8px;overflow:hidden;">
              <div id="notice-bar-fill" style="width:0%;height:100%;background:#00ff88;transition:width 0.1s;"></div>
            </div>
          </div>
        </div>
        <div id="webcam-footer">
          <div class="webcam-meter-row">
            <span style="width:65px;">MOUTH (Z):</span>
            <div class="webcam-meter-track">
              <div id="mouth-meter-fill" class="webcam-meter-fill" style="background:#00ff88;"></div>
            </div>
            <span id="mouth-meter-val" style="width:36px;text-align:right;">0%</span>
          </div>
          <div class="webcam-meter-row">
            <span style="width:65px;">BLINK (DASH):</span>
            <div class="webcam-meter-track">
              <div id="blink-meter-fill" class="webcam-meter-fill" style="background:#00f0ff;"></div>
            </div>
            <span id="blink-meter-val" style="width:36px;text-align:right;">READY</span>
          </div>
          <div id="webcam-steer-indicators">
            <span class="steer-arrow" id="steer-left">&ltrif; TURN L</span>
            <span class="steer-arrow" id="steer-up">&utrif; HEAD UP</span>
            <span class="steer-arrow" id="steer-down">&dtrif; HEAD DOWN</span>
            <span class="steer-arrow" id="steer-right">&rtrif; TURN R</span>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      this.container = container;
      this.video = document.getElementById('webcam-video');
      this.canvas = document.getElementById('webcam-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.hudNotice = document.getElementById('webcam-hud-notice');
      this.noticeTitle = document.getElementById('notice-title');
      this.noticeBarFill = document.getElementById('notice-bar-fill');
      this.statusDot = document.getElementById('webcam-status-dot');
      this.deviceSelect = document.getElementById('webcam-select');

      this.mouthMeterFill = document.getElementById('mouth-meter-fill');
      this.mouthMeterVal = document.getElementById('mouth-meter-val');
      this.blinkMeterFill = document.getElementById('blink-meter-fill');
      this.blinkMeterVal = document.getElementById('blink-meter-val');

      // Re-calibrate button
      const recalibBtn = document.getElementById('webcam-recalib-btn');
      recalibBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startCalibration();
      });

      // Toggle minimize button
      const toggleBtn = document.getElementById('webcam-toggle-btn');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isMinimized = !this.isMinimized;
        container.classList.toggle('minimized', this.isMinimized);
        toggleBtn.textContent = this.isMinimized ? '□' : '_';
      });
    }

    startCalibration() {
      this.isCalibrating = true;
      this.calibrated = false;
      this.calibSamples = [];
      this.hudNotice.style.display = 'flex';
      this.noticeTitle.textContent = 'TRAINING ON YOUR FACE...';
      this.noticeBarFill.style.width = '0%';
      this.statusDot.style.backgroundColor = '#ffea00';
      this.statusDot.style.boxShadow = '0 0 8px #ffea00';
    }

    async _startWebcam() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia not supported in this browser environment');
        }

        // 1. Enumerate devices
        let devices = await navigator.mediaDevices.enumerateDevices();
        let videoDevices = devices.filter(d => d.kind === 'videoinput');

        // Probe permission if device labels are blank
        if (videoDevices.length > 0 && !videoDevices[0].label) {
          try {
            const probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            probeStream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            videoDevices = devices.filter(d => d.kind === 'videoinput');
          } catch (e) {}
        }

        // 2. Select HP True Vision camera with top priority
        let chosenDeviceId = null;
        const hpDevice = videoDevices.find(d => /hp|true\s*vision/i.test(d.label));
        const nonVirtual = videoDevices.find(d => !/motorola|virtual/i.test(d.label));

        if (hpDevice) {
          chosenDeviceId = hpDevice.deviceId;
          console.log('[AI Vision] Target matched: HP True Vision FHD Camera');
        } else if (nonVirtual) {
          chosenDeviceId = nonVirtual.deviceId;
        } else if (videoDevices.length > 1) {
          chosenDeviceId = videoDevices[1].deviceId;
        } else if (videoDevices.length > 0) {
          chosenDeviceId = videoDevices[0].deviceId;
        }

        this._populateCameraDropdown(videoDevices, chosenDeviceId);
        await this._connectStream(chosenDeviceId);

      } catch (err) {
        console.warn('Webcam initialization error:', err);
        this.hudNotice.innerHTML = 'CAM ACCESS NEEDED<br><small style="font-size:9px">Click address bar icon to allow</small>';
        this.hudNotice.style.color = '#ffaa00';
        this.statusDot.style.backgroundColor = '#ffaa00';
      }
    }

    _populateCameraDropdown(videoDevices, selectedId) {
      if (!this.deviceSelect) return;
      this.deviceSelect.innerHTML = '';

      if (videoDevices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No camera found';
        this.deviceSelect.appendChild(opt);
        return;
      }

      videoDevices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Camera ${idx + 1}`;
        if (dev.deviceId === selectedId) {
          opt.selected = true;
        }
        this.deviceSelect.appendChild(opt);
      });

      this.deviceSelect.onchange = async () => {
        await this._connectStream(this.deviceSelect.value);
        this.startCalibration();
      };
    }

    async _connectStream(deviceId) {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }

      this.hudNotice.style.display = 'flex';
      this.noticeTitle.textContent = 'CONNECTING HP TRUE VISION CAM...';

      const constraints = {
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 }
        },
        audio: false
      };

      if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;
      this.video.srcObject = stream;

      this.video.onloadedmetadata = () => {
        this.canvas.width = this.video.videoWidth || 320;
        this.canvas.height = this.video.videoHeight || 240;
        this.isTracking = true;
        this.startCalibration();

        if (!this.cvLoopStarted) {
          this.cvLoopStarted = true;
          requestAnimationFrame(() => this._cvLoop());
        }
      };
    }

    _initMediaPipe() {
      // Check if MediaPipe FaceMesh is already loaded via <head>
      const checkAndSetup = () => {
        if (window.FaceMesh) {
          try {
            this.faceMesh = new window.FaceMesh({
              locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });

            this.faceMesh.setOptions({
              maxNumFaces: 1,
              refineLandmarks: true,
              minDetectionConfidence: 0.60,
              minTrackingConfidence: 0.60
            });

            this.faceMesh.onResults((results) => this._onFaceMeshResults(results));
            this.useMediaPipe = true;
            console.log('[AI Vision] Neural FaceMesh Engine active & tracking!');
          } catch (e) {
            console.warn('[AI Vision] Using native canvas CV engine:', e);
          }
        } else {
          setTimeout(checkAndSetup, 300);
        }
      };
      checkAndSetup();
    }

    _onFaceMeshResults(results) {
      if (!this.canvas || !this.ctx) return;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const now = performance.now();

      this.ctx.clearRect(0, 0, w, h);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const flm = results.multiFaceLandmarks[0];

        // 1. Raw Coordinates Extraction
        const rawNoseX = 1.0 - flm[1].x; // Mirrored
        const rawNoseY = flm[1].y;

        // Yaw calculation: Turn Left / Turn Right
        const dLeft = Math.abs(flm[1].x - flm[234].x);
        const dRight = Math.abs(flm[1].x - flm[454].x);
        const rawYaw = (dLeft - dRight) / Math.max(0.001, dLeft + dRight);

        // Pitch calculation: Head Up / Head Down
        const eyeY = flm[168].y;
        const chinY = flm[152].y;
        const rawPitch = (flm[1].y - eyeY) / Math.max(0.001, chinY - eyeY);

        // Mouth Aspect Ratio (MAR)
        const lipDist = Math.hypot(flm[13].x - flm[14].x, flm[13].y - flm[14].y);
        const mouthWidth = Math.hypot(flm[61].x - flm[291].x, flm[61].y - flm[291].y);
        const rawMar = lipDist / Math.max(0.001, mouthWidth);

        // Eye Aspect Ratio (EAR)
        const earLeft = Math.hypot(flm[159].x - flm[145].x, flm[159].y - flm[145].y) /
                        Math.max(0.001, Math.hypot(flm[33].x - flm[133].x, flm[33].y - flm[133].y));
        const earRight = Math.hypot(flm[386].x - flm[374].x, flm[386].y - flm[374].y) /
                         Math.max(0.001, Math.hypot(flm[362].x - flm[263].x, flm[362].y - flm[263].y));
        const rawEar = (earLeft + earRight) / 2.0;

        // 2. Exponential Moving Average Smoothing (Anti-Jitter)
        const alpha = 0.35;
        this.smooth.noseX = this.smooth.noseX * (1 - alpha) + rawNoseX * alpha;
        this.smooth.noseY = this.smooth.noseY * (1 - alpha) + rawNoseY * alpha;
        this.smooth.yaw = this.smooth.yaw * (1 - alpha) + rawYaw * alpha;
        this.smooth.mar = this.smooth.mar * (1 - alpha) + rawMar * alpha;
        this.smooth.ear = this.smooth.ear * (1 - alpha) + rawEar * alpha;

        // 3. Calibration Phase ("Training On Player's Neutral Face")
        if (this.isCalibrating) {
          this.calibSamples.push({
            noseX: rawNoseX,
            noseY: rawPitch,
            yaw: rawYaw,
            mar: rawMar,
            ear: rawEar
          });

          const pct = Math.min(100, Math.floor((this.calibSamples.length / this.calibTargetCount) * 100));
          this.noticeBarFill.style.width = `${pct}%`;
          this.noticeTitle.textContent = `TRAINING: ${pct}%`;

          if (this.calibSamples.length >= this.calibTargetCount) {
            // Compute Personalized Baseline
            const len = this.calibSamples.length;
            this.baseline.noseX = this.calibSamples.reduce((acc, s) => acc + s.noseX, 0) / len;
            this.baseline.noseY = this.calibSamples.reduce((acc, s) => acc + s.noseY, 0) / len;
            this.baseline.yaw = this.calibSamples.reduce((acc, s) => acc + s.yaw, 0) / len;
            this.baseline.mar = this.calibSamples.reduce((acc, s) => acc + s.mar, 0) / len;
            this.baseline.ear = this.calibSamples.reduce((acc, s) => acc + s.ear, 0) / len;

            // Compute Adaptive Relative Thresholds
            this.mouthOpenThreshold = this.baseline.mar * 1.55 + 0.06;
            this.blinkThreshold = this.baseline.ear * 0.70; // 30% reduction from open eye

            this.isCalibrating = false;
            this.calibrated = true;
            this.hudNotice.style.display = 'none';
            this.statusDot.style.backgroundColor = '#00ff88';
            this.statusDot.style.boxShadow = '0 0 8px #00ff88';
            console.log('[AI Vision] Training complete! Calibrated baseline:', this.baseline);
          }
          return;
        }

        // 4. Relative Head Steering from Personalized Neutral Center
        const deltaX = (this.smooth.noseX - this.baseline.noseX) + (this.smooth.yaw - this.baseline.yaw) * 0.45;
        const deltaY = rawPitch - this.baseline.noseY;

        const left = deltaX < -this.deadzoneX;
        const right = deltaX > this.deadzoneX;
        const up = deltaY < -this.deadzoneY;
        const down = deltaY > this.deadzoneY;

        this._updateSteering(up, down, left, right);

        // 5. Relative Mouth Open Detection -> Z Key (Held)
        const mouthIsOpen = this.smooth.mar >= this.mouthOpenThreshold;
        if (mouthIsOpen) {
          if (!this.isMouthOpen && (now - this.lastZTime) >= this.zDebounce) {
            this.lastZTime = now;
            if (window.input) window.input.setWebcamZ(true);
            this._flashMouthFeedback();
          } else {
            if (window.input) window.input.setWebcamZ(true);
          }
        } else {
          if (this.isMouthOpen) {
            if (window.input) window.input.setWebcamZ(false);
          }
        }
        this.isMouthOpen = mouthIsOpen;

        // 6. Relative Eye Blink Detection -> Space Dash (Held)
        const eyesAreClosed = this.smooth.ear <= this.blinkThreshold;
        const dashRemaining = Math.max(0, (this.dashCooldown - (now - this.lastDashTime)) / 1000);

        if (eyesAreClosed) {
          if (!this.isEyeClosed) {
            this.isEyeClosed = true;
            this.eyeClosedStart = now;
            if (dashRemaining <= 0) {
              this.lastDashTime = now;
              if (window.input) window.input.setWebcamSpace(true);
              this._flashBlinkFeedback();
            }
          } else {
            if (window.input) window.input.setWebcamSpace(true);
          }
        } else {
          if (this.isEyeClosed) {
            if (window.input) window.input.setWebcamSpace(false);
            this.isEyeClosed = false;
          }
        }

        // Draw Interactive Neural HUD Overlay
        this._drawNeuralHUD(flm, w, h, deltaX, deltaY);
      } else {
        this._updateSteering(false, false, false, false);
      }

      this._updateMetersDisplay();
    }

    _drawNeuralHUD(flm, w, h, deltaX, deltaY) {
      const ctx = this.ctx;
      ctx.save();

      // 1. Draw Lip Landmarks in Neon Green
      ctx.strokeStyle = this.isMouthOpen ? '#00ff88' : 'rgba(0, 255, 136, 0.5)';
      ctx.lineWidth = this.isMouthOpen ? 2.5 : 1.2;
      ctx.beginPath();
      // Outer lip contour
      const lipIndices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
      lipIndices.forEach((idx, i) => {
        const lx = (1.0 - flm[idx].x) * w;
        const ly = flm[idx].y * h;
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      });
      ctx.stroke();

      // 2. Draw Eye Contours in Neon Magenta / Cyan
      const eyeColor = this.isEyeClosed ? '#00f0ff' : 'rgba(255, 0, 170, 0.6)';
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = this.isEyeClosed ? 2.5 : 1.2;

      // Left eye
      ctx.beginPath();
      [33, 160, 158, 133, 153, 144].forEach((idx, i) => {
        const ex = (1.0 - flm[idx].x) * w;
        const ey = flm[idx].y * h;
        if (i === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      });
      ctx.closePath();
      ctx.stroke();

      // Right eye
      ctx.beginPath();
      [362, 385, 387, 263, 373, 380].forEach((idx, i) => {
        const ex = (1.0 - flm[idx].x) * w;
        const ey = flm[idx].y * h;
        if (i === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      });
      ctx.closePath();
      ctx.stroke();

      // 3. Center Target & Head Offset Indicator
      const cx = w / 2;
      const cy = h / 2;
      const deadW = this.deadzoneX * w * 2.2;
      const deadH = this.deadzoneY * h * 2.2;

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(cx - deadW / 2, cy - deadH / 2, deadW, deadH);
      ctx.setLineDash([]);

      // Head cursor dot
      const hx = cx + deltaX * w * 2.0;
      const hy = cy + deltaY * h * 2.0;
      const inDead = Math.abs(deltaX) <= this.deadzoneX && Math.abs(deltaY) <= this.deadzoneY;

      ctx.fillStyle = inDead ? '#00f0ff' : '#ffea00';
      ctx.beginPath();
      ctx.arc(hx, hy, inDead ? 5 : 7, 0, Math.PI * 2);
      ctx.fill();

      // Active Mouth Open / Dash Banner
      if (this.isMouthOpen) {
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00ff88';
        ctx.textAlign = 'center';
        ctx.fillText('MOUTH OPEN [Z HELD]', cx, h - 14);
      } else if (this.isEyeClosed) {
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00f0ff';
        ctx.textAlign = 'center';
        ctx.fillText('EYES CLOSED [DASH HELD]', cx, h - 14);
      }

      ctx.restore();
    }

    _cvLoop() {
      if (!this.isTracking || !this.video || this.video.paused || this.video.ended) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      if (this.useMediaPipe && this.faceMesh) {
        this.faceMesh.send({ image: this.video }).catch(() => {});
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // Offline Native Canvas Centroid & Luminance Fallback
      const w = this.canvas.width;
      const h = this.canvas.height;
      const now = performance.now();

      this.ctx.drawImage(this.video, 0, 0, w, h);
      const frameData = this.ctx.getImageData(0, 0, w, h);
      const data = frameData.data;

      let sumX = 0, sumY = 0, skinCount = 0;
      for (let y = 20; y < h - 20; y += 4) {
        for (let x = 20; x < w - 20; x += 4) {
          const idx = (y * w + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          if (r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 12) {
            sumX += x;
            sumY += y;
            skinCount++;
          }
        }
      }

      this.ctx.clearRect(0, 0, w, h);

      if (skinCount > 70) {
        const rawCx = sumX / skinCount;
        const cy = sumY / skinCount;
        const cx = w - rawCx;

        if (this.isCalibrating) {
          this.calibSamples.push({ noseX: cx / w, noseY: cy / h, yaw: 0, mar: 0.12, ear: 0.28 });
          const pct = Math.min(100, Math.floor((this.calibSamples.length / this.calibTargetCount) * 100));
          this.noticeBarFill.style.width = `${pct}%`;
          this.noticeTitle.textContent = `TRAINING: ${pct}%`;
          if (this.calibSamples.length >= this.calibTargetCount) {
            const len = this.calibSamples.length;
            this.baseline.noseX = this.calibSamples.reduce((a, s) => a + s.noseX, 0) / len;
            this.baseline.noseY = this.calibSamples.reduce((a, s) => a + s.noseY, 0) / len;
            this.isCalibrating = false;
            this.calibrated = true;
            this.hudNotice.style.display = 'none';
          }
        } else {
          const deltaX = (cx / w) - this.baseline.noseX;
          const deltaY = (cy / h) - this.baseline.noseY;

          const left = deltaX < -0.06;
          const right = deltaX > 0.06;
          const up = deltaY < -0.06;
          const down = deltaY > 0.06;

          this._updateSteering(up, down, left, right);

          // Draw center deadzone and centroid dot
          this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          this.ctx.strokeRect(w * 0.4, h * 0.4, w * 0.2, h * 0.2);
          this.ctx.fillStyle = '#ffea00';
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }

      requestAnimationFrame(() => this._cvLoop());
    }

    _updateSteering(up, down, left, right) {
      this.heldDirs = { up, down, left, right };
      if (window.input && window.input.setWebcamDirection) {
        window.input.setWebcamDirection(up, down, left, right);
      }

      const elL = document.getElementById('steer-left');
      const elU = document.getElementById('steer-up');
      const elD = document.getElementById('steer-down');
      const elR = document.getElementById('steer-right');

      if (elL) elL.classList.toggle('active', left);
      if (elU) elU.classList.toggle('active', up);
      if (elD) elD.classList.toggle('active', down);
      if (elR) elR.classList.toggle('active', right);
    }

    _flashMouthFeedback() {
      if (this.mouthMeterFill) {
        this.mouthMeterFill.style.boxShadow = '0 0 10px #00ff88';
        setTimeout(() => {
          if (this.mouthMeterFill) this.mouthMeterFill.style.boxShadow = 'none';
        }, 250);
      }
    }

    _flashBlinkFeedback() {
      if (this.blinkMeterFill) {
        this.blinkMeterFill.style.boxShadow = '0 0 10px #00f0ff';
        setTimeout(() => {
          if (this.blinkMeterFill) this.blinkMeterFill.style.boxShadow = 'none';
        }, 250);
      }
    }

    _updateMetersDisplay() {
      const now = performance.now();
      const dashRemaining = Math.max(0, (this.dashCooldown - (now - this.lastDashTime)) / 1000);

      // Mouth Progress Meter
      if (this.mouthMeterFill && this.mouthMeterVal) {
        const delta = Math.max(0, this.smooth.mar - this.baseline.mar);
        const targetDelta = Math.max(0.01, this.mouthOpenThreshold - this.baseline.mar);
        const pct = Math.min(100, Math.max(0, Math.round((delta / targetDelta) * 100)));

        this.mouthMeterFill.style.width = `${pct}%`;
        this.mouthMeterVal.textContent = this.isMouthOpen ? 'OPEN!' : `${pct}%`;
        this.mouthMeterVal.style.color = this.isMouthOpen ? '#00ff88' : '#a0aec0';
      }

      // Blink Progress Meter
      if (this.blinkMeterFill && this.blinkMeterVal) {
        if (dashRemaining > 0) {
          const cdPct = Math.round((1 - dashRemaining / 2.0) * 100);
          this.blinkMeterFill.style.width = `${cdPct}%`;
          this.blinkMeterFill.style.background = '#ff8800';
          this.blinkMeterVal.textContent = `${dashRemaining.toFixed(1)}s`;
          this.blinkMeterVal.style.color = '#ff8800';
        } else {
          this.blinkMeterFill.style.width = this.isEyeClosed ? '100%' : '100%';
          this.blinkMeterFill.style.background = this.isEyeClosed ? '#00ffcc' : '#00f0ff';
          this.blinkMeterVal.textContent = this.isEyeClosed ? 'BLINK!' : 'READY';
          this.blinkMeterVal.style.color = this.isEyeClosed ? '#00ffcc' : '#00f0ff';
        }
      }
    }
  }

  // Auto-start controller
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.webcamController = new AdaptiveWebcamController();
    });
  } else {
    window.webcamController = new AdaptiveWebcamController();
  }
})();

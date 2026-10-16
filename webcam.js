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
      this.mediaPipeSending = false;
      this.cvLoopStarted = false;
      this.calibTimer = null;

      // Personalized Calibration State ("Training on player's face")
      this.isCalibrating = true;
      this.calibSamples = [];
      this.calibTargetCount = 30; // ~0.8-1.0s of frames
      this.calibrated = false;

      // Baselines (personalized to the player's resting face)
      this.baseline = {
        noseX: 0.50,
        noseY: 0.50,
        yaw: 0.0,
        mar: 0.12,
        ear: 0.28,
        mouthDark: 0.08,
        eyeContrast: 20
      };

      // Smoothed filter values (Exponential Moving Average)
      this.smooth = {
        noseX: 0.50,
        noseY: 0.50,
        yaw: 0.0,
        mar: 0.12,
        ear: 0.28,
        mouthDark: 0.08,
        eyeContrast: 20
      };

      // Relative Thresholds (Dynamically tuned to the player's face)
      this.mouthOpenThreshold = 0.22;
      this.blinkThreshold = 0.18;
      this.deadzoneX = 0.05;
      this.deadzoneY = 0.05;

      // Action State
      this.isMouthOpen = false;
      this.lastZTime = 0;
      this.zDebounce = 350;

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
      if (this.hudNotice) this.hudNotice.style.display = 'flex';
      if (this.noticeTitle) this.noticeTitle.textContent = 'TRAINING ON YOUR FACE...';
      if (this.noticeBarFill) this.noticeBarFill.style.width = '0%';
      if (this.statusDot) {
        this.statusDot.style.backgroundColor = '#ffea00';
        this.statusDot.style.boxShadow = '0 0 8px #ffea00';
      }

      // Safeguard timer: Guarantees training finishes cleanly within 1.6s regardless of network or lighting
      if (this.calibTimer) clearTimeout(this.calibTimer);
      this.calibTimer = setTimeout(() => {
        if (this.isCalibrating) {
          console.log('[AI Vision] Calibration auto-finalizing via timer safeguard...');
          this._finalizeCalibration();
        }
      }, 1600);
    }

    _finalizeCalibration() {
      if (this.calibTimer) {
        clearTimeout(this.calibTimer);
        this.calibTimer = null;
      }

      const len = this.calibSamples.length;
      if (len > 0) {
        this.baseline.noseX = this.calibSamples.reduce((acc, s) => acc + (s.noseX || 0.5), 0) / len;
        this.baseline.noseY = this.calibSamples.reduce((acc, s) => acc + (s.noseY || 0.5), 0) / len;
        this.baseline.yaw = this.calibSamples.reduce((acc, s) => acc + (s.yaw || 0), 0) / len;
        this.baseline.mar = this.calibSamples.reduce((acc, s) => acc + (s.mar || 0.12), 0) / len;
        this.baseline.ear = this.calibSamples.reduce((acc, s) => acc + (s.ear || 0.28), 0) / len;
        this.baseline.mouthDark = this.calibSamples.reduce((acc, s) => acc + (s.mouthDark || 0.08), 0) / len;
        this.baseline.eyeContrast = this.calibSamples.reduce((acc, s) => acc + (s.eyeContrast || 20), 0) / len;
      }

      // Clamp baseline values to valid numeric ranges
      this.baseline.noseX = Number.isFinite(this.baseline.noseX) ? this.baseline.noseX : 0.50;
      this.baseline.noseY = Number.isFinite(this.baseline.noseY) ? this.baseline.noseY : 0.50;
      this.baseline.yaw = Number.isFinite(this.baseline.yaw) ? this.baseline.yaw : 0.0;
      this.baseline.mar = Number.isFinite(this.baseline.mar) ? this.baseline.mar : 0.12;
      this.baseline.ear = Number.isFinite(this.baseline.ear) ? this.baseline.ear : 0.28;
      this.baseline.mouthDark = Number.isFinite(this.baseline.mouthDark) ? this.baseline.mouthDark : 0.08;
      this.baseline.eyeContrast = Number.isFinite(this.baseline.eyeContrast) ? this.baseline.eyeContrast : 20;

      // Personalized thresholds
      this.mouthOpenThreshold = Math.max(0.18, this.baseline.mar * 1.55 + 0.05);
      this.blinkThreshold = Math.max(0.14, this.baseline.ear * 0.70);

      this.isCalibrating = false;
      this.calibrated = true;

      if (this.noticeTitle) this.noticeTitle.textContent = 'FACE TRAINED! READY!';
      if (this.noticeBarFill) this.noticeBarFill.style.width = '100%';
      if (this.statusDot) {
        this.statusDot.style.backgroundColor = '#00ff88';
        this.statusDot.style.boxShadow = '0 0 8px #00ff88';
      }

      setTimeout(() => {
        if (this.hudNotice && !this.isCalibrating) {
          this.hudNotice.style.display = 'none';
        }
      }, 400);

      console.log('[AI Vision] Training complete! Personalized baseline:', this.baseline);
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
        if (this.hudNotice) {
          this.hudNotice.innerHTML = 'CAM ACCESS NEEDED<br><small style="font-size:9px">Click address bar icon to allow</small>';
          this.hudNotice.style.color = '#ffaa00';
        }
        if (this.statusDot) {
          this.statusDot.style.backgroundColor = '#ffaa00';
        }
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

      if (this.hudNotice) {
        this.hudNotice.style.display = 'flex';
        this.noticeTitle.textContent = 'CONNECTING HP TRUE VISION CAM...';
      }

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
              minDetectionConfidence: 0.55,
              minTrackingConfidence: 0.55
            });

            this.faceMesh.onResults((results) => this._onFaceMeshResults(results));

            if (this.faceMesh.initialize) {
              this.faceMesh.initialize().catch(() => {});
            }
            console.log('[AI Vision] Neural FaceMesh Engine initialized in background');
          } catch (e) {
            console.warn('[AI Vision] Using native canvas CV engine:', e);
          }
        } else {
          setTimeout(checkAndSetup, 500);
        }
      };
      checkAndSetup();
    }

    _onFaceMeshResults(results) {
      if (!this.canvas || !this.ctx) return;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const now = performance.now();

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        if (!this.useMediaPipe) {
          this.useMediaPipe = true;
          console.log('[AI Vision] Upgraded to high-precision Neural FaceMesh!');
        }

        const flm = results.multiFaceLandmarks[0];

        // 1. Raw Coordinates Extraction
        const rawNoseX = 1.0 - flm[1].x; // Mirrored for natural steering
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

        // 3. Calibration Phase
        if (this.isCalibrating) {
          this.calibSamples.push({
            noseX: rawNoseX,
            noseY: rawPitch,
            yaw: rawYaw,
            mar: rawMar,
            ear: rawEar
          });

          const pct = Math.min(100, Math.floor((this.calibSamples.length / this.calibTargetCount) * 100));
          if (this.noticeBarFill) this.noticeBarFill.style.width = `${pct}%`;
          if (this.noticeTitle) this.noticeTitle.textContent = `TRAINING: ${pct}%`;

          if (this.calibSamples.length >= this.calibTargetCount) {
            this._finalizeCalibration();
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
        this.ctx.clearRect(0, 0, w, h);
        this._drawNeuralHUD(flm, w, h, deltaX, deltaY);
      } else {
        if (!this.isCalibrating) {
          this._updateSteering(false, false, false, false);
        }
      }

      this._updateMetersDisplay();
    }

    _drawNeuralHUD(flm, w, h, deltaX, deltaY) {
      const ctx = this.ctx;
      ctx.save();

      // 1. Draw Lip Landmarks in Neon Green
      ctx.strokeStyle = this.isMouthOpen ? '#00ff88' : 'rgba(0, 255, 136, 0.5)';
      ctx.lineWidth = this.isMouthOpen ? 2.5 : 1.2;
      const lipIndices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
      ctx.beginPath();
      lipIndices.forEach((idx, i) => {
        const pt = flm[idx];
        const x = (1.0 - pt.x) * w;
        const y = pt.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // 2. Draw Eye Contours in Neon Cyan
      ctx.strokeStyle = this.isEyeClosed ? '#00ffcc' : 'rgba(0, 240, 255, 0.5)';
      ctx.lineWidth = this.isEyeClosed ? 2.5 : 1.2;
      const leftEyeIndices = [33, 160, 158, 133, 153, 144];
      const rightEyeIndices = [362, 385, 387, 263, 373, 380];

      [leftEyeIndices, rightEyeIndices].forEach(indices => {
        ctx.beginPath();
        indices.forEach((idx, i) => {
          const pt = flm[idx];
          const x = (1.0 - pt.x) * w;
          const y = pt.y * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      });

      // 3. Neutral Center Crosshair & Deadzone
      const cx = w * 0.5;
      const cy = h * 0.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
      ctx.stroke();

      // Deadzone box
      const dw = this.deadzoneX * w * 2.0;
      const dh = this.deadzoneY * h * 2.0;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);
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
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00ff88';
        ctx.textAlign = 'center';
        ctx.fillText('MOUTH OPEN [Z HELD]', cx, h - 12);
      } else if (this.isEyeClosed) {
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00f0ff';
        ctx.textAlign = 'center';
        ctx.fillText('EYES CLOSED [DASH HELD]', cx, h - 12);
      }

      ctx.restore();
    }

    _cvLoop() {
      if (!this.isTracking || !this.video || this.video.paused || this.video.ended) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // Check video stream readiness
      if (this.video.readyState < 2) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // 1. Dispatch to MediaPipe asynchronously if initialized (never blocking)
      if (this.faceMesh && !this.mediaPipeSending) {
        this.mediaPipeSending = true;
        this.faceMesh.send({ image: this.video })
          .then(() => { this.mediaPipeSending = false; })
          .catch(() => { this.mediaPipeSending = false; });
      }

      // 2. If MediaPipe is active, it handles rendering in _onFaceMeshResults
      if (this.useMediaPipe) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // 3. High-Speed Illumination-Invariant Native CV Engine (Runs immediately, zero network dependencies)
      const w = this.canvas.width;
      const h = this.canvas.height;
      const now = performance.now();

      // Draw mirrored video for natural player feedback
      this.ctx.save();
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.drawImage(this.video, 0, 0, w, h);
      const frameData = this.ctx.getImageData(0, 0, w, h);
      const data = frameData.data;
      this.ctx.restore();

      // Robust skin & face centroid detection (Works in dim rooms, cool backlight, and all ethnicities)
      let sumX = 0, sumY = 0, skinCount = 0;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      const step = 4;

      for (let y = 16; y < h - 16; y += step) {
        for (let x = 16; x < w - 16; x += step) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const total = r + g + b;

          // Illumination-invariant skin & face heuristic
          const isSkin = (
            total > 45 &&
            r > 24 && g > 16 && b > 12 &&
            r >= g * 0.88 &&
            (r + g) > 1.40 * b &&
            (r - b) >= 1
          );

          if (isSkin) {
            // Center-weighted bias towards the player's face
            const dx = (x - w / 2) / (w / 2);
            const dy = (y - h / 2) / (h / 2);
            const distSq = dx * dx + dy * dy;
            const weight = distSq < 1.0 ? 1.5 : 1.0;

            sumX += x * weight;
            sumY += y * weight;
            skinCount += weight;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Fallback centroid to center if camera is dark or warming up
      let rawCx, cy;
      if (skinCount > 25) {
        rawCx = sumX / skinCount;
        cy = sumY / skinCount;
      } else {
        rawCx = w / 2;
        cy = h / 2;
      }

      // Mirrored X for mirror-camera steering
      const cx = w - rawCx;

      // Smooth centroid tracking
      this.smooth.noseX = this.smooth.noseX * 0.70 + (cx / w) * 0.30;
      this.smooth.noseY = this.smooth.noseY * 0.70 + (cy / h) * 0.30;

      // Sample mouth region (Lower center of detected face)
      const mouthY = Math.min(h - 15, Math.round(cy + 25));
      const mouthX = Math.round(rawCx);
      let mouthDarkPixels = 0;
      let mouthTotalPixels = 0;

      for (let my = mouthY - 8; my <= mouthY + 8; my += 2) {
        for (let mx = mouthX - 16; mx <= mouthX + 16; mx += 2) {
          if (mx >= 0 && mx < w && my >= 0 && my < h) {
            const idx = (my * w + mx) * 4;
            const luma = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
            if (luma < 45) mouthDarkPixels++;
            mouthTotalPixels++;
          }
        }
      }
      const mouthDarkRatio = mouthTotalPixels > 0 ? (mouthDarkPixels / mouthTotalPixels) : 0;
      this.smooth.mouthDark = this.smooth.mouthDark * 0.70 + mouthDarkRatio * 0.30;

      // Sample eye region for blink detection
      const eyeY = Math.max(10, Math.round(cy - 18));
      const eyeX1 = Math.round(rawCx - 20);
      const eyeX2 = Math.round(rawCx + 20);
      let eyeContrast = 0;
      let eyeSamples = 0;

      for (let ey = eyeY - 6; ey <= eyeY + 6; ey += 2) {
        for (let ex of [eyeX1, eyeX2]) {
          for (let offset = -8; offset <= 8; offset += 2) {
            const px = ex + offset;
            if (px > 0 && px < w - 1 && ey >= 0 && ey < h) {
              const idx1 = (ey * w + px) * 4;
              const idx2 = (ey * w + px + 1) * 4;
              const luma1 = data[idx1] * 0.299 + data[idx1 + 1] * 0.587 + data[idx1 + 2] * 0.114;
              const luma2 = data[idx2] * 0.299 + data[idx2 + 1] * 0.587 + data[idx2 + 2] * 0.114;
              eyeContrast += Math.abs(luma1 - luma2);
              eyeSamples++;
            }
          }
        }
      }
      const avgEyeContrast = eyeSamples > 0 ? (eyeContrast / eyeSamples) : 20;
      this.smooth.eyeContrast = this.smooth.eyeContrast * 0.70 + avgEyeContrast * 0.30;

      // Calibration Phase
      if (this.isCalibrating) {
        this.calibSamples.push({
          noseX: cx / w,
          noseY: cy / h,
          yaw: 0,
          mar: 0.12,
          ear: 0.28,
          mouthDark: mouthDarkRatio,
          eyeContrast: avgEyeContrast
        });

        const pct = Math.min(100, Math.floor((this.calibSamples.length / this.calibTargetCount) * 100));
        if (this.noticeBarFill) this.noticeBarFill.style.width = `${pct}%`;
        if (this.noticeTitle) this.noticeTitle.textContent = `TRAINING: ${pct}%`;

        if (this.calibSamples.length >= this.calibTargetCount) {
          this._finalizeCalibration();
        }
      } else {
        // Relative Head Steering
        const deltaX = (cx / w) - this.baseline.noseX;
        const deltaY = (cy / h) - this.baseline.noseY;

        const left = deltaX < -this.deadzoneX;
        const right = deltaX > this.deadzoneX;
        const up = deltaY < -this.deadzoneY;
        const down = deltaY > this.deadzoneY;

        this._updateSteering(up, down, left, right);

        // Relative Mouth Open Detection -> Z (Held)
        const mouthThreshold = Math.max(0.12, (this.baseline.mouthDark || 0.05) + 0.10);
        const mouthIsOpen = this.smooth.mouthDark >= mouthThreshold;

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

        // Relative Blink Detection -> Space Dash (Held)
        const blinkThreshold = Math.max(8, (this.baseline.eyeContrast || 20) * 0.65);
        const eyesAreClosed = this.smooth.eyeContrast <= blinkThreshold;
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

        // Render Native CV Visual Feedback
        this._drawNativeHUD(w, h, cx, cy, deltaX, deltaY);
      }

      this._updateMetersDisplay();
      requestAnimationFrame(() => this._cvLoop());
    }

    _drawNativeHUD(w, h, cx, cy, deltaX, deltaY) {
      const ctx = this.ctx;
      ctx.save();

      // Neutral Center Crosshairs
      const centerX = w * 0.5;
      const centerY = h * 0.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX - 15, centerY); ctx.lineTo(centerX + 15, centerY);
      ctx.moveTo(centerX, centerY - 15); ctx.lineTo(centerX, centerY + 15);
      ctx.stroke();

      // Deadzone Box
      const dw = this.deadzoneX * w * 2.0;
      const dh = this.deadzoneY * h * 2.0;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(centerX - dw / 2, centerY - dh / 2, dw, dh);
      ctx.setLineDash([]);

      // Head Position Cursor
      const hx = centerX + deltaX * w * 2.0;
      const hy = centerY + deltaY * h * 2.0;
      const inDead = Math.abs(deltaX) <= this.deadzoneX && Math.abs(deltaY) <= this.deadzoneY;

      ctx.fillStyle = inDead ? '#00f0ff' : '#ffea00';
      ctx.beginPath();
      ctx.arc(hx, hy, inDead ? 5 : 7, 0, Math.PI * 2);
      ctx.fill();

      // Face tracking target brackets
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1.5;
      const bw = 50, bh = 60;
      ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);

      // Active Gesture Banner
      if (this.isMouthOpen) {
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00ff88';
        ctx.textAlign = 'center';
        ctx.fillText('MOUTH OPEN [Z HELD]', centerX, h - 12);
      } else if (this.isEyeClosed) {
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00f0ff';
        ctx.textAlign = 'center';
        ctx.fillText('EYES CLOSED [DASH HELD]', centerX, h - 12);
      }

      ctx.restore();
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
        let pct = 0;
        if (this.useMediaPipe) {
          const delta = Math.max(0, this.smooth.mar - this.baseline.mar);
          const targetDelta = Math.max(0.01, this.mouthOpenThreshold - this.baseline.mar);
          pct = Math.min(100, Math.max(0, Math.round((delta / targetDelta) * 100)));
        } else {
          const delta = Math.max(0, this.smooth.mouthDark - (this.baseline.mouthDark || 0.05));
          const targetDelta = 0.10;
          pct = Math.min(100, Math.max(0, Math.round((delta / targetDelta) * 100)));
        }

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
          this.blinkMeterFill.style.width = '100%';
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

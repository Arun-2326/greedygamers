// webcam.js — Adaptive AI Vision Face & Gesture Controller for Neon Core: AI Arena
// Features self-training / adaptive face calibration specifically tuned to the player's face geometry.
// Automatically selects "HP True Vision FHD Camera".
// Natural Face Mode: Face stays 100% natural as per the player (no lines/meshes painted on face).
// Supports standalone detached window mode (webcam.html) via BroadcastChannel with sub-millisecond sync.
// Controls:
// - Turn left / right (Yaw)       -> Left / Right Arrow (Inverted for natural intuitive mirror movement)
// - Head up / down (Pitch)       -> Up / Down Arrow (held continuously)
// - Open mouth                   -> Z (Start Game / Confirm / Restart, held continuously)
// - Blink / eyes closed          -> Space (held continuously, triggers 2.0s burst dash)

(function () {
  class AdaptiveWebcamController {
    constructor() {
      this.isStandalone = !!window.IS_STANDALONE;
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
      this.detachedPopup = null;
      this.checkPopupTimer = null;

      // Cross-window communication channel
      this.faceChannel = null;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.faceChannel = new BroadcastChannel('neon-core-face-controller');
          this.faceChannel.onmessage = (e) => this._onChannelMessage(e.data);
        } catch (err) {
          console.warn('BroadcastChannel error:', err);
        }
      }

      // Offscreen canvas for zero-overhead background CV analysis (leaves face 100% unpainted)
      this.offCanvas = document.createElement('canvas');
      this.offCanvas.width = 160;
      this.offCanvas.height = 120;
      this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });

      // Personalized Calibration State
      this.isCalibrating = true;
      this.calibSamples = [];
      this.calibTargetCount = 28;
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

      // Smoothed filter values
      this.smooth = {
        noseX: 0.50,
        noseY: 0.50,
        yaw: 0.0,
        mar: 0.12,
        ear: 0.28,
        mouthDark: 0.08,
        eyeContrast: 20
      };

      // Relative Thresholds
      this.mouthOpenThreshold = 0.22;
      this.blinkThreshold = 0.18;
      this.deadzoneX = 0.045;
      this.deadzoneY = 0.045;

      // Action State
      this.isMouthOpen = false;
      this.lastZTime = 0;
      this.zDebounce = 350;

      this.isEyeClosed = false;
      this.eyeClosedStart = 0;
      this.lastDashTime = 0;
      this.dashCooldown = 2000;

      this.heldDirs = { up: false, down: false, left: false, right: false };

      this._initDOM();
      this._startWebcam();
      this._initMediaPipe();

      if (this.isStandalone) {
        this._broadcastGesture('cam-started', {});
        window.addEventListener('beforeunload', () => {
          this._broadcastGesture('cam-closed', {});
        });
      }
    }

    _onChannelMessage(msg) {
      if (!msg) return;
      if (!this.isStandalone) {
        if (msg.type === 'cam-started') {
          // Another window took over camera, enter detached indicator mode
          this._enterDetachedMode();
        } else if (msg.type === 'cam-closed') {
          // Standalone window closed, restore local camera
          this._exitDetachedMode();
        }
      }
    }

    _broadcastGesture(type, data) {
      const payload = Object.assign({ type, source: 'neon-core-webcam' }, data);
      if (this.faceChannel) {
        try { this.faceChannel.postMessage(payload); } catch (e) {}
      }
      if (window.opener) {
        try { window.opener.postMessage(payload, '*'); } catch (e) {}
      }
    }

    _initDOM() {
      const container = document.createElement('div');
      container.id = 'webcam-container';

      const popoutButtonHtml = this.isStandalone
        ? ''
        : `<button id="webcam-popout-btn" title="Open camera in separate window">⧉ POP OUT</button>`;

      container.innerHTML = `
        <div id="webcam-header">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;">
            <span id="webcam-status-dot"></span>
            <select id="webcam-select" title="Choose Camera"></select>
          </div>
          <button id="webcam-recalib-btn" title="Re-calibrate / Train Face Baseline">TRAIN FACE</button>
          ${popoutButtonHtml}
          ${!this.isStandalone ? `<button id="webcam-toggle-btn" title="Toggle Cam Size">_</button>` : ''}
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
      if (recalibBtn) {
        recalibBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startCalibration();
        });
      }

      // Pop-out separate window button
      const popoutBtn = document.getElementById('webcam-popout-btn');
      if (popoutBtn) {
        popoutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._popoutWindow();
        });
      }

      // Toggle minimize button
      const toggleBtn = document.getElementById('webcam-toggle-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.isMinimized = !this.isMinimized;
          container.classList.toggle('minimized', this.isMinimized);
          toggleBtn.textContent = this.isMinimized ? '□' : '_';
        });
      }
    }

    _popoutWindow() {
      const popup = window.open('webcam.html', 'NeonCoreWebcam', 'width=340,height=560,resizable=yes');
      if (popup) {
        this._enterDetachedMode(popup);
      }
    }

    _enterDetachedMode(popup) {
      if (popup) this.detachedPopup = popup;

      // Stop local camera stream to free hardware for the separate window
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
      this.isTracking = false;

      this.container.classList.add('detached');
      this.container.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00ff88;box-shadow:0 0 8px #00ff88;"></span>
          <span style="color:#00ff88;font-size:11px;font-weight:bold;">WEBCAM IN SEPARATE WINDOW</span>
        </div>
        <div style="font-size:10px;color:#94a3b8;margin-bottom:8px;">Face controls are streaming live to game</div>
        <button id="webcam-redock-btn">⬇ DOCK CAMERA BACK</button>
      `;

      const redockBtn = document.getElementById('webcam-redock-btn');
      if (redockBtn) {
        redockBtn.onclick = () => {
          if (this.detachedPopup && !this.detachedPopup.closed) {
            this.detachedPopup.close();
          }
          this._exitDetachedMode();
        };
      }

      // Check if popup closed periodically
      if (this.checkPopupTimer) clearInterval(this.checkPopupTimer);
      this.checkPopupTimer = setInterval(() => {
        if (this.detachedPopup && this.detachedPopup.closed) {
          clearInterval(this.checkPopupTimer);
          this._exitDetachedMode();
        }
      }, 1000);
    }

    _exitDetachedMode() {
      if (this.checkPopupTimer) clearInterval(this.checkPopupTimer);
      this.detachedPopup = null;
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this._initDOM();
      this._startWebcam();
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

      if (this.calibTimer) clearTimeout(this.calibTimer);
      this.calibTimer = setTimeout(() => {
        if (this.isCalibrating) {
          this._finalizeCalibration();
        }
      }, 1500);
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

      this.baseline.noseX = Number.isFinite(this.baseline.noseX) ? this.baseline.noseX : 0.50;
      this.baseline.noseY = Number.isFinite(this.baseline.noseY) ? this.baseline.noseY : 0.50;
      this.baseline.yaw = Number.isFinite(this.baseline.yaw) ? this.baseline.yaw : 0.0;
      this.baseline.mar = Number.isFinite(this.baseline.mar) ? this.baseline.mar : 0.12;
      this.baseline.ear = Number.isFinite(this.baseline.ear) ? this.baseline.ear : 0.28;
      this.baseline.mouthDark = Number.isFinite(this.baseline.mouthDark) ? this.baseline.mouthDark : 0.08;
      this.baseline.eyeContrast = Number.isFinite(this.baseline.eyeContrast) ? this.baseline.eyeContrast : 20;

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
      }, 350);
    }

    async _startWebcam() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia not supported in this browser environment');
        }

        let devices = await navigator.mediaDevices.enumerateDevices();
        let videoDevices = devices.filter(d => d.kind === 'videoinput');

        if (videoDevices.length > 0 && !videoDevices[0].label) {
          try {
            const probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            probeStream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            videoDevices = devices.filter(d => d.kind === 'videoinput');
          } catch (e) {}
        }

        let chosenDeviceId = null;
        const hpDevice = videoDevices.find(d => /hp|true\s*vision/i.test(d.label));
        const nonVirtual = videoDevices.find(d => !/motorola|virtual/i.test(d.label));

        if (hpDevice) {
          chosenDeviceId = hpDevice.deviceId;
          console.log('[AI Vision] Matched HP True Vision Camera');
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
          } catch (e) {
            console.warn('[AI Vision] Native CV engine handling tracking:', e);
          }
        } else {
          setTimeout(checkAndSetup, 500);
        }
      };
      checkAndSetup();
    }

    _onFaceMeshResults(results) {
      const now = performance.now();

      // Clear visible canvas to keep natural video feed completely unaltered
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        if (!this.useMediaPipe) {
          this.useMediaPipe = true;
          console.log('[AI Vision] Neural FaceMesh active (Natural Face Mode)');
        }

        const flm = results.multiFaceLandmarks[0];

        // 1. Raw Coordinates
        const rawNoseX = 1.0 - flm[1].x;
        const rawNoseY = flm[1].y;

        // Yaw calculation
        const dLeft = Math.abs(flm[1].x - flm[234].x);
        const dRight = Math.abs(flm[1].x - flm[454].x);
        const rawYaw = (dLeft - dRight) / Math.max(0.001, dLeft + dRight);

        // Pitch calculation
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

        // 2. Exponential Moving Average Smoothing
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

        // 4. Relative Head Steering (Inverted Left/Right for natural intuitive mirror movement)
        const deltaX = (this.smooth.noseX - this.baseline.noseX) + (this.smooth.yaw - this.baseline.yaw) * 0.45;
        const deltaY = rawPitch - this.baseline.noseY;

        const left = deltaX > this.deadzoneX;
        const right = deltaX < -this.deadzoneX;
        const up = deltaY < -this.deadzoneY;
        const down = deltaY > this.deadzoneY;

        this._updateSteering(up, down, left, right);

        // 5. Relative Mouth Open Detection -> Z Key (Held)
        const mouthIsOpen = this.smooth.mar >= this.mouthOpenThreshold;
        if (mouthIsOpen) {
          if (!this.isMouthOpen && (now - this.lastZTime) >= this.zDebounce) {
            this.lastZTime = now;
            this._triggerZ(true);
            this._flashMouthFeedback();
          } else {
            this._triggerZ(true);
          }
        } else {
          if (this.isMouthOpen) {
            this._triggerZ(false);
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
              this._triggerSpace(true);
              this._flashBlinkFeedback();
            }
          } else {
            this._triggerSpace(true);
          }
        } else {
          if (this.isEyeClosed) {
            this._triggerSpace(false);
            this.isEyeClosed = false;
          }
        }
      } else {
        if (!this.isCalibrating) {
          this._updateSteering(false, false, false, false);
        }
      }

      this._updateMetersDisplay();
    }

    _cvLoop() {
      if (!this.isTracking || !this.video || this.video.paused || this.video.ended) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      if (this.video.readyState < 2) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      if (this.faceMesh && !this.mediaPipeSending) {
        this.mediaPipeSending = true;
        this.faceMesh.send({ image: this.video })
          .then(() => { this.mediaPipeSending = false; })
          .catch(() => { this.mediaPipeSending = false; });
      }

      if (this.useMediaPipe) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // Background Offscreen Native CV Engine
      const w = 160;
      const h = 120;
      const now = performance.now();

      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }

      this.offCtx.drawImage(this.video, 0, 0, w, h);
      const frameData = this.offCtx.getImageData(0, 0, w, h);
      const data = frameData.data;

      let sumX = 0, sumY = 0, skinCount = 0;
      const step = 2;

      for (let y = 8; y < h - 8; y += step) {
        for (let x = 8; x < w - 8; x += step) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const total = r + g + b;

          const isSkin = (
            total > 45 &&
            r > 24 && g > 16 && b > 12 &&
            r >= g * 0.88 &&
            (r + g) > 1.40 * b &&
            (r - b) >= 1
          );

          if (isSkin) {
            const dx = (x - w / 2) / (w / 2);
            const dy = (y - h / 2) / (h / 2);
            const distSq = dx * dx + dy * dy;
            const weight = distSq < 1.0 ? 1.5 : 1.0;

            sumX += x * weight;
            sumY += y * weight;
            skinCount += weight;
          }
        }
      }

      let rawCx, cy;
      if (skinCount > 20) {
        rawCx = sumX / skinCount;
        cy = sumY / skinCount;
      } else {
        rawCx = w / 2;
        cy = h / 2;
      }

      const cx = w - rawCx;

      this.smooth.noseX = this.smooth.noseX * 0.70 + (cx / w) * 0.30;
      this.smooth.noseY = this.smooth.noseY * 0.70 + (cy / h) * 0.30;

      const mouthY = Math.min(h - 8, Math.round(cy + 13));
      const mouthX = Math.round(rawCx);
      let mouthDarkPixels = 0;
      let mouthTotalPixels = 0;

      for (let my = mouthY - 4; my <= mouthY + 4; my += 2) {
        for (let mx = mouthX - 8; mx <= mouthX + 8; mx += 2) {
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

      const eyeY = Math.max(5, Math.round(cy - 9));
      const eyeX1 = Math.round(rawCx - 10);
      const eyeX2 = Math.round(rawCx + 10);
      let eyeContrast = 0;
      let eyeSamples = 0;

      for (let ey = eyeY - 3; ey <= eyeY + 3; ey += 2) {
        for (let ex of [eyeX1, eyeX2]) {
          for (let offset = -4; offset <= 4; offset += 2) {
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
        const deltaX = (cx / w) - this.baseline.noseX;
        const deltaY = (cy / h) - this.baseline.noseY;

        const left = deltaX > this.deadzoneX;
        const right = deltaX < -this.deadzoneX;
        const up = deltaY < -this.deadzoneY;
        const down = deltaY > this.deadzoneY;

        this._updateSteering(up, down, left, right);

        const mouthThreshold = Math.max(0.12, (this.baseline.mouthDark || 0.05) + 0.10);
        const mouthIsOpen = this.smooth.mouthDark >= mouthThreshold;

        if (mouthIsOpen) {
          if (!this.isMouthOpen && (now - this.lastZTime) >= this.zDebounce) {
            this.lastZTime = now;
            this._triggerZ(true);
            this._flashMouthFeedback();
          } else {
            this._triggerZ(true);
          }
        } else {
          if (this.isMouthOpen) {
            this._triggerZ(false);
          }
        }
        this.isMouthOpen = mouthIsOpen;

        const blinkThreshold = Math.max(8, (this.baseline.eyeContrast || 20) * 0.65);
        const eyesAreClosed = this.smooth.eyeContrast <= blinkThreshold;
        const dashRemaining = Math.max(0, (this.dashCooldown - (now - this.lastDashTime)) / 1000);

        if (eyesAreClosed) {
          if (!this.isEyeClosed) {
            this.isEyeClosed = true;
            this.eyeClosedStart = now;
            if (dashRemaining <= 0) {
              this.lastDashTime = now;
              this._triggerSpace(true);
              this._flashBlinkFeedback();
            }
          } else {
            this._triggerSpace(true);
          }
        } else {
          if (this.isEyeClosed) {
            this._triggerSpace(false);
            this.isEyeClosed = false;
          }
        }
      }

      this._updateMetersDisplay();
      requestAnimationFrame(() => this._cvLoop());
    }

    _updateSteering(up, down, left, right) {
      this.heldDirs = { up, down, left, right };

      // Local input manager
      if (window.input && window.input.setWebcamDirection) {
        window.input.setWebcamDirection(up, down, left, right);
      }

      // Cross-window sync (Broadcast to game window)
      this._broadcastGesture('steer', { up, down, left, right });

      const elL = document.getElementById('steer-left');
      const elU = document.getElementById('steer-up');
      const elD = document.getElementById('steer-down');
      const elR = document.getElementById('steer-right');

      if (elL) elL.classList.toggle('active', left);
      if (elU) elU.classList.toggle('active', up);
      if (elD) elD.classList.toggle('active', down);
      if (elR) elR.classList.toggle('active', right);
    }

    _triggerZ(isHeld) {
      if (window.input && window.input.setWebcamZ) {
        window.input.setWebcamZ(isHeld);
      }
      this._broadcastGesture('z', { isHeld });
    }

    _triggerSpace(isHeld) {
      if (window.input && window.input.setWebcamSpace) {
        window.input.setWebcamSpace(isHeld);
      }
      this._broadcastGesture('space', { isHeld });
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

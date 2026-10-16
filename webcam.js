// webcam.js — In-Browser AI Vision Face & Gesture Controller for Neon Core: AI Arena
// Integrates live webcam feed directly into the browser window.
// Tracks:
// 1. Head / Face Position -> Arrow Keys (Up, Down, Left, Right)
// 2. Mouth Open Gesture   -> Z Key (Start / Confirm / Pause / Restart)
// 3. Eye Blink Gesture    -> Space Key (Neon Surge Dash, 2.0s cooldown)
// Includes zero-dependency offline Computer Vision engine + dynamic MediaPipe FaceMesh upgrade.

(function () {
  class InBrowserWebcamController {
    constructor() {
      this.video = null;
      this.canvas = null;
      this.ctx = null;
      this.stream = null;
      this.isTracking = false;
      this.isMinimized = false;
      this.useMediaPipe = false;
      this.faceMesh = null;

      // Tracking state
      this.mar = 0.0;
      this.ear = 0.30;
      this.mouthOpenThreshold = 0.36;
      this.blinkThreshold = 0.20;

      this.isMouthOpen = false;
      this.lastZTime = 0;
      this.zDebounce = 450; // ms

      this.isEyeClosed = false;
      this.eyeClosedStart = 0;
      this.lastDashTime = 0;
      this.dashCooldown = 2000; // ms (Rule 1 & 3: >= 2.0s cooldown)

      this.heldDirs = { up: false, down: false, left: false, right: false };

      // Deadzone thresholds (normalized 0.0 - 1.0)
      this.dzXMin = 0.40;
      this.dzXMax = 0.60;
      this.dzYMin = 0.40;
      this.dzYMax = 0.60;

      // Offline CV tracker state
      this.prevFrame = null;
      this.baselineFaceLuma = 0;

      this._initDOM();
      this._startWebcam();
      this._attemptLoadMediaPipe();
    }

    _initDOM() {
      // Create PIP Container
      const container = document.createElement('div');
      container.id = 'webcam-container';
      container.innerHTML = `
        <div id="webcam-header">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
            <span id="webcam-status-dot"></span>
            <select id="webcam-select" title="Choose Camera"></select>
          </div>
          <button id="webcam-toggle-btn" title="Toggle Cam Size">_</button>
        </div>
        <div id="webcam-video-wrap">
          <video id="webcam-video" autoplay playsinline muted></video>
          <canvas id="webcam-canvas" width="320" height="240"></canvas>
          <div id="webcam-hud-notice">INITIALIZING HP TRUE VISION CAM...</div>
        </div>
        <div id="webcam-footer">
          <div id="webcam-metrics">
            <span id="metric-mouth">MOUTH: 0.00 [Z]</span>
            <span id="metric-blink">EYES: 0.30 [DASH]</span>
          </div>
          <div id="webcam-steer-indicators">
            <span class="steer-arrow" id="steer-left">&ltrif; LEFT</span>
            <span class="steer-arrow" id="steer-up">&utrif; UP</span>
            <span class="steer-arrow" id="steer-down">&dtrif; DOWN</span>
            <span class="steer-arrow" id="steer-right">&rtrif; RIGHT</span>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      this.container = container;
      this.video = document.getElementById('webcam-video');
      this.canvas = document.getElementById('webcam-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.hudNotice = document.getElementById('webcam-hud-notice');
      this.metricMouth = document.getElementById('metric-mouth');
      this.metricBlink = document.getElementById('metric-blink');
      this.statusDot = document.getElementById('webcam-status-dot');
      this.deviceSelect = document.getElementById('webcam-select');

      // Toggle minimize button
      const toggleBtn = document.getElementById('webcam-toggle-btn');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isMinimized = !this.isMinimized;
        container.classList.toggle('minimized', this.isMinimized);
        toggleBtn.textContent = this.isMinimized ? '□' : '_';
      });
    }

    async _startWebcam() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia not supported in this browser environment');
        }

        // 1. Initial permission probe if labels are hidden
        let devices = await navigator.mediaDevices.enumerateDevices();
        let videoDevices = devices.filter(d => d.kind === 'videoinput');

        if (videoDevices.length > 0 && !videoDevices[0].label) {
          try {
            const probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            probeStream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            videoDevices = devices.filter(d => d.kind === 'videoinput');
          } catch (probeErr) {
            console.warn('[Webcam] Probe notice:', probeErr);
          }
        }

        // 2. Select HP True Vision camera as high priority
        let chosenDeviceId = null;
        const hpDevice = videoDevices.find(d => /hp|true\s*vision/i.test(d.label));
        const nonVirtual = videoDevices.find(d => !/motorola|virtual/i.test(d.label));

        if (hpDevice) {
          chosenDeviceId = hpDevice.deviceId;
          console.log('[Webcam] Auto-selected HP True Vision Camera:', hpDevice.label);
        } else if (nonVirtual) {
          chosenDeviceId = nonVirtual.deviceId;
          console.log('[Webcam] Selected physical non-virtual camera:', nonVirtual.label);
        } else if (videoDevices.length > 1) {
          chosenDeviceId = videoDevices[1].deviceId; // Index 1 is typically physical when 0 is virtual
        } else if (videoDevices.length > 0) {
          chosenDeviceId = videoDevices[0].deviceId;
        }

        // Populate camera dropdown
        this._populateCameraDropdown(videoDevices, chosenDeviceId);

        // 3. Connect to chosen camera
        await this._connectStream(chosenDeviceId);

      } catch (err) {
        console.warn('Webcam initialization notice:', err);
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
        opt.textContent = 'No cameras found';
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
        console.log('[Webcam] User manually switched to camera:', this.deviceSelect.value);
        await this._connectStream(this.deviceSelect.value);
      };
    }

    async _connectStream(deviceId) {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }

      this.hudNotice.style.display = 'flex';
      this.hudNotice.textContent = 'CONNECTING CAMERA...';

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
        this.hudNotice.style.display = 'none';
        this.statusDot.style.backgroundColor = '#00ff88';
        this.statusDot.style.boxShadow = '0 0 8px #00ff88';

        if (!this.cvLoopStarted) {
          this.cvLoopStarted = true;
          requestAnimationFrame(() => this._cvLoop());
        }
      };
    }

    _attemptLoadMediaPipe() {
      // Dynamically load MediaPipe FaceMesh CDN
      const scriptMesh = document.createElement('script');
      scriptMesh.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
      scriptMesh.crossOrigin = 'anonymous';

      scriptMesh.onload = () => {
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
            console.log('[AI Vision] MediaPipe FaceMesh loaded successfully!');
          } catch (e) {
            console.warn('[AI Vision] Falling back to native canvas CV engine:', e);
          }
        }
      };

      scriptMesh.onerror = () => {
        console.log('[AI Vision] CDN offline. Running high-speed native canvas CV engine.');
      };

      document.head.appendChild(scriptMesh);
    }

    _onFaceMeshResults(results) {
      if (!this.canvas || !this.ctx) return;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const now = performance.now();

      this.ctx.clearRect(0, 0, w, h);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const flm = results.multiFaceLandmarks[0];

        // 1. Head Steering: Head Up/Down (Pitch) and Turn Left/Right (Yaw)
        // Nose tip: Landmark 1; Left cheek: Landmark 234; Right cheek: Landmark 454; Eye line: 168; Chin: 152
        const rawNoseX = flm[1].x;
        const noseX = 1.0 - rawNoseX; // Mirrored
        const noseY = flm[1].y;

        const nx = noseX * w;
        const ny = noseY * h;

        // Yaw calculation: Turn Left / Turn Right
        const dLeft = Math.abs(flm[1].x - flm[234].x);
        const dRight = Math.abs(flm[1].x - flm[454].x);
        const yawRatio = (dLeft - dRight) / Math.max(0.001, dLeft + dRight);

        // Turn left: yawRatio < -0.16 OR nose moved left
        // Turn right: yawRatio > 0.16 OR nose moved right
        const left = (yawRatio < -0.16) || (noseX < this.dzXMin);
        const right = (yawRatio > 0.16) || (noseX > this.dzXMax);

        // Pitch calculation: Head Up / Head Down
        const eyeY = flm[168].y;
        const chinY = flm[152].y;
        const noseRelY = (flm[1].y - eyeY) / Math.max(0.001, chinY - eyeY);

        // Head up: nose closer to eyes (< 0.36) OR nose moved up
        // Head down: nose farther from eyes (> 0.64) OR nose moved down
        const up = (noseRelY < 0.36) || (noseY < this.dzYMin);
        const down = (noseRelY > 0.64) || (noseY > this.dzYMax);

        // Holding a gesture holds the arrow key continuously
        this._updateSteering(up, down, left, right);

        // 2. Open mouth -> Z (holding mouth open holds Z)
        // Landmarks: 13 (upper inner lip), 14 (lower inner lip), 61 (left corner), 291 (right corner)
        const lipDist = Math.hypot(flm[13].x - flm[14].x, flm[13].y - flm[14].y);
        const mouthWidth = Math.hypot(flm[61].x - flm[291].x, flm[61].y - flm[291].y);
        this.mar = lipDist / Math.max(0.001, mouthWidth);

        const mouthIsOpen = this.mar >= this.mouthOpenThreshold;
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

        // 3. Blink -> Space (holding blink holds Space, fresh press triggers dash)
        // Left eye: 159, 145, 33, 133; Right eye: 386, 374, 362, 263
        const earLeft = Math.hypot(flm[159].x - flm[145].x, flm[159].y - flm[145].y) /
                        Math.max(0.001, Math.hypot(flm[33].x - flm[133].x, flm[33].y - flm[133].y));
        const earRight = Math.hypot(flm[386].x - flm[374].x, flm[386].y - flm[374].y) /
                         Math.max(0.001, Math.hypot(flm[362].x - flm[263].x, flm[362].y - flm[263].y));
        this.ear = (earLeft + earRight) / 2.0;

        const dashRemaining = Math.max(0, (this.dashCooldown - (now - this.lastDashTime)) / 1000);
        const eyesAreClosed = this.ear < this.blinkThreshold;

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

        // Draw HUD overlay
        this._drawOverlayHUD(nx, ny, w, h);
      } else {
        this._updateSteering(false, false, false, false);
        if (window.input) {
          window.input.setWebcamZ(false);
          window.input.setWebcamSpace(false);
        }
      }

      this._updateMetricsDisplay();
    }

    // Native Computer Vision Engine (runs offline with zero CDN dependencies)
    _cvLoop() {
      if (!this.isTracking || !this.video || this.video.paused || this.video.ended) {
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // If MediaPipe is active, send frame to FaceMesh
      if (this.useMediaPipe && this.faceMesh) {
        this.faceMesh.send({ image: this.video }).catch(() => {});
        requestAnimationFrame(() => this._cvLoop());
        return;
      }

      // Offline Native Centroid & Optical Engine
      const w = this.canvas.width;
      const h = this.canvas.height;
      const now = performance.now();

      this.ctx.drawImage(this.video, 0, 0, w, h);
      const frameData = this.ctx.getImageData(0, 0, w, h);
      const data = frameData.data;

      let sumX = 0;
      let sumY = 0;
      let skinCount = 0;

      // Fast scan for face/skin centroid
      for (let y = 20; y < h - 20; y += 4) {
        for (let x = 20; x < w - 20; x += 4) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Normalized skin tone heuristic
          if (r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 12) {
            sumX += x;
            sumY += y;
            skinCount++;
          }
        }
      }

      this.ctx.clearRect(0, 0, w, h);

      if (skinCount > 80) {
        const rawCx = sumX / skinCount;
        const cy = sumY / skinCount;
        // Mirror X
        const cx = w - rawCx;

        const normX = cx / w;
        const normY = cy / h;

        const up = normY < this.dzYMin;
        const down = normY > this.dzYMax;
        const left = normX < this.dzXMin;
        const right = normX > this.dzXMax;

        this._updateSteering(up, down, left, right);

        // Native Mouth Region Analysis (lower middle of face centroid)
        const mouthAreaY = Math.min(h - 25, Math.floor(cy + 25));
        const mouthAreaX = Math.floor(rawCx);

        let mouthLuma = 0;
        let mouthPixels = 0;
        for (let dy = -8; dy <= 8; dy += 2) {
          for (let dx = -14; dx <= 14; dx += 2) {
            const py = mouthAreaY + dy;
            const px = mouthAreaX + dx;
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const pIdx = (py * w + px) * 4;
              mouthLuma += (data[pIdx] * 0.299 + data[pIdx + 1] * 0.587 + data[pIdx + 2] * 0.114);
              mouthPixels++;
            }
          }
        }

        const avgMouthLuma = mouthPixels > 0 ? (mouthLuma / mouthPixels) : 100;
        if (!this.baselineFaceLuma) this.baselineFaceLuma = avgMouthLuma;
        else this.baselineFaceLuma = this.baselineFaceLuma * 0.98 + avgMouthLuma * 0.02;

        // Mouth opening causes darker cavity (sharp drop in lower-face luminance)
        const mouthOpenRatio = Math.max(0, (this.baselineFaceLuma - avgMouthLuma) / Math.max(1, this.baselineFaceLuma));
        this.mar = mouthOpenRatio * 1.6;

        if (this.mar >= this.mouthOpenThreshold) {
          if (!this.isMouthOpen && (now - this.lastZTime) >= this.zDebounce) {
            this.lastZTime = now;
            if (window.input) window.input.triggerWebcamZ();
            this._flashMouthFeedback();
          }
          this.isMouthOpen = true;
        } else {
          if (this.isMouthOpen) {
            if (window.input) window.input.releaseWebcamZ();
          }
          this.isMouthOpen = false;
        }

        this._drawOverlayHUD(cx, cy, w, h);
      } else {
        this._updateSteering(false, false, false, false);
      }

      this._updateMetricsDisplay();
      requestAnimationFrame(() => this._cvLoop());
    }

    _updateSteering(up, down, left, right) {
      this.heldDirs = { up, down, left, right };
      if (window.input && window.input.setWebcamDirection) {
        window.input.setWebcamDirection(up, down, left, right);
      }

      // Update HUD arrows
      document.getElementById('steer-left').classList.toggle('active', left);
      document.getElementById('steer-up').classList.toggle('active', up);
      document.getElementById('steer-down').classList.toggle('active', down);
      document.getElementById('steer-right').classList.toggle('active', right);
    }

    _drawOverlayHUD(targetX, targetY, w, h) {
      const ctx = this.ctx;

      // 1. Center Deadzone Box
      const dzX = this.dzXMin * w;
      const dzY = this.dzYMin * h;
      const dzW = (this.dzXMax - this.dzXMin) * w;
      const dzH = (this.dzYMax - this.dzYMin) * h;

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(dzX, dzY, dzW, dzH);
      ctx.setLineDash([]);

      ctx.font = '10px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.textAlign = 'center';
      ctx.fillText('DEADZONE', w / 2, dzY + 14);

      // 2. Target Cursor on Face/Nose
      const inDeadzone = targetX >= dzX && targetX <= (dzX + dzW) && targetY >= dzY && targetY <= (dzY + dzH);
      const cursorColor = inDeadzone ? '#00f0ff' : '#ffea00';

      ctx.strokeStyle = cursorColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetX, targetY, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = cursorColor;
      ctx.beginPath();
      ctx.arc(targetX, targetY, 3, 0, Math.PI * 2);
      ctx.fill();

      // 3. Mouth Open Active Feedback
      if (this.isMouthOpen) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(targetX, targetY + 28, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#00ff88';
        ctx.textAlign = 'center';
        ctx.fillText('MOUTH OPEN [Z]', targetX, targetY + 54);
      }

      ctx.restore();
    }

    _flashMouthFeedback() {
      if (this.metricMouth) {
        this.metricMouth.style.color = '#00ff88';
        this.metricMouth.style.fontWeight = 'bold';
        setTimeout(() => {
          this.metricMouth.style.color = '#00f0ff';
          this.metricMouth.style.fontWeight = 'normal';
        }, 300);
      }
    }

    _flashBlinkFeedback() {
      if (this.metricBlink) {
        this.metricBlink.style.color = '#ffea00';
        this.metricBlink.style.fontWeight = 'bold';
        setTimeout(() => {
          this.metricBlink.style.color = '#00f0ff';
          this.metricBlink.style.fontWeight = 'normal';
        }, 300);
      }
    }

    _updateMetricsDisplay() {
      const now = performance.now();
      const dashRemaining = Math.max(0, (this.dashCooldown - (now - this.lastDashTime)) / 1000);

      if (this.metricMouth) {
        const mouthStatus = this.mar >= this.mouthOpenThreshold ? ' [TRIGGER Z]' : '';
        this.metricMouth.textContent = `MOUTH: ${this.mar.toFixed(2)}${mouthStatus}`;
      }

      if (this.metricBlink) {
        const dashStatus = dashRemaining > 0 ? ` (${dashRemaining.toFixed(1)}s)` : ' [DASH READY]';
        this.metricBlink.textContent = `EYES: ${this.ear.toFixed(2)}${dashStatus}`;
      }
    }
  }

  // Auto-initialize when window loads
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.webcamController = new InBrowserWebcamController();
    });
  } else {
    window.webcamController = new InBrowserWebcamController();
  }
})();

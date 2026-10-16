# Neon Core: AI Arena 🎮

An endless 2D cyber arcade survival game where you pilot an aerodynamic glowing cyber arrow, collect energy cores, and survive against adaptive security drones executing curved pursuit sweeps and high-speed dashes.

Built for the Game Jam under strict **AGENTS.md** competition constraints.

---

## Quick Start (How to Run)

The game is built with pure client-side HTML5 Canvas and Vanilla JavaScript. It requires **no server, build tools, or internet connection**.

### Option 1: Direct in Browser (Easiest)
Simply open `index.html` directly in any web browser (Chrome, Edge, Firefox, Brave):
- Double-click `index.html` in your file explorer, OR
- In PowerShell, run:
  ```powershell
  Start-Process index.html
  ```

### Option 2: Local Static Server (Optional)
If you prefer running via a local web server:
- Python:
  ```bash
  python -m http.server 8000
  ```
- Node / npx:
  ```bash
  npx serve .
  ```
Then visit `http://localhost:8000`.

---

## Controls (Strictly Six Keys Only)

In strict adherence to **AGENTS.md Rule 1**, the game is playable solely using these six keyboard controls (No WASD, Escape, or extra keys):

| Key | Action |
|---|---|
| **Up Arrow** | Move up (continuous movement while held) |
| **Down Arrow** | Move down (continuous movement while held) |
| **Left Arrow** | Move left (continuous movement while held) |
| **Right Arrow** | Move right (continuous movement while held) |
| **Z** | Confirm / Start Game / Pause & Resume Toggle / Restart |
| **Space** | Neon Surge Dash (2.0s cooldown, secondary dodge, safe action) |

- **Diagonals**: Holding two perpendicular arrows simultaneously moves and steers diagonally.
- **Speedy Cyber Arrow Flight**: High-speed propulsion (`315 px/s` cruising, `772 px/s` dash burst) with sharpened steering response.
- **Pause & Resume**: Pressing **`Z`** during active gameplay pauses the game safely; pressing **`Z`** again resumes play. The game also automatically pauses if the browser window loses focus (`blur`).
- **High-Tension Difficulty**: Post-hit recovery window tuned to 1.0s, requiring quick reflexive maneuvering to evade multi-hunter pincers.

---

## Endless Survival & High-Tension Mechanics

1. **Endless Survival Mode**:
   - The game no longer ends on a timer cut-off. Survive as long as you can while your `SURVIVED: MM:SS` counter and score climb!
2. **Dual-Role Hunter Pincer AI (Current + Predictive)**:
   - **Current Position Hunters (`Scout Alpha` & `Viper Phantom`)**: Lock directly onto your current coordinates and curve inward in flanking arcs to flush you out.
   - **Predictive Intercept Hunters (`Hunter Omega` & `Titan Overlord`)**: Calculate your real-time heading and velocity vector to cut off your projected escape path ahead of time!
   - Together, they execute coordinated **Pincer Traps** designed to raise player heart rate!
3. **Scaling Multi-Square Predictive AI Sector Lockdown**:
   - The AI continuously trains on your movement velocity, vector projection, and sector transition habits.
   - **Scales with Score & Threat**: Locks down **1 square** initially, escalating to **2 squares** at 1,200 pts, **3 squares** at 2,800 pts, and up to **4 simultaneous hazard zones** at 4,500+ pts!
   - Each square locks on with an animated **1.25s advance telegraph** (`AI SECTOR LOCK [1.2s]`).
   - The squares snap shut into electrified **`[!! HAZARD LOCKDOWN !!]`** zones for 3.0 seconds.
   - Breaking free of the predicted squares before they lock down awards **`PREDICTION EVADED! +300`** per square!
4. **Curved Pursuit Flanking Arcs**:
   - Drones calculate **Quadratic Bezier Arcs** that flank around the arena with 1.25s telegraphs before striking.
5. **Hunter Speed Dashes**:
   - Hunter drones telegraph an attack vector with rotating lock-on reticles (`CURRENT TARGET LOCKED` vs `PREDICTED ESCAPE LOCKED`), then surge forward at **2.5x speed** with crimson shockwaves!
6. **Adrenaline Evasion Rewards**:
   - `DASH EVADED! +250`: Dodging a single charging hunter.
   - `PREDICTION EVADED! +300`: Outsmarting and escaping the AI's predicted sector lockdown!
   - `PINCER EVADED! +400`: Slipping through the jaws of multiple converging hunters!
7. **5 Escalating Threat Levels & 4 Enemy Classes**:
   - **Level 1 (0 – 800 pts)**: Scout Protocol (Perimeter loops + regional AI bias).
   - **Level 2 (800 – 1800 pts)**: Intercept Seekers (Curved predictive tracking).
   - **Level 3 (1800 – 3200 pts)**: Apex Predator (Continuous curved sweeps & hunter dashes).
   - **Level 4 (3200 – 5000 pts)**: Viper Squadron (`Viper Phantom` joins with rapid cross-cutting arcs).
   - **Level 5 (5000+ pts)**: Omega Matrix (`Titan Overlord` joins; all 4 drones execute multi-angle pursuit dashes).
8. **Procedural Web Audio Heartbeat & Audio Synthesizer**:
   - Accelerating synth pulse matching threat level, plus dynamic warning chirps and lockdown impact slams.

---

## Optional: AI Vision Gesture Controller (Hands-Free Play) 🖐️

For demonstrations or hands-free gameplay, a standalone **AI Vision Gesture Bridge** is included (`gesture_controller.py`). It uses your webcam to detect hand gestures and converts them into hardware keyboard events, preserving **100% compliance with AGENTS.md rules**:

### How to Run the Gesture Controller
1. Double-click `start_gesture_control.bat` (or run `python gesture_controller.py`).
2. Focus the game in your browser window.
3. Use the following hand gestures in front of your webcam:

| Gesture | Emulated Key | Action in Game |
|---|---|---|
| **Shift Hand Outside Deadzone** | `Arrow Keys` | Continuous directional steering (diagonals supported) |
| **Hand Inside Center Box** | *None* | Neutral deadzone / safe drift |
| **Mouth Open (or Fist / Pinch)** | `Z` | Start / Confirm / Resume / Restart |
| **Eye Blink (or Spread Palm)** | `Space` | Neon Surge Dash (2.0s cooldown) |

*Press `q` or `Esc` in the camera window to safely quit the gesture bridge.*

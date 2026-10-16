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
| **Space** | Neon Surge Dash (2.2s cooldown, secondary dodge, safe action) |

- **Diagonals**: Holding two perpendicular arrows simultaneously moves and steers diagonally.
- **Player Arrow**: An aerodynamic delta-wing cyber arrow with animated dual thruster plumes that rotates smoothly toward your movement heading.
- **Pause & Resume**: Pressing **`Z`** during active gameplay pauses the game safely; pressing **`Z`** again resumes play. The game also automatically pauses if the browser window loses focus (`blur`).

---

## Endless Survival & High-Tension Mechanics

1. **Endless Survival Mode**:
   - The game no longer ends on a timer cut-off. Survive as long as you can while your `SURVIVED: MM:SS` counter and score climb!
2. **Curved Pursuit Flanking Arcs**:
   - Drones no longer track only in straight lines. They calculate **Quadratic Bezier Arcs** that flank around the arena to cut off your escape routes!
3. **Hunter Speed Dashes**:
   - Hunter drones telegraph a curved attack vector with a rotating lock-on reticle for 1.25 seconds, then explode forward at **2.4x speed** with crimson shockwaves!
4. **"Dash Evaded" Adrenaline Reward**:
   - Slipping past a high-speed charging drone awards `DASH EVADED! +250` bonus score and spark effects!
5. **5 Escalating Threat Levels & 4 Enemy Classes**:
   - **Level 1 (0 – 800 pts)**: Scout Protocol (Perimeter loops + regional AI bias).
   - **Level 2 (800 – 1800 pts)**: Intercept Seekers (Curved predictive tracking).
   - **Level 3 (1800 – 3200 pts)**: Apex Predator (Continuous curved sweeps & hunter dashes).
   - **Level 4 (3200 – 5000 pts)**: Viper Squadron (`Viper Phantom` joins with rapid cross-cutting arcs).
   - **Level 5 (5000+ pts)**: Omega Matrix (`Titan Overlord` joins; all 4 drones execute multi-angle pursuit dashes).
6. **Procedural Web Audio Heartbeat**:
   - Accelerating synth pulse that matches the escalating threat level.

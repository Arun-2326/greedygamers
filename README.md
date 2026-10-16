# Neon Core: AI Arena 🎮

A futuristic 2D arcade survival game where you pilot an aerodynamic glowing cyber arrow, collect energy cores, and survive against security drones whose patrol routes dynamically adapt to your movement habits.

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

In strict adherence to **AGENTS.md Rule 1**, the game is playable solely using these six keyboard controls (No Escape, WASD, or extra keys):

| Key | Action |
|---|---|
| **Up Arrow** | Move up (continuous movement while held) |
| **Down Arrow** | Move down (continuous movement while held) |
| **Left Arrow** | Move left (continuous movement while held) |
| **Right Arrow** | Move right (continuous movement while held) |
| **Z** | Confirm / Start Game / Pause & Resume Toggle / Restart |
| **Space** | Neon Surge Dash (2.2s cooldown, secondary dodge, safe action) |

- **Diagonals**: Holding two perpendicular arrows simultaneously moves and steers diagonally.
- **Player Arrow**: The player is rendered as a sleek delta-wing cyber arrow with animated dual thruster plumes that smoothly turn toward your movement direction.
- **Pause & Resume**: Pressing **`Z`** during active gameplay pauses the game safely; pressing **`Z`** again resumes play. The game also automatically pauses if the browser window loses focus (`blur`).

---

## 5 Escalating Threat Levels & 4 Enemy Classes

As your score increases or the countdown timer advances, the AI arena activates higher security tiers and deploys additional hunters:

1. **Level 1 — Scout Protocol (Score 0 – 600)**:
   - 2 Drones: `Scout Alpha` & `Hunter Omega`.
   - Baseline perimeter loops with subtle heatmap bias (Speed: 112 px/s).
2. **Level 2 — Intercept Seekers (Score 600 – 1400)**:
   - `Hunter Omega` initiates **Predictive Tracking**, projecting a crimson targeting laser toward where you are steering (Speed: 128 px/s).
3. **Level 3 — Apex Predator (Score 1400 – 2400)**:
   - Continuous lock-on charges, flanking sweeps, and escalating heartbeat audio (Speed: 145 px/s).
4. **Level 4 — Viper Squadron (Score 2400 – 3800)**:
   - **3rd Enemy Deployed**: `Viper Phantom` (sleek purple drone) joins the arena with high-speed triangular cross-cutting attacks (Speed: 162 px/s).
5. **Level 5 — Omega Matrix (Score 3800+ or Final 30s)**:
   - **4th Enemy Deployed**: `Titan Overlord` (heavy golden-red containment drone) locks down the central core with dual-zone sweeps (Speed: 180 px/s).

*Fair Play Guarantee*: All drone charges are telegraphed 1.35 seconds in advance with high-contrast laser lines and rotating floor reticles (Rule 3 compliant, >= 1.0s reaction time).

---

## High-Octane Addictive Features

- **"Close Call" Adrenaline Reward**: Dodging inches away from a charging drone awards `CLOSE CALL! +150` bonus score and sparks.
- **Escalating Heartbeat Audio**: Procedural Web Audio synth heartbeat accelerating from Level 1 up to Level 5.
- **Combo Multiplier Flow (Up to 5x)**: Rapid core pickups trigger ascending musical bell arpeggios and golden player auras.
- **Overdrive EMP Cores**: Rare magenta cores that disable drone tracking and slow all drones by 50% for 4 seconds!
- **Persistent All-Time High Score**: Automatically recorded and displayed across all screens.

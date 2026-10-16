# Neon Core: AI Arena 🎮

A futuristic 2D arcade survival game where you pilot a glowing neon player, collect energy cores, and survive against security drones whose patrol routes dynamically adapt to your movement habits.

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

In strict adherence to **AGENTS.md Rule 1**, the game is playable solely using these six keyboard controls:

| Key | Action |
|---|---|
| **Up Arrow** | Move up (continuous movement while held) |
| **Down Arrow** | Move down (continuous movement while held) |
| **Left Arrow** | Move left (continuous movement while held) |
| **Right Arrow** | Move right (continuous movement while held) |
| **Z** | Confirm / Start Game / Restart (fresh press required) |
| **Space** | Neon Surge Dash (2.2s cooldown, secondary dodge, safe action) |

- **Diagonals**: Holding two perpendicular arrows simultaneously moves diagonally.
- **No mouse/touch/buttons**: Zero clickable buttons, gestures, or extra keys.

---

## High-Octane Addictive Features

1. **Combo Multiplier Flow (Up to 5x)**:
   - Collecting cores in quick succession builds a Combo Multiplier (`x1` up to `x5 MAX`).
   - Earn massive bonus points and hear escalating harmonic musical pickup chimes!
2. **Rare Overdrive Cores & EMP Slowdown**:
   - Every 5th core can be a glowing magenta **Overdrive Core**.
   - Grants +400 bonus points and triggers an **EMP blast** that slows security drones by 35% for 3.5 seconds.
3. **Neon Surge Dash (`Space` key)**:
   - Hit `Space` to burst forward, dodging close calls and leaving sonic shockwaves.
   - Strictly obeys AGENTS.md with a 2.2-second cooldown and zero harmful accidental press consequences.
4. **Procedural Web Audio (Zero External Files)**:
   - Dynamic retro sci-fi synthesizers built right into the browser via Web Audio API.
5. **High Score Tracker**:
   - Automatically saves and tracks your all-time high score in `localStorage`.
6. **Integrity & Repair**:
   - 5 integrity segments with forgiving 2.4-second invulnerability protection.
   - Every 4th core collected repairs 1 missing integrity segment.
7. **Deterministic Adaptive AI**:
   - Samples player positions every 0.5s in an 8×5 arena grid.
   - Nudges drone patrol waypoints toward your frequent spots (capped at 64px) with clear 1.35s advance route warning indicators.

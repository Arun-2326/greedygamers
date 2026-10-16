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
| **Space** | Reserved secondary action (safe, no gameplay penalties) |

- **Diagonals**: Holding two perpendicular arrows simultaneously moves diagonally.
- **No mouse/touch/buttons**: There are zero clickable buttons, gestures, or extra keys.

---

## Gameplay & Features

1. **Energy Core Collection**:
   - Move around the arena to pick up glowing amber cores. Each core gives +100 points.
2. **Integrity & Repair**:
   - Start with 5 integrity segments.
   - Touching a security drone depletes 1 segment and triggers a 2.4-second invulnerability protection period.
   - Every 4th core collected restores 1 lost integrity segment!
3. **Deterministic Adaptive AI**:
   - The game samples your position every 0.5 seconds into a rolling 40-sample window.
   - An 8×5 grid evaluates your most frequented area and gently biases drone waypoints toward that region (capped at 64px displacement).
   - Drones project a 1.35-second magenta route warning indicator before advancing along any segment, providing ample reaction time.
4. **Win / Survival Objective**:
   - Survive the arena for 2 minutes and 30 seconds (`02:30`) to achieve `SURVIVAL COMPLETE!`, or try to score as high as possible before losing all integrity.

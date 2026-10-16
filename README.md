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

## High-Octane Escalating Tension & Addictive Features

1. **Escalating Threat Levels & Player Tracking**:
   - **Level 1 (Scout Surveillance, Score 0-650)**: Drones patrol regional loops with subtle AI heatmap nudges (115 px/s).
   - **Level 2 (Intercept Seekers, Score 650-1700)**: Hunter drones begin predicting your movement vector and locking onto your position with a targeting laser (138 px/s).
   - **Level 3 (Apex Predator Hunt, Score 1700+)**: Aggressive multi-drone coordination where drones constantly target and charge your trajectory (160 px/s).
   - *Reaction Guarantee*: Every tracking charge is preceded by a prominent 1.35-second lock-on laser and floor reticle, ensuring ample reaction time (Rule 3 compliant).
2. **"Close Call" Adrenaline Bonus**:
   - Dodging within inches of a charging drone awards `CLOSE CALL! +150` bonus points, sound effects, and spark bursts.
3. **Escalating Heartbeat Audio**:
   - Web Audio ambient electronic heartbeat pulses at accelerating tempos as the threat level rises.
4. **Combo Multiplier Flow (Up to 5x)**:
   - Collecting cores in rhythm boosts your score multiplier from `x1` up to `x5 MAX` with ascending musical bell chords.
5. **Overdrive EMP Cores**:
   - Rare magenta cores that disable drone tracking and slow drones down by 50% for 4 seconds!
6. **Neon Surge Dash (`Space` Key)**:
   - Swift escape burst with a 2.2-second cooldown and momentary collision immunity.
7. **Persistent All-Time High Score**:
   - Saved automatically to `localStorage`.

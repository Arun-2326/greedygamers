"""
gesture_controller.py — AI Vision Gesture Controller Bridge for Neon Core: AI Arena
Translates real-time webcam hand gestures into standard keyboard events (ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Z, Space).
Maintains 100% compliance with AGENTS.md competition rules by emulating native hardware keys.

Controls:
- Move Hand from Center:
    - Up    -> ArrowUp
    - Down  -> ArrowDown
    - Left  -> ArrowLeft
    - Right -> ArrowRight
- Closed Fist / Pinch:
    - Fire Z (Start, Confirm, Pause, Resume, Restart)
- Open Spread Palm:
    - Fire Space (Neon Surge Dash, 2.0s cooldown)
- Exit: Press 'q' or 'Esc' in the camera window
"""

import cv2
import math
import time
import sys

try:
    import mediapipe as mp
    import pyautogui
except ImportError:
    print("\n[!] Missing required libraries. Please install them by running:")
    print("    pip install -r requirements.txt\n")
    sys.exit(1)

# Disable pyautogui delay for immediate gaming response
pyautogui.PAUSE = 0.0
pyautogui.FAILSAFE = False

class GestureBridge:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.mp_draw = mp.solutions.drawing_utils
        self.hands = self.mp_hands.Hands(
            max_num_hands=1,
            min_detection_confidence=0.65,
            min_tracking_confidence=0.60
        )

        # Held key tracker
        self.held = {
            'up': False,
            'down': False,
            'left': False,
            'right': False
        }

        # Gesture trigger state trackers
        self.prev_fist_state = False
        self.last_z_time = 0.0
        self.z_debounce = 0.40  # Seconds between allowed Z triggers

        self.prev_dash_state = False
        self.last_dash_time = 0.0
        self.dash_cooldown = 2.0  # Seconds between dashes (matching Rule 1 & 2)

        # Deadzone configuration (normalized 0.0 - 1.0)
        self.dz_x_min = 0.38
        self.dz_x_max = 0.62
        self.dz_y_min = 0.38
        self.dz_y_max = 0.62

    def _press_key(self, key_name):
        """Dispatches a single instantaneous key press."""
        try:
            pyautogui.press(key_name)
        except Exception as e:
            print(f"[Error] Failed to press {key_name}: {e}")

    def _set_held_state(self, key_name, is_held):
        """Updates held key state, calling keyDown or keyUp only on changes."""
        if self.held[key_name] == is_held:
            return

        self.held[key_name] = is_held
        try:
            if is_held:
                pyautogui.keyDown(key_name)
            else:
                pyautogui.keyUp(key_name)
        except Exception as e:
            print(f"[Error] Failed to update {key_name}: {e}")

    def release_all_keys(self):
        """Safely releases all held arrow keys."""
        for key_name in self.held:
            if self.held[key_name]:
                self.held[key_name] = False
                try:
                    pyautogui.keyUp(key_name)
                except Exception:
                    pass

    def run(self, camera_index=0):
        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            print(f"\n[Error] Unable to open camera device at index {camera_index}.")
            print("Please ensure your webcam is connected and accessible.\n")
            return

        print("\n" + "=" * 65)
        print("  NEON CORE — AI VISION GESTURE CONTROLLER BRIDGE")
        print("=" * 65)
        print(" [▲/▼/◀/▶] Move hand outside center box to fly in that direction")
        print(" [Z KEY]    Close hand into a Fist or Pinch to start / restart")
        print(" [SPACE]    Spread all fingers wide for Neon Surge Dash")
        print(" [EXIT]     Press 'q' or 'Esc' in camera window to quit")
        print("=" * 65)
        print(">> Focus the Neon Core game window in your browser to begin!\n")

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.01)
                    continue

                # Mirror frame horizontally for intuitive direct-mirror movement
                frame = cv2.flip(frame, 1)
                h, w, _ = frame.shape

                # Convert BGR to RGB for MediaPipe processing
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self.hands.process(rgb)

                hand_detected = False
                target_keys = {'up': False, 'down': False, 'left': False, 'right': False}
                action_text = "NEUTRAL (HOLDING POSITION)"
                action_color = (180, 180, 180)

                now = time.time()

                if results.multi_hand_landmarks:
                    hand_detected = True
                    hand_landmarks = results.multi_hand_landmarks[0]
                    self.mp_draw.draw_landmarks(frame, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)

                    # Extract landmark positions
                    lm = hand_landmarks.landmark
                    wrist = lm[0]
                    thumb_tip = lm[4]
                    index_mcp = lm[5]
                    index_tip = lm[8]
                    index_pip = lm[6]
                    middle_mcp = lm[9]
                    middle_tip = lm[12]
                    middle_pip = lm[10]
                    ring_tip = lm[16]
                    ring_pip = lm[14]
                    pinky_tip = lm[20]
                    pinky_pip = lm[18]

                    # Use Palm Center (middle MCP) for steering
                    hand_x = middle_mcp.x
                    hand_y = middle_mcp.y

                    # Draw hand center cursor
                    px = int(hand_x * w)
                    py = int(hand_y * h)
                    cv2.circle(frame, (px, py), 10, (0, 255, 255), -1)

                    # 1. MOVEMENT DIRECTION (Relative to Central Deadzone)
                    if hand_x < self.dz_x_min:
                        target_keys['left'] = True
                    elif hand_x > self.dz_x_max:
                        target_keys['right'] = True

                    if hand_y < self.dz_y_min:
                        target_keys['up'] = True
                    elif hand_y > self.dz_y_max:
                        target_keys['down'] = True

                    # 2. GESTURE: CLOSED FIST OR PINCH (Triggers Z Key)
                    # Check distance from finger tips to wrist compared to PIP joints
                    dist_index = math.hypot(index_tip.x - wrist.x, index_tip.y - wrist.y)
                    dist_middle = math.hypot(middle_tip.x - wrist.x, middle_tip.y - wrist.y)
                    dist_ring = math.hypot(ring_tip.x - wrist.x, ring_tip.y - wrist.y)
                    dist_pinky = math.hypot(pinky_tip.x - wrist.x, pinky_tip.y - wrist.y)

                    ref_index = math.hypot(index_pip.x - wrist.x, index_pip.y - wrist.y)
                    ref_middle = math.hypot(middle_pip.x - wrist.x, middle_pip.y - wrist.y)
                    ref_ring = math.hypot(ring_pip.x - wrist.x, ring_pip.y - wrist.y)
                    ref_pinky = math.hypot(pinky_pip.x - wrist.x, pinky_pip.y - wrist.y)

                    pinch_dist = math.hypot(thumb_tip.x - index_tip.x, thumb_tip.y - index_tip.y)

                    is_fist = (
                        dist_index < ref_index and
                        dist_middle < ref_middle and
                        dist_ring < ref_ring and
                        dist_pinky < ref_pinky
                    )
                    is_pinch = (pinch_dist < 0.055)

                    is_z_gesture = is_fist or is_pinch

                    if is_z_gesture:
                        if not self.prev_fist_state and (now - self.last_z_time) >= self.z_debounce:
                            self._press_key('z')
                            self.last_z_time = now
                            action_text = ">> Z KEY TRIGGERED (CONFIRM/START) <<"
                            action_color = (0, 255, 0)
                        else:
                            action_text = "FIST / PINCH HELD [Z]"
                            action_color = (0, 255, 128)
                    self.prev_fist_state = is_z_gesture

                    # 3. GESTURE: OPEN SPREAD PALM (Triggers Space Dash)
                    is_spread_hand = (
                        dist_index > ref_index * 1.15 and
                        dist_middle > ref_middle * 1.15 and
                        dist_ring > ref_ring * 1.15 and
                        dist_pinky > ref_pinky * 1.15 and
                        math.hypot(thumb_tip.x - pinky_tip.x, thumb_tip.y - pinky_tip.y) > 0.22
                    )

                    dash_remaining = max(0.0, self.dash_cooldown - (now - self.last_dash_time))

                    if is_spread_hand and not is_z_gesture:
                        if not self.prev_dash_state and dash_remaining <= 0.0:
                            self._press_key('space')
                            self.last_dash_time = now
                            action_text = ">> SPACE DASH TRIGGERED! <<"
                            action_color = (0, 255, 255)
                        elif dash_remaining > 0.0:
                            action_text = f"DASH ON COOLDOWN [{dash_remaining:.1f}s]"
                            action_color = (0, 165, 255)
                        else:
                            action_text = "SPREAD PALM READY [DASH]"
                            action_color = (0, 255, 255)
                    self.prev_dash_state = is_spread_hand

                    # Update movement status string if no special action text
                    if not is_z_gesture and not is_spread_hand:
                        active_dirs = [k.upper() for k, v in target_keys.items() if v]
                        if active_dirs:
                            action_text = f"STEERING: {' + '.join(active_dirs)}"
                            action_color = (255, 200, 0)

                # Update held arrow keys based on detected directions
                if hand_detected:
                    for key_name, should_hold in target_keys.items():
                        self._set_held_state(key_name, should_hold)
                else:
                    self.release_all_keys()
                    action_text = "WAITING FOR HAND IN VIEW..."
                    action_color = (100, 100, 255)

                # ================= HUD RENDERING =================
                # Central Deadzone Box
                x1 = int(self.dz_x_min * w)
                x2 = int(self.dz_x_max * w)
                y1 = int(self.dz_y_min * h)
                y2 = int(self.dz_y_max * h)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 0), 2)
                cv2.putText(frame, "DEADZONE (HOLD)", (x1 + 6, y1 + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

                # Active Arrows HUD
                arrow_y = 50
                colors = {
                    'left': (0, 255, 0) if self.held['left'] else (70, 70, 70),
                    'up': (0, 255, 0) if self.held['up'] else (70, 70, 70),
                    'down': (0, 255, 0) if self.held['down'] else (70, 70, 70),
                    'right': (0, 255, 0) if self.held['right'] else (70, 70, 70),
                }

                cv2.putText(frame, "STEER:", (20, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.putText(frame, "<", (110, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, colors['left'], 3)
                cv2.putText(frame, "^", (145, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, colors['up'], 3)
                cv2.putText(frame, "v", (175, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, colors['down'], 3)
                cv2.putText(frame, ">", (205, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, colors['right'], 3)

                # Gesture Status Bar
                cv2.rectangle(frame, (0, h - 50), (w, h), (20, 20, 20), -1)
                cv2.putText(frame, f"STATUS: {action_text}", (20, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.65, action_color, 2)

                # Help instructions overlay at top right
                cv2.putText(frame, "Fist/Pinch = Z | Spread = Dash | 'q' = Quit", (w - 440, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

                cv2.imshow("Neon Core - AI Vision Gesture Bridge", frame)

                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27:  # 27 = Esc
                    break

        finally:
            self.release_all_keys()
            cap.release()
            cv2.destroyAllWindows()
            print("\n[Done] Gesture Controller Bridge terminated. All keys released safely.")

if __name__ == '__main__':
    bridge = GestureBridge()
    bridge.run()

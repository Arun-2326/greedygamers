"""
gesture_controller.py — AI Vision Face & Hand Gesture Controller Bridge for Neon Core: AI Arena
Translates real-time webcam facial expressions and hand steering into standard keyboard events (Arrows, Z, Space).
Maintains 100% compliance with AGENTS.md competition rules by emulating native hardware keys.

Controls:
- Hand Steering (Move outside center box):
    - Up    -> ArrowUp
    - Down  -> ArrowDown
    - Left  -> ArrowLeft
    - Right -> ArrowRight
- Facial Expressions:
    - MOUTH OPEN -> Press Z (Start, Confirm, Pause, Resume, Restart)
    - EYE BLINK  -> Press Space (Neon Surge Dash, 2.0s cooldown)
- Hand Gesture Backups:
    - Fist / Pinch -> Z
    - Spread Palm  -> Space
- Exit: Press 'q' or 'Esc' in camera window
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
        self.mp_face = mp.solutions.face_mesh
        self.mp_draw = mp.solutions.drawing_utils

        # Initialize Hand Tracking
        self.hands = self.mp_hands.Hands(
            max_num_hands=1,
            min_detection_confidence=0.65,
            min_tracking_confidence=0.60
        )

        # Initialize Face Mesh for Mouth & Blink Tracking
        self.face_mesh = self.mp_face.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.65,
            min_tracking_confidence=0.60
        )

        # Held arrow keys tracker
        self.held = {
            'up': False,
            'down': False,
            'left': False,
            'right': False
        }

        # Facial Expression Trackers
        # Mouth Open (Z Key)
        self.mouth_open_threshold = 0.38
        self.prev_mouth_open = False
        self.last_z_time = 0.0
        self.z_debounce = 0.45  # Cooldown between Z triggers

        # Eye Blink (Space Dash)
        self.blink_threshold = 0.20
        self.is_eye_closed = False
        self.eye_closed_start = 0.0
        self.last_dash_time = 0.0
        self.dash_cooldown = 2.0  # Rule 1: Dash cooldown >= 2.0s

        # Hand Gesture Backups
        self.prev_fist_state = False
        self.prev_dash_state = False

        # Deadzone configuration for Hand Steering (normalized 0.0 - 1.0)
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

    def run(self, camera_index=None):
        # Auto-detect physical camera (Try index 1 first to prioritize HP True Vision over Motorola Virtual Camera)
        cap = None
        chosen_idx = None
        candidates = [1, 0, 2, 3] if camera_index is None else [camera_index]

        for idx in candidates:
            temp_cap = cv2.VideoCapture(idx)
            if temp_cap.isOpened():
                ret, frame = temp_cap.read()
                if ret and frame is not None:
                    cap = temp_cap
                    chosen_idx = idx
                    print(f"[*] Connected successfully to physical webcam at index {idx} (HP True Vision)!")
                    break
                else:
                    temp_cap.release()

        if cap is None:
            # Fallback to index 0 if detection fails
            cap = cv2.VideoCapture(0)
            chosen_idx = 0

        if not cap.isOpened():
            print(f"\n[Error] Unable to open camera device at index {chosen_idx}.")
            print("Please ensure your HP True Vision webcam is accessible in Windows Settings.\n")
            return

        print("\n" + "=" * 70)
        print("  NEON CORE — AI VISION MULTI-GESTURE CONTROLLER BRIDGE")
        print("=" * 70)
        print(" [▲/▼/◀/▶] Move hand outside center box to steer in that direction")
        print(" [Z KEY]    OPEN MOUTH -> Start Game / Confirm / Resume / Restart")
        print(" [SPACE]    BLINK EYES -> Neon Surge Dash (2.0s cooldown)")
        print(" [BACKUPS]  Closed Fist = Z  |  Spread Palm = Space Dash")
        print(" [EXIT]     Press 'q' or 'Esc' in camera window to quit")
        print("=" * 70)
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
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                now = time.time()
                action_text = "NEUTRAL"
                action_color = (180, 180, 180)

                # ================= 1. FACE MESH PROCESSING =================
                face_results = self.face_mesh.process(rgb)
                mar = 0.0
                ear = 0.30
                face_detected = False
                target_keys = {'up': False, 'down': False, 'left': False, 'right': False}

                if face_results.multi_face_landmarks:
                    face_detected = True
                    flm = face_results.multi_face_landmarks[0].landmark

                    # ---------------- Head Steering (Pitch & Yaw) ----------------
                    # Nose tip: 1, Left cheek: 234, Right cheek: 454, Eye center: 168, Chin: 152
                    nose_x = 1.0 - flm[1].x  # Mirrored
                    nose_y = flm[1].y

                    # Yaw: Turn Left / Turn Right
                    d_left = abs(flm[1].x - flm[234].x)
                    d_right = abs(flm[1].x - flm[454].x)
                    yaw_ratio = (d_left - d_right) / max(0.001, d_left + d_right)

                    turn_left = (yaw_ratio < -0.16) or (nose_x < self.dz_x_min)
                    turn_right = (yaw_ratio > 0.16) or (nose_x > self.dz_x_max)

                    # Pitch: Head Up / Head Down
                    eye_y = flm[168].y
                    chin_y = flm[152].y
                    nose_rel_y = (flm[1].y - eye_y) / max(0.001, chin_y - eye_y)

                    head_up = (nose_rel_y < 0.36) or (nose_y < self.dz_y_min)
                    head_down = (nose_rel_y > 0.64) or (nose_y > self.dz_y_max)

                    target_keys['up'] = head_up
                    target_keys['down'] = head_down
                    target_keys['left'] = turn_left
                    target_keys['right'] = turn_right

                    # Draw Head Cursor
                    cv2.circle(frame, (int(nose_x * w), int(nose_y * h)), 8, (0, 255, 255), -1)

                    # ---------------- Mouth Aspect Ratio (MAR) -> Z Key ----------------
                    lip_top = flm[13]
                    lip_bottom = flm[14]
                    mouth_left = flm[61]
                    mouth_right = flm[291]

                    lip_dist = math.hypot(lip_top.x - lip_bottom.x, lip_top.y - lip_bottom.y)
                    mouth_width = math.hypot(mouth_left.x - mouth_right.x, mouth_left.y - mouth_right.y)
                    mar = lip_dist / max(0.001, mouth_width)

                    # Draw Mouth Indicator Dots
                    cv2.circle(frame, (int((1.0 - lip_top.x) * w), int(lip_top.y * h)), 3, (0, 255, 255), -1)
                    cv2.circle(frame, (int((1.0 - lip_bottom.x) * w), int(lip_bottom.y * h)), 3, (0, 255, 255), -1)

                    is_mouth_open = (mar >= self.mouth_open_threshold)

                    # Holding mouth open holds Z
                    if is_mouth_open:
                        if not self.prev_mouth_open and (now - self.last_z_time) >= self.z_debounce:
                            self._press_key('z')
                            self.last_z_time = now
                            action_text = ">> MOUTH OPEN -> Z KEY TRIGGERED! <<"
                            action_color = (0, 255, 0)
                        else:
                            action_text = "MOUTH OPEN [Z HELD]"
                            action_color = (0, 255, 128)
                        self._set_held_state('z', True)
                    else:
                        self._set_held_state('z', False)
                    self.prev_mouth_open = is_mouth_open

                    # ---------------- Eye Aspect Ratio (EAR) -> Space Dash ----------------
                    ear_left = math.hypot(flm[159].x - flm[145].x, flm[159].y - flm[145].y) / max(0.001, math.hypot(flm[33].x - flm[133].x, flm[33].y - flm[133].y))
                    ear_right = math.hypot(flm[386].x - flm[374].x, flm[386].y - flm[374].y) / max(0.001, math.hypot(flm[362].x - flm[263].x, flm[362].y - flm[263].y))
                    ear = (ear_left + ear_right) / 2.0

                    cv2.circle(frame, (int((1.0 - flm[159].x) * w), int(flm[159].y * h)), 3, (255, 0, 255), -1)
                    cv2.circle(frame, (int((1.0 - flm[145].x) * w), int(flm[145].y * h)), 3, (255, 0, 255), -1)
                    cv2.circle(frame, (int((1.0 - flm[386].x) * w), int(flm[386].y * h)), 3, (255, 0, 255), -1)
                    cv2.circle(frame, (int((1.0 - flm[374].x) * w), int(flm[374].y * h)), 3, (255, 0, 255), -1)

                    dash_remaining = max(0.0, self.dash_cooldown - (now - self.last_dash_time))
                    eyes_closed = (ear < self.blink_threshold)

                    # Holding blink holds Space
                    if eyes_closed:
                        if not self.is_eye_closed:
                            self.is_eye_closed = True
                            self.eye_closed_start = now
                            if dash_remaining <= 0.0:
                                self._press_key('space')
                                self.last_dash_time = now
                                action_text = ">> EYE BLINK -> SPACE DASH TRIGGERED! <<"
                                action_color = (0, 255, 255)
                        self._set_held_state('space', True)
                    else:
                        if self.is_eye_closed:
                            self._set_held_state('space', False)
                            self.is_eye_closed = False

                # ================= 2. HAND TRACKING FOR STEERING =================
                hand_results = self.hands.process(rgb)
                target_keys = {'up': False, 'down': False, 'left': False, 'right': False}
                hand_detected = False

                if hand_results.multi_hand_landmarks:
                    hand_detected = True
                    hand_landmarks = hand_results.multi_hand_landmarks[0]
                    self.mp_draw.draw_landmarks(frame, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)

                    lm = hand_landmarks.landmark
                    wrist = lm[0]
                    thumb_tip = lm[4]
                    index_tip = lm[8]
                    index_pip = lm[6]
                    middle_mcp = lm[9]
                    middle_tip = lm[12]
                    middle_pip = lm[10]
                    ring_tip = lm[16]
                    ring_pip = lm[14]
                    pinky_tip = lm[20]
                    pinky_pip = lm[18]

                    # Use Palm Center for Steering
                    hand_x = middle_mcp.x
                    hand_y = middle_mcp.y

                    # Draw hand center cursor
                    px = int(hand_x * w)
                    py = int(hand_y * h)
                    cv2.circle(frame, (px, py), 10, (0, 255, 255), -1)

                    # Movement Steering outside deadzone
                    if hand_x < self.dz_x_min:
                        target_keys['left'] = True
                    elif hand_x > self.dz_x_max:
                        target_keys['right'] = True

                    if hand_y < self.dz_y_min:
                        target_keys['up'] = True
                    elif hand_y > self.dz_y_max:
                        target_keys['down'] = True

                    # Hand Gesture Backup: Fist / Pinch -> Z
                    dist_index = math.hypot(index_tip.x - wrist.x, index_tip.y - wrist.y)
                    dist_middle = math.hypot(middle_tip.x - wrist.x, middle_tip.y - wrist.y)
                    dist_ring = math.hypot(ring_tip.x - wrist.x, ring_tip.y - wrist.y)
                    dist_pinky = math.hypot(pinky_tip.x - wrist.x, pinky_tip.y - wrist.y)

                    ref_index = math.hypot(index_pip.x - wrist.x, index_pip.y - wrist.y)
                    ref_middle = math.hypot(middle_pip.x - wrist.x, middle_pip.y - wrist.y)
                    ref_ring = math.hypot(ring_pip.x - wrist.x, ring_pip.y - wrist.y)
                    ref_pinky = math.hypot(pinky_pip.x - wrist.x, pinky_pip.y - wrist.y)

                    is_fist = (dist_index < ref_index and dist_middle < ref_middle and dist_ring < ref_ring and dist_pinky < ref_pinky)
                    is_pinch = (math.hypot(thumb_tip.x - index_tip.x, thumb_tip.y - index_tip.y) < 0.055)

                    if (is_fist or is_pinch) and not self.prev_mouth_open:
                        if not self.prev_fist_state and (now - self.last_z_time) >= self.z_debounce:
                            self._press_key('z')
                            self.last_z_time = now
                            action_text = ">> FIST/PINCH -> Z KEY TRIGGERED <<"
                            action_color = (0, 255, 0)
                    self.prev_fist_state = (is_fist or is_pinch)

                    # Hand Gesture Backup: Spread Palm -> Space Dash
                    is_spread_hand = (
                        dist_index > ref_index * 1.15 and
                        dist_middle > ref_middle * 1.15 and
                        dist_ring > ref_ring * 1.15 and
                        dist_pinky > ref_pinky * 1.15 and
                        math.hypot(thumb_tip.x - pinky_tip.x, thumb_tip.y - pinky_tip.y) > 0.22
                    )

                    dash_remaining = max(0.0, self.dash_cooldown - (now - self.last_dash_time))
                    if is_spread_hand and not is_fist and not is_pinch:
                        if not self.prev_dash_state and dash_remaining <= 0.0:
                            self._press_key('space')
                            self.last_dash_time = now
                            action_text = ">> SPREAD PALM -> SPACE DASH! <<"
                            action_color = (0, 255, 255)
                    self.prev_dash_state = is_spread_hand

                    # Steering status display
                    if action_text == "NEUTRAL":
                        active_dirs = [k.upper() for k, v in target_keys.items() if v]
                        if active_dirs:
                            action_text = f"STEERING: {' + '.join(active_dirs)}"
                            action_color = (255, 200, 0)

                # Update held arrow keys based on detected directions (from Head Steering or Hand)
                if face_detected or hand_detected:
                    for key_name, should_hold in target_keys.items():
                        self._set_held_state(key_name, should_hold)
                else:
                    self.release_all_keys()
                    if action_text == "NEUTRAL":
                        action_text = "ALIGN FACE IN VIEW TO STEER"
                        action_color = (130, 130, 220)

                # ================= HUD RENDERING =================
                # Central Deadzone Box for Hand Steering
                x1 = int(self.dz_x_min * w)
                x2 = int(self.dz_x_max * w)
                y1 = int(self.dz_y_min * h)
                y2 = int(self.dz_y_max * h)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 0), 2)
                cv2.putText(frame, "DEADZONE", (x1 + 6, y1 + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

                # Active Arrows HUD
                arrow_y = 45
                colors = {
                    'left': (0, 255, 0) if self.held['left'] else (70, 70, 70),
                    'up': (0, 255, 0) if self.held['up'] else (70, 70, 70),
                    'down': (0, 255, 0) if self.held['down'] else (70, 70, 70),
                    'right': (0, 255, 0) if self.held['right'] else (70, 70, 70),
                }

                cv2.putText(frame, "STEER:", (20, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
                cv2.putText(frame, "<", (105, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.85, colors['left'], 3)
                cv2.putText(frame, "^", (135, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.85, colors['up'], 3)
                cv2.putText(frame, "v", (165, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.85, colors['down'], 3)
                cv2.putText(frame, ">", (195, arrow_y), cv2.FONT_HERSHEY_SIMPLEX, 0.85, colors['right'], 3)

                # Real-Time Facial Metrics HUD (Top Right)
                mouth_color = (0, 255, 0) if mar >= self.mouth_open_threshold else (180, 180, 180)
                eye_color = (0, 255, 255) if ear < self.blink_threshold else (180, 180, 180)

                cv2.putText(frame, f"MOUTH OPEN (Z): {mar:.2f}", (w - 260, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.55, mouth_color, 2)
                cv2.putText(frame, f"EYES BLINK (SPACE): {ear:.2f}", (w - 260, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.55, eye_color, 2)

                # Gesture Status Bar (Bottom)
                cv2.rectangle(frame, (0, h - 50), (w, h), (20, 20, 20), -1)
                cv2.putText(frame, f"STATUS: {action_text}", (20, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.65, action_color, 2)

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

import cv2
import numpy as np
from machine import Machine
from camera import Camera
import projection

class Interaction:
    def __init__(self, img, screen_size, gui):
        self.Y_OFFSET_PX = 20
        self.m = Machine(dry=False)
        self.envelope_hw = (18, 28) # slightly smaller than axidraw envelope
        self.img = img
        self.gui = gui
        self.set_cam_color('red')
        self.set_listening_click_to_move(False)
        self.set_listening_translate(False)
        self.set_listening_spacing(False)
        self.canditate_contours = []

        # Selection
        self.pt_mdown = (0, 0)
        self.pt_mdrag = (0, 0)
        self.set_drawing_sel_box(False)
        self.curr_sel_contour = None

        # Set arbitrary CAM data
        self.length = screen_size[1] // 2
        self.spacing = screen_size[0] // 5
        self.translate_x = screen_size[1] // 4
        self.translate_y = screen_size[0] // 4
        self.calib_pt = (self.translate_x, self.translate_y)
        self.render()

    def translate(self, x, y):
        self.translate_x = x
        self.translate_y = y
        self.calib_pt = (self.translate_x, self.translate_y)
        self.render()

    def set_cam_color(self, color_name):
        self.color_name = color_name

    def set_drawing_sel_box(self, flag):
        self.drawing_sel_box = flag;

    def set_listening_click_to_move(self, flag):
        self.listening_click_to_move = flag

    def set_listening_translate(self, flag):
        self.listening_translate = flag

    def set_listening_spacing(self, flag):
        self.listening_spacing = flag

    def set_candidate_contours(self, contours):
        self.canditate_contours = contours

    def select_contour_at_point(self, pt):
        selected_contours = []
        eps_px = 10
        for contour in self.canditate_contours:
            signed_dist = cv2.pointPolygonTest(contour, pt, measureDist=True)
            if abs(signed_dist) <= eps_px:
                selected_contours.append(contour)
        max_len = 0
        optimal_contour = None
        for c in selected_contours:
            if cv2.arcLength(c, closed=True) >= max_len:
                optimal_contour = c
        return optimal_contour

    def calc_offset_contours(self, contours):
        if len(contours) == 0:
            return []
        translated_contours = list(map(lambda c: np.copy(c), contours))
        for c in translated_contours:
            for p in c:
                p += np.array([0, self.Y_OFFSET_PX])
        return translated_contours

    def _render_candidate_contours(self, contours, img):
        translated_contours = self.calc_offset_contours(self.canditate_contours)
        cv2.drawContours(img, translated_contours, -1, (255, 0, 0), 1)

    def _render_sel_box(self):
        if self.drawing_sel_box:
            projection.rectangle_from_to(self.pt_mdown, self.pt_mdrag, 'white', self.img)

    def _render_sel_contour(self):
        if self.curr_sel_contour is not None:
            trans_contours = self.calc_offset_contours([self.curr_sel_contour])
            cv2.drawContours(self.img, trans_contours, 0, (255, 255, 255), 3)

    def _render_cam(self):
        # TODO: work for actual cam
        for i in range(0, 3):
            start_pt = (self.translate_x, i * self.spacing + self.translate_y)
            end_pt = (self.length + self.translate_x, i * self.spacing + self.translate_y)
            projection.line_from_to(start_pt, end_pt, self.color_name, self.img)

    def render(self):
        """
        Note: this function draws each render subroutine over the last call
        to the effect of being an informal z-buffer.
        """
        self.img = np.zeros(self.img.shape, np.float32)
        self._render_candidate_contours(self.canditate_contours, self.img)
        self._render_sel_box()
        self._render_sel_contour()
        self._render_cam()
        self.gui.render_gui(self.img)
        cv2.imshow('Projection', self.img)

class GuiControl:
    def __init__(self, screen_size):
        self.bottom_buttons = []
        self.CM_TO_PX = 37.7952755906
        self.Y_OFFSET = 20
        self.envelope_hw = (18, 28) # slightly smaller than axidraw envelope

        self.button_params = {\
            'start_pt' : (screen_size[1] // 10, screen_size[0] - screen_size[0] // 8),\
            'gutter' : 75\
        }

    def add_bottom_button(self, text, img):
        text_size = projection.find_text_size(text)
        x_offset = len(self.bottom_buttons) *\
                   (text_size[0] + self.button_params['gutter'])
        pt = (self.button_params['start_pt'][0] + x_offset,\
              self.button_params['start_pt'][1])
        rect_obj = projection.rectangle_at(pt, text_size[0], text_size[1], img)
        text_obj = projection.text_at(text, pt, 'black', img)
        self.bottom_buttons.append((rect_obj, text_obj))

    def calibration_square(self, start_pt, length, img):
        length *= self.CM_TO_PX
        pt1 = (start_pt[0] + length, start_pt[1])
        pt2 = (start_pt[0] + length, start_pt[1] + length)
        pt3 = (start_pt[0], start_pt[1] + length)
        projection.line_from_to(start_pt, pt1, 'white', img)
        projection.line_from_to(pt1, pt2, 'white', img)
        projection.line_from_to(pt2, pt3, 'white', img)
        projection.line_from_to(pt3, start_pt, 'white', img)

    def calibration_envelope(self, envelope_hw, img):
        height_px = envelope_hw[0] * self.CM_TO_PX
        width_px = envelope_hw[1] * self.CM_TO_PX
        thickness = 3
        pt0 = (thickness, thickness + self.Y_OFFSET)
        pt1 = (width_px - thickness, thickness + self.Y_OFFSET)
        pt2 = (width_px - thickness, height_px - thickness + self.Y_OFFSET)
        pt3 = (thickness, height_px - thickness + self.Y_OFFSET)
        projection.line_from_to(pt0, pt1, 'red', img)
        projection.line_from_to(pt1, pt2, 'red', img)
        projection.line_from_to(pt2, pt3, 'red', img)
        projection.line_from_to(pt3, pt0, 'red', img)

    def render_gui(self, img):
        # TODO: don't recreate buttons, just separate rendering vs data
        self.bottom_buttons = []
        self.add_bottom_button('translate', img)
        self.add_bottom_button('spacing', img)
        self.calibration_envelope(self.envelope_hw, img)

def make_machine_ixn_click_handler(machine, ixn):
    def handle_click(event, x, y, flags, param):
        def invert_y(y):
            """
            Use if plotter is facing same side as projection
            """
            return GRID_IMG_SIZE[1] - y;

        # TODO: way of sharing image dimensions
        CM_TO_PX = 37.7952755906

        if event == cv2.EVENT_LBUTTONDOWN:
            if ixn.listening_translate:
                    ixn.translate(x, y)
                    ixn.set_cam_color('red')
                    ixn.set_listening_translate(False)
                    ixn.render()
            elif ixn.listening_click_to_move:
                    scaled_x = x / CM_TO_PX
                    scaled_y = y / CM_TO_PX
                    scaled_x = round(scaled_x, 2)
                    scaled_y = round(scaled_y, 2)
                    instr = machine.travel((scaled_x, scaled_y))
                    print(instr)
            else:
                ixn.set_drawing_sel_box(True)
                ixn.pt_mdown = (x, y)

        # On mouse move, if we are drawing sel box, actually draw it
        if event == cv2.EVENT_MOUSEMOVE:
            if ixn.drawing_sel_box:
                ixn.pt_mdrag = (x, y)
                ixn.render()

        if event == cv2.EVENT_LBUTTONUP:
            if ixn.drawing_sel_box:
                ixn.pt_mdown = (0, 0)
                ixn.pt_mdrag = (0, 0)
                ixn.set_drawing_sel_box(False)
                ixn.render()

            ixn.curr_sel_contour = ixn.select_contour_at_point((x, y))
            ixn.render()

    return handle_click

def run_canvas_loop():
    MAC_SCREEN_SIZE_HW = (900, 1440)
    PROJ_SCREEN_SIZE_HW = (720, 1280)
    SCREEN_W_EPS = 5
    img_size_three_channel = PROJ_SCREEN_SIZE_HW + (3,)
    img = np.zeros(img_size_three_channel, np.float32)
    window_name = 'Projection'
    cv2.namedWindow(window_name, cv2.WND_PROP_FULLSCREEN)
    cv2.moveWindow(window_name, MAC_SCREEN_SIZE_HW[1], 0)
    cv2.setWindowProperty(window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
    gui = GuiControl(PROJ_SCREEN_SIZE_HW)
    ixn = Interaction(img, PROJ_SCREEN_SIZE_HW, gui)

    machine = Machine(dry=False)
    camera = Camera()
    handle_click = make_machine_ixn_click_handler(machine, ixn)
    cv2.setMouseCallback(window_name, handle_click)
    cv2.imshow(window_name, ixn.img)

    try:
        while True:
            CM_TO_PX = 37.7952755906
            pressed_key = cv2.waitKey(1)

            if pressed_key == 27:
                """
                Close window on Escape keypress.
                """
                break

            if pressed_key == ord('=') and ixn.listening_spacing:
                """
                If spacing adjustment mode on, increase spacing.
                """
                ixn.spacing += 10
                ixn.render()

            if pressed_key == ord('-') and ixn.listening_spacing:
                """
                If spacing adjustment mode on, reduce spacing.
                """
                ixn.spacing -= 10
                ixn.render()

            if pressed_key == ord('m'):
                """
                Toggle click-to-move mode.
                """
                ixn.set_listening_click_to_move(not ixn.listening_click_to_move)
                if ixn.listening_click_to_move:
                    ixn.set_listening_spacing(False)
                    ixn.set_listening_translate(False)
                    ixn.set_cam_color('red')
                ixn.render()

            if pressed_key == ord('s'):
                """
                Toggle selection spacing adjustment mode.
                """
                ixn.set_listening_spacing(not ixn.listening_spacing)
                if ixn.listening_spacing:
                    ixn.set_listening_translate(False)
                    ixn.set_listening_click_to_move(False)
                    ixn.set_cam_color('green')
                else:
                    ixn.set_cam_color('red')
                ixn.render()

            if pressed_key == ord('t'):
                """
                Toggle selection translation mode.
                """
                ixn.set_listening_translate(not ixn.listening_translate)
                if ixn.listening_translate:
                    ixn.set_listening_click_to_move(False)
                    ixn.set_listening_spacing(False)
                    ixn.set_cam_color('green')
                ixn.render()

            if pressed_key == ord('q'):
                """
                Calibration square.
                """
                pt = (ixn.calib_pt[0] / CM_TO_PX, ixn.calib_pt[1] / CM_TO_PX)
                instr = machine.plot_rect_hw(pt, 2, 2)
                print(instr)

            if pressed_key == ord('e'):
                """
                Machine draws work envelope.
                """
                pt = (0, ixn.Y_OFFSET_PX / CM_TO_PX)
                instr = machine.plot_rect_hw(pt, ixn.envelope_hw[0],\
                                             ixn.envelope_hw[1])
                print(instr)

            if pressed_key == ord('0') or pressed_key == ord('1')\
                or pressed_key == ord('2'):
                """
                Draw line number 0, 1, or 2.
                """
                # Exit any edit mode first
                ixn.set_listening_translate(False)
                ixn.set_listening_spacing(False)
                ixn.set_cam_color('red')
                ixn.render()

                # Calculate and draw lines
                i = int(chr(pressed_key))
                start_pt = (ixn.translate_x / CM_TO_PX,\
                            (i * ixn.spacing + ixn.translate_y) / CM_TO_PX)
                end_pt = ((ixn.length + ixn.translate_x) / CM_TO_PX,\
                          (i * ixn.spacing + ixn.translate_y) / CM_TO_PX)
                machine.travel(start_pt)
                machine.line(end_pt)
                machine.pen_up()

            if pressed_key == ord('c'):
                """
                Show candidate contours from camera feed.
                """
                camera.calc_candidate_contours(ixn.envelope_hw)
                ixn.set_candidate_contours(camera.candidate_contours)
                ixn.render()

    finally:
        cv2.destroyAllWindows()
        machine.return_to_origin()
        machine.disconnect()

def main():
    run_canvas_loop()

if __name__ == '__main__':
    main()


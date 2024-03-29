from functools import reduce
import math
import cv2
import numpy as np
from machine import Machine
# from camera import Camera
from loader import Loader
from toolpath_collection import Toolpath, ToolpathCollection
import projection
import pickle
import os

class Interaction:
    es_filename = './envelope_settings.pckl'

    def __init__(self, img, screen_size):
        self.proj_screen_hw = (720, 1280)
        self.toolpath_collection = ToolpathCollection(self.proj_screen_hw)
        self.GRID_SNAP_DIST = 30
        self.img = img
        # TODO: consolidate listening functionality to use mode_flag
        self.set_listening_click_to_move(False)
        self.set_listening_translate(False)
        self.set_listening_rotate(False)
        self.set_listening_scale(False)
        self.mode_flag = None
        self.candidate_contours = []
        self.chosen_contour = None
        self.chosen_contour_bbox = []
        self.curr_sel_contour = None
        self.curr_mouse_pos = (0, 0)
        self.curr_mouse_down = False

        # Init envelope
        # if os.path.exists(Interaction.es_filename):
        if False:
            f = open(Interaction.es_filename, 'rb')
            self.envelope_h = pickle.load(f)
            f.close()
        else:
            self.envelope_h = None
        # TODO: set these from envelope settings
        self.envelope_hw = (18, 28) # slightly smaller than axidraw envelope
        self.envelope_tp = Toolpath('ENVELOPE', None)

        # Init GUI
        self.gui = GuiControl(self.proj_screen_hw, img.shape)
        self.gui.render_gui(self)
        self.mdown_offset_x = 0
        self.mdown_offset_y = 0
        self.selected_tp_name = None
        self.set_color_for_toolpath('red', 'ALL')
        self.render()

    @property
    def toolpaths(self):
        return self.toolpath_collection

    def move_toolpath_with_mdown_offset(self, tp_name, x, y):
        tp = self.toolpaths[tp_name]
        tp.translate_x = x - self.mdown_offset_x
        tp.translate_y = y - self.mdown_offset_y
        snap_x, snap_y = self.check_snap_for_toolpath(tp_name, x, y)
        if snap_x is not None:
            tp.translate_x = snap_x
        if snap_y is not None:
            tp.translate_y = snap_y
        self.render()

    def check_snap_for_toolpath(self, tp_name, x_val, y_val):
        snaps = [None, None]
        if len(self.chosen_contour_bbox) > 0:
            contour_bbox = self.chosen_contour_bbox.reshape((4, 1, 2))
            x_vals = contour_bbox[:, 0, 0]
            y_vals = contour_bbox[:, 0, 1]
            x_min = x_vals[np.argmin(x_vals)]
            x_max = x_vals[np.argmax(x_vals)]
            y_min = y_vals[np.argmin(y_vals)]
            y_max = y_vals[np.argmax(y_vals)]
            trans_toolpath_bbox = self.calc_bbox_for_trans_toolpath(tp_name)
            _, _, width, height = cv2.boundingRect(trans_toolpath_bbox)
            x_min_border_left = x_val + width - x_min
            x_min_border_right = x_val - x_min
            x_max_border_left = x_val + width - x_max
            x_max_border_right = x_val - x_max
            y_min_border_bottom = y_val + height - y_min
            y_min_border_top = y_val - y_min
            y_max_border_bottom = y_val + height - y_max
            y_max_border_top = y_val - y_max
            if x_min_border_left >= -self.GRID_SNAP_DIST and x_min_border_left <= 0:
                snaps[0] = x_min - width
            if x_min_border_right <= self.GRID_SNAP_DIST and x_min_border_right > 0:
                snaps[0] = x_min
            if x_max_border_left >= -self.GRID_SNAP_DIST and x_max_border_left <= 0:
                snaps[0] = x_max - width
            if x_max_border_right <= self.GRID_SNAP_DIST and x_max_border_right > 0:
                snaps[0] = x_max
            if y_min_border_bottom >= -self.GRID_SNAP_DIST and y_min_border_bottom <= 0:
                snaps[1] = y_min - height
            if y_min_border_top <= self.GRID_SNAP_DIST and y_min_border_top > 0:
                snaps[1] = y_min
            if y_max_border_bottom >= -self.GRID_SNAP_DIST and y_max_border_bottom <= 0:
                snaps[1] = y_max - height
            if y_max_border_top <= self.GRID_SNAP_DIST and y_max_border_top > 0:
                snaps[1] = y_max
        return snaps

    def snap_translate(self):
        # TODO: offset doesn't work when rotation angle past pi radians
        contour = self.chosen_contour
        contour_bbox = self.calc_min_bbox_for_contour(contour)
        center_contour = self.calc_bbox_center(contour_bbox)
        center_toolpath = self.calc_bbox_center(self.toolpath_bbox)
        diff_x = center_contour[0] - center_toolpath[0]
        diff_y = center_contour[1] - center_toolpath[1]
        edge_contour = self.find_shortest_bbox_line(contour_bbox)
        edge_toolpath = self.find_shortest_bbox_line(self.toolpath_bbox)
        edge_len_contour = np.linalg.norm(edge_contour[0]\
                            - edge_contour[1])
        edge_len_toolpath = np.linalg.norm(edge_toolpath[0] - edge_toolpath[1])\
                        * self.scale
        offset_hyp = 0.5 * (edge_len_contour + edge_len_toolpath)
        # TODO: based on where click is, do + vs. - ofset_hyp
        # if we want to snap to the shorter edge, find an orthogonal vector
        offset_x = math.sin(self.theta) * -offset_hyp
        offset_y = math.cos(self.theta) * -offset_hyp
        self.translate(diff_x + offset_x, diff_y + offset_y)

    def translate_toolpath(self, tp_name, x, y):
        tp = self.toolpaths[tp_name]
        tp.translate_x = x
        tp.translate_y = y
        self.render()

    def rotate_toolpath(self, tp_name, theta):
        tp = self.toolpaths[tp_name]
        tp.theta = theta
        self.render()

    def scale_toolpath(self, tp_name, scale):
        tp = self.toolpaths[tp_name]
        tp.scale = scale
        self.render()

    # Getters and setters

    def set_color_for_toolpath(self, color_name, tp_name):
        if tp_name == 'ALL':
            for tp in self.toolpaths:
                tp.color = color_name
        else:
            self.toolpaths[tp_name].color = color_name

    def set_listening_click_to_move(self, flag):
        self.listening_click_to_move = flag

    def set_listening_translate(self, flag):
        self.listening_translate = flag

    def set_listening_rotate(self, flag):
        self.listening_rotate = flag

    def set_listening_scale(self, flag):
        self.listening_scale = flag

    def set_mdown_offset_for_toolpath(self, x_mdown, y_mdown, tp_name):
        tp = self.toolpaths[tp_name]
        self.mdown_offset_x = x_mdown - tp.translate_x
        self.mdown_offset_y = y_mdown - tp.translate_y

    def set_candidate_contours(self, contours):
        self.candidate_contours = contours

    def clear_candidate_contours(self):
        self.candidate_contours = []

    def set_curr_sel_contour(self, contours):
        self.curr_sel_contour = contours

    def clear_curr_sel_contour(self):
        self.curr_sel_contour = None

    def set_chosen_contour(self, contour):
        self.chosen_contour = contour
        self.chosen_contour_bbox = self.calc_straight_bbox_for_contour(contour)

    def clear_chosen_contour(self):
        self.chosen_contour = None
        self.chosen_contour_bbox = []

    def select_contour_at_point(self, pt):
        selected_contours = []
        eps_px = 10
        for contour in self.candidate_contours:
            signed_dist = cv2.pointPolygonTest(contour, pt, measureDist=True)
            if abs(signed_dist) <= eps_px:
                selected_contours.append(contour)
        max_len = 0
        optimal_contour = None
        for c in selected_contours:
            if cv2.arcLength(c, closed=True) >= max_len:
                optimal_contour = c
        return optimal_contour

    def calc_bbox_center(self, contour):
        c_rs = contour.reshape((4, 2))
        p0_x = c_rs[0, 0]
        p0_y = c_rs[0, 1]
        p1_x = c_rs[2, 0]
        p1_y = c_rs[2, 1]
        return (int(round((p0_x + p1_x) / 2)), int(round((p0_y + p1_y) / 2)))

    def check_pt_on_handle(self, pt):
        pass

    def check_pt_inside_toolpath_bbox(self, pt):
        for tp in self.toolpaths:
            trans_bbox = self.calc_bbox_for_trans_toolpath(tp.name)\
                             .reshape((4, 1, 2))
            x_vals = trans_bbox[:, 0, 0]
            y_vals = trans_bbox[:, 0, 1]
            x_min = x_vals[np.argmin(x_vals)]
            x_max = x_vals[np.argmax(x_vals)]
            y_min = y_vals[np.argmin(y_vals)]
            y_max = y_vals[np.argmax(y_vals)]
            x_pt = pt[0]
            y_pt = pt[1]
            in_bbox = x_pt >= x_min and x_pt <= x_max\
                      and y_pt >= y_min and y_pt <= y_max
            if in_bbox:
                return tp.name

    def check_pt_inside_toolpath_collection_bbox(self, pt):
        """
        Assuming the toolpath collection area is right-aligned.
        """
        x_pt = pt[0]
        y_pt = pt[1]
        return x_pt >= self.proj_screen_hw[1] \
                - self.toolpath_collection.width

    def calc_centroid(self, contours):
        """
        True centroid, probably not a case where we need this.
        """
        centroids = []
        eps = 0.001
        for c in contours:
            moments = cv2.moments(c)
            try:
                cx = int(moments['m10'] / moments['m00'])
            except ZeroDivisionError:
                cx = eps
            try:
                cy = int(moments['m01'] / moments['m00'])
            except ZeroDivisionError:
                cy = eps
            centroids.append((cx, cy))
        def add_pts(p0, p1):
            return ((p0[0] + p1[0], p0[1] + p1[1]))
        avg_centroid = reduce(add_pts, centroids)
        avg_centroid = (avg_centroid[0] // len(centroids),\
                        avg_centroid[1] // len(centroids))
        return avg_centroid

    def calc_line_angle(self, line_tup):
        v0 = line_tup[0].reshape((2, 1))
        v1 = line_tup[1].reshape((2, 1))
        v = [v1[0] - v0[0], v1[1] - v0[1]]
        x_unit = np.array([1, 0]).reshape((1, 2))
        numer = np.dot(np.array(x_unit), np.array(v))
        denom = math.sqrt(v[0] ** 2 + v[1] ** 2)
        if denom == 0:
            print('Calculated angle on overlapping points, returning 0 deg')
            return 0
        angle_rad = math.acos(numer / denom)
        return round((angle_rad / math.pi) * 180)

    def find_longest_bbox_line(self, box_contour):
        box = box_contour.reshape(4, 2)
        dist_side_a = np.linalg.norm(box[0] - box[1])
        dist_side_b = np.linalg.norm(box[0] - box[3])
        if dist_side_a > dist_side_b:
            return (box[0], box[1])
        return (box[0], box[3])

    def find_shortest_bbox_line(self, box_contour):
        box = box_contour.reshape(4, 2)
        dist_side_a = np.linalg.norm(box[0] - box[1])
        dist_side_b = np.linalg.norm(box[0] - box[3])
        if dist_side_a < dist_side_b:
            return (box[0], box[1])
        return (box[0], box[3])

    def combine_contours(self, contours):
        def combine(c0, c1):
            return np.append(c0, c1, axis=0)
        return reduce(combine, contours).astype(np.int32)

    def calc_min_bbox_for_contour(self, contour):
        rectangle = cv2.minAreaRect(contour)
        box_pts = np.int32(cv2.boxPoints(rectangle))
        return np.array(box_pts)

    def calc_straight_bbox_for_contour(self, contour):
        x, y, w, h = cv2.boundingRect(contour)
        matrix = np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
        return matrix.reshape((4, 2))

    def init_bbox_for_toolpath(self, tp_name):
        toolpath = self.toolpaths[tp_name]
        combined_contour = self.combine_contours(toolpath)
        self.toolpath_bbox = self.calc_straight_bbox_for_contour(combined_contour)

    def calc_line_for_contour(self, contour):
        [vx, vy, x, y] = cv2.fitLine(contour, cv2.DIST_L2, 0, 0.01, 0.01)
        return ((x[0], y[0]), (vx[0], vy[0]))

    def calc_bbox_for_trans_toolpath(self, tp_name):
        toolpath = self.toolpaths[tp_name]
        combined_contour = self.combine_contours(toolpath.path)
        trans_toolpath = np.copy(combined_contour)
        trans_toolpath = cv2.transform(trans_toolpath, toolpath.mat)
        off_x, off_y, _, _ = cv2.boundingRect(trans_toolpath)
        trans_toolpath[:,0,0] = trans_toolpath[:,0,0] \
                                + toolpath.translate_x - off_x
        trans_toolpath[:,0,1] = trans_toolpath[:,0,1] \
                                + toolpath.translate_y - off_y
        return self.calc_straight_bbox_for_contour(trans_toolpath)

    def _render_candidate_contours(self):
        cv2.drawContours(self.img, self.candidate_contours, -1, (255, 0, 0), 1)

    def _render_chosen_contour(self):
        if self.chosen_contour is not None:
            cv2.drawContours(self.img, self.chosen_contour, -1, (0, 255, 255), 3)
            box_pts = self.calc_min_bbox_for_contour(self.chosen_contour)
            cv2.drawContours(self.img, [box_pts], 0, (0, 255, 255), 1)

    def _render_sel_contour(self):
        if self.curr_sel_contour is not None:
            cv2.drawContours(self.img, [self.curr_sel_contour], 0, (255, 255, 255), 3)
            box_pts = self.calc_min_bbox_for_contour(self.curr_sel_contour)
            cv2.drawContours(self.img, [box_pts], 0, (255, 255, 0), 1)

    def _render_bbox_for_toolpath(self, tp_name):
        trans_bbox = self.calc_bbox_for_trans_toolpath(tp_name)
        cv2.drawContours(self.img, [trans_bbox], 0, (255, 255, 0), 1)

    def _render_bbox_lines(self, bbox_lines):
        projection.line_from_to(bbox_lines['top'][0], bbox_lines['top'][1],\
                                'white', self.img)
        projection.line_from_to(bbox_lines['bottom'][0], bbox_lines['bottom'][1],\
                                'red', self.img)
        projection.line_from_to(bbox_lines['left'][0], bbox_lines['left'][1],\
                                'cyan', self.img)
        projection.line_from_to(bbox_lines['right'][0], bbox_lines['right'][1],\
                                'yellow', self.img)

    def _render_guides(self):
        if len(self.chosen_contour_bbox) > 0:
            bbox = self.chosen_contour_bbox
            edges = [(bbox[0], bbox[1]), (bbox[1], bbox[2]),\
                     (bbox[2], bbox[3]), (bbox[3], bbox[0])]
            for edge in edges:
                projection.guide_through_pts(edge[0], edge[1],\
                        self.proj_screen_hw, self.img)

    def _render_toolpath(self, tp_name):
        color_name = self.toolpaths[tp_name].color
        if color_name == 'white':
            color = (255, 255, 255)
        elif color_name == 'black':
            color = (0, 0, 0)
        elif color_name == 'red':
            color = (0, 0, 255)
        elif color_name == 'green':
            color = (0, 255, 0)
        else:
            color = (255, 255, 255)

        def make_translate_matrix(x, y):
            def fn(contour):
                c = np.copy(contour)
                c[:,0,0] = c[:,0,0] + x
                c[:,0,1] = c[:,0,1] + y
                return c
            return fn
        tp = self.toolpaths[tp_name]
        tp.mat = cv2.getRotationMatrix2D((0, 0), \
                            tp.theta, tp.scale)
        sr_contours = list(map(lambda c: cv2.transform(c, tp.mat),\
                                  tp.path))
        combined_contour = self.combine_contours(sr_contours)
        sr_off_x, sr_off_y, _, _ = cv2.boundingRect(combined_contour)
        translate_sr_off = make_translate_matrix(-sr_off_x, -sr_off_y)
        translate_full = make_translate_matrix(tp.translate_x, tp.translate_y)
        sr_off_contours = list(map(translate_sr_off, sr_contours))
        srt_off_contours = list(map(translate_full, sr_off_contours))
        cv2.polylines(self.img, srt_off_contours, False, color, 2)
        if tp_name == self.selected_tp_name:
            self._render_bbox_for_toolpath(tp_name)

    def render(self, extras_fn=None):
        """
        Note: this function draws each render subroutine over the last call
        to the effect of being an informal z-buffer.
        """
        self.img = np.zeros(self.img.shape, np.float32)
        # self._render_candidate_contours()
        # self._render_chosen_contour()
        # self._render_guides()
        # self._render_sel_contour()
        for tp in self.toolpaths:
            self._render_toolpath(tp.name)
        self.gui.render_gui(self)
        if extras_fn:
            extras_fn()
        cv2.imshow('Projection', self.img)

class GuiControl:
    def __init__(self, screen_size, img_size):
        self.bottom_buttons = []
        self.CM_TO_PX = 37.7952755906
        self.envelope_hw = (18, 28) # slightly smaller than axidraw envelope
        self.overlay = np.zeros(img_size)
        self.overlay_dirty = False

        self.button_params = {\
            'start_pt' : (screen_size[1] // 10, screen_size[0] - screen_size[0] // 8),\
            'gutter' : 100\
        }

    def add_bottom_button(self, text, color_name, img):
        text_size = projection.find_text_size(text)
        x_offset = len(self.bottom_buttons) *\
                   (text_size[0] + self.button_params['gutter'])
        pt = (self.button_params['start_pt'][0] + x_offset,\
              self.button_params['start_pt'][1])
        rect_obj = projection.rectangle_at(pt, text_size[0], text_size[1], \
                    img, color_name, True)
        text_obj = projection.text_at(text, pt, 'black', 1.5, img)
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
        pt0 = (thickness, thickness)
        pt1 = (width_px - thickness, thickness)
        pt2 = (width_px - thickness, height_px - thickness)
        pt3 = (thickness, height_px - thickness)
        projection.line_from_to(pt0, pt1, 'red', img)
        projection.line_from_to(pt1, pt2, 'red', img)
        projection.line_from_to(pt2, pt3, 'red', img)
        projection.line_from_to(pt3, pt0, 'red', img)

    def render_envelope_handles(self, img):
        self.mode_flag = 'resize_envelope'
        CM_TO_PX = 37.7952755906
        h, w = self.envelope_hw
        h = math.floor(h * CM_TO_PX)
        w = math.floor(w * CM_TO_PX)
        # Point order convention: CCW from top left
        corner_handles = [(0, 0), (0, h), (w, h), (w, 0)]
        for handle in corner_handles:
            rect_dim = 10
            projection.rectangle_centered_at(handle, rect_dim, rect_dim,
                                        img, 'cyan', True)

    def render_envelope_for_toolpath(self, toolpath, img):
        pass

    def render_gui(self, ixn):
        """
        Renders the gui to IXN's bitmap.
        """
        self.bottom_buttons = []
        t_color = 'green' if ixn.listening_translate else 'red'
        r_color = 'green' if ixn.listening_rotate else 'red'
        s_color = 'green' if ixn.listening_scale else 'red'
        self.add_bottom_button('translate', t_color, ixn.img)
        self.add_bottom_button('rotate', r_color, ixn.img)
        self.add_bottom_button('scale', s_color, ixn.img)
        self.calibration_envelope(self.envelope_hw, ixn.img)
        if ixn.mode_flag == 'resize_envelope':
            self.render_envelope_handles(ixn.img)
        ixn.img = ixn.toolpath_collection.add_bitmap_to_projection(ixn.img)

def make_machine_ixn_click_handler(machine, ixn):
    def handle_click(event, x, y, flags, param):
        def invert_y(y):
            """
            Use if plotter is facing same side as projection
            """
            return GRID_IMG_SIZE[1] - y;

        # TODO: way of sharing image dimensions
        CM_TO_PX = 37.7952755906

        ixn.curr_mouse_pos = (x, y)
        hit_tp_name = ixn.check_pt_inside_toolpath_bbox((x, y))

        if event == cv2.EVENT_LBUTTONDOWN:
            ixn.curr_mouse_down = True
            if ixn.check_pt_inside_toolpath_collection_bbox((x, y)):
                ixn.toolpath_collection.process_click_at_pt((x, y), ixn)

            elif hit_tp_name:
                # Select whatever we landed on
                ixn.selected_tp_name = hit_tp_name
                ixn.set_color_for_toolpath('green', hit_tp_name)

                # Red out any tps that are not selected
                for tp in ixn.toolpaths:
                    if tp.name != ixn.selected_tp_name:
                        ixn.set_color_for_toolpath('red', tp.name)

                ixn.set_listening_click_to_move(True)
                ixn.set_listening_scale(False)
                ixn.set_listening_rotate(False)
                ixn.set_listening_translate(False)
                ixn.set_mdown_offset_for_toolpath(x, y, hit_tp_name)
                ixn.set_color_for_toolpath('green', hit_tp_name)

            elif ixn.listening_translate:
                if ixn.chosen_contour is not None:
                    ixn.snap_translate()
                    ixn.set_color_for_toolpath('red', 'ALL')
                    ixn.set_listening_translate(False)

            elif ixn.listening_rotate:
                if ixn.chosen_contour is not None:
                    contour = ixn.chosen_contour
                    box = ixn.calc_min_bbox_for_contour(contour)
                    line = ixn.find_longest_bbox_line(box)
                    angle = ixn.calc_line_angle(line)
                    ixn.rotate(angle)
                    ixn.set_toolpath_color('red')
                    ixn.set_listening_rotate(False)

            # elif ixn.listening_scale:
            #     contour = ixn.chosen_contour
            #     bbox_contour = ixn.calc_min_bbox_for_contour(contour)
            #     edge_contour = ixn.find_longest_bbox_line(bbox_contour)
            #     edge_toolpath = ixn.find_longest_bbox_line(ixn.toolpath_bbox)
            #     edge_len_contour = np.linalg.norm(edge_contour[0] - edge_contour[1])
            #     edge_len_toolpath = np.linalg.norm(edge_toolpath[0] - edge_toolpath[1])
            #     edge_ratio = edge_len_contour / edge_len_toolpath
            #     ixn.scale(edge_ratio)
            #     ixn.set_toolpath_color('red')
            #     ixn.set_listening_scale(False)
            #     ixn.render()

            elif False:
                # TODO: this used to be for click to move mode, but would be
                # unhelpful if we moved the head when the CAM moves.
                # instead, make a new mode for moving machine head
                scaled_x = x / CM_TO_PX
                scaled_y = y / CM_TO_PX
                scaled_x = round(scaled_x, 2)
                scaled_y = round(scaled_y, 2)
                instr = machine.travel((scaled_x, scaled_y))
                print(instr)

            ixn.render()

        if event == cv2.EVENT_MOUSEMOVE:
            if ixn.listening_click_to_move and ixn.selected_tp_name:
                ixn.move_toolpath_with_mdown_offset(ixn.selected_tp_name, x, y)
            ixn.render()

        if event == cv2.EVENT_LBUTTONUP:
            ixn.curr_mouse_down = False
            # If we released the click outside a bbox, null out the selected tp
            if not hit_tp_name:
                ixn.selected_tp_name = None

            if ixn.listening_click_to_move:
                ixn.set_listening_click_to_move(False)

            ixn.set_curr_sel_contour(ixn.select_contour_at_point((x, y)))
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
    # cv2.moveWindow(window_name, MAC_SCREEN_SIZE_HW[1], 0)
    # cv2.setWindowProperty(window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
    ixn = Interaction(img, PROJ_SCREEN_SIZE_HW)

    machine = Machine(dry=True)
    # camera = Camera()
    handle_click = make_machine_ixn_click_handler(machine, ixn)
    cv2.setMouseCallback(window_name, handle_click)
    cv2.imshow(window_name, ixn.img)

    try:
        while True:
            CM_TO_PX = 37.7952755906
            pressed_key = cv2.waitKey(1)
            curr_tp = ixn.toolpaths[ixn.selected_tp_name] \
                       if ixn.selected_tp_name else None

            if pressed_key == 27:
                """
                Close window on Escape keypress.
                """
                break

            if pressed_key == ord('='):
                """
                If scale adjustment mode on, increase scale.
                If rotation adjustment mode on, rotate CCW.
                """
                if curr_tp:
                    if ixn.listening_scale:
                        curr_tp.scale += 0.01
                    if ixn.listening_rotate:
                        curr_tp.theta = (curr_tp.theta + 45) % 360
                        ixn.rotate_toolpath(ixn.selected_tp_name, curr_tp.theta)
                    if ixn.listening_translate:
                        ixn.translate_toolpath(ixn.selected_tp_name, 0, \
                                curr_tp.translate_y + 10)
                    ixn.render()

            if pressed_key == ord('-'):
                """
                If scale adjustment mode on, reduce scale.
                If rotation adjustment mode on, rotate CW.
                """
                if curr_tp:
                    if ixn.listening_scale:
                        curr_tp.scale -= 0.01
                    if ixn.listening_rotate:
                        curr_tp.theta = (curr_tp.theta - 45) % 360
                        ixn.rotate_toolpath(ixn.selected_tp_name, curr_tp.theta)
                    if ixn.listening_translate:
                        ixn.translate(ixn.selected_tp_name, 0, \
                                curr_tp.translate_y - 10)
                    ixn.render()

            if pressed_key == ord('s'):
                """
                Toggle selection scaling adjustment mode.
                """
                ixn.set_listening_scale(not ixn.listening_scale)
                if ixn.listening_scale:
                    ixn.set_listening_translate(False)
                    ixn.set_listening_click_to_move(False)
                    ixn.set_listening_rotate(False)
                ixn.render()

            if pressed_key == ord('t'):
                """
                Toggle selection translation mode.
                """
                ixn.set_listening_translate(not ixn.listening_translate)
                if ixn.listening_translate:
                    ixn.set_listening_click_to_move(False)
                    ixn.set_listening_scale(False)
                    ixn.set_listening_rotate(False)
                ixn.render()

            if pressed_key == ord('r'):
                ixn.set_listening_rotate(not ixn.listening_rotate)
                if ixn.listening_rotate:
                    ixn.set_listening_click_to_move(False)
                    ixn.set_listening_scale(False)
                    ixn.set_listening_translate(False)
                ixn.render()

            if pressed_key == ord('e'):
                """
                Machine draws work envelope.
                """
                pt = (0, 0)
                instr = machine.plot_rect_hw(pt, ixn.envelope_hw[0],\
                                             ixn.envelope_hw[1])
                print(instr)
                ixn.mode_flag = 'resize_envelope'

            if pressed_key == ord('0') or pressed_key == ord('1')\
                or pressed_key == ord('2'):
                """
                Draw line number 0, 1, or 2.
                """
                # Exit any edit mode first
                ixn.set_listening_translate(False)
                ixn.set_listening_scale(False)
                ixn.set_toolpath_color('red')
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

            if pressed_key == ord('d'):
                try:
                    # TODO: apply toolpath's transforms before plotting
                    toolpath = ixn.toolpaths[ixn.selected_tp_name]
                    Loader.export_contours_as_svg(toolpath, 'drawing')
                    machine.plot_svg('output_vectors/drawing.svg')
                except Exception as e:
                    print(e)

            if pressed_key == ord('c'):
                """
                Show candidate contours from camera feed.
                Clear existing chosen and candidate contours.
                """
                ixn.clear_chosen_contour()
                ixn.clear_candidate_contours()
                ixn.clear_curr_sel_contour()
                try:
                    camera.calc_candidate_contours(ixn.envelope_hw)
                    ixn.set_candidate_contours(camera.candidate_contours)
                    ixn.render()
                except ValueError:
                    print('Found no rectangle.')

            if pressed_key == ord('v'):
                """
                Open a video capture preview.
                """
                def __render_white():
                    env_hw_px = (round(ixn.envelope_hw[1] * CM_TO_PX),\
                                 round(ixn.envelope_hw[0] * CM_TO_PX))
                    projection.flood_env_white(ixn.img, env_hw_px)
                ixn.render(__render_white)
                if not camera.video_preview_open:
                    camera.open_video_preview()
                else:
                    camera.update_video_preview()

            if pressed_key == ord('w'):
                """
                Write transformed CAM contour to SVG.
                """
                toolpath = ixn.toolpaths[ixn.selected_tp_name]
                Loader.export_contours_as_svg(toolpath, 'test')

            if pressed_key == 13:
                """
                Move candidate contours to chosen contours on ENTER.
                """
                if ixn.curr_sel_contour is not None:
                    ixn.set_chosen_contour(np.copy(ixn.curr_sel_contour))
                ixn.clear_candidate_contours()
                ixn.clear_curr_sel_contour()
                ixn.render()

    finally:
        cv2.destroyAllWindows()
        machine.return_to_origin()
        machine.disconnect()

def main():
    run_canvas_loop()

if __name__ == '__main__':
    main()


import cv2
import numpy as np
from scipy.spatial.distance import euclidean as dist

def process_image(img):
    img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # img = cv2.GaussianBlur(img, (11, 11), 1, 1)
    # _, img = cv2.threshold(img, 150, 255, cv2.THRESH_BINARY)
    # img = cv2.Canny(img, 200, 300)
    return img

def draw_hough_lines(edge_img, out_img):
    """
    Finds Hough lines from EDGE_IMG and draws those lines on OUT_IMG.
    Currently does not work.
    """
    minLineLength = 100
    maxLineGap = 10
    lines = cv2.HoughLinesP(edge_img, 1, np.pi / 180, 100, minLineLength,\
                            maxLineGap)
    for line in lines:
        print(line)
        x1 = line[0][0]
        x2 = line[0][1]
        y1 = line[0][2]
        y2 = line[0][3]
        cv2.line(out_img,(x1, y1),(x2, y2), (0, 255, 0), 2)

def calc_contours(edge_img):
    _, contours, hierarchy = cv2.findContours(edge_img, cv2.RETR_TREE,\
                                           cv2.CHAIN_APPROX_SIMPLE)
    return contours

def decimate_contours(contours):
    MAX_DIST = 100
    return list(map(lambda c: cv2.approxPolyDP(c,\
                    MAX_DIST, True), contours))

def find_work_env_in_contours(contours):
    def select_contour(contours):
        decimated_contours = decimate_contours(contours)
        four_pt_contours = list(filter(lambda c: len(c) == 4, decimated_contours))
        max_area = 0
        candidate = None
        for contour in four_pt_contours:
            # Assumes points are ordered circularly
            contour = contour.reshape((4, 2))
            a = [contour[0][0] - contour[1][0],\
                 contour[0][1] - contour[1][1]]
            b = [contour[0][0] - contour[3][0],\
                 contour[0][1] - contour[3][1]]
            area = abs(np.cross(a, b))
            if area > max_area:
                candidate = contour
                max_area = area
        return candidate

    rect_contour = select_contour(contours)
    if rect_contour is None or len(rect_contour) > 4:
        # TODO: increase max dist if this happens, or something.
        raise ValueError('Cannot find a contour with four points.')
    return rect_contour

def calc_work_env_homog(raw_img, env_corner_points, out_shape):
    def order_contour_points(contour_pts, img_contour):
        """
        Returns a new contour (assuming 4 points) with points in the order:
        top right, top left (origin), bottom left, bottom right.
        """
        img_height, img_width, _ = img_contour.shape
        abs_upper_left = np.array([0, 0])
        abs_upper_right = np.array([img_width, 0])
        dists_upper_left = [dist(pt, abs_upper_left) \
                                for pt in contour_pts]
        dists_upper_right = [dist(pt, abs_upper_right) \
                                for pt in contour_pts]

        idx_upper_left = np.argmin(dists_upper_left)
        idx_upper_right = np.argmin(dists_upper_right)
        idx_lower_left = np.argmax(dists_upper_right)
        idx_lower_right = np.argmax(dists_upper_left)

        return [contour_pts[idx_upper_right], contour_pts[idx_upper_left], \
                contour_pts[idx_lower_left], contour_pts[idx_lower_right]]

    def get_img_corner_pts(img):
        """
        Returns corner points in pixels of image in the following order:
        top right, top left (origin), bottom left, bottom right.
        """
        img_height, img_width = img.shape
        return [np.array([img_width, 0]), \
                np.array([0, 0]), \
                np.array([0, img_height]), \
                np.array([img_width, img_height])]

    if len(env_corner_points) != 4:
        raise ValueError('Cannot crop with non-four-point contour.')
    output_img = np.zeros(out_shape)
    out_img_corners = get_img_corner_pts(output_img)
    ordered_env_corner_pts = order_contour_points(env_corner_points, raw_img)
    h, status = cv2.findHomography(np.array(ordered_env_corner_pts, np.float32), \
                                   np.array(out_img_corners, np.float32))
    return h

def transform_contour_with_h(contour, h):
    contour_float = np.array(contour).astype(np.float32)
    trans = cv2.perspectiveTransform(contour_float, h)
    return trans.astype(np.int32)

def run_camera_loop(img_path):
    c = Camera()
    cv2.imshow('orig', c.img_orig)

    while True:
        pressed_key = cv2.waitKey(1)

        if pressed_key == 27:
            break

        if pressed_key == ord('v'):
            cv2.destroyAllWindows()
            img = c._read_video_image()
            img_raw = img.copy()
            img = c._process_image(img)
            try:
                envelope_hw = (18, 28)
                c.calc_candidate_contours(envelope_hw)
                print(len(c.candidate_contours))
                # TODO: figure out homography with camera -> projector dimensions
                envelope_hw_px = (round(envelope_hw[0] * c.CM_TO_PX),\
                                  round(envelope_hw[1] * c.CM_TO_PX))
                work_env_homog = calc_work_env_homog(img_raw, c.work_env_contour,\
                                                     envelope_hw_px)
                img_crop = cv2.warpPerspective(img_raw, work_env_homog,\
                             (envelope_hw_px[1], envelope_hw_px[0]))
                cv2.drawContours(img_crop, c.candidate_contours, -1, (255, 0, 0), 1)
                cv2.imshow('contours', img_crop)
                cv2.imshow('edges', img)
            except ValueError:
                print('Found no rectangle')

        if pressed_key == ord('n'):
            img_crop_volatile = img_crop.copy()
            curr_contour = contours[curr_contour_idx]
            trans_contour = transform_contour_with_h(curr_contour, work_env_homog)
            cv2.drawContours(img_crop_volatile, [trans_contour],\
                             0, (255, 0, 0), 1)
            curr_contour_idx = (curr_contour_idx + 1) % len(contours)
            cv2.imshow('crop', img_crop_volatile)
            # print(f'Showing contour {curr_contour_idx}')

    cv2.destroyAllWindows()

# TODO: actually put functions into Camera class to export
class Camera:
    def __init__(self):
        self.PROJ_SCREEN_SIZE_HW = (720, 1280)
        self.CM_TO_PX = 37.7952755906
        self.MIN_CONTOUR_LEN = 100
        self.path = 'test_images/form.png'
        self.img_orig = cv2.imread(self.path)
        self.contours = []
        self.work_env_contour = None
        self.video_capture = cv2.VideoCapture(0)
        self.video_preview_open = False

    def _process_image(self, img):
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        img = cv2.GaussianBlur(img, (11, 11), 1, 1)
        # _, img = cv2.threshold(img, 150, 255, cv2.THRESH_BINARY)
        img = cv2.Canny(img, 50, 80)
        return img

    def _load_file_image(self):
        return cv2.imread(self.path)

    def _read_video_image(self):
        ret, frame = self.video_capture.read()
        return frame

    def open_video_preview(self):
        self.video_preview_open = True
        cv2.imshow('preview', self._read_video_image())

    def update_video_preview(self):
        img = self._read_video_image()
        img_edge = self._process_image(img)
        contours = calc_contours(img_edge)
        try:
            work_env_contour = find_work_env_in_contours(contours)
            cv2.drawContours(img, [work_env_contour], -1, (0, 255, 0), 3)
        except ValueError:
            pass
        cv2.imshow('preview', img)

    def close_video_preview(self):
        self.video_preview_open = False
        cv2.destroyWindow('preview')

    def calc_candidate_contours(self, envelope_hw):
        # img = self._read_video_image()
        img = self._load_file_image()
        img = self._process_image(img)
        contours = calc_contours(img)
        work_env_contour = find_work_env_in_contours(contours)
        envelope_hw_px = (round(envelope_hw[0] * self.CM_TO_PX),\
                          round(envelope_hw[1] * self.CM_TO_PX))
        # TODO: this works with img_orig but we shouldn't be using it
        work_env_homog = calc_work_env_homog(self.img_orig, work_env_contour,\
                                             envelope_hw_px)
        decimated_contours = decimate_contours(contours)
        # Not sure whether/how closed=T/F matters here
        min_length_lambda = lambda c: cv2.arcLength(c, closed=True)\
                            > self.MIN_CONTOUR_LEN
        culled_contours = list(filter(min_length_lambda, decimated_contours))
        trans_contours = list(map(lambda c: transform_contour_with_h(c,\
                                work_env_homog), culled_contours))
        self.contours = trans_contours
        self.work_env_contour = work_env_contour

    @property
    def candidate_contours(self):
        return self.contours

def main():
    run_camera_loop('./test_images/form.png')

if __name__ == '__main__':
    main()


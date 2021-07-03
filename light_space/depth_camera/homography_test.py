import numpy as np
import cv2
from cv2 import aruco
import pyrealsense2 as rs
import sys
from scipy.spatial import distance

cam_img_height = 1080
cam_img_width = 1920
proj_img_height = 900
proj_img_width = 1440
framerate = 30

cv2.namedWindow('Projector',cv2.WINDOW_NORMAL)
cv2.namedWindow('Camera',cv2.WINDOW_NORMAL)

# Project localization pattern
aruco1 = cv2.imread('./patterns/test_marker1.jpg')
aruco2 = cv2.imread('./patterns/test_marker2.jpg')
aruco3 = cv2.imread('./patterns/test_marker3.jpg')
aruco4 = cv2.imread('./patterns/test_marker4.jpg')
proj_img = np.zeros((proj_img_width, proj_img_height, 3), np.uint8)
off = 5
proj_img = np.zeros((720, 1280, 3), np.uint8)
proj_img[:] = (255, 255, 255)
proj_img[off:off+aruco1.shape[0],
            off:off+aruco1.shape[1]] = aruco1
proj_img[off:off+aruco1.shape[0],
            -aruco1.shape[1] -off:-off] = aruco2
proj_img[-aruco1.shape[0]-off:-off, off:aruco1.shape[1]+off] = aruco3
proj_img[-aruco1.shape[0]-off:-off, -aruco1.shape[1]-off:-off] = aruco4

cv2.imshow('Projector', proj_img)

# while True:
#     if cv2.waitKey(1) & 0xFF == ord('q'):
#         break

# Image processing definitions
def get_roi_corner_pts(img):
    aruco_dict = aruco.Dictionary_get(aruco.DICT_5X5_1000)
    parameters =  aruco.DetectorParameters_create()
    corners, ids, rejectedImgPoints = aruco.detectMarkers(img, aruco_dict, parameters=parameters)
    if len(corners) != 4:
        return []
    return get_outermost_points(corners, img)

def get_outermost_points(corners_arr_lst, img):
    flat_corner_sets = [cset.reshape(4, 2) for cset in corners_arr_lst]
    all_points = np.concatenate(flat_corner_sets)

    img_height, img_width, _ = img.shape
    abs_upper_left = np.array([0, 0])
    abs_upper_right = np.array([0, img_width])
    dists_upper_left = [distance.euclidean(pt, abs_upper_left) \
                            for pt in all_points]
    dists_upper_right = [distance.euclidean(pt, abs_upper_right) \
                            for pt in all_points]

    idx_upper_left = np.argmin(dists_upper_left)
    idx_upper_right = np.argmin(dists_upper_right)
    idx_lower_left = np.argmax(dists_upper_right)
    idx_lower_right = np.argmax(dists_upper_left)

    return [all_points[idx_upper_right], all_points[idx_upper_left], \
            all_points[idx_lower_left], all_points[idx_lower_right]]

# Start camera
pipeline = rs.pipeline()
config = rs.config()
config.enable_stream(rs.stream.color, cam_img_width,\
                       cam_img_height, rs.format.bgr8, framerate)
profile = pipeline.start(config)
while True:
        frames = pipeline.wait_for_frames()
        color_frame = frames.get_color_frame()
        if not color_frame:
            continue
        color_image = np.asanyarray(color_frame.get_data())
        cv2.imshow('Camera', color_image)
        corner_points = get_roi_corner_pts(color_image)
        print(corner_points)
        if cv2.waitKey(200) & 0xFF == ord('q'):
            break

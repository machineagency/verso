import cv2
import numpy as np

GRID_IMG_SIZE = (400, 400)

def flood_env_white(img, envelope_hw):
    return cv2.rectangle(img, (0, 0), envelope_hw, (255, 255, 255), cv2.FILLED)

def dot_at(pt):
    radius = 10
    dot_color = (0, 0, 255)
    return cv2.circle(img, pt, radius, dot_color, -1)

def crosshair_at(pt, img):
    max_y = img.shape[0]
    max_x = img.shape[1]
    x = pt[0]
    y = pt[1]
    length = 10
    pt_x_start = (max(x - length, 0), y)
    pt_x_end = (min(x + length, max_x), y)
    pt_y_start = (x, max(y - length, 0))
    pt_y_end = (x, min(y + length, max_y))
    line_from_to(pt_x_start, pt_x_end, 'cyan', img, 2)
    line_from_to(pt_y_start, pt_y_end, 'cyan', img, 2)
    return img

def line_from_to(p0, p1, color_name='red', img=None, thickness=5):
    if img is None:
        img_size_three_channel = GRID_IMG_SIZE + (3,)
        img = np.zeros(img_size_three_channel, np.float32)
    if color_name == 'white':
        color = (255, 255, 255)
    elif color_name == 'green':
        color = (0, 255, 0)
    elif color_name == 'red':
        color = (0, 0, 255)
    elif color_name == 'yellow':
        color = (0, 255, 255)
    elif color_name == 'cyan':
        color = (255, 255, 0)
    else:
        color = (255, 255, 255)
    p0 = (int(round(p0[0])), int(round(p0[1])))
    p1 = (int(round(p1[0])), int(round(p1[1])))
    return cv2.line(img, p0, p1, color, thickness, cv2.LINE_AA)

def guide_through_pts(p0, p1, proj_screen_hw, img):
    m_numer = p0[1] - p1[1]
    m_denom = p0[0] - p1[0]
    if m_numer == 0 and m_denom == 0:
        # Don't draw guides for co-point points
        return
    elif m_denom == 0:
        p_min = (p0[0], 0)
        p_max = (p0[0], proj_screen_hw[0])
    elif m_numer == 0:
        p_min = (0, p0[1])
        p_max = (proj_screen_hw[1], p0[1])
    else:
        m = m_numer / m_denom
        b = p0[1] - m * p0[0]
        # TODO: find out how to find points in non-axis-aligned case
        # Below is just a placeholder for now
        p_min = (0, 0)
        p_max = (proj_screen_hw[1], proj_screen_hw[0])
    return cv2.line(img, p_min, p_max, (255, 255, 0), 1, cv2.LINE_AA)

def rectangle_at(pt, width, height, img, color_name, filled=False):
    """
    Creates a rectangle whose top left corner is at PT, with WIDTH (delta X)
    and HEIGHT (delta Y).
    """
    end_pt = (pt[0] + width, pt[1] + height)
    if color_name == 'white':
        color = (255, 255, 255)
    elif color_name == 'green':
        color = (0, 255, 0)
    elif color_name == 'red':
        color = (0, 0, 255)
    elif color_name == 'yellow':
        color = (0, 255, 255)
    elif color_name == 'cyan':
        color = (255, 255, 0)
    else:
        color = (0, 0, 255)
    thickness = cv2.FILLED if filled else 2
    return cv2.rectangle(img, pt, end_pt, color, thickness)

def rectangle_centered_at(pt, width, height, img, color_name, filled=False):
    """
    Creates a rectangle centered at PT, with WIDTH (delta X)
    and HEIGHT (delta Y).
    """
    start_pt = (pt[0] - width // 2, pt[1] - height // 2)
    end_pt = (pt[0] + width // 2, pt[1] + height // 2)
    if color_name == 'white':
        color = (255, 255, 255)
    elif color_name == 'green':
        color = (0, 255, 0)
    elif color_name == 'red':
        color = (0, 0, 255)
    elif color_name == 'yellow':
        color = (0, 255, 255)
    elif color_name == 'cyan':
        color = (255, 255, 0)
    else:
        color = (0, 0, 255)
    thickness = cv2.FILLED if filled else 2
    return cv2.rectangle(img, start_pt, end_pt, color, thickness)

def rectangle_from_to(from_pt, to_pt, color_name, img):
    if color_name == 'white':
        color = (255, 255, 255)
    elif color_name == 'green':
        color = (0, 255, 0)
    elif color_name == 'red':
        color = (0, 0, 255)
    else:
        color = (255, 255, 255)
    thickness = 3
    return cv2.rectangle(img, from_pt, to_pt, color, thickness)

def text_at(text, pt, color_name='white', scale=1.5, img=None) -> None:
    """
    Creates text where PT is top left corner (not bottom left).
    """
    if img is None:
        img_size_three_channel = GRID_IMG_SIZE + (3,)
        img = np.zeros(img_size_three_channel, np.float32)
    if color_name == 'white':
        color = (255, 255, 255)
    elif color_name == 'black':
        color = (0, 0, 0)
    elif color_name == 'red':
        color = (0, 0, 255)
    else:
        color = (255, 255, 255)

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = scale
    thickness = round(scale * 2)
    bbox, _ = cv2.getTextSize(text, font, font_scale, thickness)
    y_offset = bbox[1]
    translated_pt = (pt[0], pt[1] + y_offset)
    cv2.putText(img, text, translated_pt, font, font_scale, color, \
                       thickness, cv2.LINE_AA)

def find_text_size(text):
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.5
    font_color = (255, 255, 255)
    thickness = 3
    bbox, _ = cv2.getTextSize(text, font, font_scale, thickness)
    return bbox


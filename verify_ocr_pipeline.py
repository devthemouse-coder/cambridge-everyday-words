"""
OCR pipeline visual verification against 1000019610.jpg.
Mirrors the JS logic in documentAlignment.ts + templateRegions.ts.
Saves all intermediate images to verify_output/ for manual inspection.
"""

import os, sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

IMG_PATH = r"C:\Users\n-mol\Downloads\1000019610.jpg"
OUT_DIR = os.path.join(os.path.dirname(__file__), "verify_output")
os.makedirs(OUT_DIR, exist_ok=True)

# --- mirror of templateRegions.ts ---
STANDARD_W = 1000
STANDARD_H = 1400
ROW_Y_RATIOS = [0.12, 0.28, 0.44, 0.60, 0.76]
ROW_H_RATIO  = 0.10

def get_row_rects():
    rects = []
    for ratio in ROW_Y_RATIOS:
        rects.append({
            "x": 0,
            "y": STANDARD_H * ratio,
            "w": STANDARD_W,
            "h": STANDARD_H * ROW_H_RATIO,
        })
    return rects

def get_cell_rects(row):
    eng = {
        "x": row["x"] + row["w"] * 0.12,
        "y": row["y"] + row["h"] * 0.08,
        "w": row["w"] * 0.36,
        "h": row["h"] * 0.72,
    }
    kor = {
        "x": row["x"] + row["w"] * 0.53,
        "y": row["y"] + row["h"] * 0.08,
        "w": row["w"] * 0.38,
        "h": row["h"] * 0.72,
    }
    return eng, kor

# --- mirror of documentAlignment.ts ---
def order_points(pts):
    pts = np.array(pts, dtype="float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype="float32")

def find_largest_quad(gray):
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges   = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    best_pts  = None
    best_area = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 20000:
            continue
        peri  = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(float)
            w = pts[:, 0].max() - pts[:, 0].min()
            h = pts[:, 1].max() - pts[:, 1].min()
            ratio = w / h if h > 0 else 0
            if 0.5 < ratio < 3.5 and area > best_area:
                best_area = area
                best_pts  = pts
    if best_pts is None:
        h, w = gray.shape
        best_pts = np.array([[0,0],[w,0],[w,h],[0,h]], dtype=float)
        print("  [WARN] no quad found – using full-image fallback")
    return order_points(best_pts)  # tl tr br bl

def warp_to_standard(img, quad):
    """quad: (tl, tr, br, bl) in original pixel coords"""
    dst = np.array([[0, 0],[STANDARD_W, 0],[STANDARD_W, STANDARD_H],[0, STANDARD_H]], dtype="float32")
    M   = cv2.getPerspectiveTransform(quad, dst)
    return cv2.warpPerspective(img, M, (STANDARD_W, STANDARD_H), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)

def split_dual_quad(quad):
    """quad: (tl, tr, br, bl)"""
    tl, tr, br, bl = quad
    mid_x = (tl[0] + tr[0] + br[0] + bl[0]) / 4
    mid_top_y    = (tl[1] + tr[1]) / 2
    mid_bottom_y = (bl[1] + br[1]) / 2
    left_quad  = order_points(np.array([tl, [mid_x, mid_top_y], [mid_x, mid_bottom_y], bl]))
    right_quad = order_points(np.array([[mid_x, mid_top_y], tr, br, [mid_x, mid_bottom_y]]))
    return left_quad, right_quad

def save(img_bgr, name):
    path = os.path.join(OUT_DIR, name)
    cv2.imwrite(path, img_bgr)
    print(f"  saved: {name}  ({img_bgr.shape[1]}x{img_bgr.shape[0]})")
    return path

def crop(img, rect):
    x1 = max(0, int(rect["x"]))
    y1 = max(0, int(rect["y"]))
    x2 = min(img.shape[1], int(rect["x"] + rect["w"]))
    y2 = min(img.shape[0], int(rect["y"] + rect["h"]))
    return img[y1:y2, x1:x2]

# ============================================================
print("\n=== STEP 1: Load original image ===")
orig = cv2.imread(IMG_PATH)
if orig is None:
    sys.exit(f"ERROR: cannot read {IMG_PATH}")
print(f"  image size: {orig.shape[1]}x{orig.shape[0]} (WxH)")
save(orig, "00_original.jpg")

# ============================================================
print("\n=== STEP 2: documentAlignment – find largest quad ===")
gray = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY)
quad = find_largest_quad(gray)
print(f"  quad corners (tl,tr,br,bl):\n  {quad}")

# draw quad on original
vis = orig.copy()
pts_draw = quad.astype(int)
cv2.polylines(vis, [pts_draw.reshape(-1,1,2)], True, (0,0,255), 8)
save(vis, "01_detected_quad.jpg")

# ============================================================
print("\n=== STEP 3: Dual-page split ===")
h, w = orig.shape[:2]
is_dual = w > h * 1.25 or w > 1200
print(f"  is_dual={is_dual}  (w={w}, h={h}, ratio={w/h:.2f})")

if is_dual:
    left_quad, right_quad = split_dual_quad(quad)
else:
    left_quad = quad
    right_quad = None

vis2 = orig.copy()
cv2.polylines(vis2, [left_quad.astype(int).reshape(-1,1,2)], True, (255,0,0), 6)
if right_quad is not None:
    cv2.polylines(vis2, [right_quad.astype(int).reshape(-1,1,2)], True, (0,200,0), 6)
cv2.putText(vis2, "LEFT", tuple(left_quad[0].astype(int)+np.array([10,40])),
            cv2.FONT_HERSHEY_SIMPLEX, 2, (255,0,0), 4)
if right_quad is not None:
    cv2.putText(vis2, "RIGHT", tuple(right_quad[0].astype(int)+np.array([10,40])),
                cv2.FONT_HERSHEY_SIMPLEX, 2, (0,200,0), 4)
save(vis2, "02_split_quads.jpg")

# ============================================================
print("\n=== STEP 4: Warp pages to standard size (1000x1400) ===")
left_warped = warp_to_standard(orig, left_quad)
save(left_warped, "03_left_page_warped.jpg")

right_warped = None
if right_quad is not None:
    right_warped = warp_to_standard(orig, right_quad)
    save(right_warped, "04_right_page_warped.jpg")

# ============================================================
print("\n=== STEP 5: Template overlay (5 rows × eng/kor areas) ===")
rows = get_row_rects()

def draw_template(page_img, label):
    vis = page_img.copy()
    for i, row in enumerate(rows):
        eng, kor = get_cell_rects(row)
        for cell, color, tag in [(eng,(0,80,255),"E"), (kor,(0,180,0),"K")]:
            x1,y1 = int(cell["x"]), int(cell["y"])
            x2,y2 = int(cell["x"]+cell["w"]), int(cell["y"]+cell["h"])
            cv2.rectangle(vis, (x1,y1),(x2,y2), color, 3)
            cv2.putText(vis, f"R{i+1}{tag}", (x1+4, y1+24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    return vis

left_template_vis = draw_template(left_warped, "LEFT")
save(left_template_vis, "05_left_template_overlay.jpg")

if right_warped is not None:
    right_template_vis = draw_template(right_warped, "RIGHT")
    save(right_template_vis, "06_right_template_overlay.jpg")

# ============================================================
print("\n=== STEP 6: Crop individual cells ===")
crops_to_check = [
    ("left",  0, "eng"),
    ("left",  0, "kor"),
    ("left",  1, "eng"),
    ("right", 0, "eng"),
    ("right", 0, "kor"),
    ("right", 4, "eng"),
]

row_rects = get_row_rects()
crop_results = {}

for side, row_idx, cell_type in crops_to_check:
    page_img = left_warped if side == "left" else right_warped
    if page_img is None:
        print(f"  SKIP {side} row{row_idx+1} {cell_type} (no page)")
        continue
    row  = row_rects[row_idx]
    eng, kor = get_cell_rects(row)
    rect = eng if cell_type == "eng" else kor
    c = crop(page_img, rect)
    fname = f"07_{side}_row{row_idx+1}_{cell_type}.jpg"
    save(c, fname)
    crop_results[f"{side}_row{row_idx+1}_{cell_type}"] = (c, fname)

# ============================================================
print("\n=== STEP 7: Visual summary of crop contents ===")
print("  Open verify_output/ and inspect the 07_* files manually.")
print("  Check that each crop contains readable text without clipping.")

# ============================================================
print("\n=== STEP 8: OCR (pytesseract) ===")
try:
    import pytesseract
    # Try common install locations
    for candidate in [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"C:\Users\n-mol\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
    ]:
        if os.path.exists(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            print(f"  Tesseract found: {candidate}")
            break
    else:
        raise RuntimeError("Tesseract binary not found. Install from https://github.com/UB-Mannheim/tesseract/wiki")

    EXPECTED = [
        ("left",  0, "eng", "Wednesday"),
        ("left",  0, "kor", "수요일"),
        ("left",  1, "eng", "April"),
        ("left",  1, "kor", "4월"),
        ("left",  2, "eng", "fall"),
        ("left",  2, "kor", "가을"),
        ("left",  3, "eng", "well"),
        ("left",  3, "kor", "잘, 건강한"),
        ("left",  4, "eng", "lunch"),
        ("left",  4, "kor", "점심"),
        ("right", 0, "eng", "when"),
        ("right", 0, "kor", "~할 때, 언제"),
        ("right", 1, "eng", "new"),
        ("right", 1, "kor", "새로운"),
        ("right", 2, "eng", "letter"),
        ("right", 2, "kor", "편지"),
        ("right", 3, "eng", "hear"),
        ("right", 3, "kor", "듣다"),
        ("right", 4, "eng", "English"),
        ("right", 4, "kor", "영어"),
    ]

    print("\n--- OCR results ---")
    for side, row_idx, cell_type, expected in EXPECTED:
        page_img = left_warped if side == "left" else right_warped
        if page_img is None:
            print(f"  SKIP {side} r{row_idx+1} {cell_type}")
            continue
        row  = row_rects[row_idx]
        eng, kor = get_cell_rects(row)
        rect = eng if cell_type == "eng" else kor
        c = crop(page_img, rect)

        # upscale 3x + threshold
        c_up = cv2.resize(c, (c.shape[1]*3, c.shape[0]*3), interpolation=cv2.INTER_CUBIC)
        gray_c = cv2.cvtColor(c_up, cv2.COLOR_BGR2GRAY)
        _, bw = cv2.threshold(gray_c, 170, 255, cv2.THRESH_BINARY)

        lang = "eng" if cell_type == "eng" else "kor"
        cfg  = "--psm 7" if cell_type == "eng" else "--psm 7"
        raw = pytesseract.image_to_string(bw, lang=lang, config=cfg).strip()
        match = "PASS" if expected.lower() in raw.lower() else "FAIL"
        print(f"  [{side} r{row_idx+1} {cell_type}] expected='{expected}'  got='{raw}'  → {match}")

except RuntimeError as e:
    print(f"\n  [OCR SKIP] {e}")
    print("  Install Tesseract then rerun. Visual crop check is still valid.")

print(f"\nAll output files written to: {OUT_DIR}")

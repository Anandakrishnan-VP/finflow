"""
OCR fallback parser for scanned bank statement PDFs and images.
Uses Tesseract via the sandboxed subprocess wrapper.
Provides advanced image preprocessing (deskew, denoise, binarize, contrast enhancement).
"""
import logging
import re
import tempfile
import hashlib
from decimal import Decimal
from datetime import datetime
from pathlib import Path
import cv2
import numpy as np
from schemas.uts import UniversalTransaction, TransactionType, TransactionFlag
from security.sandbox import run_sandboxed_tesseract

logger = logging.getLogger(__name__)
OCR_CONFIDENCE_THRESHOLD = 0.70  # Rows below this → human_review_queue

def is_pdf_scanned(file_path: str) -> bool:
    """
    Detects if a PDF is scanned by checking if the average character count
    extracted from the first 3 pages is less than 100.
    """
    try:
        import fitz
        doc = fitz.open(file_path)
        total_chars = 0
        pages_checked = min(3, len(doc))
        if pages_checked == 0:
            return True
        for i in range(pages_checked):
            total_chars += len((doc[i].get_text() or "").strip())
        doc.close()
        avg_chars = total_chars / pages_checked
        return avg_chars < 100
    except Exception as e:
        logger.warning("Error checking if PDF is scanned: %s. Assuming scanned.", e)
        return True

def preprocess_image(input_path: str, output_path: str) -> bool:
    """
    Advanced OpenCV image preprocessing:
    1. Grayscale conversion.
    2. Upscaling if resolution is low.
    3. Contrast limited adaptive histogram equalization (CLAHE).
    4. Median blur denoising.
    5. Adaptive Gaussian binarization.
    6. Hough line skew detection and deskewing.
    """
    try:
        img = cv2.imread(input_path)
        if img is None:
            return False
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Scale up if resolution is low to improve Tesseract accuracy
        h, w = gray.shape[:2]
        if h < 1500 or w < 1500:
            scale_factor = 2000.0 / min(h, w)
            gray = cv2.resize(gray, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)
            h, w = gray.shape[:2]
            
        # Contrast Enhancement
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Denoising
        denoised = cv2.medianBlur(enhanced, 3)
        
        # Binarization
        binarized = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # Deskewing using Canny + Hough Lines P
        edges = cv2.Canny(binarized, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 100, minLineLength=100, maxLineGap=10)
        angles = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
                if -45 < angle < 45:
                    angles.append(angle)
                    
        skew_angle = np.median(angles) if angles else 0.0
        if abs(skew_angle) > 0.5:
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, skew_angle, 1.0)
            binarized = cv2.warpAffine(binarized, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=255)
            
        cv2.imwrite(output_path, binarized)
        return True
    except Exception as e:
        logger.warning("Image pre-processing failed: %s. Using original image.", e)
        return False
async def parse_scanned_pdf(file_path: str, bank_name: str, progress_callback = None) -> list[UniversalTransaction]:
    """
    Convert each PDF page to image, run advanced preprocessing, run Tesseract, and parse TSV output.
    """
    import fitz  # PyMuPDF
    doc = fitz.open(file_path)
    txns = []
    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
    total_pages = len(doc)

    for page_num, page in enumerate(doc):
        # Report page progress
        if progress_callback:
            pct = int(85 + (15 * (page_num + 1) / total_pages))
            await progress_callback(pct, f"OCR processing page {page_num + 1} of {total_pages}...")
            
        # Render page at 300 DPI
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat)
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_raw:
            pix.save(tmp_raw.name)
            
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
            success = preprocess_image(tmp_raw.name, tmp_proc.name)
            img_to_ocr = tmp_proc.name if success else tmp_raw.name
            
        tsv_text = await run_sandboxed_tesseract(img_to_ocr, lang="eng+hin")
        
        # Cleanup temp files
        Path(tmp_raw.name).unlink(missing_ok=True)
        Path(tmp_proc.name).unlink(missing_ok=True)

        if not tsv_text:
            continue

        page_txns = _parse_tsv(tsv_text, bank_name, file_hash)
        txns.extend(page_txns)

    doc.close()
    return txns


async def parse_image_file(file_path: str, bank_name: str) -> list[UniversalTransaction]:
    """
    Run Tesseract OCR directly on image files with preprocessing.
    """
    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
        success = preprocess_image(file_path, tmp_proc.name)
        img_to_ocr = tmp_proc.name if success else file_path
        
    tsv_text = await run_sandboxed_tesseract(img_to_ocr, lang="eng+hin")
    Path(tmp_proc.name).unlink(missing_ok=True)
    
    if not tsv_text:
        return []
    return _parse_tsv(tsv_text, bank_name, file_hash)

def _parse_tsv(tsv_text: str, bank_name: str, file_hash: str) -> list[UniversalTransaction]:
    """
    Reconstruct tabular cells from Tesseract TSV using vertical overlap
    and horizontal proximity.
    """
    lines = tsv_text.strip().split("\n")
    if len(lines) < 2:
        return []

    headers = lines[0].split("\t")
    try:
        left_idx = headers.index("left")
        top_idx = headers.index("top")
        width_idx = headers.index("width")
        height_idx = headers.index("height")
        conf_idx = headers.index("conf")
        text_idx = headers.index("text")
    except ValueError:
        return []

    words = []
    total_conf = 0.0
    conf_count = 0

    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) <= text_idx:
            continue
        text = parts[text_idx].strip()
        if not text:
            continue
        try:
            left = int(parts[left_idx])
            top = int(parts[top_idx])
            width = int(parts[width_idx])
            height = int(parts[height_idx])
            conf = float(parts[conf_idx])
        except ValueError:
            continue

        words.append({
            "left": left,
            "top": top,
            "width": width,
            "height": height,
            "conf": conf,
            "text": text
        })
        if conf > 0:
            total_conf += conf
            conf_count += 1

    if not words:
        return []

    avg_confidence = (total_conf / conf_count) if conf_count > 0 else 0.0

    # Sort words by top coordinate
    words.sort(key=lambda w: w["top"])

    # Group words into rows based on vertical overlap (>40% overlap with average height of the row)
    rows = []
    for w in words:
        placed = False
        for row in rows:
            row_top = sum(r["top"] for r in row) / len(row)
            row_height = sum(r["height"] for r in row) / len(row)
            row_bottom = row_top + row_height

            w_top = w["top"]
            w_bottom = w["top"] + w["height"]

            overlap = min(row_bottom, w_bottom) - max(row_top, w_top)
            min_h = min(row_height, w["height"])
            if min_h > 0 and (overlap / min_h) > 0.4:
                row.append(w)
                placed = True
                break
        if not placed:
            rows.append([w])

    # Sort rows vertically by average top coordinate
    rows.sort(key=lambda r: sum(w["top"] for w in r) / len(r))

    # Reconstruct cells in each row by combining words separated by small horizontal gaps
    table = []
    for row in rows:
        row.sort(key=lambda w: w["left"])
        cells = []
        current_cell_words = []
        for w in row:
            if not current_cell_words:
                current_cell_words.append(w)
            else:
                last_w = current_cell_words[-1]
                gap = w["left"] - (last_w["left"] + last_w["width"])
                max_gap = 2.5 * max(w["height"], last_w["height"])
                if gap < max_gap:
                    current_cell_words.append(w)
                else:
                    cells.append(" ".join(wd["text"] for wd in current_cell_words))
                    current_cell_words = [w]
        if current_cell_words:
            cells.append(" ".join(wd["text"] for wd in current_cell_words))
        table.append(cells)

    # Use generic parser to parse this table structure
    from parsers.generic_parser import parse_generic_table
    txns = parse_generic_table(table, bank_name, file_hash)

    # Set OCR confidence and low confidence flags
    for t in txns:
        t.ocr_confidence = avg_confidence / 100.0
        if avg_confidence < OCR_CONFIDENCE_THRESHOLD * 100:
            t.flags.append(TransactionFlag.LOW_OCR_CONFIDENCE)

    return txns


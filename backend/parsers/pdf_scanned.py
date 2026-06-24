"""
OCR fallback parser for scanned bank statement PDFs and images.
Uses Tesseract via the sandboxed subprocess wrapper.
Provides advanced image preprocessing (deskew, denoise, binarize, contrast enhancement).
"""
import importlib.metadata
original_version = importlib.metadata.version
def patched_version(pkg_name):
    if pkg_name == 'torch':
        return '2.12.1'
    return original_version(pkg_name)
importlib.metadata.version = patched_version

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

# Patch SuryaOCRConfig to avoid KeyError with newer transformers versions
try:
    from surya.model.recognition.config import SuryaOCRConfig
    original_init = SuryaOCRConfig.__init__
    def patched_init(self, *args, **kwargs):
        if "encoder" not in kwargs and "decoder" not in kwargs:
            from transformers import PretrainedConfig
            super(SuryaOCRConfig, self).__init__(**kwargs)
            self.encoder = None
            self.decoder = None
            self.is_encoder_decoder = True
            self.decoder_start_token_id = None
            self.pad_token_id = None
            self.eos_token_id = None
        else:
            original_init(self, *args, **kwargs)
    SuryaOCRConfig.__init__ = patched_init
    SuryaOCRConfig.get_text_config = lambda self, *args, **kwargs: self.decoder
except Exception as e:
    logger.warning("Failed to apply SuryaOCRConfig patch: %s", e)

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
    5. Deskewing using Hough lines on binarized image, applying rotation to grayscale.
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
        
        # Binarize ONLY for skew detection
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
        
        output_img = denoised
        if abs(skew_angle) > 0.5:
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, skew_angle, 1.0)
            output_img = cv2.warpAffine(denoised, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=255)
            
        cv2.imwrite(output_path, output_img)
        return True
    except Exception as e:
        logger.warning("Image pre-processing failed: %s. Using original image.", e)
        return False

async def run_surya_ocr(image_path: str, langs: list[str] = ["en"]) -> tuple[list[dict], float]:
    import gc
    import torch
    from PIL import Image
    
    from surya.model.detection.model import load_model as load_det_model, load_processor as load_det_processor
    from surya.model.recognition.model import load_model as load_ocr_model
    from surya.model.recognition.processor import load_processor as load_rec_processor
    from surya.detection import batch_text_detection
    from surya.recognition import batch_recognition
    from surya.input.processing import slice_polys_from_image
    from surya.postprocessing.text import sort_text_lines
    from surya.schema import TextLine

    img = Image.open(image_path).convert("RGB")

    # Determine device and batch size
    device = "cuda"
    dtype = torch.float16
    rec_batch_size = 8

    # 1. Detection Phase (load model, detect, unload)
    try:
        logger.info(f"Loading Surya detection model on {device}...")
        det_model = load_det_model(device=device, dtype=dtype)
        det_processor = load_det_processor()
        
        logger.info("Running text detection...")
        det_predictions = batch_text_detection([img], det_model, det_processor)
        
        # Free detection model from GPU memory
        del det_model
        del det_processor
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    except Exception as e:
        if device == "cuda" and ("out of memory" in str(e).lower() or "cuda" in str(e).lower()):
            logger.warning("CUDA OOM or error during detection. Falling back to CPU.")
            device = "cpu"
            dtype = torch.float32
            
            # Clean up and try again on CPU
            gc.collect()
            torch.cuda.empty_cache()
            
            logger.info("Loading Surya detection model on CPU...")
            det_model = load_det_model(device="cpu", dtype=torch.float32)
            det_processor = load_det_processor()
            
            logger.info("Running text detection on CPU...")
            det_predictions = batch_text_detection([img], det_model, det_processor)
            
            del det_model
            del det_processor
            gc.collect()
        else:
            raise e

    if not det_predictions:
        return [], 0.0

    det_pred = det_predictions[0]
    polygons = [p.polygon for p in det_pred.bboxes]
    slices = slice_polys_from_image(img, polygons)

    # 2. Recognition Phase (load model, recognize, unload)
    try:
        logger.info(f"Loading Surya recognition model on {device}...")
        rec_model = load_ocr_model(device=device, dtype=dtype)
        rec_processor = load_rec_processor()

        logger.info(f"Running text recognition (batch_size={rec_batch_size})...")
        rec_predictions, confidence_scores = batch_recognition(slices, [langs] * len(slices), rec_model, rec_processor, batch_size=rec_batch_size)

        # Free recognition model from GPU memory
        del rec_model
        del rec_processor
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    except Exception as e:
        if device == "cuda" and ("out of memory" in str(e).lower() or "cuda" in str(e).lower()):
            logger.warning("CUDA OOM or error during recognition. Falling back to CPU.")
            device = "cpu"
            dtype = torch.float32
            rec_batch_size = None  # Use default for CPU
            
            # Clean up and try again on CPU
            gc.collect()
            torch.cuda.empty_cache()
            
            logger.info("Loading Surya recognition model on CPU...")
            rec_model = load_ocr_model(device="cpu", dtype=torch.float32)
            rec_processor = load_rec_processor()
            
            logger.info("Running text recognition on CPU...")
            rec_predictions, confidence_scores = batch_recognition(slices, [langs] * len(slices), rec_model, rec_processor, batch_size=rec_batch_size)
            
            del rec_model
            del rec_processor
            gc.collect()
        else:
            raise e

    # Reconstruct TextLines
    lines = []
    for text_line, confidence, bbox in zip(rec_predictions, confidence_scores, det_pred.bboxes):
        lines.append(TextLine(
            text=text_line,
            polygon=bbox.polygon,
            bbox=bbox.bbox,
            confidence=confidence
        ))

    lines = sort_text_lines(lines)

    # Convert to words dictionary format for the rest of the parsing pipeline
    words = []
    total_conf = 0.0
    conf_count = 0

    for line in lines:
        x1, y1, x2, y2 = line.bbox
        left = int(x1)
        top = int(y1)
        width = int(x2 - x1)
        height = int(y2 - y1)
        line_text = line.text
        confidence = getattr(line, "confidence", 1.0)

        line_words = line_text.split()
        if not line_words:
            continue

        num_chars = sum(len(w) for w in line_words)
        if num_chars == 0:
            continue
            
        current_x = left
        char_width = width / (num_chars + len(line_words) - 1) if (num_chars + len(line_words) - 1) > 0 else width
        
        for word in line_words:
            w_len = len(word)
            w_width = w_len * char_width
            w_left = int(current_x)
            w_top = int(top)
            w_w = int(w_width)
            w_h = int(height)
            
            words.append({
                "left": w_left,
                "top": w_top,
                "width": w_w,
                "height": w_h,
                "text": word
            })
            current_x += w_width + char_width
            
        if confidence is not None:
            total_conf += confidence
            conf_count += 1
            
    avg_confidence = (total_conf / conf_count) if conf_count > 0 else 1.0
    return words, avg_confidence

async def parse_page_ocr(img_to_ocr: str, bank_name: str, file_hash: str, column_mapping: dict = None) -> list[UniversalTransaction]:
    try:
        import surya
        words, avg_confidence = await run_surya_ocr(img_to_ocr)
        table = reconstruct_table_from_words(words)
        if not table:
            return []
        if not column_mapping:
            table = expand_collapsed_rows(table)
            if not table:
                return []
        from parsers.generic_parser import parse_generic_table
        txns = parse_generic_table(table, bank_name, file_hash, column_mapping=column_mapping)
        for t in txns:
            t.ocr_confidence = avg_confidence
            if avg_confidence < OCR_CONFIDENCE_THRESHOLD:
                t.flags.append(TransactionFlag.LOW_OCR_CONFIDENCE)
        return txns
    except Exception as e:
        logger.exception("Surya OCR failed, falling back to Tesseract: %s", e)
        tsv_text = await run_sandboxed_tesseract(img_to_ocr, lang="eng")
        if not tsv_text:
            return []
        return _parse_tsv(tsv_text, bank_name, file_hash, column_mapping=column_mapping)

async def parse_scanned_pdf(file_path: str, bank_name: str, progress_callback = None, column_mapping: dict = None) -> list[UniversalTransaction]:
    """
    Convert each PDF page to image, run advanced preprocessing, run Surya OCR, and parse table.
    If column_mapping is provided (from manual UI mapping), it is passed to the generic table parser.
    """
    import fitz  # PyMuPDF
    doc = fitz.open(file_path)
    txns = []
    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
    total_pages = len(doc)

    for page_num, page in enumerate(doc):
        if progress_callback:
            pct = int(85 + (15 * (page_num + 1) / total_pages))
            await progress_callback(pct, f"OCR processing page {page_num + 1} of {total_pages}...")
            
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat)
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_raw:
            pix.save(tmp_raw.name)
            
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
            success = preprocess_image(tmp_raw.name, tmp_proc.name)
            img_to_ocr = tmp_proc.name if success else tmp_raw.name
            
        page_txns = await parse_page_ocr(img_to_ocr, bank_name, file_hash, column_mapping=column_mapping)
        txns.extend(page_txns)
        
        Path(tmp_raw.name).unlink(missing_ok=True)
        Path(tmp_proc.name).unlink(missing_ok=True)

    doc.close()
    return txns


async def parse_image_file(file_path: str, bank_name: str, column_mapping: dict = None) -> list[UniversalTransaction]:
    """
    Run Surya OCR directly on image files with preprocessing.
    If column_mapping is provided, it is passed to the generic table parser.
    """
    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
        success = preprocess_image(file_path, tmp_proc.name)
        img_to_ocr = tmp_proc.name if success else file_path
        
    txns = await parse_page_ocr(img_to_ocr, bank_name, file_hash, column_mapping=column_mapping)
    Path(tmp_proc.name).unlink(missing_ok=True)
    return txns

def group_words_into_rows(words: list) -> list[list[dict]]:
    """
    Group OCR words into rows using vertical center-of-mass clustering.
    Words within 60% of average word height of each other belong to the same row.
    """
    if not words:
        return []
    words.sort(key=lambda w: w["top"])
    rows = []
    curr_row = [words[0]]
    for w in words[1:]:
        avg_h = sum(x.get("height", 20) for x in curr_row) / len(curr_row)
        avg_top = sum(x["top"] for x in curr_row) / len(curr_row)
        if abs(w["top"] - avg_top) < max(avg_h * 0.65, 10):
            curr_row.append(w)
        else:
            rows.append(sorted(curr_row, key=lambda x: x["left"]))
            curr_row = [w]
    rows.append(sorted(curr_row, key=lambda x: x["left"]))
    return [r for r in rows if r]


def detect_column_boundaries(words: list) -> list[int]:
    """
    Detect column boundaries using x-axis histogram analysis.

    All words in a given column start at nearly the same x position, forming
    a peak in the histogram. The gaps (valleys) between those peaks are the
    column separators. This is the same core technique used by AWS Textract
    and Azure Form Recognizer for column detection without model training.

    Returns a sorted list of x-pixel boundary positions including 0 and max_x+1.
    """
    if not words:
        return [0, 1]
    max_x = max(w["left"] + w["width"] for w in words) + 1
    # Build pixel-level occupancy mask (1 if any word covers that x-pixel)
    mask = np.zeros(max_x, dtype=np.int32)
    for w in words:
        lo = max(0, w["left"])
        hi = min(max_x, w["left"] + w["width"])
        mask[lo:hi] += 1

    # Smooth slightly to merge hairline gaps within words
    kernel_size = max(3, max_x // 300)
    smoothed = np.convolve(mask.astype(float), np.ones(kernel_size) / kernel_size, mode="same")

    # A column boundary is a contiguous zero-run in the smoothed mask
    boundaries = [0]
    in_gap = False
    gap_start = 0
    for i, v in enumerate(smoothed):
        if v < 0.5 and not in_gap:
            in_gap = True
            gap_start = i
        elif v >= 0.5 and in_gap:
            in_gap = False
            gap_mid = (gap_start + i) // 2
            # Ignore gaps narrower than 1% of page width (noise)
            if gap_mid - boundaries[-1] >= max(8, max_x // 100):
                boundaries.append(gap_mid)
    boundaries.append(max_x)

    # Deduplicate and sort
    boundaries = sorted(set(boundaries))
    logger.debug("Histogram column boundaries: %s (page_width=%d)", boundaries, max_x)
    return boundaries


def reconstruct_table_from_words(words: list[dict]) -> list[list[str]]:
    """
    Reconstruct tabular rows from grouped words with bounding boxes:
      1. Vertical clustering → groups words into rows.
      2. Histogram-based column boundary detection → finds column separators
         from x-axis occupancy valleys across the ENTIRE page.
    """
    if not words:
        return []

    # Step 1: Group words into rows
    rows = group_words_into_rows(words)

    # Step 2: Detect column boundaries from ALL words across the page
    col_boundaries = detect_column_boundaries(words)
    num_cols = max(1, len(col_boundaries) - 1)

    # Step 3: Assign each word to a column slot, build table rows
    table = []
    for row in rows:
        col_slots: list[list[str]] = [[] for _ in range(num_cols)]
        for w in row:
            # Find which column interval this word's left-edge falls into
            col_idx = num_cols - 1
            for i in range(len(col_boundaries) - 1):
                if col_boundaries[i] <= w["left"] < col_boundaries[i + 1]:
                    col_idx = i
                    break
            col_slots[min(col_idx, num_cols - 1)].append(w["text"])

        cells = [" ".join(slot) for slot in col_slots]
        # Keep all columns to preserve rectangular structure for downstream parsing
        if any(c.strip() for c in cells):
            table.append(cells)

    return table


def reconstruct_table_from_tsv(tsv_text: str) -> list[list[str]]:
    """
    Reconstruct tabular rows from Tesseract TSV output.
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
        text_idx = headers.index("text")
    except ValueError:
        return []

    words = []
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
            words.append({"left": left, "top": top, "width": width, "height": height, "text": text})
        except (ValueError, IndexError):
            continue

    return reconstruct_table_from_words(words)


# Date pattern: matches "2 Jan 2013", "04-01-2013", "2013-01-04", "04/01/2013" etc.
_DATE_PREFIX_RE = re.compile(
    r'^(\d{1,2}[\s/\-\.][A-Za-z]{3}[\s/\-\.]\d{2,4}'   # 2 Jan 2013
    r'|\d{1,2}[\s/\-\.]\d{1,2}[\s/\-\.]\d{2,4}'         # 04/01/2013
    r'|\d{4}[\-/]\d{2}[\-/]\d{2})'                       # 2013-01-04
)

# Amount pattern: float with optional commas, at end of a token
_AMOUNT_RE = re.compile(r'(\d[\d,]*\.\d{2})$')

def clean_ocr_amount_token(tok: str) -> str | None:
    """
    Strips prefix/suffix noise (e.g. parenthetical characters, currency symbols, asterisks)
    from a token and verifies if it matches a standard decimal or integer number.
    Replaces common OCR letter misreads (O/o -> 0, I/l -> 1).
    """
    cleaned = tok.strip()
    # Strip any trailing non-alphanumeric/non-digit chars like *, ), ], |, ., etc.
    cleaned = re.sub(r'[^0-9a-zA-Z]+$', '', cleaned)
    # Strip any leading non-alphanumeric/non-digit chars
    cleaned = re.sub(r'^[^0-9a-zA-Z\-]+', '', cleaned)
    
    # Check if it ends with CR or DR (case insensitive) and strip it
    cr_dr_match = re.search(r'(?i)(cr|dr|c|d)$', cleaned)
    if cr_dr_match:
        cleaned = cleaned[:cr_dr_match.start()].strip()
        
    # Also strip any trailing non-digit chars again (after removing cr/dr)
    cleaned = re.sub(r'\D+$', '', cleaned)
    
    if not cleaned:
        return None

    # Replace common OCR misreads: O/o -> 0, I/l -> 1
    if any(c.isdigit() for c in cleaned):
        cleaned = re.sub(r'\.[oO0][oO0]$', '.00', cleaned)
        cleaned = re.sub(r'\.[oO0]$', '.0', cleaned)
        cleaned = cleaned.replace('O', '0').replace('o', '0').replace('l', '1').replace('I', '1')
        
    # Remove commas
    num_str = cleaned.replace(',', '')
    
    # Must match a standard float or integer:
    if re.match(r'^\-?\d+(\.\d+)?$', num_str):
        return cleaned
    return None


def expand_collapsed_rows(table: list[list[str]]) -> list[list[str]]:
    """
    Post-process for scanned PDFs where the histogram finds only 1-2 columns
    because pixel-level column gaps are absent (columns physically touch).

    Strategy:
      If the table has 1-2 columns AND any cell starts with a date pattern,
      attempt to split each cell into [date, narration, debit, credit, balance] by:
        1. Extracting a leading date token from the joined row text.
        2. Extracting trailing amount tokens (right-aligned numbers) using right-to-left scan.
        3. Everything in between = narration.
        4. Classify amounts into Debit, Credit, and Balance.
        5. Prepend standard headers ["Date", "Narration", "Debit", "Credit", "Balance"].

    Returns the table unchanged if expansion is not warranted.
    """
    if not table:
        return table

    # Only trigger if most rows have <= 2 columns (or if the table is collapsed)
    from collections import Counter
    col_dist = Counter(len(r) for r in table)
    if not col_dist:
        return table
    most_common_len = col_dist.most_common(1)[0][0]
    if most_common_len > 3:
        return table  # Already has proper columns — don't touch

    # Helper: Check if a joined row starts with or contains a date pattern
    def get_row_date_match(row: list[str]):
        row_text = " ".join(c for c in row if c).strip()
        return _DATE_PREFIX_RE.match(row_text)

    # Count how many rows have a valid date prefix
    date_rows = sum(1 for r in table if get_row_date_match(r))
    if date_rows < 2:  # Lowered slightly to be more robust for small statements
        return table  # Doesn't look like a transaction table — don't touch

    logger.info(
        "expand_collapsed_rows: detected collapsed table (%d cols), expanding %d date rows",
        most_common_len, date_rows
    )

    credit_keywords = {"credit", "cr", "deposit", "dep", "refund", "salary", "interest", "received", "credited"}

    expanded = [["Date", "Narration", "Debit", "Credit", "Balance"]]
    for row in table:
        if not row:
            continue
        
        row_text = " ".join(c for c in row if c).strip()
        dm = _DATE_PREFIX_RE.match(row_text)
        if not dm:
            # Keep header/metadata rows as-is, but pad them to 5 columns
            non_empty = [c for c in row if c.strip()]
            if non_empty:
                val = " ".join(non_empty)
                expanded.append(["", val, "", "", ""])
            continue

        date_str = dm.group(0)
        rest = row_text[dm.end():].strip()

        # Split remaining text into tokens
        tokens = rest.split()
        amounts = []
        narration_tokens = []

        # Right-to-left scan to separate trailing amounts from narration
        in_amounts = True
        for tok in reversed(tokens):
            if not in_amounts:
                narration_tokens.insert(0, tok)
                continue
                
            cleaned = clean_ocr_amount_token(tok)
            if cleaned:
                # If we already have 2 amounts, the 3rd one must have a decimal point to be accepted
                # (to avoid capturing ATM IDs, dates, or other integer codes from narration)
                if len(amounts) >= 2 and "." not in cleaned:
                    in_amounts = False
                    narration_tokens.insert(0, tok)
                else:
                    amounts.insert(0, cleaned)
            else:
                in_amounts = False
                narration_tokens.insert(0, tok)

        narration = " ".join(narration_tokens).strip()

        # Classify amounts into Debit, Credit, Balance
        debit = ""
        credit = ""
        balance = ""

        # Lowercase narration for credit check
        narration_lower = narration.lower()
        has_credit_kw = any(kw in narration_lower for kw in credit_keywords) or "cr" in [t.lower() for t in tokens]

        if len(amounts) == 1:
            amt = amounts[0]
            amt_lower = amt.lower()
            if "cr" in amt_lower:
                credit = amt
            elif "dr" in amt_lower:
                debit = amt
            elif has_credit_kw:
                credit = amt
            else:
                debit = amt
        elif len(amounts) == 2:
            amt1, amt2 = amounts[0], amounts[1]
            balance = amt2
            amt1_lower = amt1.lower()
            if "cr" in amt1_lower:
                credit = amt1
            elif "dr" in amt1_lower:
                debit = amt1
            elif has_credit_kw:
                credit = amt1
            else:
                debit = amt1
        elif len(amounts) >= 3:
            debit = amounts[0]
            credit = amounts[1]
            balance = amounts[-1]

        expanded.append([date_str, narration, debit, credit, balance])

    return expanded



def _parse_tsv(tsv_text: str, bank_name: str, file_hash: str, column_mapping: dict = None) -> list[UniversalTransaction]:
    """
    Parse Tesseract TSV output into UniversalTransactions.
    If column_mapping is provided, the generic parser uses the manual column overrides
    instead of auto-detecting header and column roles.
    """
    table = reconstruct_table_from_tsv(tsv_text)
    if not table:
        return []

    # Attempt to expand collapsed single/dual column tables (scanned PDFs with no pixel gaps)
    if not column_mapping:
        table = expand_collapsed_rows(table)
        if not table:
            return []


    lines = tsv_text.strip().split("\n")
    headers = lines[0].split("\t")
    try:
        conf_idx = headers.index("conf")
    except ValueError:
        return []

    total_conf = 0.0
    conf_count = 0
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) <= conf_idx:
            continue
        try:
            conf = float(parts[conf_idx])
            if conf > 0:
                total_conf += conf
                conf_count += 1
        except ValueError:
            continue

    avg_confidence = (total_conf / conf_count) if conf_count > 0 else 0.0

    # Use generic parser to parse this table structure, passing column_mapping if provided
    from parsers.generic_parser import parse_generic_table
    txns = parse_generic_table(table, bank_name, file_hash, column_mapping=column_mapping)

    # Set OCR confidence and low confidence flags
    for t in txns:
        t.ocr_confidence = avg_confidence / 100.0
        if avg_confidence < OCR_CONFIDENCE_THRESHOLD * 100:
            t.flags.append(TransactionFlag.LOW_OCR_CONFIDENCE)

    return txns


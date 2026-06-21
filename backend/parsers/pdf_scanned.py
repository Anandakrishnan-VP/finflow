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

def collapse_spaced_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\n", "  ").replace("\r", "  ")
    chunks = re.split(r'\s{2,}', text)
    processed_chunks = []
    for chunk in chunks:
        tokens = chunk.split()
        if not tokens:
            continue
        merged_tokens = []
        temp_seq = []
        for t in tokens:
            if len(t) == 1:
                temp_seq.append(t)
            else:
                if temp_seq:
                    merged_tokens.append("".join(temp_seq))
                    temp_seq = []
                merged_tokens.append(t)
        if temp_seq:
            merged_tokens.append("".join(temp_seq))
        processed_chunks.append(" ".join(merged_tokens))
    return " ".join(processed_chunks).strip()

def clean_ocr_cell(val) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        text = "  ".join(str(item).strip() for item in val if item is not None)
    else:
        text = str(val).strip()
    return collapse_spaced_text(text)


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

async def parse_scanned_pdf(file_path: str, bank_name: str, progress_callback = None, column_mapping: dict = None) -> list[UniversalTransaction]:
    """
    Convert each PDF page to image, run advanced preprocessing, run Tesseract, and parse TSV output.
    If column_mapping is provided (from manual UI mapping), it is passed to the generic table parser.
    """
    import fitz  # PyMuPDF
    from img2table.document import PDF as Img2TablePDF
    from img2table.ocr import TesseractOCR as Img2TableTesseract
    from parsers.generic_parser import parse_generic_table
    import pandas as pd

    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
    txns = []

    logger.info("Attempting local OpenCV visual table parsing with img2table on %s", file_path)
    
    try:
        # Initialize local Tesseract engine inside img2table
        ocr = Img2TableTesseract(n_threads=1, lang="eng")
        doc = Img2TablePDF(src=file_path)
        
        # Extract tables from the entire document
        # implicit_rows=True finds cells without explicit horizontal borders
        # borderless_tables=True finds tables without enclosing boxes
        extracted_tables = doc.extract_tables(ocr=ocr, implicit_rows=True, borderless_tables=True)
    except Exception as e:
        logger.error("img2table extraction failed or crashed: %s. Falling back to raw OCR.", e)
        extracted_tables = {}

    total_tables_extracted = sum(len(tables) for tables in extracted_tables.values()) if extracted_tables else 0
    
    if total_tables_extracted > 0:
        logger.info("OpenCV visual table parsing extracted %d tables across pages.", total_tables_extracted)
        try:
            pdf_doc = fitz.open(file_path)
            total_pages = len(pdf_doc)
            pdf_doc.close()
        except Exception:
            total_pages = max(extracted_tables.keys()) + 1 if extracted_tables else 1

        last_valid_mapping = None
        from parsers.generic_parser import HEADER_PATTERNS

        for page_idx in sorted(extracted_tables.keys()):
            if progress_callback:
                pct = int(85 + (15 * (page_idx + 1) / total_pages))
                await progress_callback(pct, f"Parsing table on page {page_idx + 1} of {total_pages}...")
            
            tables_on_page = extracted_tables[page_idx]
            for t in tables_on_page:
                df = t.df
                if df is None or df.empty:
                    continue
                
                # Convert DataFrame to list of lists of strings
                table_grid = []
                headers = [clean_ocr_cell(c) for c in df.columns]
                if not all(str(h).isdigit() for h in headers):
                    table_grid.append(headers)
                
                for _, row in df.iterrows():
                    table_grid.append([clean_ocr_cell(val) for val in row])
                
                table_grid = [r for r in table_grid if any(c.strip() for c in r)]
                
                if not table_grid:
                    continue

                current_mapping = column_mapping
                if not current_mapping and last_valid_mapping:
                    # Check if the page has a complete header row
                    has_complete_header = False
                    for r in table_grid[:5]:
                        score = 0
                        matched_keys = set()
                        for cell in r:
                            cell_lower = cell.lower().strip()
                            if not cell_lower:
                                continue
                            for key, patterns in HEADER_PATTERNS.items():
                                for pattern in patterns:
                                    if re.search(pattern, cell_lower):
                                        if key not in matched_keys:
                                            matched_keys.add(key)
                                            score += 1
                                            break
                        if score >= 2 and "date" in matched_keys:
                            has_complete_header = True
                            break

                    if not has_complete_header:
                        valid_vals = [val for val in last_valid_mapping.values() if val is not None]
                        if valid_vals:
                            max_idx = max(valid_vals)
                            if max_idx < len(table_grid[0]):
                                logger.info(
                                    "Page %d table has no complete header. Inheriting column layout from previous page.",
                                    page_idx + 1
                                )
                                current_mapping = last_valid_mapping

                page_txns, actual_mapping = parse_generic_table(
                    table_grid, bank_name, file_hash, column_mapping=current_mapping, return_mapping=True
                )
                
                if page_txns and actual_mapping.get("date") is not None:
                    last_valid_mapping = actual_mapping

                for txn in page_txns:
                    txn.ocr_confidence = 0.82
                txns.extend(page_txns)
                
        if txns:
            # Global year alignment: align any 1900 or 2026/current year transactions to the most common year in the statement
            years = [t.txn_date.year for t in txns if t.txn_date and t.txn_date.year not in (datetime.now().year, 2026, 1900)]
            if years:
                from collections import Counter
                most_common_year = Counter(years).most_common(1)[0][0]
                logger.info("Global year alignment: replacing default 1900/current years with most common year %d", most_common_year)
                for t in txns:
                    if t.txn_date and t.txn_date.year in (datetime.now().year, 2026, 1900):
                        try:
                            t.txn_date = t.txn_date.replace(year=most_common_year)
                        except ValueError:
                            pass

            logger.info("Successfully extracted %d transactions using local OpenCV img2table.", len(txns))
            return txns

    # Fallback to Tesseract TSV word position clustering
    logger.warning("img2table yielded no transactions. Falling back to raw Tesseract TSV text clustering.")
    
    try:
        pdf_doc = fitz.open(file_path)
        total_pages = len(pdf_doc)
    except Exception as e:
        logger.error("Failed to open PDF for fallback OCR: %s", e)
        return []

    for page_num in range(total_pages):
        if progress_callback:
            pct = int(85 + (15 * (page_num + 1) / total_pages))
            await progress_callback(pct, f"Fallback OCR processing page {page_num + 1} of {total_pages}...")
            
        mat = fitz.Matrix(300/72, 300/72)
        try:
            page = pdf_doc[page_num]
            pix = page.get_pixmap(matrix=mat)
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_raw:
                pix.save(tmp_raw.name)
                
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
                success = preprocess_image(tmp_raw.name, tmp_proc.name)
                img_to_ocr = tmp_proc.name if success else tmp_raw.name
                
            tsv_text = await run_sandboxed_tesseract(img_to_ocr, lang="eng")
            
            Path(tmp_raw.name).unlink(missing_ok=True)
            Path(tmp_proc.name).unlink(missing_ok=True)
            
            if tsv_text:
                page_txns = _parse_tsv(tsv_text, bank_name, file_hash, column_mapping=column_mapping)
                txns.extend(page_txns)
        except Exception as e:
            logger.error("Error running fallback OCR on page %d: %s", page_num, e)
            
    pdf_doc.close()
    return txns


async def parse_image_file(file_path: str, bank_name: str, column_mapping: dict = None) -> list[UniversalTransaction]:
    """
    Run Tesseract OCR directly on image files with preprocessing.
    If column_mapping is provided, it is passed to the generic table parser.
    """
    from img2table.document import Image as Img2TableImage
    from img2table.ocr import TesseractOCR as Img2TableTesseract
    from parsers.generic_parser import parse_generic_table
    import pandas as pd

    file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
    
    # Try img2table first
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
            success = preprocess_image(file_path, tmp_proc.name)
            img_to_process = tmp_proc.name if success else file_path
            
        ocr = Img2TableTesseract(n_threads=1, lang="eng")
        doc = Img2TableImage(src=img_to_process)
        extracted_tables = doc.extract_tables(ocr=ocr, implicit_rows=True, borderless_tables=True)
        
        Path(tmp_proc.name).unlink(missing_ok=True)
        
        txns = []
        for t in extracted_tables:
            df = t.df
            if df is None or df.empty:
                continue
            
            table_grid = []
            headers = [clean_ocr_cell(c) for c in df.columns]
            if not all(str(h).isdigit() for h in headers):
                table_grid.append(headers)
            
            for _, row in df.iterrows():
                table_grid.append([clean_ocr_cell(val) for val in row])
                
            table_grid = [r for r in table_grid if any(c.strip() for c in r)]
            page_txns = parse_generic_table(table_grid, bank_name, file_hash, column_mapping=column_mapping)
            for txn in page_txns:
                txn.ocr_confidence = 0.82
            txns.extend(page_txns)
            
        if txns:
            return txns
    except Exception as e:
        logger.error("img2table image parsing failed: %s. Falling back to raw OCR.", e)
        
    # Fallback to standard Tesseract OCR
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_proc:
        success = preprocess_image(file_path, tmp_proc.name)
        img_to_ocr = tmp_proc.name if success else file_path
        
    tsv_text = await run_sandboxed_tesseract(img_to_ocr, lang="eng")
    Path(tmp_proc.name).unlink(missing_ok=True)
    
    if not tsv_text:
        return []
    return _parse_tsv(tsv_text, bank_name, file_hash, column_mapping=column_mapping)

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


def reconstruct_table_from_tsv(tsv_text: str) -> list[list[str]]:
    """
    Reconstruct tabular rows from Tesseract TSV output using:
      1. Vertical clustering → groups words into rows.
      2. Histogram-based column boundary detection → finds column separators
         from x-axis occupancy valleys across the ENTIRE page (not just
         adjacent word gaps). This correctly identifies 5–7 columns in
         bank statement PDFs where adjacent column gaps are narrow.
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
        # Remove trailing empty cells
        while cells and not cells[-1].strip():
            cells.pop()
        if cells:
            table.append(cells)

    return table


# Date pattern: matches "2 Jan 2013", "04-01-2013", "2013-01-04", "04/01/2013" etc.
_DATE_PREFIX_RE = re.compile(
    r'^(\d{1,2}[\s/\-\.][A-Za-z]{3}[\s/\-\.]\d{2,4}'   # 2 Jan 2013
    r'|\d{1,2}[\s/\-\.]\d{1,2}[\s/\-\.]\d{2,4}'         # 04/01/2013
    r'|\d{4}[\-/]\d{2}[\-/]\d{2})'                       # 2013-01-04
)

# Amount pattern: float with optional commas, at end of a token
_AMOUNT_RE = re.compile(r'(\d[\d,]*\.\d{2})$')


def expand_collapsed_rows(table: list[list[str]]) -> list[list[str]]:
    """
    Post-process for scanned PDFs where the histogram finds only 1-2 columns
    because pixel-level column gaps are absent (columns physically touch).

    Strategy:
      If the table has 1-2 columns AND any cell starts with a date pattern,
      attempt to split each cell into [date, narration, amounts...] by:
        1. Extracting a leading date token.
        2. Extracting trailing amount tokens (right-aligned numbers).
        3. Everything in between = narration.

    Returns the table unchanged if expansion is not warranted.
    """
    if not table:
        return table

    # Only trigger if most rows have ≤ 2 columns
    from collections import Counter
    col_dist = Counter(len(r) for r in table)
    most_common_len = col_dist.most_common(1)[0][0]
    if most_common_len > 3:
        return table  # Already has proper columns — don't touch

    # Check if any first-cell starts with a date pattern
    date_rows = sum(1 for r in table if r and _DATE_PREFIX_RE.match(r[0].strip()))
    if date_rows < 3:
        return table  # Doesn't look like a transaction table — don't touch

    logger.info(
        "expand_collapsed_rows: detected collapsed table (%d cols), expanding %d date rows",
        most_common_len, date_rows
    )

    expanded = []
    for row in table:
        if not row:
            continue
        cell0 = row[0].strip()
        dm = _DATE_PREFIX_RE.match(cell0)
        if not dm:
            # No date prefix — keep as-is (header / metadata row)
            expanded.append(row)
            continue

        date_str = dm.group(0)
        rest = cell0[dm.end():].strip()

        # Extract trailing amounts from `rest`
        amounts = []
        tokens = rest.split()
        narration_tokens = []
        for tok in tokens:
            if _AMOUNT_RE.match(tok.replace(",", "")) or _AMOUNT_RE.search(tok):
                amounts.append(tok)
            else:
                narration_tokens.append(tok)
        narration = " ".join(narration_tokens).strip()

        # Also grab amounts from remaining columns
        for extra_cell in row[1:]:
            for tok in extra_cell.split():
                if _AMOUNT_RE.search(tok.replace(",", "")):
                    amounts.append(tok)

        new_row = [date_str, narration] + amounts
        expanded.append(new_row)

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


import os
import torch
import logging
from PIL import Image
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Pre-configure torch device before loading Surya modules
# This forces Surya's internal settings to read this configuration
_DEVICE = None
try:
    from config import get_settings
    cfg_device = getattr(get_settings(), "surya_device", "auto").lower()
except Exception as e:
    logger.warning("Could not read settings for surya_device, defaulting to 'auto': %s", e)
    cfg_device = "auto"

if cfg_device == "cuda":
    if torch.cuda.is_available():
        os.environ["TORCH_DEVICE"] = "cuda"
        _DEVICE = "cuda"
    else:
        logger.warning("CUDA requested but not available. Falling back to CPU.")
        os.environ["TORCH_DEVICE"] = "cpu"
        _DEVICE = "cpu"
elif cfg_device == "cpu":
    os.environ["TORCH_DEVICE"] = "cpu"
    _DEVICE = "cpu"
else:  # auto
    if torch.cuda.is_available():
        os.environ["TORCH_DEVICE"] = "cuda"
        _DEVICE = "cuda"
    else:
        os.environ["TORCH_DEVICE"] = "cpu"
        _DEVICE = "cpu"

logger.info("Surya-OCR initialization: using device %s", _DEVICE)

# Now import Surya models and processors
from surya.detection import DetectionPredictor
from surya.layout import LayoutPredictor
from surya.recognition import RecognitionPredictor
from surya.foundation import FoundationPredictor
from surya.settings import settings

# Global cache to keep models in worker memory across tasks
_MODELS_CACHE = {
    "det_predictor": None,
    "rec_predictor": None,
    "layout_predictor": None
}

def get_det_predictor():
    """Load and cache detection predictor (lazy loading)."""
    if _MODELS_CACHE["det_predictor"] is None:
        logger.info("Loading Surya detection predictor on %s...", _DEVICE)
        _MODELS_CACHE["det_predictor"] = DetectionPredictor(device=_DEVICE)
    return _MODELS_CACHE["det_predictor"]

def get_rec_predictor():
    """Load and cache recognition predictor (lazy loading)."""
    if _MODELS_CACHE["rec_predictor"] is None:
        logger.info("Loading Surya recognition predictor on %s...", _DEVICE)
        _MODELS_CACHE["rec_predictor"] = RecognitionPredictor(
            FoundationPredictor(checkpoint=settings.RECOGNITION_MODEL_CHECKPOINT, device=_DEVICE)
        )
    return _MODELS_CACHE["rec_predictor"]

def get_layout_predictor():
    """Load and cache layout predictor (lazy loading)."""
    if _MODELS_CACHE["layout_predictor"] is None:
        logger.info("Loading Surya layout predictor on %s...", _DEVICE)
        _MODELS_CACHE["layout_predictor"] = LayoutPredictor(
            FoundationPredictor(checkpoint=settings.LAYOUT_MODEL_CHECKPOINT, device=_DEVICE)
        )
    return _MODELS_CACHE["layout_predictor"]


def get_intersection_ratio(boxA: List[float], boxB: List[float]) -> float:
    """Calculate ratio of boxA's area that falls inside boxB."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    
    interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
    if interArea == 0.0:
        return 0.0
        
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    if boxAArea <= 0.0:
        return 0.0
        
    return interArea / boxAArea

async def extract_table_from_image(img_path: str) -> List[List[str]]:
    """
    Core layout-guided OCR parser for a single page image.
    1. Runs layout detection to find 'Table' bounding boxes.
    2. Runs high-precision text detection and recognition (OCR).
    3. Filters text lines to keep only those inside the detected tables.
    4. Reconstructs rows and columns mathematically using coordinate boundaries.
    """
    try:
        image = Image.open(img_path).convert("RGB")
    except Exception as e:
        logger.error("Failed to open image %s: %s", img_path, e)
        return []

    # 1. Load Predictors
    det_predictor = get_det_predictor()
    layout_predictor = get_layout_predictor()
    rec_predictor = get_rec_predictor()

    # 2. Get text line predictions (needed as input to layout detection)
    try:
        det_results = det_predictor([image])
        if not det_results:
            return []
        # Layout detection doesn't need heatmaps/affinity maps directly, but we keep format uniform
        det_result = det_results[0]
    except Exception as e:
        logger.error("Surya text detection failed: %s", e)
        return []

    # 3. Get layout predictions
    table_bboxes = []
    try:
        layout_results = layout_predictor([image])
        if layout_results:
            layout_result = layout_results[0]
            bboxes_list = getattr(layout_result, "bboxes", [])
            for box in bboxes_list:
                label = getattr(box, "label", "").lower()
                bbox_coords = getattr(box, "bbox", None)
                if label == "table" and bbox_coords:
                    table_bboxes.append(bbox_coords)
            logger.info("Surya layout analysis detected %d table region(s).", len(table_bboxes))
    except Exception as e:
        logger.warning("Surya layout analysis failed (falling back to full page OCR): %s", e)

    # 4. Run full OCR transcription
    try:
        # In 0.17.1, RecognitionPredictor can run text detection internally if det_predictor is provided
        ocr_results = rec_predictor([image], det_predictor=det_predictor)
        if not ocr_results:
            return []
        ocr_result = ocr_results[0]
        text_lines = getattr(ocr_result, "text_lines", [])
    except Exception as e:
        logger.error("Surya OCR failed: %s", e)
        return []

    # 5. Filter OCR text lines inside table bounding boxes
    filtered_lines = []
    if table_bboxes:
        for line in text_lines:
            line_bbox = getattr(line, "bbox", None)
            line_text = getattr(line, "text", "")
            if not line_bbox or not line_text.strip():
                continue
            
            # Check if this text line belongs to any detected table
            in_table = False
            for tbl_box in table_bboxes:
                if get_intersection_ratio(line_bbox, tbl_box) > 0.6:
                    in_table = True
                    break
            
            if in_table:
                filtered_lines.append(line)
        
        # Fallback: if layout detection filtered out everything but OCR lines exist,
        # layout might have been too strict. Fallback to using all lines.
        if not filtered_lines and text_lines:
            logger.warning("No OCR lines matched table boxes. Falling back to full page OCR.")
            filtered_lines = text_lines
    else:
        filtered_lines = text_lines

    # 6. Convert Surya OCR lines to standardized words coordinates format
    # expected by our clustering heuristics in pdf_scanned.py
    words = []
    for line in filtered_lines:
        line_bbox = getattr(line, "bbox", None)
        line_text = getattr(line, "text", "")
        if not line_bbox or not line_text.strip():
            continue
        
        # Bbox format: [x0, y0, x1, y1]
        x0, y0, x1, y1 = line_bbox
        words.append({
            "left": int(x0),
            "top": int(y0),
            "width": int(x1 - x0),
            "height": int(y1 - y0),
            "text": line_text
        })

    if not words:
        return []

    # Import table reconstruction helper from pdf_scanned
    # We do the import here to avoid circular imports
    from parsers.pdf_scanned import reconstruct_table_from_words, expand_collapsed_rows
    
    table_grid = reconstruct_table_from_words(words)
    
    # Expand collapsed columns if necessary (like standard OCR)
    table_grid = expand_collapsed_rows(table_grid)
    
    return table_grid

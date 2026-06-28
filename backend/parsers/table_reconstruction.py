"""
Table reconstruction utilities for digital PDFs.
Clusters words into lines and maps them to column bands.
"""
import logging

logger = logging.getLogger(__name__)

LINE_Y_TOLERANCE_DIGITAL = 2.0

DEFAULT_BANDS_FRACTIONAL = [
    ("date", 0.0, 0.15),
    ("value_date", 0.15, 0.25),
    ("description", 0.25, 0.55),
    ("ref_no", 0.55, 0.65),
    ("debit", 0.65, 0.77),
    ("credit", 0.77, 0.88),
    ("balance", 0.88, 1.0)
]

HEADER_KEYWORDS = {
    "date": [
        "txn date", "tran date", "trans date", "transaction date",
        "date", "tran dt", "trans dt", "value date",
        "trans date and", "trans date &",   # IDFC "Trans Date and Time" prefix
    ],
    "value_date": ["value date", "value dt", "val date", "val dt"],
    "description": [
        "tran particular", "transaction details", "transaction desc",
        "description", "particulars", "narration", "details",
        "transaction narration", "remarks",
    ],
    "ref_no": [
        "ref no", "reference", "cheque", "chq", "ref.", "chq/ref",
        "chq no", "cheque no", "ref number", "tran id",
    ],
    "debit": [
        # Order matters: longer strings first to avoid partial match on 'debit'
        "debit amount", "withdrawal amount", "debit amt",
        "debits", "debit", "withdrawal", "dr amount", "dr amt", "dr",
        "with-drawl",
    ],
    "credit": [
        "credit amount", "deposit amount", "credit amt",
        "credits", "credit", "deposit", "cr amount", "cr amt",
    ],
    "balance": [
        "balance amount", "closing balance", "balance amt",
        "balance", "bal", "bal amount",
    ],
}


def cluster_lines(words: list[dict], y_tolerance: float = LINE_Y_TOLERANCE_DIGITAL) -> list[list[dict]]:
    """Group words that sit on the same vertical line."""
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: w["top"])
    lines = []
    current_line = []
    for w in sorted_words:
        if not current_line:
            current_line.append(w)
        else:
            avg_top = sum(x["top"] for x in current_line) / len(current_line)
            if abs(w["top"] - avg_top) <= y_tolerance:
                current_line.append(w)
            else:
                lines.append(sorted(current_line, key=lambda x: x["x0"]))
                current_line = [w]
    if current_line:
        lines.append(sorted(current_line, key=lambda x: x["x0"]))
    return lines


def _assign_band(word: dict, bands: list[tuple]) -> str | None:
    """Find which band this word falls into based on center x-coordinate."""
    mid_x = (word["x0"] + word["x1"]) / 2.0
    for name, x_start, x_end in bands:
        if x_start <= mid_x < x_end:
            return name
    return None


def reconstruct_rows(
    words: list[dict],
    bands: list[tuple],
    y_tolerance: float = LINE_Y_TOLERANCE_DIGITAL,
) -> list[dict]:
    """Reconstruct rows from words and column bands."""
    lines = cluster_lines(words, y_tolerance)
    rows = []
    for line in lines:
        row_data = {}
        for w in line:
            col_name = _assign_band(w, bands)
            if col_name:
                if col_name in row_data:
                    row_data[col_name] += " " + w["text"]
                else:
                    row_data[col_name] = w["text"]
        if row_data:
            rows.append(row_data)
    return rows


def detect_column_bands(
    words: list[dict],
    page_width: float,
    y_tolerance: float = LINE_Y_TOLERANCE_DIGITAL,
) -> list[tuple]:
    """
    Finds column band positions from the header row(s).
    """
    lines = cluster_lines(words, y_tolerance)[:20]
    if not lines:
        return _default_bands(page_width)

    def _score_and_positions(candidate_lines: list) -> tuple[int, dict]:
        """Score candidate lines and return (match_count, {col_name: x0})."""
        all_words_flat = [w for line in candidate_lines for w in line]
        combined_text = " ".join(w["text"].lower() for w in all_words_flat)
        positions = {}
        for col_name, keywords in HEADER_KEYWORDS.items():
            for kw in keywords:
                if kw in combined_text:
                    # Find x0 of first word matching the keyword's first token
                    first_token = kw.split()[0][:4]
                    for w in all_words_flat:
                        if w["text"].lower().startswith(first_token):
                            if col_name not in positions:
                                positions[col_name] = w["x0"]
                            break
                    break
        return len(positions), positions

    # Score each single line and each adjacent pair
    best_score, best_positions = 0, {}

    for i in range(len(lines)):
        score, positions = _score_and_positions([lines[i]])
        if score > best_score:
            best_score, best_positions = score, positions

        if i + 1 < len(lines):
            score, positions = _score_and_positions([lines[i], lines[i + 1]])
            if score > best_score:
                best_score, best_positions = score, positions

    if best_score < 3:
        logger.info("No confident header found (best score=%d) — using default bands", best_score)
        return _default_bands(page_width)

    ordered = sorted(best_positions.items(), key=lambda kv: kv[1])
    bands = []
    for i, (col_name, x_start) in enumerate(ordered):
        x_end = ordered[i + 1][1] if i + 1 < len(ordered) else page_width
        bands.append((col_name, x_start, x_end))

    logger.debug("Detected column bands: %s", [(n, round(s), round(e)) for n, s, e in bands])
    return bands


def _default_bands(page_width: float) -> list[tuple]:
    """Fallback when header detection fails."""
    return [(name, frac_start * page_width, frac_end * page_width)
            for name, frac_start, frac_end in DEFAULT_BANDS_FRACTIONAL]

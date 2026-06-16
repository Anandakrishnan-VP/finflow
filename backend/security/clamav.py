import logging
from pathlib import Path

logger = logging.getLogger(__name__)

async def scan_file(file_path: str) -> tuple[bool, str]:
    """
    Returns (is_clean, reason_string).
    Graceful degradation: if ClamAV is unavailable, logs warning and allows upload.
    Never block uploads due to ClamAV unavailability — that would break offline demo.
    """
    try:
        import clamd
        cd = clamd.ClamdUnixSocket()
        result = cd.scan(file_path)
        if result and file_path in result:
            status, detail = result[file_path]
            if status == "FOUND":
                logger.warning("MALWARE DETECTED: %s — %s", file_path, detail)
                return False, f"Malware detected: {detail}"
        return True, "clean"
    except Exception as e:
        logger.warning("ClamAV unavailable (%s) — skipping scan for %s", e, file_path)
        return True, "clamav_unavailable"

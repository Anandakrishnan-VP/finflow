import subprocess, tempfile, hashlib, logging
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import resource
except ImportError:
    resource = None

def _set_subprocess_limits():
    """RULE 7: Always apply resource limits to parser subprocesses."""
    if resource is not None:
        resource.setrlimit(resource.RLIMIT_CPU,    (30,  30))    # 30s CPU max
        resource.setrlimit(resource.RLIMIT_AS,     (1 * 1024**3, 1 * 1024**3))  # 1GB RAM
        resource.setrlimit(resource.RLIMIT_NOFILE, (64,  64))    # 64 file descriptors
        resource.setrlimit(resource.RLIMIT_NPROC,  (32,  32))    # 32 sub-processes/threads

async def run_sandboxed_tesseract(image_path: str, lang: str = "eng+hin") -> str:
    """Run Tesseract OCR in a sandboxed subprocess with resource limits."""
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=True) as out:
        output_base = out.name.replace(".txt", "")
    try:
        import os
        env = os.environ.copy()
        env["OMP_THREAD_LIMIT"] = "1"
        env["OMP_NUM_THREADS"] = "1"
        result = subprocess.run(
            ["tesseract", image_path, output_base, "-l", lang,
             "--psm", "6", "tsv"],
            capture_output=True, timeout=30,
            preexec_fn=_set_subprocess_limits if resource is not None else None,
            env=env
        )
        if result.returncode != 0:
            logger.warning("Tesseract error: %s", result.stderr.decode())
            return ""
        output_file = output_base + ".tsv"
        text = Path(output_file).read_text(errors="replace")
        Path(output_file).unlink(missing_ok=True)
        return text
    except subprocess.TimeoutExpired:
        logger.error("Tesseract timeout for %s", image_path)
        return ""
    except Exception as e:
        logger.error("Tesseract failed: %s", e)
        return ""

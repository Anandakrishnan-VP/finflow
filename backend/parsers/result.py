from dataclasses import dataclass, field
from statistics import mean
from typing import Any

from schemas.uts import UniversalTransaction


PARSED = "PARSED"
PARSED_WITH_WARNINGS = "PARSED_WITH_WARNINGS"
NEEDS_REVIEW = "NEEDS_REVIEW"
FAILED = "FAILED"


@dataclass
class RejectedRow:
    raw_row: Any
    reason: str
    row_index: int | None = None
    confidence: float | None = None

    def as_dict(self) -> dict:
        return {
            "raw_row": self.raw_row,
            "reason": self.reason,
            "row_index": self.row_index,
            "confidence": self.confidence,
        }


@dataclass
class ParseResult:
    transactions: list[UniversalTransaction] = field(default_factory=list)
    parser_name: str = "unknown"
    method: str = "unknown"
    ocr_used: bool = False
    warnings: list[str] = field(default_factory=list)
    rejected_rows: list[RejectedRow] = field(default_factory=list)
    detected_mapping: dict | None = None
    confidence: float | None = None
    quality_score: float = 0.0
    status: str = FAILED
    needs_review_reason: str | None = None

    @classmethod
    def from_transactions(
        cls,
        transactions: list[UniversalTransaction],
        parser_name: str,
        method: str,
        ocr_used: bool = False,
        warnings: list[str] | None = None,
        rejected_rows: list[RejectedRow] | None = None,
        detected_mapping: dict | None = None,
    ) -> "ParseResult":
        result = cls(
            transactions=transactions or [],
            parser_name=parser_name,
            method=method,
            ocr_used=ocr_used,
            warnings=warnings or [],
            rejected_rows=rejected_rows or [],
            detected_mapping=detected_mapping,
        )
        result.evaluate()
        return result

    def evaluate(self) -> None:
        total_candidates = len(self.transactions) + len(self.rejected_rows)
        if not self.transactions:
            self.quality_score = 0.0
            self.status = NEEDS_REVIEW if self.ocr_used else FAILED
            self.needs_review_reason = "No transactions could be extracted"
            return

        date_count = sum(1 for t in self.transactions if t.txn_date)
        amount_count = sum(1 for t in self.transactions if t.amount is not None)
        identity_count = sum(1 for t in self.transactions if t.account_id and not t.account_id.startswith("STATEMENT-"))
        confidence_values = [
            float(t.ocr_confidence)
            for t in self.transactions
            if t.ocr_confidence is not None
        ]
        if confidence_values:
            self.confidence = mean(confidence_values)
        elif self.confidence is None:
            self.confidence = 0.90 if not self.ocr_used else 0.70

        coverage = (date_count + amount_count) / max(1, len(self.transactions) * 2)
        rejection_penalty = len(self.rejected_rows) / max(1, total_candidates)
        identity_bonus = 0.05 if identity_count else 0.0
        confidence_component = max(0.0, min(float(self.confidence or 0.0), 1.0))
        self.quality_score = max(
            0.0,
            min(1.0, (coverage * 0.55) + (confidence_component * 0.35) + identity_bonus - (rejection_penalty * 0.25)),
        )

        if self.ocr_used and confidence_component < 0.70:
            self.status = NEEDS_REVIEW
            self.needs_review_reason = "OCR confidence below review threshold"
        elif self.quality_score < 0.55:
            self.status = NEEDS_REVIEW
            self.needs_review_reason = "Parse quality below review threshold"
        elif self.rejected_rows or self.warnings:
            self.status = PARSED_WITH_WARNINGS
            self.needs_review_reason = "; ".join(self.warnings[:2]) or None
        else:
            self.status = PARSED
            self.needs_review_reason = None

    def metadata(self, bank_name: str, file_hash: str, mime_type: str) -> dict:
        return {
            "bank_name": bank_name,
            "file_hash": file_hash,
            "mime_type": mime_type,
            "row_count": len(self.transactions),
            "ocr_used": self.ocr_used,
            "ocr_confidence_avg": self.confidence,
            "parse_method": self.method,
            "parser_name": self.parser_name,
            "parse_quality_score": self.quality_score,
            "parse_status": self.status,
            "parse_warnings": self.warnings,
            "rejected_rows": [r.as_dict() for r in self.rejected_rows],
            "rejected_row_count": len(self.rejected_rows),
            "extracted_row_count": len(self.transactions),
            "detected_mapping": self.detected_mapping,
            "needs_review_reason": self.needs_review_reason,
        }

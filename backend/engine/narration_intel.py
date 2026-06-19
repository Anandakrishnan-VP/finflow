"""
Narration Intelligence:
  1. NER extraction (spaCy) for names, locations, and organizations.
  2. Coordinated Narration Cluster detection (DBSCAN + Cosine Similarity).
"""
import logging
import hashlib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import DBSCAN
from schemas.uts import UniversalTransaction, TransactionFlag

logger = logging.getLogger(__name__)

# Load spaCy lazily
_nlp = None
def get_nlp():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
        except Exception as e:
            logger.warning("Could not load spaCy model 'en_core_web_sm': %s. Using basic fallback.", e)
            _nlp = False
    return _nlp


def extract_entities(text: str) -> list[str]:
    """Extract PERSON, ORG, GPE entities from narration using spaCy."""
    nlp = get_nlp()
    if not nlp or not text:
        # Fallback to simple words or basic UPI pattern matching
        if not text:
            return []
        parts = text.split()
        return [p for p in parts if len(p) > 4 and p.isupper()]

    try:
        doc = nlp(text)
        entities = []
        for ent in doc.ents:
            if ent.label_ in ("PERSON", "ORG", "GPE"):
                entities.append(ent.text.strip())
        return list(set(entities))
    except Exception as e:
        logger.error("spaCy entity extraction failed: %s", e)
        return []


def compute_narration_clusters(txns: list[UniversalTransaction]) -> list[dict]:
    """
    Groups transactions into clusters using TF-IDF + DBSCAN.
    If a cluster spans >= 3 distinct accounts, flag them as COORDINATED_NARRATION.
    Returns a list of cluster metadata dicts to store in the DB.
    """
    if len(txns) < 5:
        return []

    # Filter transactions with valid narrations
    valid_txns = [t for t in txns if t.narration and len(t.narration.strip()) > 3]
    if len(valid_txns) < 5:
        return []

    texts = [t.narration for t in valid_txns]

    try:
        # Character n-grams for robust partial matching
        vectorizer = TfidfVectorizer(min_df=1, analyzer="char_wb", ngram_range=(3, 5))
        X = vectorizer.fit_transform(texts)

        # DBSCAN to group similar narrations
        db = DBSCAN(eps=0.3, min_samples=2, metric="cosine")
        labels = db.fit_predict(X)

        clusters_dict = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue # Noise
            if label not in clusters_dict:
                clusters_dict[label] = []
            clusters_dict[label].append(valid_txns[idx])

        db_clusters = []
        for label, c_txns in clusters_dict.items():
            accounts = set(t.account_id for t in c_txns)
            is_coordinated = len(accounts) >= 3

            # Determine a representative narration (most common or first)
            rep_narration = c_txns[0].narration

            # Signature is SHA-256 of the representative narration
            sig = hashlib.sha256(rep_narration.lower().encode("utf-8")).hexdigest()

            if is_coordinated:
                for t in c_txns:
                    if TransactionFlag.COORDINATED_NARRATION not in t.flags:
                        t.flags.append(TransactionFlag.COORDINATED_NARRATION)

            db_clusters.append({
                "cluster_id": int(label),
                "narration_signature": sig,
                "transaction_count": len(c_txns),
                "account_count": len(accounts),
                "is_coordinated": is_coordinated,
                "representative_narration": rep_narration,
            })

        return db_clusters

    except Exception as e:
        logger.error("Narration clustering failed: %s", e)
        return []

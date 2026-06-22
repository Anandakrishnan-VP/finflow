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

# Maximum transactions to run TF-IDF + DBSCAN on (prevents OOM on 200k+ rows)
MAX_CLUSTER_SAMPLES = 10_000

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


def _stratified_sample(txns: list, max_samples: int) -> list:
    """
    Stratified sample by account_id so each account contributes proportionally.
    Prevents any single account from dominating the clustering sample.
    """
    from collections import defaultdict
    import random
    by_account = defaultdict(list)
    for t in txns:
        by_account[t.account_id].append(t)

    per_account = max(1, max_samples // max(1, len(by_account)))
    sampled = []
    for acc_txns in by_account.values():
        if len(acc_txns) <= per_account:
            sampled.extend(acc_txns)
        else:
            sampled.extend(random.sample(acc_txns, per_account))

    # If we still have too many, random subsample the remainder
    if len(sampled) > max_samples:
        sampled = random.sample(sampled, max_samples)

    return sampled


def compute_narration_clusters(txns: list[UniversalTransaction]) -> list[dict]:
    """
    Groups transactions into clusters using TF-IDF + DBSCAN.
    If a cluster spans >= 3 distinct accounts, flag them as COORDINATED_NARRATION.
    Returns a list of cluster metadata dicts to store in the DB.

    For large datasets (>10k transactions), runs on a stratified sample to
    prevent OOM. Cluster labels are propagated back to all transactions via
    narration-signature matching.
    """
    if len(txns) < 5:
        return []

    # Filter transactions with valid narrations
    valid_txns = [t for t in txns if t.narration and len(t.narration.strip()) > 3]
    if len(valid_txns) < 5:
        return []

    total = len(valid_txns)
    is_large = total > MAX_CLUSTER_SAMPLES

    if is_large:
        logger.info(
            "compute_narration_clusters: %d transactions → sampling %d for clustering (large dataset)",
            total, MAX_CLUSTER_SAMPLES
        )
        sample_txns = _stratified_sample(valid_txns, MAX_CLUSTER_SAMPLES)
    else:
        sample_txns = valid_txns

    texts = [t.narration for t in sample_txns]

    try:
        # Character n-grams for robust partial matching
        # max_features caps vocabulary size to prevent memory explosion on large corpora
        vectorizer = TfidfVectorizer(
            min_df=1,
            analyzer="char_wb",
            ngram_range=(3, 5),
            max_features=5000  # hard cap on vocabulary size
        )
        X = vectorizer.fit_transform(texts)

        logger.info("TF-IDF matrix shape: %s  (%.1f MB estimated)",
                    X.shape, X.data.nbytes / 1e6)

        # DBSCAN to group similar narrations
        db = DBSCAN(eps=0.3, min_samples=2, metric="cosine")
        labels = db.fit_predict(X)

        clusters_dict = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue  # Noise
            if label not in clusters_dict:
                clusters_dict[label] = []
            clusters_dict[label].append(sample_txns[idx])

        # Build a narration → cluster_label map for propagation to full dataset
        narration_to_label: dict[str, int] = {}
        for label, c_txns in clusters_dict.items():
            for t in c_txns:
                narration_to_label[t.narration.lower().strip()] = label

        # If large dataset: propagate cluster flags back to all valid_txns
        if is_large:
            cluster_hashes = {lbl: set(t.txn_hash for t in c_txns) for lbl, c_txns in clusters_dict.items()}
            for t in valid_txns:
                key = t.narration.lower().strip() if t.narration else ""
                if key in narration_to_label:
                    lbl = narration_to_label[key]
                    if lbl not in clusters_dict:
                        clusters_dict[lbl] = []
                        cluster_hashes[lbl] = set()
                    if t.txn_hash not in cluster_hashes[lbl]:
                        clusters_dict[lbl].append(t)
                        cluster_hashes[lbl].add(t.txn_hash)

        db_clusters = []
        for label, c_txns in clusters_dict.items():
            accounts = set(t.account_id for t in c_txns)
            is_coordinated = len(accounts) >= 3

            rep_narration = c_txns[0].narration
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

        logger.info("Narration clustering complete: %d clusters found", len(db_clusters))
        return db_clusters

    except Exception as e:
        logger.error("Narration clustering failed: %s", e)
        return []

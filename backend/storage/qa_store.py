import os
import re
import sqlite3
import threading
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import List, Dict

_DB_LOCK = threading.Lock()
TERM_PATTERN = re.compile(r"[0-9a-zA-Zก-๙]+")


def _db_path() -> Path:
    configured = os.getenv("QA_DB_PATH", "")
    if configured.strip():
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parent.parent / "db" / "chat_memory.sqlite3"


def init_db() -> None:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    with _DB_LOCK:
        conn = sqlite3.connect(path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_turns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'cloud-llm',
                    created_at INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat_session_time ON chat_turns(session_id, created_at DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat_question ON chat_turns(question)"
            )
            conn.commit()
        finally:
            conn.close()


def save_chat_turn(session_id: str, question: str, answer: str, source: str = "cloud-llm") -> None:
    if not session_id.strip() or not question.strip() or not answer.strip():
        return

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        try:
            conn.execute(
                "INSERT INTO chat_turns(session_id, question, answer, source, created_at) VALUES(?, ?, ?, ?, ?)",
                (session_id.strip(), question.strip(), answer.strip(), source.strip(), int(time.time())),
            )
            conn.commit()
        finally:
            conn.close()


def get_recent_turns(session_id: str, limit: int = 8) -> List[Dict[str, str]]:
    if not session_id.strip():
        return []

    n = max(1, min(limit, 30))
    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT question, answer
                FROM chat_turns
                WHERE session_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (session_id.strip(), n),
            ).fetchall()
        finally:
            conn.close()

    # Return chronological order for prompt building.
    out = [{"question": r["question"], "answer": r["answer"]} for r in rows]
    out.reverse()
    return out


def get_similar_qa(question: str, limit: int = 3) -> List[Dict[str, str]]:
    q = question.strip().lower()
    if not q:
        return []

    # Lightweight similarity via SQL LIKE; portable across machines without extra deps.
    token = q[:24]
    n = max(1, min(limit, 5))

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT question, answer
                FROM chat_turns
                WHERE lower(question) LIKE ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (f"%{token}%", n),
            ).fetchall()
        finally:
            conn.close()

    return [{"question": r["question"], "answer": r["answer"]} for r in rows]


def _normalize_text(text: str) -> str:
    return " ".join(text.lower().split())


def _extract_terms(text: str) -> set[str]:
    return {token for token in TERM_PATTERN.findall(_normalize_text(text)) if len(token) > 1}


def _similarity_score(left: str, right: str) -> float:
    l = _normalize_text(left)
    r = _normalize_text(right)
    if not l or not r:
        return 0.0

    l_terms = _extract_terms(l)
    r_terms = _extract_terms(r)

    if l_terms and r_terms:
        jaccard = len(l_terms & r_terms) / max(len(l_terms | r_terms), 1)
    else:
        jaccard = 0.0

    sequence = SequenceMatcher(None, l, r).ratio()
    contains_bonus = 0.1 if (l in r or r in l) else 0.0

    return min(1.0, (0.6 * sequence) + (0.4 * jaccard) + contains_bonus)


def get_best_similar_answer(question: str, min_score: float = 0.9) -> Dict[str, str] | None:
    q = question.strip()
    if not q:
        return None

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT question, answer
                FROM chat_turns
                ORDER BY created_at DESC, id DESC
                LIMIT 300
                """
            ).fetchall()
        finally:
            conn.close()

    best: Dict[str, str] | None = None
    best_score = 0.0
    for row in rows:
        candidate_q = row["question"]
        candidate_a = row["answer"]
        score = _similarity_score(q, candidate_q)
        if score > best_score:
            best_score = score
            best = {
                "question": candidate_q,
                "answer": candidate_a,
                "score": f"{score:.3f}",
            }

    if not best:
        return None
    if float(best["score"]) < max(0.0, min(min_score, 1.0)):
        return None
    return best

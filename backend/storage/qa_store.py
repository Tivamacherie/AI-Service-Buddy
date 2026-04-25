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
LEADING_NOISE_PATTERN = re.compile(
    r"^(?:อาการ|ปัญหา|เรื่อง|กรณี|ช่วยดู|ช่วยเช็ค|ช่วยวิเคราะห์|รถ|รถยนต์)+",
    re.IGNORECASE,
)
KEYWORD_STOPWORDS = {
    "ครับ",
    "ค่ะ",
    "คับ",
    "หน่อย",
    "ที",
    "หน่อยครับ",
    "หน่อยค่ะ",
    "ช่วย",
    "ช่วยดู",
    "ช่วยเช็ค",
    "ช่วยวิเคราะห์",
    "รบกวน",
    "please",
    "help",
    "check",
    "analyze",
    "analysis",
}


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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS top_search_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    keyword TEXT NOT NULL,
                    keyword_norm TEXT NOT NULL,
                    question TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_top_search_keyword_time ON top_search_events(keyword_norm, created_at DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_top_search_session_time ON top_search_events(session_id, created_at DESC)"
            )
            conn.commit()
        finally:
            conn.close()


def save_chat_turn(session_id: str, question: str, answer: str, source: str = "cloud-llm") -> None:
    sid = session_id.strip()
    q = question.strip()
    a = answer.strip()
    if not sid or not q or not a:
        return

    keyword = _extract_symptom_keyword(q)
    keyword_norm = _normalize_text(keyword)
    created_at = int(time.time())

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        try:
            conn.execute(
                "INSERT INTO chat_turns(session_id, question, answer, source, created_at) VALUES(?, ?, ?, ?, ?)",
                (sid, q, a, source.strip(), created_at),
            )
            if keyword and keyword_norm:
                conn.execute(
                    "INSERT INTO top_search_events(session_id, keyword, keyword_norm, question, created_at) VALUES(?, ?, ?, ?, ?)",
                    (sid, keyword, keyword_norm, q, created_at),
                )
            conn.commit()
        finally:
            conn.close()


def delete_chat_session(session_id: str) -> int:
    sid = session_id.strip()
    if not sid:
        return 0

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        try:
            cur = conn.execute("DELETE FROM chat_turns WHERE session_id = ?", (sid,))
            conn.execute("DELETE FROM top_search_events WHERE session_id = ?", (sid,))
            conn.commit()
            return int(cur.rowcount or 0)
        finally:
            conn.close()


def clear_chat_history() -> int:
    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        try:
            cur = conn.execute("DELETE FROM chat_turns")
            conn.execute("DELETE FROM top_search_events")
            conn.commit()
            return int(cur.rowcount or 0)
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


def get_top_searches(limit: int = 5) -> List[Dict[str, object]]:
    n = max(1, min(limit, 10))

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT keyword, keyword_norm, created_at
                FROM top_search_events
                WHERE TRIM(keyword_norm) != ''
                ORDER BY created_at DESC, id DESC
                LIMIT 3000
                """,
            ).fetchall()
        finally:
            conn.close()

    aggregated: dict[str, dict[str, object]] = {}
    for row in rows:
        keyword = (row["keyword"] or "").strip()
        normalized = (row["keyword_norm"] or "").strip()
        if not keyword or not normalized:
            continue

        entry = aggregated.get(normalized)
        if not entry:
            aggregated[normalized] = {
                "keyword": keyword,
                "count": 1,
                "latest_at": int(row["created_at"] or 0),
            }
            continue

        entry["count"] = int(entry["count"]) + 1
        entry["latest_at"] = max(int(entry["latest_at"]), int(row["created_at"] or 0))

    ranked = sorted(
        aggregated.values(),
        key=lambda x: (-int(x["count"]), -int(x["latest_at"]), str(x["keyword"])),
    )[:n]

    return [
        {
            "question": str(item["keyword"]),
            "keyword": str(item["keyword"]),
            "count": int(item["count"]),
        }
        for item in ranked
    ]


def get_top_search_sources(keyword: str, limit: int = 20) -> List[Dict[str, object]]:
    n = max(1, min(limit, 50))
    target_keyword = _extract_symptom_keyword(keyword)
    target_normalized = _normalize_text(target_keyword)
    if not target_normalized:
        return []

    with _DB_LOCK:
        conn = sqlite3.connect(_db_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT session_id, question, created_at
                FROM top_search_events
                WHERE keyword_norm = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 5000
                """,
                (target_normalized,),
            ).fetchall()
        finally:
            conn.close()

    aggregated: dict[str, dict[str, object]] = {}
    for row in rows:
        session_id = (row["session_id"] or "").strip()
        if not session_id:
            continue

        entry = aggregated.get(session_id)
        if not entry:
            aggregated[session_id] = {
                "session_id": session_id,
                "count": 1,
                "latest_at": int(row["created_at"] or 0),
                "latest_question": (row["question"] or "").strip(),
            }
            continue

        entry["count"] = int(entry["count"]) + 1
        current_time = int(row["created_at"] or 0)
        if current_time >= int(entry["latest_at"]):
            entry["latest_at"] = current_time
            entry["latest_question"] = (row["question"] or "").strip()

    ranked = sorted(
        aggregated.values(),
        key=lambda x: (-int(x["count"]), -int(x["latest_at"]), str(x["session_id"])),
    )[:n]

    return [
        {
            "session_id": str(item["session_id"]),
            "count": int(item["count"]),
            "latest_at": int(item["latest_at"]),
            "latest_question": str(item["latest_question"]),
        }
        for item in ranked
    ]


def _cleanup_keyword_chunk(text: str) -> str:
    cleaned = LEADING_NOISE_PATTERN.sub("", text.strip())
    return cleaned.strip(" -_.,:;!?()[]{}\"'“”’`~")


def _extract_symptom_keyword(question: str) -> str:
    normalized = " ".join((question or "").strip().split())
    if not normalized:
        return ""

    chunks = [part.strip() for part in re.split(r"[,/|]+", normalized) if part.strip()]
    if not chunks:
        chunks = [normalized]

    for chunk in chunks:
        candidate = _cleanup_keyword_chunk(chunk)
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered in KEYWORD_STOPWORDS:
            continue
        if len(candidate) < 3:
            continue
        return candidate

    fallback = _cleanup_keyword_chunk(normalized)
    if not fallback:
        return ""
    if fallback.lower() in KEYWORD_STOPWORDS:
        return ""
    return fallback


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

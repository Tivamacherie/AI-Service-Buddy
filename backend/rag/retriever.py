import re
from functools import lru_cache
from pathlib import Path
from typing import List, Tuple

from rag.utils import chunk_text, read_text_file


def _clean_text(text: str) -> str:
    return " ".join(text.lower().split())


def _char_ngrams(text: str, n: int = 3) -> set[str]:
    compact = _clean_text(text).replace(" ", "")
    if len(compact) < n:
        return {compact} if compact else set()
    return {compact[i : i + n] for i in range(len(compact) - n + 1)}


def _score_chunk(question: str, chunk: str) -> float:
    q = _clean_text(question)
    c = _clean_text(chunk)
    if not q or not c:
        return 0.0

    # score 1: exact match bonus
    exact_bonus = 4.0 if q in c else 0.0

    # score 2: keyword overlap (works for EN + TH phrases with spaces)
    q_terms = [t for t in re.findall(r"[0-9a-zA-Zก-๙]+", q) if len(t) > 1]
    term_score = sum(1.0 for t in q_terms if t in c)

    # score 3: char n-gram overlap (helps Thai without spaces)
    q_grams = _char_ngrams(q, n=3)
    c_grams = _char_ngrams(c, n=3)
    gram_score = len(q_grams & c_grams) / max(len(q_grams), 1)

    return exact_bonus + term_score + gram_score


def _split_manual_sections(raw_text: str) -> List[str]:
    lines = [line.rstrip() for line in raw_text.splitlines()]
    sections: List[str] = []
    current: List[str] = []

    heading_pattern = re.compile(r"^[ก-ฮ]-\d+\.\s*.+")
    for line in lines:
        if heading_pattern.match(line.strip()):
            if current:
                section = "\n".join(current).strip()
                if section:
                    sections.append(section)
            current = [line]
        else:
            current.append(line)

    if current:
        section = "\n".join(current).strip()
        if section:
            sections.append(section)

    return sections


@lru_cache(maxsize=1)
def _load_manual_chunks() -> List[str]:
    manual_path = Path(__file__).resolve().parent.parent / "data" / "manual.txt"
    raw = read_text_file(manual_path)
    sections = _split_manual_sections(raw)
    if sections:
        return sections
    return chunk_text(raw, chunk_size=700, overlap=120)


def retrieve_context(question: str, top_k: int = 3) -> List[str]:
    if not question:
        return []

    chunks = _load_manual_chunks()
    if not chunks:
        return []

    scored: List[Tuple[float, str]] = [
        (_score_chunk(question, chunk), chunk) for chunk in chunks
    ]
    scored.sort(key=lambda x: x[0], reverse=True)

    # Return only chunks that have some similarity.
    filtered = [chunk for score, chunk in scored if score > 0]
    return filtered[:top_k]

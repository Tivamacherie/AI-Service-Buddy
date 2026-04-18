import re
from dataclasses import dataclass
from functools import lru_cache
from heapq import nlargest
from pathlib import Path
from typing import List

from rag.utils import chunk_text, read_text_file


TERM_PATTERN = re.compile(r"[0-9a-zA-Zก-๙]+")


@dataclass(frozen=True)
class ChunkFeatures:
    raw: str
    normalized: str
    terms: frozenset[str]
    grams: frozenset[str]


def _clean_text(text: str) -> str:
    return " ".join(text.lower().split())


def _char_ngrams(text: str, n: int = 3) -> set[str]:
    compact = _clean_text(text).replace(" ", "")
    if len(compact) < n:
        return {compact} if compact else set()
    return {compact[i : i + n] for i in range(len(compact) - n + 1)}


def _extract_terms(text: str) -> frozenset[str]:
    return frozenset(t for t in TERM_PATTERN.findall(text) if len(t) > 1)


def _build_chunk_features(chunk: str) -> ChunkFeatures:
    normalized = _clean_text(chunk)
    return ChunkFeatures(
        raw=chunk,
        normalized=normalized,
        terms=_extract_terms(normalized),
        grams=frozenset(_char_ngrams(normalized, n=3)),
    )


def _score_chunk(
    question_normalized: str,
    question_terms: frozenset[str],
    question_grams: frozenset[str],
    chunk: ChunkFeatures,
) -> float:
    if not question_normalized or not chunk.normalized:
        return 0.0

    # score 1: exact match bonus
    exact_bonus = 4.0 if question_normalized in chunk.normalized else 0.0

    # score 2: keyword overlap (EN + TH)
    term_overlap = len(question_terms & chunk.terms)
    term_coverage = term_overlap / max(len(question_terms), 1)
    term_score = term_overlap + (term_coverage * 2.0)

    # score 3: char n-gram overlap (helps Thai without spaces)
    gram_score = len(question_grams & chunk.grams) / max(len(question_grams), 1)

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
def _load_manual_chunks() -> List[ChunkFeatures]:
    manual_path = Path(__file__).resolve().parent.parent / "data" / "manual.txt"
    raw = read_text_file(manual_path)
    sections = _split_manual_sections(raw)
    chunks = sections if sections else chunk_text(raw, chunk_size=700, overlap=120)
    return [_build_chunk_features(chunk) for chunk in chunks if chunk.strip()]


def _is_relevant(
    score: float,
    question_terms: frozenset[str],
    question_grams: frozenset[str],
    chunk: ChunkFeatures,
) -> bool:
    if score <= 0:
        return False

    if question_terms and (question_terms & chunk.terms):
        return True

    if question_grams:
        gram_overlap = len(question_grams & chunk.grams) / max(len(question_grams), 1)
        return gram_overlap >= 0.18

    return False


def _effective_top_k(top_k: int) -> int:
    if top_k <= 0:
        return 1
    return min(top_k, 10)


def retrieve_context(question: str, top_k: int = 3) -> List[str]:
    question_normalized = _clean_text(question)
    if not question_normalized:
        return []

    chunks = _load_manual_chunks()
    if not chunks:
        return []

    question_terms = _extract_terms(question_normalized)
    question_grams = frozenset(_char_ngrams(question_normalized, n=3))

    k = _effective_top_k(top_k)
    best = nlargest(
        k,
        chunks,
        key=lambda chunk: _score_chunk(
            question_normalized=question_normalized,
            question_terms=question_terms,
            question_grams=question_grams,
            chunk=chunk,
        ),
    )

    filtered: List[str] = []
    for chunk in best:
        score = _score_chunk(
            question_normalized=question_normalized,
            question_terms=question_terms,
            question_grams=question_grams,
            chunk=chunk,
        )
        if _is_relevant(score, question_terms, question_grams, chunk):
            filtered.append(chunk.raw)

    return filtered[:k]

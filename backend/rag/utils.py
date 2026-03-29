from pathlib import Path
from typing import List


def read_text_file(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> List[str]:
    if not text:
        return []

    chunks: List[str] = []
    step = max(chunk_size - overlap, 1)

    for i in range(0, len(text), step):
        chunk = text[i : i + chunk_size].strip()
        if chunk:
            chunks.append(chunk)

    return chunks

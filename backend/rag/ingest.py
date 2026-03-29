from pathlib import Path

from rag.utils import chunk_text, read_text_file


def ingest_manual(manual_path: str = "data/manual.txt") -> dict:
    """
    TODO:
    1) Read raw text
    2) Split into chunks
    3) Build embeddings
    4) Save vectors to FAISS index at db/faiss_index
    """
    path = Path(manual_path)
    raw_text = read_text_file(path)
    chunks = chunk_text(raw_text, chunk_size=500, overlap=80)

    # Placeholder: replace with real embedding + FAISS write flow.
    return {
        "manual_path": str(path),
        "num_chunks": len(chunks),
        "status": "stubbed",
    }

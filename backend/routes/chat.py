from flask import Blueprint, jsonify, request

from rag.generator import generate_answer
from rag.retriever import retrieve_context

chat_bp = Blueprint("chat", __name__)


@chat_bp.post("/ask")
def ask():
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()

    if not question:
        return jsonify({"error": "question is required"}), 400

    context_chunks = retrieve_context(question=question, top_k=3)
    answer = generate_answer(question=question, context_chunks=context_chunks)

    return jsonify(
        {
            "question": question,
            "answer": answer,
            "sources": context_chunks,
        }
    )

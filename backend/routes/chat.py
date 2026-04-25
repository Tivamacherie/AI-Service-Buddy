import os
import uuid

from flask import Blueprint, jsonify, request

from rag.generator import generate_answer
from rag.retriever import retrieve_context
from storage.qa_store import (
    clear_chat_history,
    delete_chat_session,
    get_best_similar_answer,
    get_recent_turns,
    get_similar_qa,
    get_top_search_sources,
    get_top_searches,
    save_chat_turn,
)

chat_bp = Blueprint("chat", __name__)
USE_MANUAL_CONTEXT = os.getenv("USE_MANUAL_CONTEXT", "false").strip().lower() == "true"
FAST_REUSE_MIN_SCORE = float(os.getenv("FAST_REUSE_MIN_SCORE", "0.96"))
ENABLE_FAST_REUSE = os.getenv("ENABLE_FAST_REUSE", "false").strip().lower() == "true"


def _normalize_top_k(value: object, default: int = 3) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, 1), 10)


def _normalize_limit(value: object, default: int = 5) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, 1), 10)


def _normalize_source_limit(value: object, default: int = 20) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, 1), 50)


@chat_bp.post("/ask")
def ask():
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    session_id = (payload.get("session_id") or "").strip() or str(uuid.uuid4())
    top_k = _normalize_top_k(payload.get("top_k"), default=3)
    force_fresh = bool(payload.get("force_fresh", False))

    if not question:
        return jsonify({"error": "question is required"}), 400

    if USE_MANUAL_CONTEXT:
        context_chunks = retrieve_context(question=question, top_k=top_k)
    else:
        context_chunks = []

    conversation_history = get_recent_turns(session_id=session_id, limit=8)
    similar_qa = get_similar_qa(question=question, limit=3)

    source = "cloud-llm"
    if not force_fresh and ENABLE_FAST_REUSE:
        best = get_best_similar_answer(question=question, min_score=FAST_REUSE_MIN_SCORE)
    else:
        best = None

    if best and (best.get("answer") or "").strip():
        answer = (best.get("answer") or "").strip()
        source = "memory-reuse"
    else:
        answer = generate_answer(
            question=question,
            context_chunks=context_chunks,
            conversation_history=conversation_history,
            similar_qa=similar_qa,
        )
        if (
            best
            and (best.get("answer") or "").strip()
            and (
                answer.startswith("เรียก Cloud LLM ไม่สำเร็จ")
                or answer.startswith("เชื่อมต่อ Cloud LLM ไม่สำเร็จ")
                or answer.startswith("เกิดข้อผิดพลาดระหว่างเรียก Cloud LLM")
            )
        ):
            answer = (best.get("answer") or "").strip()
            source = "memory-reuse-fallback"

    save_chat_turn(
        session_id=session_id,
        question=question,
        answer=answer,
        source=source,
    )

    return jsonify(
        {
            "session_id": session_id,
            "question": question,
            "answer": answer,
            "sources": context_chunks,
            "source": source,
            "top_k": top_k,
            "memory_turns": len(conversation_history),
        }
    )


@chat_bp.get("/history/<session_id>")
def history(session_id: str):
    turns = get_recent_turns(session_id=session_id, limit=30)
    return jsonify({"session_id": session_id, "turns": turns})


@chat_bp.delete("/history/<session_id>")
def delete_history(session_id: str):
    deleted = delete_chat_session(session_id=session_id)
    return jsonify({"session_id": session_id, "deleted": deleted})


@chat_bp.delete("/history")
def clear_history():
    deleted = clear_chat_history()
    return jsonify({"deleted": deleted})


@chat_bp.get("/top-searches")
def top_searches():
    limit = _normalize_limit(request.args.get("limit"), default=5)
    items = get_top_searches(limit=limit)
    return jsonify({"items": items, "limit": limit})


@chat_bp.get("/top-searches/sources")
def top_search_sources():
    keyword = (request.args.get("keyword") or "").strip()
    if not keyword:
        return jsonify({"error": "keyword is required"}), 400

    limit = _normalize_source_limit(request.args.get("limit"), default=20)
    sessions = get_top_search_sources(keyword=keyword, limit=limit)
    return jsonify({"keyword": keyword, "sessions": sessions, "limit": limit})

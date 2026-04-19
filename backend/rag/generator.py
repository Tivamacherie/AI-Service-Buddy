import json
import os
import threading
from typing import Dict, List
from urllib import error, request

CLOUD_LLM_BASE_URL = os.getenv("CLOUD_LLM_BASE_URL", "https://api.openai.com")
CLOUD_LLM_API_KEY = os.getenv("CLOUD_LLM_API_KEY", "")
CLOUD_LLM_MODEL = os.getenv("CLOUD_LLM_MODEL", "GPT-5.3 Chat")
CLOUD_LLM_TIMEOUT_SECONDS = int(os.getenv("CLOUD_LLM_TIMEOUT_SECONDS", "60"))
MAX_OUTPUT_TOKENS = int(os.getenv("CLOUD_LLM_MAX_OUTPUT_TOKENS", "350"))

_CACHE_LOCK = threading.Lock()
_ANSWER_CACHE: Dict[str, str] = {}
_CACHE_MAX_SIZE = 512


def is_cloud_llm_enabled() -> bool:
    return bool(CLOUD_LLM_API_KEY.strip())


def _to_message(role: str, content: str) -> Dict[str, str]:
    return {"role": role, "content": content}


def _normalize_text(text: str) -> str:
    return " ".join((text or "").lower().split())


def _cache_key(
    question: str,
    conversation_history: List[Dict[str, str]] | None,
) -> str:
    normalized_question = _normalize_text(question)
    if not conversation_history:
        return normalized_question

    # Keep key compact for better cache hit rate while still context-aware.
    last_turns = conversation_history[-2:]
    context_hint = "|".join(
        _normalize_text(turn.get("question", "")) for turn in last_turns
    )
    return f"{normalized_question}::{context_hint}"


def _get_cached_answer(key: str) -> str | None:
    if not key:
        return None
    with _CACHE_LOCK:
        return _ANSWER_CACHE.get(key)


def _set_cached_answer(key: str, answer: str) -> None:
    if not key or not answer.strip():
        return
    with _CACHE_LOCK:
        if len(_ANSWER_CACHE) >= _CACHE_MAX_SIZE:
            # Drop an arbitrary old item to keep memory small and fast.
            _ANSWER_CACHE.pop(next(iter(_ANSWER_CACHE)))
        _ANSWER_CACHE[key] = answer.strip()


def _should_ask_clarifying_question(question: str) -> bool:
    q = (question or "").strip()
    if not q:
        return True

    compact = _normalize_text(q)
    keywords = [
        "เสียง",
        "สั่น",
        "ไฟ",
        "กลิ่น",
        "ควัน",
        "ความร้อน",
        "รั่ว",
        "ดับ",
        "สตาร์ท",
        "รอบ",
        "เบรก",
        "เกียร์",
        "แอร์",
        "engine",
        "start",
        "brake",
    ]

    direct_intents = [
        "ควรเช็ค",
        "เช็คอะไร",
        "เกิดจาก",
        "เป็นเพราะ",
        "แก้ยังไง",
        "ทำยังไง",
        "ซ่อมยังไง",
        "วิธีแก้",
        "อาการนี้",
    ]

    vague_phrases = [
        "รถมีปัญหา",
        "รถเสีย",
        "ผิดปกติ",
        "ช่วยดูหน่อย",
        "ช่วยที",
        "ไม่รู้เป็นอะไร",
        "ไม่แน่ใจ",
        "ช่วยวิเคราะห์",
    ]

    if any(k in compact for k in keywords):
        return False

    if any(intent in compact for intent in direct_intents):
        return False

    # Ask follow-up only when message is too generic/ambiguous.
    if any(p in compact for p in vague_phrases):
        return True

    if len(compact) <= 4:
        return True

    return False


def _clarifying_response(question: str) -> str:
    return (
        "รับทราบครับ เดี๋ยวผมช่วยไล่งานให้ก่อนลงมือซ่อมให้แม่นขึ้นอีกนิด\n"
        "ขอข้อมูลเพิ่มสั้น ๆ 2-3 จุด: เงื่อนไขที่เกิดอาการ, รหัส/ไฟเตือนที่พบ, "
        "และสิ่งที่ตรวจไปแล้วหรืออะไหล่ที่เปลี่ยนมาก่อนหน้านี้\n"
        f"ข้อมูลตอนนี้ที่มี: {question.strip() or 'ยังไม่ได้ระบุอาการ'}"
    )


def _build_messages(
    question: str,
    context_chunks: List[str],
    conversation_history: List[Dict[str, str]] | None,
    similar_qa: List[Dict[str, str]] | None,
) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [
        _to_message(
            "system",
            "คุณคือช่างที่ปรึกษา (Consulting Mechanic) สำหรับช่างซ่อมที่กำลังหาข้อมูลก่อนลงมือซ่อมจริง "
            "ผู้ถามคือช่างหน้างาน ไม่ใช่ลูกค้าทั่วไป จึงให้ตอบเชิงเทคนิคได้มากขึ้น แต่ยังคงอ่านง่ายและกระชับ "
            "ห้ามคัดลอกข้อความจากฐานความรู้แบบตรงตัวหรือยาวเป็นบล็อก ให้สรุปใหม่ด้วยเหตุผลเชิงช่าง "
            "หลีกเลี่ยงการลิสต์ยาวแบบข้อ 1-2-3 ถ้าไม่จำเป็น ให้ตอบเหมือนช่างคุยกับช่าง "
            "ทุกคำตอบควรมี: สาเหตุที่เป็นไปได้, จุดตรวจที่ควรเริ่มก่อน, และแนวทางยืนยันผลก่อนสั่งซ่อม/เปลี่ยนอะไหล่ "
            "ถ้าคำถามตรงและชัดเจน ให้ตอบแนวทางได้เลยโดยไม่ต้องถามกลับ "
            "ถามกลับเฉพาะเคสกำกวมจริง ๆ หรือเสี่ยงวินิจฉัยผิด โดยถามสั้นที่สุดเท่าที่จำเป็น",
        )
    ]

    if similar_qa:
        memory_lines = ["ความรู้สะสมจากคำถามก่อนหน้า:"]
        for idx, item in enumerate(similar_qa[:3], start=1):
            q = (item.get("question") or "").strip()
            a = (item.get("answer") or "").strip()
            if q and a:
                # Keep memory compact for latency and to avoid copy-paste style outputs.
                compact_answer = " ".join(a.split())[:220]
                memory_lines.append(f"{idx}) Q: {q}\nA(สรุป): {compact_answer}")
        if len(memory_lines) > 1:
            messages.append(_to_message("system", "\n\n".join(memory_lines)))

    if context_chunks:
        context_block = "\n\n".join(
            f"[Knowledge {idx + 1}]\n{' '.join(chunk.split())[:500]}"
            for idx, chunk in enumerate(context_chunks[:3])
        )
        messages.append(_to_message("system", f"ข้อมูลความรู้ที่เกี่ยวข้อง:\n{context_block}"))

    if conversation_history:
        for item in conversation_history[-4:]:
            q = (item.get("question") or "").strip()
            a = (item.get("answer") or "").strip()
            if q:
                messages.append(_to_message("user", q))
            if a:
                messages.append(_to_message("assistant", " ".join(a.split())[:280]))

    messages.append(_to_message("user", question))
    return messages


def _cloud_chat_completions(messages: List[Dict[str, str]]) -> str:
    if not is_cloud_llm_enabled():
        return "ยังไม่ได้ตั้งค่า Cloud LLM API key กรุณาตั้งค่า CLOUD_LLM_API_KEY"

    base = CLOUD_LLM_BASE_URL.rstrip("/")
    if base.endswith("/v1"):
        url = f"{base}/chat/completions"
    else:
        url = f"{base}/v1/chat/completions"
    payload = {
        "model": CLOUD_LLM_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": MAX_OUTPUT_TOKENS,
    }
    data = json.dumps(payload).encode("utf-8")

    req = request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CLOUD_LLM_API_KEY}",
            "HTTP-Referer": os.getenv("CLOUD_LLM_REFERER", "http://localhost"),
            "X-Title": "AI-Service-Buddy",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=CLOUD_LLM_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body)
            choices = parsed.get("choices") or []
            if not choices:
                return "ระบบ AI บนคลาวด์ตอบกลับว่างเปล่า กรุณาลองใหม่อีกครั้ง"
            message = choices[0].get("message") or {}
            content = (message.get("content") or "").strip()
            if content:
                return content
            return "ระบบ AI บนคลาวด์ตอบกลับว่างเปล่า กรุณาลองใหม่อีกครั้ง"
    except error.HTTPError as ex:
        return f"เรียก Cloud LLM ไม่สำเร็จ (HTTP {ex.code})"
    except error.URLError:
        return "เชื่อมต่อ Cloud LLM ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายหรือ URL"
    except Exception:
        return "เกิดข้อผิดพลาดระหว่างเรียก Cloud LLM กรุณาลองใหม่อีกครั้ง"


def generate_answer(
    question: str,
    context_chunks: List[str],
    conversation_history: List[Dict[str, str]] | None = None,
    similar_qa: List[Dict[str, str]] | None = None,
) -> str:
    if _should_ask_clarifying_question(question):
        return _clarifying_response(question)

    key = _cache_key(question=question, conversation_history=conversation_history)
    cached = _get_cached_answer(key)
    if cached:
        return cached

    messages = _build_messages(
        question=question,
        context_chunks=context_chunks,
        conversation_history=conversation_history,
        similar_qa=similar_qa,
    )
    answer = _cloud_chat_completions(messages)
    _set_cached_answer(key, answer)
    return answer

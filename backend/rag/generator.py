import json
import os
from typing import List
from urllib import error, request

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))


def _extract_lines_after_marker(lines: List[str], marker: str, limit: int) -> List[str]:
    out: List[str] = []
    collecting = False
    for line in lines:
        s = line.strip()
        if not s:
            if collecting and out:
                break
            continue
        if marker in s:
            collecting = True
            continue
        if collecting:
            if s.startswith("ข-") or s.startswith("ค-") or s.startswith("ง-"):
                break
            out.append(s)
            if len(out) >= limit:
                break
    return out


def _deterministic_answer_from_context(question: str, context_chunks: List[str]) -> str | None:
    if not context_chunks:
        return None

    top = context_chunks[0]
    if question.strip() and question.strip() not in top:
        # If top chunk does not explicitly contain the asked phrase, skip deterministic mode.
        return None

    lines = top.splitlines()
    header = lines[0].strip() if lines else ""
    inspect_items = _extract_lines_after_marker(lines, "รายการตรวจเกี่ยวกับรถยนต์", limit=5)
    causes = _extract_lines_after_marker(lines, "สาเหตุที่อาจเป็นไปได้ของปัญหา", limit=8)

    parts: List[str] = []
    parts.append(f"อ้างอิงหัวข้อ: {header or 'ในคู่มือ'}")
    parts.append(f"สรุป: พบข้อมูลสำหรับอาการ '{question}' ในคู่มือ")
    if inspect_items:
        parts.append("รายการตรวจเบื้องต้น:")
        parts.extend(f"- {item}" for item in inspect_items)
    if causes:
        parts.append("สาเหตุที่อาจเป็นไปได้:")
        parts.extend(f"- {item}" for item in causes)

    return "\n".join(parts)


def _build_prompt(question: str, context_chunks: List[str]) -> str:
    context_block = "\n\n".join(
        f"[Context {idx + 1}]\n{chunk}" for idx, chunk in enumerate(context_chunks)
    )
    if not context_block:
        context_block = "(ไม่มี context จากฐานข้อมูล)"

    return (
        "คุณเป็นผู้ช่วย AI Service Buddy\n"
        "กติกาการตอบ:\n"
        "1) ใช้ข้อมูลจาก Context เท่านั้น ห้ามแต่งข้อมูลเพิ่มเอง\n"
        "2) ถ้าพบหัวข้อที่ตรงกับคำถาม ให้สรุปคำตอบจากหัวข้อนั้นทันที\n"
        "3) รูปแบบคำตอบ: สรุปอาการ 1 บรรทัด, รายการตรวจ, สาเหตุที่อาจเป็นไปได้\n"
        "4) ถ้าไม่พบข้อมูลที่ตอบคำถามได้จริง ๆ เท่านั้น ให้ตอบว่า 'ไม่พบข้อมูลนี้ในคู่มือที่มีอยู่'\n"
        "5) ตอบเป็นภาษาไทย กระชับ ชัดเจน\n\n"
        f"{context_block}\n\n"
        f"[Question]\n{question}\n\n"
        "[Answer]"
    )


def _call_ollama(prompt: str) -> str:
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=OLLAMA_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body)
            answer = (parsed.get("response") or "").strip()
            if answer:
                return answer
            return "โมเดลตอบกลับว่างเปล่า กรุณาลองใหม่อีกครั้ง"
    except error.URLError:
        return (
            "ยังเชื่อมต่อ Ollama ไม่ได้ กรุณาเปิด `ollama serve` "
            "หรือกำหนด OLLAMA_BASE_URL ให้ถูกต้อง"
        )
    except Exception:
        return "เกิดข้อผิดพลาดระหว่างสร้างคำตอบจากโมเดล กรุณาลองใหม่อีกครั้ง"


def generate_answer(question: str, context_chunks: List[str]) -> str:
    deterministic = _deterministic_answer_from_context(
        question=question, context_chunks=context_chunks
    )
    if deterministic:
        return deterministic

    prompt = _build_prompt(question=question, context_chunks=context_chunks)
    return _call_ollama(prompt=prompt)

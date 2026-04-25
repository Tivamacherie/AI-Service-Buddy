# AI-Service-Buddy

แอปผู้ช่วยตอบคำถามงานบริการรถยนต์ (Thai) ด้วย Flask + Cloud LLM + Memory

## จุดเด่น
- โหมด Cloud-first: เรียกโมเดลบนคลาวด์ (OpenAI-compatible API)
- บันทึกประวัติคำถาม-คำตอบลงฐานข้อมูล SQLite เพื่อใช้เป็น memory
- รองรับ session chat ต่อเนื่อง (ไม่ใช่ถามทีเดียวจบ)
- เปิด/ปิดการใช้ context จาก manual ได้ด้วย env

## โครงสร้าง
- Frontend: [index.html](index.html), [script.js](script.js), [style.css](style.css)
- Backend: [backend/app.py](backend/app.py)
- Chat route: [backend/routes/chat.py](backend/routes/chat.py)
- RAG: [backend/rag/retriever.py](backend/rag/retriever.py), [backend/rag/generator.py](backend/rag/generator.py)
- Memory store: [backend/storage/qa_store.py](backend/storage/qa_store.py)
- คู่มือ: [backend/data/manual.txt](backend/data/manual.txt)

## ติดตั้ง (ทุก OS)
ต้องมี Python 3.10+ ก่อน

1) เข้าโฟลเดอร์โปรเจกต์
2) สร้าง virtual environment

Windows (PowerShell)
- `python -m venv .venv`
- `.\.venv\Scripts\Activate.ps1`

macOS / Linux
- `python3 -m venv .venv`
- `source .venv/bin/activate`

3) ติดตั้ง dependency
- `pip install -r requirements.txt`

## รันระบบ
จากโฟลเดอร์โปรเจกต์:
- `python backend/app.py`

เปิดเว็บ:
- `http://127.0.0.1:8000/`

## ตั้งค่า Environment (ไม่บังคับ)
- `PORT` (default: `8000`)
- `CORS_ALLOW_ORIGIN` (default: `*`)
- `APP_ENV` (`development` หรือ `production`, default: `development`)
- `FORCE_HTTPS` (default: `true`)
- `CLOUD_LLM_BASE_URL` (default: `https://api.openai.com`)
- `CLOUD_LLM_API_KEY` (**จำเป็นสำหรับโหมดคลาวด์**)
- `CLOUD_LLM_MODEL` (default: `gpt-4.1-mini`)
- `CLOUD_LLM_TIMEOUT_SECONDS` (default: `60`)
- `CLOUD_LLM_MAX_OUTPUT_TOKENS` (default: `350`)
- `ENABLE_FAST_REUSE` (default: `false`)
- `FAST_REUSE_MIN_SCORE` (default: `0.96`, ใช้เมื่อเปิด `ENABLE_FAST_REUSE=true`)
- `USE_MANUAL_CONTEXT` (`true`/`false`, default: `false`)
- `QA_DB_PATH` (default: `backend/db/chat_memory.sqlite3`)

ตัวอย่างไฟล์ `.env` สำหรับรัน local:
```env
CLOUD_LLM_API_KEY=your_api_key_here
CLOUD_LLM_BASE_URL=https://api.openai.com
CLOUD_LLM_MODEL=gpt-4.1-mini
```

ถ้าใช้คีย์ขึ้นต้น `sk-or-v1` ของ OpenRouter ให้ใช้ค่านี้แทน:
```env
CLOUD_LLM_API_KEY=sk-or-v1-...
CLOUD_LLM_BASE_URL=https://openrouter.ai/api/v1
CLOUD_LLM_MODEL=openai/gpt-4.1-mini
```

## Health Check
- `GET /health`

## API ที่เพิ่ม
- `POST /ask`
	- body ตัวอย่าง:
		- `{"question":"รถสตาร์ทไม่ติด", "session_id":"user-01"}`
	- ถ้าไม่ส่ง `session_id` ระบบจะสร้างให้
	- ส่ง `force_fresh=true` ได้ เมื่อต้องการบังคับให้เรียกโมเดลใหม่ ไม่ reuse memory
- `GET /history/<session_id>`
	- ดึงประวัติ chat ของ session
- `DELETE /history/<session_id>`
	- ลบประวัติ chat ทั้งหมดของ session นั้น
- `DELETE /history`
	- ลบประวัติ chat ทั้งหมดทุก session
- `GET /top-searches?limit=5`
	- ดึงรายการคีย์เวิร์ดอาการที่ถูกถามบ่อยที่สุด (สกัดจากข้อความคำถาม)
- `GET /top-searches/sources?keyword=<keyword>&limit=20`
	- ดึงรายการ session ที่มีคีย์เวิร์ดอาการนั้น พร้อมจำนวนครั้งที่พบ

## Deploy ขึ้น Cloud
โปรเจกต์มี [Dockerfile](Dockerfile) พร้อม deploy

Environment ที่ต้องตั้งบน Cloud:
- `APP_ENV=production`
- `CLOUD_LLM_API_KEY`
- `CLOUD_LLM_BASE_URL` (ถ้าใช้ OpenAI ให้ใช้ค่า default ได้)
- `CLOUD_LLM_MODEL`
- `CORS_ALLOW_ORIGIN` (เช่น `https://your-domain.com`)
- `PORT` (แพลตฟอร์มส่วนใหญ่กำหนดให้อัตโนมัติ)

หมายเหตุสำคัญเรื่อง "ไม่ปลอดภัย":
- ถ้าเปิดด้วย `http://127.0.0.1` บนเครื่องตัวเอง เบราว์เซอร์อาจแสดงว่าไม่ปลอดภัย (ปกติของ local)
- งานจริงควร deploy ผ่าน HTTPS domain เท่านั้น (เช่น Cloudflare/Render/Railway/Fly)

ตัวอย่างคำสั่งรัน image:
- `docker build -t ai-service-buddy .`
- `docker run -p 8000:8000 --env CLOUD_LLM_API_KEY=... ai-service-buddy`

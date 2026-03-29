(function () {
  const API_URL_CANDIDATES = [
    "/ask",
    "http://127.0.0.1:8000/ask",
    "http://localhost:8000/ask",
    "http://127.0.0.1:8002/ask",
    "http://localhost:8002/ask",
    "http://127.0.0.1:8003/ask",
    "http://localhost:8003/ask",
    "http://127.0.0.1:8004/ask",
    "http://localhost:8004/ask",
  ];
  const input = document.getElementById("searchInput");
  const answerText = document.getElementById("answerText");
  if (!input || !answerText) return;

  async function askBackend(question) {
    answerText.textContent = "กำลังค้นหาคำตอบ...";
    answerText.classList.add("is-loading");
    answerText.classList.remove("is-error");

    try {
      let data = null;
      let lastStatus = null;

      for (const url of API_URL_CANDIDATES) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
          });
          lastStatus = res.status;
          if (!res.ok) continue;
          data = await res.json();
          break;
        } catch (_) {
          // Try next URL.
        }
      }

      if (!data) {
        throw new Error(`request_failed:${lastStatus || "network"}`);
      }

      answerText.textContent =
        (data.answer || "").trim() || "ยังไม่มีคำตอบจากระบบในตอนนี้";
      answerText.classList.remove("is-error");
    } catch (err) {
      answerText.textContent =
        "เชื่อมต่อ backend ไม่ได้ กรุณาตรวจสอบว่า backend กำลังรันอยู่";
      console.error("[AI Service Buddy] ask failed:", err);
      answerText.classList.add("is-error");
    } finally {
      answerText.classList.remove("is-loading");
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = input.value.trim();
      if (q) {
        askBackend(q);
      }
    }
  });
})();

(function () {
  const REQUEST_TIMEOUT_MS = 12000;
  const STORAGE_KEY = "AI_SERVICE_BUDDY_API_URL";
  const SESSION_KEY = "AI_SERVICE_BUDDY_SESSION_ID";
  const CHAT_LIST_KEY = "AI_SERVICE_BUDDY_CHAT_LIST";
  const MAX_INPUT_HEIGHT = 180;

  function buildAskApiCandidates() {
    const candidates = [];
    const fromStorage = (localStorage.getItem(STORAGE_KEY) || "").trim();
    const fromWindow = (window.AI_SERVICE_BUDDY_API_URL || "").trim();

    if (fromWindow) candidates.push(fromWindow);
    if (fromStorage) candidates.push(fromStorage);

    const isHttpPage = window.location.protocol === "http:" || window.location.protocol === "https:";
    if (isHttpPage) {
      candidates.push(`${window.location.origin}/ask`);
      candidates.push("/ask");
    }

    candidates.push("http://127.0.0.1:8000/ask");
    candidates.push("http://localhost:8000/ask");

    return [...new Set(candidates.map((u) => u.trim()).filter(Boolean))];
  }

  function buildBaseApiCandidates(askUrl) {
    return [
      (askUrl || "").replace(/\/ask$/, ""),
      window.location.origin,
      "http://127.0.0.1:8000",
      "http://localhost:8000",
    ].filter(Boolean);
  }

  const API_URL_CANDIDATES = buildAskApiCandidates();
  const sidebarEl = document.getElementById("sidebar");
  const sidebarBackdropEl = document.getElementById("sidebarBackdrop");
  const threadEl = document.getElementById("chatThread");
  const quickPromptsEl = document.getElementById("quickPrompts");
  const formEl = document.getElementById("composerForm");
  const inputEl = document.getElementById("chatInput");
  const sendBtnEl = document.getElementById("sendBtn");
  const newChatBtnEl = document.getElementById("newChatBtn");
  const toggleSidebarBtnEl = document.getElementById("toggleSidebarBtn");
  const chatHistoryListEl = document.getElementById("chatHistoryList");
  const apiStatusEl = document.getElementById("apiStatus");

  if (!sidebarEl || !sidebarBackdropEl || !threadEl || !quickPromptsEl || !formEl || !inputEl || !sendBtnEl || !newChatBtnEl || !toggleSidebarBtnEl || !chatHistoryListEl || !apiStatusEl) {
    return;
  }

  let isSending = false;
  let activeSessionId = "";
  let chatList = [];
  const quickPrompts = [
    "รถสตาร์ทไม่ติด ควรเช็คจุดไหนก่อน",
    "ไฟเครื่องโชว์ ขับต่อได้ไหม",
    "แอร์ไม่เย็น น่าจะเสียที่อะไร",
    "รถสั่นตอนออกตัว เกิดจากอะไร",
    "เบรกแล้วมีเสียงดัง ต้องเช็คอะไร",
  ];

  function getChatList() {
    try {
      const raw = localStorage.getItem(CHAT_LIST_KEY) || "[]";
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x) => x && x.id).slice(0, 80);
    } catch (_) {
      return [];
    }
  }

  function saveChatList(list) {
    chatList = list.slice(0, 80);
    try {
      localStorage.setItem(CHAT_LIST_KEY, JSON.stringify(chatList));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function titleFromQuestion(text) {
    const q = (text || "").trim();
    if (!q) return "แชทใหม่";
    return q.length > 36 ? `${q.slice(0, 36)}...` : q;
  }

  function previewFromAnswer(text) {
    const t = (text || "").trim().replace(/\s+/g, " ");
    if (!t) return "ยังไม่มีข้อความ";
    return t.length > 52 ? `${t.slice(0, 52)}...` : t;
  }

  function upsertChatMeta(sessionId, question, answer) {
    const now = Date.now();
    const idx = chatList.findIndex((c) => c.id === sessionId);
    const item = {
      id: sessionId,
      title: titleFromQuestion(question),
      preview: previewFromAnswer(answer),
      updatedAt: now,
    };

    if (idx >= 0) {
      const current = chatList[idx];
      chatList[idx] = {
        ...current,
        preview: item.preview,
        updatedAt: now,
        title: current.title && current.title !== "แชทใหม่" ? current.title : item.title,
      };
    } else {
      chatList.unshift(item);
    }

    chatList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    saveChatList(chatList);
    renderChatList();
  }

  function ensureSessionInList(sessionId, title = "แชทใหม่") {
    if (!sessionId) return;
    if (chatList.some((c) => c.id === sessionId)) return;
    chatList.unshift({
      id: sessionId,
      title,
      preview: "ยังไม่มีข้อความ",
      updatedAt: Date.now(),
    });
    saveChatList(chatList);
  }

  function renderChatList() {
    chatHistoryListEl.innerHTML = "";
    if (!chatList.length) {
      const empty = document.createElement("p");
      empty.className = "history-item-preview";
      empty.textContent = "ยังไม่มีประวัติแชท";
      chatHistoryListEl.appendChild(empty);
      return;
    }

    for (const item of chatList) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `history-item${item.id === activeSessionId ? " active" : ""}`;
      btn.dataset.sessionId = item.id;

      const title = document.createElement("p");
      title.className = "history-item-title";
      title.textContent = item.title || "แชทใหม่";

      const preview = document.createElement("p");
      preview.className = "history-item-preview";
      preview.textContent = item.preview || "ยังไม่มีข้อความ";

      btn.appendChild(title);
      btn.appendChild(preview);
      btn.addEventListener("click", async () => {
        await switchToSession(item.id);
      });
      chatHistoryListEl.appendChild(btn);
    }
  }

  function getSessionId() {
    let sid = "";
    try {
      sid = (localStorage.getItem(SESSION_KEY) || "").trim();
      if (!sid) {
        sid = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || `${Date.now()}`;
        localStorage.setItem(SESSION_KEY, sid);
      }
    } catch (_) {
      sid = `${Date.now()}`;
    }
    return sid;
  }

  function createNewSession() {
    const sid = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || `${Date.now()}`;
    try {
      localStorage.setItem(SESSION_KEY, sid);
    } catch (_) {
      // Ignore storage errors.
    }
    return sid;
  }

  function setStatus(text, isError = false) {
    apiStatusEl.textContent = text;
    apiStatusEl.classList.toggle("is-error", isError);
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) {
      sidebarEl.classList.remove("open");
      sidebarBackdropEl.classList.remove("show");
    }
  }

  function setSidebarOpen(open) {
    if (window.innerWidth > 900) return;
    sidebarEl.classList.toggle("open", open);
    sidebarBackdropEl.classList.toggle("show", open);
  }

  function scrollToBottom() {
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function appendMessage(role, text, source = "") {
    const row = document.createElement("div");
    row.className = `message-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = (text || "").trim() || "-";
    row.appendChild(bubble);

    if (source) {
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `แหล่งคำตอบ: ${source}`;
      bubble.appendChild(meta);
    }

    threadEl.appendChild(row);
    scrollToBottom();
  }

  function createTypingNode() {
    const row = document.createElement("div");
    row.className = "message-row assistant";
    row.id = "typingRow";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const typing = document.createElement("div");
    typing.className = "typing";
    typing.innerHTML = "<span></span><span></span><span></span>";

    bubble.appendChild(typing);
    row.appendChild(bubble);
    return row;
  }

  function setComposerEnabled(enabled) {
    inputEl.disabled = !enabled;
    sendBtnEl.disabled = !enabled;
  }

  function autoResizeInput() {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function askBackend(question) {
    let data = null;
    let lastStatus = null;

    for (const url of API_URL_CANDIDATES) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              session_id: activeSessionId || getSessionId(),
            }),
          },
          REQUEST_TIMEOUT_MS
        );
        lastStatus = res.status;
        if (!res.ok) continue;
        data = await res.json();
        try {
          localStorage.setItem(STORAGE_KEY, url);
        } catch (_) {
          // Ignore storage errors.
        }
        setStatus("เชื่อมต่อแล้ว");
        break;
      } catch (_) {
        // Try next URL.
      }
    }

    if (!data) {
      setStatus("เชื่อมต่อไม่ได้", true);
      throw new Error(`request_failed:${lastStatus || "network"}`);
    }

    return data;
  }

  async function loadHistory(sessionId) {
    const sid = sessionId || activeSessionId || getSessionId();
    const askApi = (localStorage.getItem(STORAGE_KEY) || API_URL_CANDIDATES[0] || "").trim();
    const roots = buildBaseApiCandidates(askApi);

    threadEl.innerHTML = "";

    for (const root of roots) {
      try {
        const url = `${root.replace(/\/$/, "")}/history/${encodeURIComponent(sid)}`;
        const res = await fetchWithTimeout(url, { method: "GET" }, REQUEST_TIMEOUT_MS);
        if (!res.ok) continue;

        const payload = await res.json();
        const turns = Array.isArray(payload.turns) ? payload.turns : [];
        if (!turns.length) {
          resetChatUi();
          return;
        }

        for (const turn of turns) {
          appendMessage("user", turn.question || "");
          appendMessage("assistant", turn.answer || "");
        }
        return;
      } catch (_) {
        // Try next root.
      }
    }

    resetChatUi();
  }

  function resetChatUi() {
    threadEl.innerHTML = "";
    appendMessage(
      "assistant",
      "สวัสดีครับ ผมเป็นช่างที่ปรึกษาสำหรับช่างหน้างาน\nส่งอาการและข้อมูลที่ตรวจมาแล้วได้เลย เดี๋ยวผมช่วยวางแผนเช็กก่อนซ่อมให้เป็นขั้นตอน"
    );
  }

  function renderQuickPrompts() {
    quickPromptsEl.innerHTML = "";
    for (const prompt of quickPrompts) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "prompt-chip";
      btn.textContent = prompt;
      btn.addEventListener("click", () => {
        inputEl.value = prompt;
        autoResizeInput();
        formEl.requestSubmit();
      });
      quickPromptsEl.appendChild(btn);
    }
  }

  async function switchToSession(sessionId) {
    activeSessionId = sessionId;
    try {
      localStorage.setItem(SESSION_KEY, sessionId);
    } catch (_) {
      // Ignore storage errors.
    }
    renderChatList();
    closeSidebarOnMobile();
    await loadHistory(sessionId);
  }

  async function submitQuestion(question) {
    if (isSending) return;
    isSending = true;
    setComposerEnabled(false);

    appendMessage("user", question);
    const typingNode = createTypingNode();
    threadEl.appendChild(typingNode);
    scrollToBottom();

    try {
      const data = await askBackend(question);
      typingNode.remove();
      const answer = (data.answer || "").trim() || "ยังไม่มีคำตอบจากระบบในตอนนี้";
      appendMessage("assistant", answer, data.source || "");
      upsertChatMeta(activeSessionId, question, answer);
    } catch (err) {
      typingNode.remove();
      appendMessage("assistant", "เชื่อมต่อ backend ไม่ได้ กรุณาตรวจสอบว่า backend กำลังรันอยู่");
      console.error("[AI Service Buddy] ask failed:", err);
    } finally {
      isSending = false;
      setComposerEnabled(true);
      inputEl.focus();
    }
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = inputEl.value.trim();
    if (!q) return;

    inputEl.value = "";
    autoResizeInput();
    submitQuestion(q);
  });

  inputEl.addEventListener("input", autoResizeInput);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  newChatBtnEl.addEventListener("click", () => {
    activeSessionId = createNewSession();
    ensureSessionInList(activeSessionId);
    resetChatUi();
    setStatus("เริ่มแชทใหม่เรียบร้อย");
    renderChatList();
    closeSidebarOnMobile();
  });

  toggleSidebarBtnEl.addEventListener("click", () => {
    setSidebarOpen(!sidebarEl.classList.contains("open"));
  });

  sidebarBackdropEl.addEventListener("click", () => {
    setSidebarOpen(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      sidebarEl.classList.remove("open");
      sidebarBackdropEl.classList.remove("show");
    }
  });

  chatList = getChatList();
  activeSessionId = getSessionId();
  ensureSessionInList(activeSessionId);
  renderChatList();
  renderQuickPrompts();
  loadHistory(activeSessionId);
  autoResizeInput();
  inputEl.focus();
})();

(function () {
  const REQUEST_TIMEOUT_MS = 12000;
  const STORAGE_KEY = "AI_SERVICE_BUDDY_API_URL";
  const SESSION_KEY = "AI_SERVICE_BUDDY_SESSION_ID";
  const CHAT_LIST_KEY = "AI_SERVICE_BUDDY_CHAT_LIST";
  const PENDING_MSG_KEY = "AI_SERVICE_BUDDY_PENDING_MSG"; // คีย์สำหรับฝากข้อความข้ามหน้า
  const TOP_SEARCH_KEYWORD_KEY = "AI_SERVICE_BUDDY_TOP_SEARCH_KEYWORD";
  const MAX_INPUT_HEIGHT = 180;

  function buildAskApiCandidates() {
    const candidates = [];
    const fromStorage = (localStorage.getItem(STORAGE_KEY) || "").trim();
    const fromWindow = (window.AI_SERVICE_BUDDY_API_URL || "").trim();

    if (fromWindow) candidates.push(fromWindow);
    if (fromStorage) candidates.push(fromStorage);

    const isHttpPage =
      window.location.protocol === "http:" ||
      window.location.protocol === "https:";
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

  // --- Element Selectors ---
  const sidebarEl = document.getElementById("sidebar");
  const sidebarBackdropEl = document.getElementById("sidebarBackdrop");
  const threadEl = document.getElementById("chatThread");
  const quickPromptsEl = document.getElementById("quickPrompts");
  const formEl = document.getElementById("composerForm");
  const inputEl = document.getElementById("chatInput");
  const sendBtnEl = document.getElementById("sendBtn");
  const topSearchesListEl = document.getElementById("topSearchesList");
  const chatHistoryListEl = document.getElementById("chatHistoryList");
  const apiStatusEl = document.getElementById("apiStatus");

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  const newChatBtnEl = document.getElementById("newChatBtn");
  const sidebarNewChatBtn = document.getElementById("sidebarNewChatBtn");

  if (
    !sidebarEl ||
    !sidebarBackdropEl ||
    !threadEl ||
    !quickPromptsEl ||
    !formEl ||
    !inputEl ||
    !sendBtnEl ||
    !topSearchesListEl ||
    !chatHistoryListEl
  ) {
    console.error("Missing critical DOM elements!");
    return;
  }

  let isSending = false;
  let activeSessionId = "";
  let activeTopKeyword = "";
  let isTopSearchMode = false;
  let topSearchItems = [];
  let chatList = [];
  const quickPrompts = [
    "รถสตาร์ทไม่ติด ควรเช็คจุดไหนก่อน",
    "ไฟเครื่องโชว์ ขับต่อได้ไหม",
    "แอร์ไม่เย็น น่าจะเสียที่อะไร",
    "รถสั่นตอนออกตัว เกิดจากอะไร",
    "เบรกแล้วมีเสียงดัง ต้องเช็คอะไร",
  ];

  // เช็คว่าอยู่หน้า index หรือไม่
  const isIndexPage = window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/');

  // ==========================================
  // Sidebar Toggle System
  // ==========================================
  const body = document.body;

  function toggleSidebar() {
    if (window.innerWidth > 980) {
      body.classList.toggle("sidebar-closed");
    } else {
      body.classList.toggle("sidebar-open");
    }
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 980) {
      body.classList.remove("sidebar-open");
    }
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", toggleSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeSidebarOnMobile);
  if (sidebarBackdropEl) sidebarBackdropEl.addEventListener("click", closeSidebarOnMobile);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) body.classList.remove("sidebar-open");
  });

  // ==========================================
  // Chat History & Sessions
  // ==========================================

  function getChatList() {
    try {
      const raw = localStorage.getItem(CHAT_LIST_KEY) || "[]";
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => x && x.id).slice(0, 80) : [];
    } catch (_) { return []; }
  }

  function saveChatList(list) {
    chatList = list.slice(0, 80);
    try { localStorage.setItem(CHAT_LIST_KEY, JSON.stringify(chatList)); } catch (_) {}
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

  function shortSessionId(sessionId) {
    const sid = (sessionId || "").trim();
    if (!sid) return "ไม่ระบุ session";
    return sid.length <= 14 ? sid : `${sid.slice(0, 6)}...${sid.slice(-4)}`;
  }

  function setTopSearchViewMode(enabled) {
    isTopSearchMode = Boolean(enabled);
    if (quickPromptsEl) quickPromptsEl.style.display = isTopSearchMode ? "none" : "";
    if (formEl) formEl.style.display = isTopSearchMode ? "none" : "";
  }

  function titleFromSessionId(sessionId) {
    const found = chatList.find((c) => c.id === sessionId);
    if (found && found.title) return found.title;
    return `แชท ${shortSessionId(sessionId)}`;
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

  function renderChatList() {
    chatHistoryListEl.innerHTML = "";
    if (!chatList.length) {
      const empty = document.createElement("p");
      empty.className = "history-item-preview";
      empty.textContent = "ยังไม่มีประวัติแชท";
      empty.style.padding = "0 20px";
      chatHistoryListEl.appendChild(empty);
      return;
    }

    const btnStyle = `width: 100%; text-align: left; padding: 10px 15px; margin-bottom: 5px; border: none; background: transparent; border-radius: 8px; cursor: pointer; transition: background 0.2s;`;

    for (const item of chatList) {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; align-items: stretch; gap: 6px; margin: 0 10px 5px;";

      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = item.id === activeSessionId;
      btn.style.cssText = btnStyle + "margin-bottom: 0; flex: 1;" + (isActive ? "background: #f0f0f0;" : "");
      
      btn.onmouseover = () => { if (!isActive) btn.style.background = "#fafafa"; };
      btn.onmouseout = () => { if (!isActive) btn.style.background = "transparent"; };

      const title = document.createElement("div");
      title.style.cssText = "font-weight: 600; font-size: 14px; color: #333; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      title.textContent = item.title || "แชทใหม่";

      const preview = document.createElement("div");
      preview.style.cssText = "font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      preview.textContent = item.preview || "ยังไม่มีข้อความ";

      btn.appendChild(title);
      btn.appendChild(preview);

      btn.addEventListener("click", async () => {
        if (isIndexPage) {
          // ถ้าอยู่หน้า index ให้จำ session แล้วย้ายไป chat.html
          localStorage.setItem(SESSION_KEY, item.id);
          window.location.href = "chat.html";
        } else {
          await switchToSession(item.id);
        }
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", "ลบประวัติแชท");
      delBtn.title = "ลบประวัติแชท";
      delBtn.style.cssText = "width: 30px; min-width: 30px; height: 30px; align-self: center; border: 1px solid #ecd6d6; background: #fff; color: #bf4a4a; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0;";
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12a2 2 0 0 0 2-2V8H4v11a2 2 0 0 0 2 2Z"/></svg>';
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = window.confirm(`ต้องการลบประวัติแชท\n\"${item.title || "แชทนี้"}\" หรือไม่?`);
        if (!ok) return;
        await deleteSessionHistory(item.id);
      });

      row.appendChild(btn);
      row.appendChild(delBtn);
      chatHistoryListEl.appendChild(row);
    }
  }

  async function deleteSessionOnServer(sessionId) {
    const sid = (sessionId || "").trim();
    if (!sid) return false;

    const askApi = (localStorage.getItem(STORAGE_KEY) || API_URL_CANDIDATES[0] || "").trim();
    const roots = buildBaseApiCandidates(askApi);
    for (const root of roots) {
      try {
        const url = `${root.replace(/\/$/, "")}/history/${encodeURIComponent(sid)}`;
        const res = await fetchWithTimeout(url, { method: "DELETE" }, REQUEST_TIMEOUT_MS);
        if (!res.ok) continue;
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function deleteSessionHistory(sessionId) {
    const ok = await deleteSessionOnServer(sessionId);
    if (!ok) {
      window.alert("ลบประวัติไม่สำเร็จ กรุณาตรวจสอบว่า backend กำลังรันอยู่");
      return;
    }

    chatList = chatList.filter((c) => c.id !== sessionId);
    saveChatList(chatList);

    if (activeSessionId === sessionId) {
      setTopSearchViewMode(false);
      activeTopKeyword = "";

      if (chatList.length > 0) {
        activeSessionId = chatList[0].id;
      } else {
        activeSessionId = createNewSession();
      }
      localStorage.setItem(SESSION_KEY, activeSessionId);

      if (!isIndexPage) {
        await loadHistory(activeSessionId);
      }
    }

    renderChatList();
    loadTopSearches();
  }

  function renderTopSearches(items) {
    topSearchesListEl.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "history-item-preview";
      empty.textContent = "ยังไม่มีข้อมูลค้นหายอดฮิต";
      empty.style.padding = "0 20px";
      topSearchesListEl.appendChild(empty);
      return;
    }

    const btnStyle = `width: 100%; text-align: left; padding: 10px 15px; margin-bottom: 5px; border: none; background: transparent; border-radius: 8px; cursor: pointer; transition: background 0.2s;`;

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      const keyword = (item.keyword || item.question || "").trim();
      const isActive = keyword && keyword === activeTopKeyword;
      btn.style.cssText = btnStyle + (isActive ? "background: #f0f0f0;" : "");

      btn.onmouseover = () => { if (!isActive) btn.style.background = "#fafafa"; };
      btn.onmouseout = () => { if (!isActive) btn.style.background = "transparent"; };

      const title = document.createElement("div");
      title.style.cssText = "font-weight: 600; font-size: 14px; color: #333; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      title.textContent = item.question || "ไม่ระบุรายการ";

      const preview = document.createElement("div");
      preview.style.cssText = "font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      const count = Number(item.count || 0);
      preview.textContent = `ถูกค้นหา ${count.toLocaleString()} ครั้ง`;

      btn.appendChild(title);
      btn.appendChild(preview);
      btn.addEventListener("click", () => {
        const selected = (item.keyword || item.question || "").trim();
        if (!selected) return;
        loadTopSearchSources(selected);
      });
      topSearchesListEl.appendChild(btn);
    }
  }

  async function openSourceSession(sessionId) {
    if (!sessionId) return;
    if (isIndexPage) {
      localStorage.setItem(SESSION_KEY, sessionId);
      window.location.href = "chat.html";
      return;
    }
    await switchToSession(sessionId);
  }

  function renderKeywordSessionsInThread(keyword, sessions) {
    const q = (keyword || "").trim();
    threadEl.innerHTML = "";

    appendMessage("assistant", `ผลการค้นหายอดฮิต: ${q || "ไม่ระบุคีย์เวิร์ด"}`);

    if (!q || !sessions.length) {
      appendMessage("assistant", "ไม่พบแชทที่เคยค้นหาด้วยคีย์เวิร์ดนี้");
      return;
    }

    for (const item of sessions) {
      const sessionId = (item.session_id || "").trim();
      const title = titleFromSessionId(sessionId);
      const countText = `พบคีย์เวิร์ดนี้ ${Number(item.count || 0).toLocaleString()} ครั้ง`;
      const latestQuestion = (item.latest_question || "ไม่มีข้อความล่าสุด").trim();
      const text = `${title}\n${countText}\nตัวอย่างข้อความล่าสุด: ${latestQuestion}`;
      appendMessage("assistant", text);

      const actionRow = document.createElement("div");
      actionRow.className = "message-row assistant";
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "prompt-chip";
      actionBtn.textContent = `เปิด ${title}`;
      actionBtn.addEventListener("click", () => openSourceSession(sessionId));
      actionRow.appendChild(actionBtn);
      threadEl.appendChild(actionRow);
    }

    scrollToBottom();
  }

  function getSessionId() {
    let sid = (localStorage.getItem(SESSION_KEY) || "").trim();
    if (!sid) {
      sid = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || `${Date.now()}`;
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  }

  function createNewSession() {
    const sid = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || `${Date.now()}`;
    localStorage.setItem(SESSION_KEY, sid);
    return sid;
  }

  function setStatus(text, isError = false) {
    if(!apiStatusEl) return;
    apiStatusEl.textContent = text;
    apiStatusEl.classList.toggle("is-error", isError);
  }

  // ==========================================
  // Chat UI Functions
  // ==========================================

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

  // ==========================================
  // API & Fetch System
  // ==========================================

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); } 
    finally { clearTimeout(timer); }
  }

  async function loadTopSearches() {
    const askApi = (localStorage.getItem(STORAGE_KEY) || API_URL_CANDIDATES[0] || "").trim();
    const roots = buildBaseApiCandidates(askApi);

    for (const root of roots) {
      try {
        const url = `${root.replace(/\/$/, "")}/top-searches?limit=5`;
        const res = await fetchWithTimeout(url, { method: "GET" }, REQUEST_TIMEOUT_MS);
        if (!res.ok) continue;
        const payload = await res.json();
        topSearchItems = Array.isArray(payload.items) ? payload.items : [];
        renderTopSearches(topSearchItems);
        return;
      } catch (_) {}
    }

    topSearchItems = [];
    renderTopSearches([]);
  }

  async function loadTopSearchSources(keyword) {
    const q = (keyword || "").trim();
    if (!q) {
      activeTopKeyword = "";
      renderTopSearches(topSearchItems);
      return;
    }

    if (isIndexPage) {
      sessionStorage.setItem(TOP_SEARCH_KEYWORD_KEY, q);
      window.location.href = "chat.html";
      return;
    }

    activeTopKeyword = q;
    setTopSearchViewMode(true);
    renderTopSearches(topSearchItems);

    const askApi = (localStorage.getItem(STORAGE_KEY) || API_URL_CANDIDATES[0] || "").trim();
    const roots = buildBaseApiCandidates(askApi);

    for (const root of roots) {
      try {
        const url = `${root.replace(/\/$/, "")}/top-searches/sources?keyword=${encodeURIComponent(q)}&limit=20`;
        const res = await fetchWithTimeout(url, { method: "GET" }, REQUEST_TIMEOUT_MS);
        if (!res.ok) continue;
        const payload = await res.json();
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        renderKeywordSessionsInThread(q, sessions);
        return;
      } catch (_) {}
    }

    renderKeywordSessionsInThread(q, []);
  }

  async function askBackend(question) {
    let data = null;
    let lastStatus = null;
    for (const url of API_URL_CANDIDATES) {
      try {
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, session_id: activeSessionId }),
        }, REQUEST_TIMEOUT_MS);
        lastStatus = res.status;
        if (!res.ok) continue;
        data = await res.json();
        localStorage.setItem(STORAGE_KEY, url);
        setStatus("เชื่อมต่อแล้ว");
        break;
      } catch (_) {}
    }
    if (!data) {
      setStatus("เชื่อมต่อไม่ได้", true);
      throw new Error(`request_failed:${lastStatus || "network"}`);
    }
    return data;
  }

  async function loadHistory(sessionId) {
    const sid = sessionId || activeSessionId;
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
        if (!turns.length) { resetChatUi(); return; }
        for (const turn of turns) {
          appendMessage("user", turn.question || "");
          appendMessage("assistant", turn.answer || "");
        }
        return;
      } catch (_) {}
    }
    resetChatUi();
  }

  function resetChatUi() {
    threadEl.innerHTML = "";
    appendMessage("assistant", "สวัสดีครับ ผมเป็นช่างที่ปรึกษาสำหรับช่างหน้างาน\nส่งอาการและข้อมูลที่ตรวจมาแล้วได้เลย เดี๋ยวผมช่วยวางแผนเช็กก่อนซ่อมให้เป็นขั้นตอน");
  }

  function renderQuickPrompts() {
    quickPromptsEl.innerHTML = "";
    for (const prompt of quickPrompts) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "prompt-chip";
      btn.textContent = prompt;
      btn.addEventListener("click", () => {
        if (isIndexPage) {
          sessionStorage.setItem(PENDING_MSG_KEY, prompt);
          window.location.href = "chat.html";
        } else {
          inputEl.value = prompt;
          autoResizeInput();
          formEl.requestSubmit();
        }
      });
      quickPromptsEl.appendChild(btn);
    }
  }

  async function switchToSession(sessionId) {
    setTopSearchViewMode(false);
    activeSessionId = sessionId;
    localStorage.setItem(SESSION_KEY, sessionId);
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
      loadTopSearches();
    } catch (err) {
      typingNode.remove();
      appendMessage("assistant", "เชื่อมต่อ backend ไม่ได้ กรุณาตรวจสอบว่า backend กำลังรันอยู่");
    } finally {
      isSending = false;
      setComposerEnabled(true);
      if (window.innerWidth > 900) inputEl.focus();
    }
  }

  // ==========================================
  // Event Listeners
  // ==========================================

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = inputEl.value.trim();
    if (!q) return;

    if (isIndexPage) {
      // ถ้าอยู่หน้า index ให้ฝากข้อความแล้วย้ายหน้า
      sessionStorage.setItem(PENDING_MSG_KEY, q);
      window.location.href = "chat.html";
    } else {
      inputEl.value = "";
      autoResizeInput();
      submitQuestion(q);
    }
  });

  inputEl.addEventListener("input", autoResizeInput);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  function handleNewChat() {
    // สร้างรหัสแชทใหม่ไว้ใช้งาน แต่ยังไม่เพิ่มในประวัติจนกว่าจะมีข้อความจริง
    activeSessionId = createNewSession();
    
    // ล้างข้อความที่อาจจะค้างอยู่
    sessionStorage.removeItem(PENDING_MSG_KEY);
    sessionStorage.removeItem(TOP_SEARCH_KEYWORD_KEY);

    // บังคับให้กลับไปหน้า index.html เสมอ
    window.location.href = "index.html"; 
  }

  if (newChatBtnEl) newChatBtnEl.addEventListener("click", handleNewChat);
  if (sidebarNewChatBtn) sidebarNewChatBtn.addEventListener("click", handleNewChat);

  // ==========================================
  // Initialization
  // ==========================================
  
  chatList = getChatList();
  activeSessionId = getSessionId();
  renderChatList();
  renderQuickPrompts();
  loadTopSearches();

  // ลอจิกพิเศษ: ถ้าเปิดหน้า chat.html แล้วมีข้อความฝากไว้ ให้ส่งทันที
  if (!isIndexPage) {
    const pendingKeyword = (sessionStorage.getItem(TOP_SEARCH_KEYWORD_KEY) || "").trim();
    if (pendingKeyword) {
      sessionStorage.removeItem(TOP_SEARCH_KEYWORD_KEY);
      loadTopSearchSources(pendingKeyword);
    } else {
      setTopSearchViewMode(false);
      loadHistory(activeSessionId).then(() => {
          const pending = sessionStorage.getItem(PENDING_MSG_KEY);
          if (pending) {
              sessionStorage.removeItem(PENDING_MSG_KEY);
              submitQuestion(pending);
          }
      });
    }
  }

  autoResizeInput();
  if (window.innerWidth > 900) inputEl.focus();

})();
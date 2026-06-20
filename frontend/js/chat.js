// chat.js
// ===============================
// หน้าที่:
//  - สร้างห้องแชทใหม่
//  - ส่งข้อความ
//  - แสดงข้อความในหน้าจอ
// ===============================

let currentChat = null;

const quickPrompts = [
    "รถสตาร์ทไม่ติด ควรเช็คจุดไหนก่อน",
    "ไฟเครื่องโชว์ ขับต่อได้ไหม",
    "แอร์ไม่เย็น น่าจะเสียที่อะไร",
    "รถสั่นตอนออกตัว เกิดจากอะไร",
    "เบรกแล้วมีเสียงดัง ต้องเช็คอะไร",
];

// ===============================
// สร้างห้องใหม่
// ===============================
function createNewChat() {
    console.log("CREATE NEW CHAT");
    currentChat = {
        id: Date.now(),
        sessionId: crypto.randomUUID(),
        title: "",
        messages: []
    };
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;
    chatArea.innerHTML = '';

    const welcomeMessage = `สวัสดีครับ ผมเป็นช่างที่ปรึกษาสำหรับช่างหน้างาน
    ส่งอาการและข้อมูลที่ตรวจมาแล้วได้เลย เดี๋ยวผมช่วยวางแผนเช็กก่อนซ่อมให้เป็นขั้นตอน`;

    const welcomeBubble = document.createElement('div');
    welcomeBubble.classList.add('bot-message');

    welcomeBubble.innerHTML = welcomeMessage.replace(/\n/g, '<br>');

    chatArea.appendChild(welcomeBubble);

    currentChat.messages.push({
        role: 'bot',
        content: welcomeMessage
    });

    renderQuickPrompts();
}

// ===============================
// เพิ่ม Bubble
// ===============================
function appendMessage(role, content) {
    const chatArea =
        document.getElementById('chat-area');

    const bubble =
        document.createElement('div');

    bubble.classList.add(
        role === 'user'
            ? 'user-message'
            : 'bot-message'
    );

    if (role === 'bot') {
        bubble.innerHTML =
            content.replace(/\n/g, '<br>');
    } else {
        bubble.textContent =
            content;
    }

    chatArea.appendChild(
        bubble
    );

    chatArea.scrollTop =
        chatArea.scrollHeight;
}

//===============================
// ส่งข้อความไป Backend
// ===============================
async function sendMessage(message) {
    const result =
        await askAI(
            message,
            currentChat.sessionId
        );

    return result.answer;
}

// ===============================
// เริ่มระบบ Chat
// ===============================
function initChat() {
    createNewChat();

    const form = document.getElementById('composerForm');
    const input = document.getElementById('chatInput');
    const chatArea = document.getElementById('chat-area');

    // Enter = ส่งข้อความ
    // Shift + Enter = ขึ้นบรรทัดใหม่
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const message = input.value.trim(); /*เอาข้อความจาก Textarea ของ input(chatInput), trim() ใช้ในการลบช่องว่างที่อยู่หน้าและหลังข้อความ*/
        if (!message) return; /*ถ้าไม่มีข้อความ (เช่น กดส่งโดยไม่พิมพ์อะไร) จะไม่ทำอะไรเลย*/

        // ------------------
        // เก็บข้อความ User
        // ------------------
        currentChat.messages.push({
            role: 'user',
            content: message
        });

        appendMessage(
            'user',
            message
        );

        // ------------------
        // สร้างหัวข้อ History
        // ------------------
        if (currentChat.title === '') {
            currentChat.title =
                message.length > 20
                ? message.substring(0,20)+'...'
                : message;

                addHistory(currentChat);

                setActiveHistory(
                    currentChat.id
            );
        }
        saveChats();

        // ------------------
        // Loading
        // ------------------
        const loadingBubble = document.createElement('div');

        loadingBubble.classList.add('bot-message');

        loadingBubble.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;

        document
            .getElementById(
                'chat-area'
            )
            .appendChild(
                loadingBubble
            );

            try {

                const botReply =
                    await sendMessage(
                        message
                    );

                loadingBubble.remove();

                appendMessage(
                    'bot',
                    botReply
                );

                currentChat.messages.push({
                    role: 'bot',
                    content: botReply
                });

                saveChats();

            }
            catch(error){

                loadingBubble.remove();

                appendMessage(
                    'bot',
                    'เชื่อมต่อ Backend ไม่สำเร็จ'
                );

                console.error(error);
            }

            input.value = '';
        }
    );
}

// ===============================
// ปุ่ม New Chat
// ===============================
function setupNewChatButton() {

    console.log('SETUP NEW CHAT BUTTON');

    const newChatBtn =
        document.getElementById('new-chat-btn');

    if (!newChatBtn) return;

    newChatBtn.addEventListener('click', () => {

        console.log('CLICK NEW CHAT');

        setActiveSidebar('newchat');

        currentChat = null;

        loadPage('newchat');
    });
}


function renderQuickPrompts() {

    const container =
        document.getElementById(
            'quick-prompts'
        );

    if (!container) return;

    container.innerHTML = '';

    quickPrompts.forEach(prompt => {

        const button =
            document.createElement('button');

        button.classList.add(
            'prompt-card'
        );

        button.textContent =
            prompt;

        button.addEventListener(
            'click',
            () => {

                const input =
                    document.getElementById(
                        'chatInput'
                    );

                input.value = prompt;

                document
                    .getElementById(
                        'composerForm'
                    )
                    .requestSubmit();
            }
        );

        container.appendChild(
            button
        );
    });
}
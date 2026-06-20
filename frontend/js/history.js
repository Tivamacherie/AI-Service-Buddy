// history.js
// ===============================
// หน้าที่:
//  - เพิ่มประวัติ
//  - เปิดแชทเก่า
//  - แสดงรายการด้านซ้าย
// ===============================

let chatHistory = [];

function addHistory(chat) {

    chatHistory.push(chat);

    renderHistory();

    saveChats();
}

function renderHistory() {

    const historyList =
        document.getElementById(
            'history-list'
        );

    historyList.innerHTML = '';

    [...chatHistory]
        .reverse()
        .forEach(chat => {
            const item = document.createElement('div');

            item.classList.add('history-item');
            item.dataset.chatId = chat.id;
            item.textContent = chat.title;

            item.addEventListener('click', () => {
                openChat(chat.id);
                setActiveHistory(chat.id);
            });

            historyList.appendChild(item);
        });
}


function setActiveHistory(chatId) {

    document
        .querySelectorAll('.history-item')
        .forEach(item =>
            item.classList.remove('active')
        );

    document
        .querySelectorAll('.sidebar-item')
        .forEach(item =>
            item.classList.remove('active')
        );

    const target =
        document.querySelector(
            `[data-chat-id="${chatId}"]`
        );

    if (target) {
        target.classList.add('active');
    }
}

async function openChat(chatId) {
    console.log("OPEN CHAT", chatId);
    const navigationToken = await loadPage('newchat');

    const chat =
        chatHistory.find(
            c => c.id === chatId
        );

    if (!chat) return;

    if (navigationToken !== activeNavigationToken) return;

    currentChat = chat;

    setActiveHistory(chatId);

    const chatArea =
        document.getElementById('chat-area');

    chatArea.innerHTML = '';

    chat.messages.forEach(msg => {

        const bubble =
            document.createElement('div');

        bubble.classList.add(
            msg.role === 'user'
                ? 'user-message'
                : 'bot-message'
        );

        if(msg.role === 'bot'){
            bubble.innerHTML =
                msg.content.replace(/\n/g,'<br>');
        }else{
            bubble.textContent =
                msg.content;
        }

        chatArea.appendChild(bubble);
    });
}
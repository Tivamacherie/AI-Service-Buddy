// storage.js
// ===============================
// หน้าที่:
//  - Local Storage ทั้งหมด
// ===============================


function saveChats() {

    localStorage.setItem(
        "chatHistory",
        JSON.stringify(chatHistory)
    );
}

function loadChats() {

    const data =
        localStorage.getItem(
            "chatHistory"
        );

    if (!data) return;

    chatHistory = JSON.parse(data);

    renderHistory();
}
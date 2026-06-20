// session.js
// ===============================
// หน้าที่:
//  - จัดการเซสชันของผู้ใช้
// ===============================


function createSession() {
    return crypto.randomUUID();
}

function getSessionId() {

    let sessionId =
        localStorage.getItem("sessionId");

    if (!sessionId) {

        sessionId = createSession();

        localStorage.setItem(
            "sessionId",
            sessionId
        );
    }

    return sessionId;
}
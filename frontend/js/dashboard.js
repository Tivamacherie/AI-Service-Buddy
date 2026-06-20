// dashboard.js
// ===============================
// หน้าที่:
//  - จัดการหน้า Dashboard ทั้งหมด
// ===============================

async function loadDashboard() {

    const result =
        await getTopSearches();

    console.log(result);
}

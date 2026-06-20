// app.js
// ===============================
// หน้าที่:
//  - โหลดหน้า
//  - จัดการ Sidebar
//  - เริ่มต้นระบบ
// ===============================

let activeNavigationToken = 0;

// ฟังก์ชันนี้ใช้โหลดหน้า HTML ที่ต้องการ
async function loadPage(page) {
    const navigationToken = ++activeNavigationToken;
    const mainContent = document.getElementById('main-content');
    const response = await fetch(`pages/${page}.html`);
    const html = await response.text();

    if (navigationToken !== activeNavigationToken) return navigationToken;

    mainContent.innerHTML = html;

    setActiveSidebar(page);

    if (page === 'newchat') {
        initChat();
    }

    if (page === 'dashboard') {
        loadDashboard();
    }

    if (page === 'hotsearch') {
        loadHotSearch();
    }

    return navigationToken;
}

function setActiveSidebar(page){

    document
        .querySelectorAll('.sidebar-item')
        .forEach(item =>
            item.classList.remove('active')
        );

    document
        .querySelectorAll('.history-item')
        .forEach(item =>
            item.classList.remove('active')
        );

    const target =
        document.querySelector(
            `.sidebar-item[data-page="${page}"]`
        );

    if(target){
        target.classList.add('active');
    }
}

function setupSidebarNavigation() {
    const sidebarItems = document.querySelectorAll('.sidebar-item[data-page]');

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const page =
                item.dataset.page;

            if (!page) return;

            setActiveSidebar(page);

            loadPage(page);
        });
    });
}

// เป็นจุดเริ่มต้นของโปรแกรม
function bootApp() {
    setupSidebarNavigation();

    const activePage = document.querySelector('.sidebar-item.active[data-page]')?.dataset.page || 'newchat';
    loadPage(activePage);
}

bootApp();
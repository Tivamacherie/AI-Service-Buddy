// hotsearch.js
// ===============================
// หน้าที่:
//  - จัดการฟีเจอร์การค้นหาที่นิยม
// ===============================

async function loadHotSearch() {

    const container =
        document.getElementById(
            'hotsearch-list'
        );

    if (!container) return;

    try {

        const result =
            await getTopSearches();

        container.innerHTML = '';

        result.items.forEach(item => {

            const card =
                document.createElement('div');

            card.classList.add(
                'hotsearch-item'
            );

            card.innerHTML = `
                <span>${item.keyword}</span>
                <span>${item.count} ครั้ง</span>
            `;

            container.appendChild(card);
        });

    } catch (error) {

        console.error(error);

        container.innerHTML =
            '<p>ไม่สามารถโหลดข้อมูลได้</p>';
    }
}
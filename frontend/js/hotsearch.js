// hotsearch.js
// ===============================
// หน้าที่:
//  - จัดการฟีเจอร์การค้นหาที่นิยม
// ===============================

async function loadHotSearch() {

    const result =
        await getTopSearches();

    const container =
        document.getElementById(
            'hotsearch-list'
        );

    container.innerHTML = '';

    result.items.forEach(item => {

        const div =
            document.createElement('div');

        div.textContent =
            `${item.keyword} (${item.count})`;

        container.appendChild(div);
    });
}
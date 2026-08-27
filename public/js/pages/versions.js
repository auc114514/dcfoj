async function renderVersions(container) {
    const versions = await apiCall('/versions');

    let items = versions.map(v => `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;">
                <h3 style="color:#38bdf8;font-size:1.1rem;">${v.version}</h3>
                <span style="color:#64748b;font-size:0.7rem;">${new Date(v.created_at).toLocaleDateString()}</span>
            </div>
            <h4 style="margin:0.2rem 0;font-size:0.95rem;">${v.title}</h4>
            <p style="color:#94a3b8;font-size:0.85rem;">${v.content}</p>
        </div>
    `).join('') || '<div class="empty-state">暂无版本记录</div>';

    container.innerHTML = `
        <div class="page active">
            <h2 style="font-size:1.3rem;margin-bottom:0.8rem;">📜 版本日志</h2>
            ${items}
        </div>
    `;
}

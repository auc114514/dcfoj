async function renderHome() {
    const problems = await apiCall('/problems');
    const subs = await apiCall('/submissions');
    const ac = subs.filter(s => s.status === 'AC').length;
    return `
        <div class="page active">
            <div class="hero">
                <h1>⚡ Dan_Chao_Fan OJ</h1>
                <p>真判题 · 咕值 · 犇犇 · 团队 · 工单 · 陶片 · UID · LaTeX</p>
                <button class="btn btn-primary" onclick="navigate('problems')">🚀 开始做题</button>
            </div>
            <div class="notice"><div class="notice-title">📢 v1.2.0</div><p style="color:#94a3b8;">工单随机8位ID · 双击进入详情 · 优化性能</p></div>
            <div class="stats-grid">
                <div class="stat-card"><span class="stat-number">${problems.length}</span><div class="stat-label">题目</div></div>
                <div class="stat-card"><span class="stat-number">${subs.length}</span><div class="stat-label">提交</div></div>
                <div class="stat-card"><span class="stat-number">${ac}</span><div class="stat-label">通过</div></div>
            </div>
        </div>
    `;
}

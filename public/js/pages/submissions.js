
async function renderSubmissions(container) {
    const subs = await apiCall('/submissions');
    const users = await apiCall('/users').catch(() => []);
    const userMap = {};
    users.forEach(u => userMap[u.username] = u);

    let rows = subs.slice(0, 100).map(s => {
        const user = userMap[s.username] || { username: s.username, role: 'user', gu: { total: 0 } };
        const nameHtml = getUsernameHtml(user);
        return `<tr><td style="font-size:0.65rem;font-family:monospace;">${s.id||'sub_'}</td><td>${nameHtml}</td><td><span class="id-display">${s.problem_code}</span></td><td><span style="font-weight:700;color:${s.status==='AC'?'#4ade80':s.status==='CE'?'#f59e0b':'#f87171'}">${s.status}</span></td><td>${s.lang}</td><td>${s.time||0}ms</td><td style="font-size:0.7rem;color:#64748b;">${s.timestamp?new Date(s.timestamp).toLocaleString():'-'}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty-state">暂无提交</td></tr>';

    container.innerHTML = `<div class="page active"><h2 style="font-size:1.3rem;margin-bottom:0.8rem;">📋 提交记录</h2><div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>用户</th><th>题目</th><th>状态</th><th>语言</th><th>耗时</th><th>时间</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    renderMath();
}

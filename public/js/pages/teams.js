async function renderTeams(container) {
    const teams = await apiCall('/teams');
    let cards = teams.map(t => `
        <div class="team-card" onclick="navigate('team','${t.id}')">
            <h3>${t.name}</h3>
            <p>${t.description || '无简介'}</p>
            <span class="meta">👤 ${t.member_count||0} 人 · ${new Date(t.created_at).toLocaleDateString()}</span>
        </div>
    `).join('') || '<div class="empty-state">暂无团队</div>';

    container.innerHTML = `
        <div class="page active">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap;gap:0.5rem;">
                <h2 style="font-size:1.3rem;">👥 团队</h2>
                ${currentUser ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('team-modal').classList.add('active')">➕ 创建</button>` : ''}
            </div>
            <div class="team-grid">${cards}</div>
        </div>
    `;
}

async function createTeam() {
    const name = document.getElementById('team-name').value.trim();
    const description = document.getElementById('team-desc').value.trim();
    if (!name) { showToast('请输入团队名称', 'error'); return; }
    const res = await apiCall('/teams', { method: 'POST', body: JSON.stringify({ name, description }) });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('团队创建成功！', 'success');
    document.getElementById('team-modal').classList.remove('active');
    navigate('teams');
}

async function renderTeamDetail(container, id) {
    const team = await apiCall('/teams/' + id);
    if (team.error) { container.innerHTML = `<div class="page active"><div class="empty-state">团队不存在</div></div>`; return; }

    container.innerHTML = `
        <div class="page active">
            <button class="btn btn-secondary btn-sm" onclick="navigate('teams')">← 返回</button>
            <div class="card" style="margin-top:0.5rem;">
                <h2 style="color:#38bdf8;">${team.name}</h2>
                <p style="color:#94a3b8;">${team.description || '无简介'}</p>
                <p style="color:#64748b;font-size:0.8rem;">创建者: ${team.owner_id}</p>
                ${currentUser && !team.members.find(m=>m.id===currentUser.id) ? `<button class="btn btn-primary btn-sm" onclick="joinTeam(${team.id})">加入团队</button>` : ''}
            </div>
            <div class="card">
                <div class="card-title">👤 成员 (${team.members.length})</div>
                ${team.members.map(m => `<span class="tag" style="cursor:pointer;font-size:0.85rem;padding:0.3rem 0.8rem;" onclick="navigate('user','${m.username}')">${m.username} ${m.role==='owner'?'👑':''}</span>`).join(' ')}
            </div>
        </div>
    `;
}

async function joinTeam(id) {
    const res = await apiCall('/teams/' + id + '/join', { method: 'POST' });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('加入成功！', 'success');
    navigate('team', id);
}

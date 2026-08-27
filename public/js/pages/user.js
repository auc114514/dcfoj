async function renderUserProfile(username) {
    if (!username) { navigate('home'); return; }
    const app = document.getElementById('app');
    const user = await apiCall('/users/' + username);
    if (user.error) {
        const byUid = await apiCall('/users/uid/' + username);
        if (byUid.error) { app.innerHTML = `<div class="page active"><div class="empty-state">用户不存在</div></div>`; return; }
        renderUserProfileData(app, byUid); return;
    }
    renderUserProfileData(app, user);
}

async function renderUserProfileData(app, user) {
    const teams = await apiCall('/users/' + user.username + '/teams');
    const colorMap = { gray: 'gu-gray', blue: 'gu-blue', green: 'gu-green', orange: 'gu-orange', red: 'gu-red', purple: 'gu-purple' };
    const gu = user.gu || { total: 100, color: 'gray', practice: 0, credit: 100 };
    const userColor = getUserColorClass(user);
    const roleMap = { admin: '管理员', cheater: '作弊者', user: '用户', banned: '已封禁' };
    const roleClassMap = { admin: 'admin', cheater: 'cheater', user: 'user', banned: 'user' };
    const isAdmin = currentUser?.role === 'admin';

    app.innerHTML = `<div class="page active"><div class="card"><div class="profile-header"><div class="profile-avatar">${user.username.charAt(0).toUpperCase()}</div><div class="profile-info"><h2><span class="${userColor}">${user.username}</span><span class="profile-role ${roleClassMap[user.role]||'user'}">${roleMap[user.role]||'用户'}</span><span style="font-size:0.8rem;color:#64748b;font-family:monospace;">UID: ${user.uid}</span>${isAdmin?`<button class="btn btn-secondary btn-sm" onclick="showRoleModal('${user.id}','${user.username}')">🏷️ 改角色</button><button class="btn btn-danger btn-sm" onclick="showRevokeModal('${user.id}','${user.username}')">🔽 撤销</button>`:''}</h2><div class="profile-meta">${user.role==='admin'?'🛡️ 管理员 · ':''}${user.role==='cheater'?'⚠️ 作弊者 · ':''}加入于 ${new Date(user.created_at).toLocaleDateString()}</div></div></div></div><div class="card"><div class="card-title">📊 咕值</div><div class="gu-display"><span class="gu-item"><span class="gu-label">练习</span> <span class="gu-value">${gu.practice||0}</span></span><span class="gu-item"><span class="gu-label">信用</span> <span class="gu-value">${gu.credit||100}</span></span><span class="gu-item"><span class="gu-label">贡献</span> <span class="gu-value">${gu.contribution||0}</span></span><span class="gu-item"><span class="gu-label">比赛</span> <span class="gu-value">${gu.competition||0}</span></span><span class="gu-item"><span class="gu-label">总咕</span> <span class="gu-value" style="color:#38bdf8;">${Math.floor(gu.total)}</span></span></div></div><div class="card"><div class="card-title">📝 统计</div><div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.9rem;"><span>提交: <strong>${user.totalSubmissions||0}</strong></span><span>通过: <strong style="color:#4ade80;">${user.acSubmissions||0}</strong></span><span>已解决: <strong>${(user.solved||[]).length}</strong></span></div></div><div class="card"><div class="card-title">👥 团队</div>${teams.length?teams.map(t=>`<span class="tag" style="cursor:pointer;font-size:0.85rem;padding:0.3rem 0.8rem;" onclick="navigate('team','${t.id}')">${t.name}</span>`).join(' '):'<span style="color:#64748b;">未加入团队</span>'}</div></div>`;
    renderMath();
}

function showRoleModal(userId, username) {
    if (!currentUser || currentUser.role !== 'admin') { showToast('需要管理员权限', 'error'); return; }
    roleTargetUserId = userId;
    document.getElementById('role-user-name').textContent = '用户: ' + username;
    document.getElementById('role-select').value = 'user';
    document.getElementById('role-reason').value = '';
    document.getElementById('role-modal').classList.add('active');
}

async function saveUserRole() {
    const role = document.getElementById('role-select').value;
    const reason = document.getElementById('role-reason').value.trim() || '修改用户角色';
    const res = await apiCall('/admin/users/' + roleTargetUserId + '/role', { method: 'PUT', body: JSON.stringify({ role, reason }) });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('✅ 角色已更新', 'success');
    document.getElementById('role-modal').classList.remove('active');
    const route = getRoute();
    if (route.page === 'user') renderUserProfile(route.param);
    else navigate('admin');
}

function showRevokeModal(userId, username) {
    if (!currentUser || currentUser.role !== 'admin') { showToast('需要管理员权限', 'error'); return; }
    revokeTargetUserId = userId;
    document.getElementById('revoke-user-name').textContent = '用户: ' + username;
    document.getElementById('revoke-reason').value = '';
    document.getElementById('revoke-modal').classList.add('active');
}

async function confirmRevoke() {
    const reason = document.getElementById('revoke-reason').value.trim();
    if (!reason) { showToast('请填写撤销原因', 'error'); return; }
    const res = await apiCall('/admin/users/' + revokeTargetUserId + '/revoke', { method: 'PUT', body: JSON.stringify({ reason }) });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('✅ 权限已撤销', 'success');
    document.getElementById('revoke-modal').classList.remove('active');
    const route = getRoute();
    if (route.page === 'user') renderUserProfile(route.param);
    else navigate('admin');
}

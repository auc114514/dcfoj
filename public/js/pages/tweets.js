
async function renderTweets(container) {
    const tweets = await apiCall('/tweets');
    const users = await apiCall('/users').catch(() => []);
    const userMap = {};
    users.forEach(u => userMap[u.username] = u);

    let items = tweets.map(t => {
        const user = userMap[t.username] || { username: t.username, role: 'user', gu: { total: 0 } };
        const nameHtml = getUsernameHtml(user);
        return `<div class="tweet-item"><div class="tweet-header"><span class="tweet-user">${nameHtml}</span><span class="tweet-time">${new Date(t.created_at).toLocaleString()}</span></div>${t.content?`<div class="tweet-content">${t.content}</div>`:''}${t.code?`<div class="tweet-code">${t.code}</div>`:''}<div class="tweet-actions"><button onclick="showReply(${t.id})">💬 回复</button><button onclick="showReport(${t.id})">🚨 举报</button></div></div>`;
    }).join('') || '<div class="empty-state">还没有犇犇</div>';

    container.innerHTML = `<div class="page active"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap;gap:0.5rem;"><h2 style="font-size:1.3rem;">🐮 犇犇</h2>${currentUser?`<button class="btn btn-primary btn-sm" onclick="document.getElementById('tweet-modal').classList.add('active')">✏️ 发犇犇</button>`:'<span style="color:#64748b;">登录后发布</span>'}</div>${items}</div>`;
    renderMath();
}

async function postTweet() {
    const content = document.getElementById('tweet-content').value.trim();
    const code = document.getElementById('tweet-code').value.trim();
    const lang = document.getElementById('tweet-lang').value;
    if (!content && !code) { showToast('内容不能为空', 'error'); return; }
    const res = await apiCall('/tweets', { method: 'POST', body: JSON.stringify({ content, code, lang }) });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('发布成功！', 'success');
    document.getElementById('tweet-modal').classList.remove('active');
    document.getElementById('tweet-content').value = '';
    document.getElementById('tweet-code').value = '';
    navigate('tweets');
}

function showReply(id) { replyTargetId = id; document.getElementById('reply-content').value = ''; document.getElementById('reply-modal').classList.add('active'); }
async function submitReply() {
    const content = document.getElementById('reply-content').value.trim();
    if (!content) { showToast('请输入回复内容', 'error'); return; }
    const res = await apiCall('/tweets/' + replyTargetId + '/reply', { method: 'POST', body: JSON.stringify({ content }) });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('回复成功！', 'success');
    document.getElementById('reply-modal').classList.remove('active');
    navigate('tweets');
}

function showReport(id) { reportTargetId = id; document.getElementById('report-reason').value = ''; document.getElementById('report-modal').classList.add('active'); }
async function submitReport() {
    const reason = document.getElementById('report-reason').value.trim();
    if (!reason) { showToast('请填写举报原因', 'error'); return; }
    const res = await apiCall('/tweets/' + reportTargetId + '/report', { method: 'POST', body: JSON.stringify({ reason }) });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('举报成功', 'success');
    document.getElementById('report-modal').classList.remove('active');
}

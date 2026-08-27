// ================================================================
//  工单列表
// ================================================================
async function renderTickets(container) {
    const tickets = await apiCall('/tickets');

    let items = tickets.map(t => `
        <div class="ticket-item" ondblclick="navigate('ticket','${t.id}')" style="cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;">
                <strong>#${t.id} ${t.title}</strong>
                <span class="ticket-status ${t.status==='open'?'ticket-status-open':'ticket-status-closed'}">${t.status==='open'?'待处理':'已关闭'}</span>
            </div>
            <p style="color:#94a3b8;font-size:0.85rem;margin:0.2rem 0;">${t.content}</p>
            ${t.admin_reply ? `<div style="background:#0f172a;padding:0.4rem;border-radius:6px;margin-top:0.2rem;border-left:3px solid #38bdf8;font-size:0.85rem;"><strong style="color:#38bdf8;">管理员:</strong> ${t.admin_reply}</div>` : ''}
            <div style="font-size:0.65rem;color:#64748b;margin-top:0.2rem;">${new Date(t.created_at).toLocaleString()}</div>
            ${currentUser && currentUser.role === 'admin' && t.status === 'open' ? `<button class="btn btn-primary btn-sm" style="margin-top:0.3rem;" onclick="event.stopPropagation();navigate('ticket','${t.id}/edit')">回复</button>` : ''}
        </div>
    `).join('') || '<div class="empty-state">暂无工单</div>';

    container.innerHTML = `
        <div class="page active">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap;gap:0.5rem;">
                <h2 style="font-size:1.3rem;">📩 工单</h2>
                ${currentUser ? `<button class="btn btn-primary btn-sm" onclick="navigate('ticket','new')">✏️ 新建</button>` : ''}
            </div>
            <div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">💡 双击工单进入详情</div>
            ${items}
        </div>
    `;
}

// ================================================================
//  新建工单
// ================================================================
async function renderTicketNew() {
    if (!currentUser) { showToast('请先登录', 'warning'); navigate('home'); return; }
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="page active">
            <button class="btn btn-secondary btn-sm" onclick="navigate('tickets')">← 返回工单列表</button>
            <div class="card" style="margin-top:0.5rem;">
                <h2 style="font-size:1.3rem;">📩 新建工单</h2>
                <div style="color:#64748b;font-size:0.8rem;margin-bottom:0.8rem;">工单ID将自动生成8位随机字母数字</div>
                <div class="edit-form">
                    <div class="form-group"><label>标题 *</label><input type="text" id="ticket-new-title" placeholder="工单标题" /></div>
                    <div class="form-group"><label>内容 *</label><textarea id="ticket-new-content" rows="5" placeholder="详细描述你的问题..."></textarea></div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="navigate('tickets')">取消</button>
                        <button class="btn btn-primary" onclick="submitNewTicket()">✅ 提交</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function submitNewTicket() {
    const title = document.getElementById('ticket-new-title').value.trim();
    const content = document.getElementById('ticket-new-content').value.trim();
    if (!title || !content) { showToast('请填写完整信息', 'error'); return; }
    // 生成8位随机ID
    const ticketId = generateTicketId();
    const res = await apiCall('/tickets', { 
        method: 'POST', 
        body: JSON.stringify({ id: ticketId, title, content }) 
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('工单提交成功！ID: ' + ticketId, 'success');
    navigate('ticket', ticketId);
}

// ================================================================
//  工单详情
// ================================================================
async function renderTicketDetail(id) {
    const tickets = await apiCall('/tickets');
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) { navigate('tickets'); return; }
    const app = document.getElementById('app');
    const isAdmin = currentUser?.role === 'admin';

    app.innerHTML = `
        <div class="page active">
            <button class="btn btn-secondary btn-sm" onclick="navigate('tickets')">← 返回工单列表</button>
            <div class="card" style="margin-top:0.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                    <h2 style="font-size:1.3rem;">📩 #${ticket.id} ${ticket.title}</h2>
                    <span class="ticket-status ${ticket.status==='open'?'ticket-status-open':'ticket-status-closed'}">${ticket.status==='open'?'待处理':'已关闭'}</span>
                </div>
                <p style="color:#94a3b8;margin:0.5rem 0;white-space:pre-wrap;">${ticket.content}</p>
                <div style="font-size:0.7rem;color:#64748b;">提交于 ${new Date(ticket.created_at).toLocaleString()}</div>
                ${ticket.admin_reply ? `<div style="background:#0f172a;padding:0.5rem;border-radius:6px;margin-top:0.5rem;border-left:3px solid #38bdf8;"><strong style="color:#38bdf8;">管理员回复：</strong>${ticket.admin_reply}</div>` : ''}
                ${isAdmin && ticket.status === 'open' ? `<button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="navigate('ticket','${id}/edit')">✏️ 回复</button>` : ''}
            </div>
        </div>
    `;
    renderMath();
}

// ================================================================
//  管理员回复工单
// ================================================================
async function renderTicketEdit(id) {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('需要管理员权限', 'error');
        navigate('ticket', id);
        return;
    }
    const tickets = await apiCall('/tickets');
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) { navigate('tickets'); return; }
    const app = document.getElementById('app');

    app.innerHTML = `
        <div class="page active">
            <button class="btn btn-secondary btn-sm" onclick="navigate('ticket','${id}')">← 返回工单</button>
            <div class="card" style="margin-top:0.5rem;">
                <h2 style="font-size:1.3rem;">✏️ 回复工单 #${id}</h2>
                <div style="background:#0f172a;padding:0.5rem;border-radius:6px;margin-bottom:0.8rem;">
                    <strong>${ticket.title}</strong>
                    <p style="color:#94a3b8;font-size:0.9rem;">${ticket.content}</p>
                </div>
                <div class="edit-form">
                    <div class="form-group"><label>回复内容 *</label><textarea id="ticket-reply-content" rows="4" placeholder="输入回复内容..."></textarea></div>
                    <div class="form-group"><label>状态</label>
                        <select id="ticket-reply-status">
                            <option value="open">保持开启</option>
                            <option value="closed">关闭工单</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="navigate('ticket','${id}')">取消</button>
                        <button class="btn btn-primary" onclick="submitTicketReply('${id}')">✅ 提交</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function submitTicketReply(id) {
    const reply = document.getElementById('ticket-reply-content').value.trim();
    const status = document.getElementById('ticket-reply-status').value;
    if (!reply) { showToast('请填写回复内容', 'error'); return; }
    const res = await apiCall('/tickets/' + id, { 
        method: 'PUT', 
        body: JSON.stringify({ admin_reply: reply, status }) 
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('回复成功！', 'success');
    navigate('ticket', id);
}

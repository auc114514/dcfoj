async function renderTickets() {
    const tickets = await apiCall('/tickets');
    if (!tickets.length) {
        return `
            <div class="page active">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap;gap:0.5rem;">
                    <h2 style="font-size:1.3rem;">📩 工单</h2>
                    ${currentUser ? `<button class="btn btn-primary btn-sm" onclick="navigate('ticket','new')">✏️ 新建</button>` : ''}
                </div>
                <div style="color:#64748b;font-size:0.8rem;margin-bottom:0.5rem;">💡 双击工单进入详情</div>
                <div class="empty-state">暂无工单</div>
            </div>
        `;
    }
    
    let items = tickets.map(t => `
        <div class="ticket-item" ondblclick="navigate('ticket','${t.id}')" style="cursor:pointer;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;">
                <strong>#${t.id} ${t.title}</strong>
                <span class="ticket-status ${t.status==='open'?'ticket-status-open':'ticket-status-closed'}">${t.status==='open'?'待处理':'已关闭'}</span>
            </div>
            <p style="color:#94a3b8;font-size:0.85rem;margin:0.2rem 0;">${t.content && t.content.length > 100 ? t.content.slice(0,100)+'...' : t.content}</p>
            ${t.admin_reply ? `<div style="background:#0f172a;padding:0.4rem;border-radius:6px;margin-top:0.2rem;border-left:3px solid #38bdf8;font-size:0.85rem;"><strong style="color:#38bdf8;">管理员:</strong> ${t.admin_reply.slice(0,80)}${t.admin_reply.length>80?'...':''}</div>` : ''}
            <div style="font-size:0.65rem;color:#64748b;margin-top:0.2rem;">${new Date(t.created_at).toLocaleString()}</div>
            ${currentUser && currentUser.role === 'admin' && t.status === 'open' ? `<button class="btn btn-primary btn-sm" style="margin-top:0.3rem;" onclick="event.stopPropagation();navigate('ticket','${t.id}/edit')">回复</button>` : ''}
        </div>
    `).join('');

    return `
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

async function renderTicketDetail(id) {
    const tickets = await apiCall('/tickets');
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) { navigate('tickets'); return; }
    const isAdmin = currentUser?.role === 'admin';

    return `
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
}

// 缓存页面内容，减少重复渲染
const pageCache = {};

function navigate(page, param) {
    currentPage = page;
    
    // 题目路由
    if (page === 'problem' && param === 'new') {
        location.hash = 'problem/new';
        renderProblemNew();
        return;
    }
    if (page === 'problem' && param && param.endsWith('/edit')) {
        const code = param.replace('/edit', '');
        location.hash = 'problem/' + param;
        renderProblemEdit(code);
        return;
    }
    if (page === 'problem' && param) {
        location.hash = 'problem/' + param;
        renderProblemDetail(param);
        return;
    }
    
    // 工单路由
    if (page === 'ticket' && param === 'new') {
        location.hash = 'ticket/new';
        renderTicketNew();
        return;
    }
    if (page === 'ticket' && param && param.endsWith('/edit')) {
        const id = param.replace('/edit', '');
        location.hash = 'ticket/' + param;
        renderTicketEdit(id);
        return;
    }
    if (page === 'ticket' && param) {
        location.hash = 'ticket/' + param;
        renderTicketDetail(param);
        return;
    }
    
    // 其他路由
    if (page === 'logs') {
        location.hash = 'logs';
        renderLogs();
        return;
    }
    if (page === 'user' && param) {
        location.hash = 'user/' + param;
        renderUserProfile(param);
        return;
    }
    if (page === 'admin') {
        location.hash = 'admin';
        renderAdmin(document.getElementById('app'));
        return;
    }
    
    if (param) location.hash = page + '/' + param;
    else location.hash = page;
    renderPage(page, param);
    updateSidebarActive(page);
}

function getRoute() {
    const hash = location.hash.slice(1) || 'home';
    const parts = hash.split('/');
    return { page: parts[0], param: parts[1] || null };
}

function updateSidebarActive(page) {
    document.querySelectorAll('.sidebar .nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
}

async function renderPage(page, param) {
    const app = document.getElementById('app');
    // 简单缓存
    const cacheKey = page + (param || '');
    if (pageCache[cacheKey] && page !== 'problem' && page !== 'ticket') {
        app.innerHTML = pageCache[cacheKey];
        return;
    }
    
    let html = '';
    switch (page) {
        case 'home': html = await renderHome(); break;
        case 'problems': html = await renderProblems(); break;
        case 'submissions': html = await renderSubmissions(); break;
        case 'tweets': html = await renderTweets(); break;
        case 'user': html = await renderUserProfile(param); break;
        case 'teams': html = await renderTeams(); break;
        case 'team': html = await renderTeamDetail(param); break;
        case 'tickets': html = await renderTickets(); break;
        case 'versions': html = await renderVersions(); break;
        case 'admin': html = await renderAdmin(); break;
        default: html = await renderHome();
    }
    app.innerHTML = html;
    pageCache[cacheKey] = html;
    renderMath();
}

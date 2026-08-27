function navigate(page, param) {
    currentPage = page;
    if (page === 'problem' && param === 'new') { location.hash = 'problem/new'; renderProblemNew(); return; }
    if (page === 'problem' && param && param.endsWith('/edit')) { const code = param.replace('/edit', ''); location.hash = 'problem/' + param; renderProblemEdit(code); return; }
    if (page === 'problem' && param) { location.hash = 'problem/' + param; renderProblemDetail(param); return; }
    if (page === 'ticket' && param === 'new') { location.hash = 'ticket/new'; renderTicketNew(); return; }
    if (page === 'ticket' && param && param.endsWith('/edit')) { const id = param.replace('/edit', ''); location.hash = 'ticket/' + param; renderTicketEdit(id); return; }
    if (page === 'ticket' && param) { location.hash = 'ticket/' + param; renderTicketDetail(param); return; }
    if (page === 'logs') { location.hash = 'logs'; renderLogs(); return; }
    if (page === 'user' && param) { location.hash = 'user/' + param; renderUserProfile(param); return; }
    if (page === 'admin') { location.hash = 'admin'; renderAdmin(document.getElementById('app')); return; }
    if (param) location.hash = page + '/' + param; else location.hash = page;
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
    switch (page) {
        case 'home': await renderHome(app); break;
        case 'problems': await renderProblems(app); break;
        case 'submissions': await renderSubmissions(app); break;
        case 'tweets': await renderTweets(app); break;
        case 'user': await renderUserProfile(param); break;
        case 'teams': await renderTeams(app); break;
        case 'team': await renderTeamDetail(app, param); break;
        case 'tickets': await renderTickets(app); break;
        case 'versions': await renderVersions(app); break;
        case 'admin': await renderAdmin(app); break;
        default: await renderHome(app);
    }
}


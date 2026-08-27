window.addEventListener('hashchange', () => {
    const route = getRoute();
    
    if (route.page === 'problem' && route.param) {
        if (route.param === 'new') { renderProblemNew(); return; }
        if (route.param.endsWith('/edit')) { renderProblemEdit(route.param.replace('/edit', '')); return; }
        renderProblemDetail(route.param);
        return;
    }
    
    if (route.page === 'ticket' && route.param) {
        if (route.param === 'new') { renderTicketNew(); return; }
        if (route.param.endsWith('/edit')) { renderTicketEdit(route.param.replace('/edit', '')); return; }
        renderTicketDetail(route.param);
        return;
    }
    
    if (route.page === 'logs') { renderLogs(); return; }
    if (route.page === 'user' && route.param) { renderUserProfile(route.param); return; }
    if (route.page === 'admin') { renderAdmin(document.getElementById('app')); return; }
    
    renderPage(route.page, route.param);
    updateSidebarActive(route.page);
});

window.addEventListener('load', () => {
    updateUI();
    const route = getRoute();
    
    if (route.page === 'problem' && route.param) {
        if (route.param === 'new') { renderProblemNew(); return; }
        if (route.param.endsWith('/edit')) { renderProblemEdit(route.param.replace('/edit', '')); return; }
        renderProblemDetail(route.param);
        return;
    }
    
    if (route.page === 'ticket' && route.param) {
        if (route.param === 'new') { renderTicketNew(); return; }
        if (route.param.endsWith('/edit')) { renderTicketEdit(route.param.replace('/edit', '')); return; }
        renderTicketDetail(route.param);
        return;
    }
    
    if (route.page === 'logs') { renderLogs(); return; }
    if (route.page === 'user' && route.param) { renderUserProfile(route.param); return; }
    if (route.page === 'admin') { renderAdmin(document.getElementById('app')); return; }
    
    navigate(route.page, route.param);
});

// 暴露全局
window.navigate = navigate;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.switchAuthMode = switchAuthMode;
window.handleAuth = handleAuth;
window.logout = logout;
window.closeModal = closeModal;
window.toggleSidebar = toggleSidebar;
window.getUsernameHtml = getUsernameHtml;
window.getUserColorClass = getUserColorClass;
window.apiCall = apiCall;
window.showToast = showToast;
window.renderMath = renderMath;
window.generateTicketId = generateTicketId;

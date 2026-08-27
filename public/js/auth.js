
function showLogin() {
    authMode = 'login';
    document.getElementById('auth-title').textContent = '登录';
    document.getElementById('auth-submit-btn').textContent = '登录';
    document.getElementById('auth-switch-text').innerHTML = '还没有账号？<a onclick="switchAuthMode()" style="color:#38bdf8;cursor:pointer;">注册</a>';
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-captcha-group').style.display = 'none';
    document.getElementById('login-modal').classList.add('active');
    generateCaptcha();
}

function showRegister() {
    authMode = 'register';
    document.getElementById('auth-title').textContent = '注册';
    document.getElementById('auth-submit-btn').textContent = '注册';
    document.getElementById('auth-switch-text').innerHTML = '已有账号？<a onclick="switchAuthMode()" style="color:#38bdf8;cursor:pointer;">去登录</a>';
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-captcha-group').style.display = 'none';
    document.getElementById('login-modal').classList.add('active');
    generateCaptcha();
}

function switchAuthMode() { if (authMode === 'login') showRegister(); else showLogin(); }

function generateCaptcha() {
    const a = Math.floor(Math.random() * 20) + 1, b = Math.floor(Math.random() * 20) + 1;
    document.getElementById('auth-captcha-text').textContent = a + ' + ' + b + ' = ?';
    document.getElementById('auth-captcha-text').dataset.answer = String(a + b);
}

async function handleAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    if (!username || !password) { showToast('请填写完整信息', 'error'); return; }
    const captchaGroup = document.getElementById('auth-captcha-group');
    if (captchaGroup.style.display !== 'none') {
        const input = document.getElementById('auth-captcha-input').value.trim();
        const answer = document.getElementById('auth-captcha-text').dataset.answer;
        if (input !== answer) { showToast('验证码错误', 'error'); generateCaptcha(); return; }
    }
    const res = await apiCall('/auth/' + authMode, { method: 'POST', body: JSON.stringify({ username, password }) });
    if (res.error) { showToast(res.error, 'error'); if (authMode === 'login') { document.getElementById('auth-captcha-group').style.display = 'block'; generateCaptcha(); } return; }
    if (res.token) {
        localStorage.setItem('dcf_token', res.token);
        localStorage.setItem('dcf_user', JSON.stringify(res.user));
        currentUser = res.user;
        document.getElementById('login-modal').classList.remove('active');
        updateUI();
        showToast(authMode === 'login' ? '登录成功！' : '注册成功！', 'success');
        navigate('home');
    }
}

function logout() {
    localStorage.removeItem('dcf_token');
    localStorage.removeItem('dcf_user');
    currentUser = null;
    updateUI();
    showToast('已退出', 'warning');
    navigate('home');
}

function updateUI() {
    const token = localStorage.getItem('dcf_token');
    const userStr = localStorage.getItem('dcf_user');
    if (token && userStr) {
        try {
            currentUser = JSON.parse(userStr);
            document.getElementById('user-status').innerHTML = '👤 ' + currentUser.username;
            document.getElementById('auth-btns').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'inline-block';
            const gu = currentUser.gu || { total: 0, color: 'gray' };
            const colorMap = { gray: 'gu-gray', blue: 'gu-blue', green: 'gu-green', orange: 'gu-orange', red: 'gu-red', purple: 'gu-purple' };
            document.getElementById('gu-display-header').innerHTML = `<span class="gu-badge ${colorMap[gu.color]||'gu-gray'}">${Math.floor(gu.total)}</span>`;
            const avatar = document.getElementById('sidebar-avatar');
            avatar.textContent = currentUser.username.charAt(0).toUpperCase();
            document.getElementById('sidebar-uname').textContent = currentUser.username;
            document.getElementById('sidebar-uname').onclick = () => navigate('user', currentUser.username);
            const roleMap = { admin: '管理员', cheater: '作弊者', user: '用户', banned: '已封禁' };
            document.getElementById('sidebar-urole').textContent = roleMap[currentUser.role] || '用户';
            const adminItem = document.getElementById('nav-admin-item');
            adminItem.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
        } catch { resetUI(); }
    } else { resetUI(); }
}

function resetUI() {
    currentUser = null;
    document.getElementById('user-status').innerHTML = '🧑 Guest';
    document.getElementById('auth-btns').style.display = 'flex';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('gu-display-header').innerHTML = '';
    document.getElementById('nav-admin-item').style.display = 'none';
    document.getElementById('sidebar-avatar').textContent = 'G';
    document.getElementById('sidebar-uname').textContent = 'Guest';
    document.getElementById('sidebar-urole').textContent = '游客';
}

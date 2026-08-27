function showToast(msg, type) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1e293b;border:1px solid #334155;padding:0.6rem 1.2rem;border-radius:10px;z-index:9999;max-width:350px;transition:all 0.3s;transform:translateY(80px);opacity:0;font-size:0.9rem;';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#4ade80' : '#f1f5f9';
    el.style.transform = 'translateY(0)';
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.transform = 'translateY(80px)'; el.style.opacity = '0'; }, 3000);
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function getUserColorClass(user) {
    if (!user) return 'username-gray';
    if (user.role === 'admin') return 'username-admin';
    if (user.role === 'cheater') return 'username-cheater';
    const gu = user.gu || { total: 0 };
    if (gu.total >= 210) return 'username-red';
    if (gu.total >= 160) return 'username-orange';
    if (gu.total >= 120) return 'username-green';
    if (gu.total >= 100) return 'username-blue';
    return 'username-gray';
}

function getUsernameHtml(user) {
    if (!user) return '<span class="username-gray">Guest</span>';
    const cls = getUserColorClass(user);
    const name = user.username || 'Unknown';
    return `<span class="${cls}" onclick="navigate('user','${name}')" style="cursor:pointer;">${name}</span>`;
}

function renderMath() {
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ]
        });
    }
}

// 生成8位随机字母数字ID
function generateTicketId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
// 防抖函数
function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// 使用防抖包装 navigate
const navigateDebounced = debounce(navigate, 200);

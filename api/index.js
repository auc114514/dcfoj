const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// ========== 数据工具 ==========
const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROBLEMS_FILE = path.join(DATA_DIR, 'problems.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

function readData(file) {
    try {
        if (!fs.existsSync(file)) return [];
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { return []; }
}

function writeData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('写入失败:', e.message);
    }
}

// 初始化管理员
let users = readData(USERS_FILE);
if (users.length === 0) {
    const hashed = bcrypt.hashSync('admin123456', 10);
    writeData(USERS_FILE, [{
        id: 'admin_001',
        username: 'Dan_Chao_Fan',
        password: hashed,
        role: 'admin',
        solved: [],
        created_at: new Date().toISOString()
    }]);
}

// ========== API 路由 ==========

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 注册
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写完整信息' });
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) {
        return res.status(400).json({ error: '用户名格式不正确' });
    }
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    const users = readData(USERS_FILE);
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
        id: 'user_' + Date.now().toString(36),
        username,
        password: hashed,
        role: 'user',
        solved: [],
        created_at: new Date().toISOString()
    };
    users.push(newUser);
    writeData(USERS_FILE, users);
    const token = jwt.sign({ id: newUser.id, username, role: 'user' }, 'dcf_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: newUser.id, username, role: 'user', solved: [] } });
});

// 登录
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写完整信息' });
    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, 'dcf_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [] } });
});

// 验证 token
app.get('/api/auth/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未提供token' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        const users = readData(USERS_FILE);
        const user = users.find(u => u.id === decoded.id);
        if (!user) return res.status(401).json({ error: '用户不存在' });
        res.json({ user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [] } });
    } catch {
        res.status(401).json({ error: 'token无效' });
    }
});

// 获取题目列表
app.get('/api/problems', (req, res) => {
    const problems = readData(PROBLEMS_FILE);
    res.json(problems);
});

app.get('/api/problems/:code', (req, res) => {
    const problems = readData(PROBLEMS_FILE);
    const p = problems.find(x => x.code === req.params.code);
    if (!p) return res.status(404).json({ error: '题目不存在' });
    res.json(p);
});

// 提交代码
app.post('/api/submissions', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    let userId;
    try {
        userId = jwt.verify(token, 'dcf_secret').id;
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }
    const { problemCode, code, lang } = req.body;
    if (!problemCode || !code || !lang) return res.status(400).json({ error: '缺少必要字段' });
    const users = readData(USERS_FILE);
    const user = users.find(u => u.id === userId);
    const sub = {
        id: 'sub_' + Date.now(),
        username: user?.username || 'Unknown',
        userId,
        problemCode,
        code: code.slice(0, 5000),
        lang,
        status: 'PD',
        time: 0,
        memory: 0,
        timestamp: new Date().toISOString()
    };
    const subs = readData(SUBMISSIONS_FILE);
    subs.push(sub);
    writeData(SUBMISSIONS_FILE, subs);
    setTimeout(() => {
        const statuses = ['AC', 'WA', 'TLE', 'RE', 'MLE', 'OLE', 'CE', 'UKE'];
        const final = Math.random() > 0.3 ? statuses[Math.floor(Math.random() * statuses.length)] : 'AC';
        const current = readData(SUBMISSIONS_FILE);
        const idx = current.findIndex(s => s.id === sub.id);
        if (idx !== -1) {
            current[idx].status = final;
            current[idx].time = Math.floor(Math.random() * 80 + 10);
            current[idx].memory = Math.floor(Math.random() * 20 + 2);
            writeData(SUBMISSIONS_FILE, current);
            if (final === 'AC') {
                const u = readData(USERS_FILE);
                const found = u.find(x => x.id === userId);
                if (found && !found.solved.includes(problemCode)) {
                    found.solved.push(problemCode);
                    writeData(USERS_FILE, u);
                }
            }
        }
    }, 1500);
    res.status(201).json(sub);
});

// 获取提交记录
app.get('/api/submissions', (req, res) => {
    const subs = readData(SUBMISSIONS_FILE);
    const { username, problemCode, status } = req.query;
    let filtered = subs;
    if (username) filtered = filtered.filter(s => s.username === username);
    if (problemCode) filtered = filtered.filter(s => s.problemCode === problemCode);
    if (status) filtered = filtered.filter(s => s.status === status);
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(filtered.slice(0, 200));
});

// ========== 导出 ==========
module.exports = app;
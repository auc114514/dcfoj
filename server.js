const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// 数据目录
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROBLEMS_FILE = path.join(DATA_DIR, 'problems.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

// 工具函数
function readData(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// 初始化管理员账号
const users = readData(USERS_FILE);
if (users.length === 0) {
    const adminPassword = bcrypt.hashSync('admin123456', 10);
    writeData(USERS_FILE, [{
        id: 'admin_001',
        username: 'Dan_Chao_Fan',
        password: adminPassword,
        role: 'admin',
        solved: [],
        created_at: new Date().toISOString()
    }]);
    console.log('✅ 管理员账号已创建 (用户名: Dan_Chao_Fan, 密码: admin123456)');
} else {
    // 检查 Dan_Chao_Fan 是否存在，如果不存在则添加
    const hasAdmin = users.find(u => u.username === 'Dan_Chao_Fan');
    if (!hasAdmin) {
        const adminPassword = bcrypt.hashSync('admin123456', 10);
        users.push({
            id: 'admin_001',
            username: 'Dan_Chao_Fan',
            password: adminPassword,
            role: 'admin',
            solved: [],
            created_at: new Date().toISOString()
        });
        writeData(USERS_FILE, users);
        console.log('✅ 管理员账号已添加 (用户名: Dan_Chao_Fan, 密码: admin123456)');
    }
}

// ==================== 路由 ====================

// 注册
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    // 支持中英文、数字、下划线，长度2-20位
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) {
        return res.status(400).json({
            error: '用户名只能包含中英文、数字和下划线，长度2-20位'
        });
    }

    if (!password || password.length < 6) {
        return res.status(400).json({ error: '密码至少6位' });
    }

    const users = readData(USERS_FILE);
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: 'user_' + Date.now().toString(36),
        username,
        password: hashedPassword,
        role: 'user',
        solved: [],
        created_at: new Date().toISOString()
    };

    users.push(newUser);
    writeData(USERS_FILE, users);

    const token = jwt.sign(
        { id: newUser.id, username: newUser.username, role: newUser.role },
        'dcf_secret',
        { expiresIn: '7d' }
    );

    res.json({
        token,
        user: { id: newUser.id, username: newUser.username, role: newUser.role, solved: [] }
    });
});

// 登录
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const users = readData(USERS_FILE);
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        'dcf_secret',
        { expiresIn: '7d' }
    );

    res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [] }
    });
});

// 验证token
app.get('/api/auth/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未提供token' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        const users = readData(USERS_FILE);
        const user = users.find(u => u.id === decoded.id);
        if (!user) return res.status(401).json({ error: '用户不存在' });
        res.json({
            user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [] }
        });
    } catch {
        res.status(401).json({ error: 'token无效' });
    }
});

// 获取所有题目（公开）
app.get('/api/problems', (req, res) => {
    const problems = readData(PROBLEMS_FILE);
    res.json(problems);
});

// 获取单个题目
app.get('/api/problems/:code', (req, res) => {
    const problems = readData(PROBLEMS_FILE);
    const p = problems.find(x => x.code === req.params.code);
    if (!p) return res.status(404).json({ error: '题目不存在' });
    res.json(p);
});

// 添加题目（管理员）
app.post('/api/problems', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const { code, type, difficulty, title, timeLimit, memoryLimit, tags, description, testCases, templates } = req.body;

    if (!code || !title || !description) {
        return res.status(400).json({ error: '缺少必要字段' });
    }

    const problems = readData(PROBLEMS_FILE);
    if (problems.find(p => p.code === code)) {
        return res.status(400).json({ error: '题目编号已存在' });
    }

    const newProblem = {
        code,
        type: type || 'problem',
        difficulty: difficulty || 'unrated',
        title,
        timeLimit: timeLimit || 1000,
        memoryLimit: memoryLimit || 128,
        tags: tags || [],
        description,
        testCases: testCases || [],
        templates: templates || {
            cpp: '// 请在此编写你的 C++ 代码\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO: 编写你的代码\n    return 0;\n}',
            python: '# 请在此编写你的 Python 代码\n# TODO: 编写你的代码',
            java: '// 请在此编写你的 Java 代码\nimport java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // TODO: 编写你的代码\n    }\n}'
        },
        created_at: new Date().toISOString()
    };

    problems.push(newProblem);
    writeData(PROBLEMS_FILE, problems);
    res.status(201).json(newProblem);
});

// 删除题目（管理员）
app.delete('/api/problems/:code', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const problems = readData(PROBLEMS_FILE);
    const idx = problems.findIndex(p => p.code === req.params.code);
    if (idx === -1) return res.status(404).json({ error: '题目不存在' });

    problems.splice(idx, 1);
    writeData(PROBLEMS_FILE, problems);
    res.json({ message: '题目已删除' });
});

// 获取所有用户（管理员）
app.get('/api/users', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const users = readData(USERS_FILE);
    res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        solved: u.solved || [],
        created_at: u.created_at
    })));
});

// 更新用户角色（管理员）- 设为管理员/移除管理
app.put('/api/users/:id', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const { role } = req.body;
    if (!role || !['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: '无效的角色' });
    }

    const users = readData(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '用户不存在' });

    // 不能修改自己的权限
    const tokenDecoded = jwt.verify(token, 'dcf_secret');
    if (users[idx].id === tokenDecoded.id) {
        return res.status(400).json({ error: '不能修改自己的权限' });
    }

    // 不能修改 Dan_Chao_Fan 的权限
    if (users[idx].username === 'Dan_Chao_Fan') {
        return res.status(400).json({ error: '不能修改超级管理员的权限' });
    }

    users[idx].role = role;
    writeData(USERS_FILE, users);
    res.json({ id: users[idx].id, username: users[idx].username, role: users[idx].role });
});

// 删除用户（管理员）
app.delete('/api/users/:id', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const users = readData(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '用户不存在' });

    // 不能删除自己
    const tokenDecoded = jwt.verify(token, 'dcf_secret');
    if (users[idx].id === tokenDecoded.id) {
        return res.status(400).json({ error: '不能删除自己' });
    }

    // 不能删除 Dan_Chao_Fan
    if (users[idx].username === 'Dan_Chao_Fan') {
        return res.status(400).json({ error: '不能删除超级管理员' });
    }

    users.splice(idx, 1);
    writeData(USERS_FILE, users);
    res.json({ message: '用户已删除' });
});

// 管理员添加用户（支持中文）
app.post('/api/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });

    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const { username, password, role } = req.body;

    if (!username || username.length < 2) {
        return res.status(400).json({ error: '用户名至少2位' });
    }

    if (!password || password.length < 6) {
        return res.status(400).json({ error: '密码至少6位' });
    }

    const users = readData(USERS_FILE);
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: 'user_' + Date.now().toString(36),
        username,
        password: hashedPassword,
        role: role || 'user',
        solved: [],
        created_at: new Date().toISOString()
    };

    users.push(newUser);
    writeData(USERS_FILE, users);
    res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role });
});

// 提交代码
app.post('/api/submissions', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });

    let userId;
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        userId = decoded.id;
    } catch {
        return res.status(401).json({ error: 'token无效' });
    }

    const { problemCode, code, lang } = req.body;
    if (!problemCode || !code || !lang) {
        return res.status(400).json({ error: '缺少必要字段' });
    }

    const users = readData(USERS_FILE);
    const user = users.find(u => u.id === userId);

    const submission = {
        id: 'sub_' + Date.now(),
        username: user?.username || 'Unknown',
        userId: userId,
        problemCode,
        code: code.slice(0, 5000),
        lang,
        status: 'PD',
        time: 0,
        memory: 0,
        timestamp: new Date().toISOString()
    };

    const subs = readData(SUBMISSIONS_FILE);
    subs.push(submission);
    writeData(SUBMISSIONS_FILE, subs);

    // 模拟判题
    setTimeout(() => {
        const allStatuses = ['AC', 'WA', 'TLE', 'RE', 'MLE', 'OLE', 'UKE', 'FE', 'IE',
            'PE', 'CE', 'PC', 'SE', 'NTD', 'JF', 'US', 'PD', 'SJE', 'OE', 'CI', 'OCP'
        ];
        const statusIdx = Math.floor(Math.random() * allStatuses.length);
        const finalStatus = Math.random() > 0.3 ? allStatuses[statusIdx] : 'AC';

        const currentSubs = readData(SUBMISSIONS_FILE);
        const idx = currentSubs.findIndex(s => s.id === submission.id);
        if (idx !== -1) {
            currentSubs[idx].status = finalStatus;
            currentSubs[idx].time = Math.floor(Math.random() * 80 + 10);
            currentSubs[idx].memory = Math.floor(Math.random() * 20 + 2);
            writeData(SUBMISSIONS_FILE, currentSubs);

            if (finalStatus === 'AC') {
                const usersData = readData(USERS_FILE);
                const u = usersData.find(x => x.id === userId);
                if (u && !u.solved.includes(problemCode)) {
                    u.solved.push(problemCode);
                    writeData(USERS_FILE, usersData);
                }
            }
        }
    }, 1500 + Math.random() * 2000);

    res.status(201).json(submission);
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

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
// 本地开发用
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`\n🚀 DCF OJ Backend 已启动`);
        console.log(`📍 http://localhost:${PORT}`);
        console.log(`📁 数据目录: ${DATA_DIR}`);
        console.log(`👑 管理员: Dan_Chao_Fan (密码: admin123456)\n`);
    });
}

// Vercel 导出
module.exports = app;
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());

// ========== 连接数据库 ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== 真·判题引擎 ==========
async function runJudge(code, lang, testCases, timeLimit = 1000) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));
    const results = [];
    let finalStatus = 'AC';
    let totalTime = 0;

    try {
        const configs = {
            'cpp': {
                ext: '.cpp',
                compile: (f) => `g++ -std=c++14 -O2 ${f} -o ${f}.out`,
                run: (f) => `./${f}.out`,
                needCompile: true
            },
            'cpp98': {
                ext: '.cpp',
                compile: (f) => `g++ -std=c++98 ${f} -o ${f}.out`,
                run: (f) => `./${f}.out`,
                needCompile: true
            },
            'python': {
                ext: '.py',
                compile: null,
                run: (f) => `python3 ${f}`,
                needCompile: false
            },
            'pypy3': {
                ext: '.py',
                compile: null,
                run: (f) => `pypy3 ${f}`,
                needCompile: false
            },
            'java': {
                ext: '.java',
                compile: (f) => `javac ${f}`,
                run: (f) => `java -cp ${path.dirname(f)} Main`,
                needCompile: true
            }
        };

        const cfg = configs[lang];
        if (!cfg) return { status: 'SE', error: '不支持的语言' };

        const fileName = path.join(tmpDir, 'Main' + cfg.ext);
        fs.writeFileSync(fileName, code);

        if (cfg.needCompile && cfg.compile) {
            try {
                execSync(cfg.compile(fileName), { timeout: 10000, stdio: 'pipe', shell: true });
            } catch (e) {
                return { status: 'CE', error: e.stderr?.toString() || e.message };
            }
        }

        for (let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            const start = Date.now();

            try {
                const output = execSync(
                    `echo "${tc.input.replace(/"/g, '\\"')}" | ${cfg.run(fileName)}`,
                    { timeout: timeLimit, maxBuffer: 1024 * 1024 * 10, stdio: 'pipe', shell: true }
                );

                const elapsed = Date.now() - start;
                const got = output.toString().trim();
                const expected = tc.output.trim();

                const status = got === expected ? 'AC' : 'WA';
                results.push({ index: i, status, time: elapsed, memory: 0, expected, got });

                if (status !== 'AC' && finalStatus === 'AC') finalStatus = status;
                totalTime += elapsed;

            } catch (e) {
                let status = 'RE';
                if (e.signal === 'SIGTERM' || e.killed) status = 'TLE';
                results.push({ index: i, status, time: timeLimit, memory: 0, error: e.message });
                if (finalStatus === 'AC') finalStatus = status;
                totalTime += timeLimit;
            }
        }

    } catch (e) {
        return { status: 'SE', error: e.message };
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }

    return { status: finalStatus, results, totalTime, maxMemory: 0 };
}

// ========== 初始化数据库表 ==========
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                solved TEXT[] DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS problems (
                code VARCHAR(20) PRIMARY KEY,
                type VARCHAR(20),
                difficulty VARCHAR(20),
                title TEXT,
                time_limit INT,
                memory_limit INT,
                tags TEXT[],
                description TEXT,
                test_cases JSONB,
                templates JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id VARCHAR(50) PRIMARY KEY,
                username VARCHAR(50),
                user_id VARCHAR(50),
                problem_code VARCHAR(20),
                code TEXT,
                lang VARCHAR(20),
                status VARCHAR(20),
                time INT,
                memory INT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const adminCheck = await pool.query("SELECT * FROM users WHERE username = 'Dan_Chao_Fan'");
        if (adminCheck.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123456', 10);
            await pool.query(
                `INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)`,
                ['admin_001', 'Dan_Chao_Fan', hashedPassword, 'admin']
            );
            console.log('✅ 管理员账号已创建 (Dan_Chao_Fan / admin123456)');
        }
        console.log('✅ 数据库连接和表初始化成功！');
    } catch (err) {
        console.error('❌ 数据库初始化失败:', err.message);
    }
}
initDB();

// ============================================================
// API 路由
// ============================================================

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: e.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) {
        return res.status(400).json({ error: '用户名格式不正确' });
    }
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

    try {
        const existCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existCheck.rows.length > 0) return res.status(400).json({ error: '用户名已存在' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = 'user_' + Date.now().toString(36);
        await pool.query(
            `INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)`,
            [userId, username, hashedPassword, 'user']
        );

        const token = jwt.sign({ id: userId, username, role: 'user' }, 'dcf_secret', { expiresIn: '7d' });
        res.json({ token, user: { id: userId, username, role: 'user', solved: [] } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: '用户名或密码错误' });
        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ error: '用户名或密码错误' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, 'dcf_secret', { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [] } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/auth/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未提供token' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (result.rows.length === 0) return res.status(401).json({ error: '用户不存在' });
        const user = result.rows[0];
        res.json({ user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [] } });
    } catch { res.status(401).json({ error: 'token无效' }); }
});

app.get('/api/problems', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM problems ORDER BY code');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/problems/:code', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM problems WHERE code = $1', [req.params.code]);
        if (result.rows.length === 0) return res.status(404).json({ error: '题目不存在' });
        const p = result.rows[0];
        res.json({
            code: p.code,
            type: p.type,
            difficulty: p.difficulty,
            title: p.title,
            timeLimit: p.time_limit,
            memoryLimit: p.memory_limit,
            tags: p.tags || [],
            description: p.description,
            testCases: p.test_cases || [],
            templates: p.templates || {}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/problems', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    const { code, type, difficulty, title, timeLimit, memoryLimit, tags, description, testCases, templates } = req.body;
    if (!code || !title || !description) return res.status(400).json({ error: '缺少必要字段' });

    try {
        await pool.query(
            `INSERT INTO problems (code, type, difficulty, title, time_limit, memory_limit, tags, description, test_cases, templates)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [code, type || 'problem', difficulty || 'unrated', title, timeLimit || 1000, memoryLimit || 128,
             tags || [], description, testCases || [], templates || {
                cpp: '// 请在此编写你的 C++ 代码\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO: 编写你的代码\n    return 0;\n}',
                python: '# 请在此编写你的 Python 代码\n# TODO: 编写你的代码',
                java: '// 请在此编写你的 Java 代码\nimport java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // TODO: 编写你的代码\n    }\n}'
            }]
        );
        res.status(201).json({ code, title });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') return res.status(400).json({ error: '题目编号已存在' });
        res.status(500).json({ error: '服务器错误' });
    }
});

app.delete('/api/problems/:code', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    try {
        const result = await pool.query('DELETE FROM problems WHERE code = $1', [req.params.code]);
        if (result.rowCount === 0) return res.status(404).json({ error: '题目不存在' });
        res.json({ message: '题目已删除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }
    try {
        const result = await pool.query('SELECT id, username, role, solved, created_at FROM users ORDER BY created_at');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    let decoded;
    try { decoded = jwt.verify(token, 'dcf_secret'); if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' }); } 
    catch { return res.status(401).json({ error: 'token无效' }); }

    const { role } = req.body;
    if (!role || !['user', 'admin'].includes(role)) return res.status(400).json({ error: '无效的角色' });
    try {
        const userCheck = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (userCheck.rows[0].username === 'Dan_Chao_Fan') return res.status(400).json({ error: '不能修改超级管理员的权限' });
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
        res.json({ id: req.params.id, role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    let decoded;
    try { decoded = jwt.verify(token, 'dcf_secret'); if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' }); } 
    catch { return res.status(401).json({ error: 'token无效' }); }
    try {
        const userCheck = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (userCheck.rows[0].username === 'Dan_Chao_Fan') return res.status(400).json({ error: '不能删除超级管理员' });
        if (req.params.id === decoded.id) return res.status(400).json({ error: '不能删除自己' });
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ message: '用户已删除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/submissions', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    let userId, username;
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        userId = decoded.id;
        username = decoded.username;
    } catch { return res.status(401).json({ error: 'token无效' }); }

    const { problemCode, code, lang } = req.body;
    if (!problemCode || !code || !lang) return res.status(400).json({ error: '缺少必要字段' });

    const subId = 'sub_' + Date.now();
    try {
        const problemRes = await pool.query('SELECT test_cases, time_limit FROM problems WHERE code = $1', [problemCode]);
        const problem = problemRes.rows[0];
        if (!problem) return res.status(404).json({ error: '题目不存在' });

        await pool.query(
            `INSERT INTO submissions (id, username, user_id, problem_code, code, lang, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [subId, username, userId, problemCode, code.slice(0, 5000), lang, 'PD']
        );

        // 真判题
        const judgeResult = await runJudge(
            code,
            lang,
            problem.test_cases || [],
            problem.time_limit || 1000
        );

        await pool.query(
            `UPDATE submissions SET status = $1, time = $2, memory = $3 WHERE id = $4`,
            [judgeResult.status, judgeResult.totalTime, judgeResult.maxMemory || 0, subId]
        );

        if (judgeResult.status === 'AC') {
            const userRes = await pool.query('SELECT solved FROM users WHERE id = $1', [userId]);
            const solved = userRes.rows[0]?.solved || [];
            if (!solved.includes(problemCode)) {
                solved.push(problemCode);
                await pool.query('UPDATE users SET solved = $1 WHERE id = $2', [solved, userId]);
            }
        }

        res.status(201).json({ id: subId, status: judgeResult.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/submissions', async (req, res) => {
    const { username, problemCode, status } = req.query;
    let sql = 'SELECT * FROM submissions WHERE 1=1';
    const params = [];
    if (username) { params.push(username); sql += ` AND username = $${params.length}`; }
    if (problemCode) { params.push(problemCode); sql += ` AND problem_code = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += ' ORDER BY timestamp DESC LIMIT 200';
    try {
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 启动服务 ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 DCF OJ Backend 运行在端口 ${PORT}`);
});

module.exports = app;

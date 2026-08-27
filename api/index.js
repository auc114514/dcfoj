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
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ===== 根路由 =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const B2_BUCKET = process.env.B2_BUCKET || 'dcf-oj-data';
const B2_BASE = `https://f000.backblazeb2.com/file/${B2_BUCKET}`;

// ========== 工具函数 ==========
async function readFromB2(filepath) {
    try {
        const res = await fetch(`${B2_BASE}/${filepath}`);
        if (!res.ok) return null;
        return await res.text();
    } catch { return null; }
}

async function getTestData(code, idx) {
    const input = await readFromB2(`${code}/${idx}.in`);
    const output = await readFromB2(`${code}/${idx}.out`);
    if (input === null || output === null) return null;
    return { input: input.trim(), output: output.trim() };
}

async function judge(code, lang, problemCode, timeLimit = 1000) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));
    const results = [];
    let finalStatus = 'AC';
    let totalTime = 0;

    try {
        const configs = {
            cpp: { ext: '.cpp', compile: (f) => `g++ -std=c++14 -O2 ${f} -o ${f}.out`, run: (f) => `./${f}.out`,
                needCompile: true },
            python: { ext: '.py', compile: null, run: (f) => `python3 ${f}`, needCompile: false },
            java: { ext: '.java', compile: (f) => `javac ${f}`, run: (f) => `java -cp ${path.dirname(f)} Main`,
                needCompile: true }
        };

        const cfg = configs[lang];
        if (!cfg) return { status: 'SE', error: '不支持的语言' };

        const file = path.join(tmp, 'Main' + cfg.ext);
        fs.writeFileSync(file, code);

        if (cfg.needCompile && cfg.compile) {
            try {
                execSync(cfg.compile(file), { timeout: 10000, stdio: 'pipe', shell: true });
            } catch (e) {
                return { status: 'CE', error: e.stderr?.toString() || e.message };
            }
        }

        let idx = 1;
        while (true) {
            const data = await getTestData(problemCode, idx);
            if (!data) break;

            const start = Date.now();
            try {
                const out = execSync(
                    `echo "${data.input.replace(/"/g, '\\"')}" | ${cfg.run(file)}`,
                    { timeout: timeLimit, maxBuffer: 1024 * 1024 * 10, stdio: 'pipe', shell: true }
                );
                const elapsed = Date.now() - start;
                const got = out.toString().trim();
                const status = got === data.output ? 'AC' : 'WA';
                results.push({ index: idx, status, time: elapsed });
                if (status !== 'AC' && finalStatus === 'AC') finalStatus = status;
                totalTime += elapsed;
            } catch (e) {
                let status = 'RE';
                if (e.signal === 'SIGTERM' || e.killed) status = 'TLE';
                results.push({ index: idx, status, time: timeLimit });
                if (finalStatus === 'AC') finalStatus = status;
                totalTime += timeLimit;
            }
            idx++;
        }

        if (results.length === 0) return { status: 'NTD' };

    } catch (e) {
        return { status: 'SE', error: e.message };
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }

    return { status: finalStatus, results, totalTime };
}

async function updateGuValue(userId) {
    const userRes = await pool.query('SELECT solved FROM users WHERE id = $1', [userId]);
    const solved = userRes.rows[0]?.solved || [];

    let practice = 0;
    const diffMap = { 'intro': 0.05, 'popular-minus': 0.1, 'popular': 0.2, 'popular-plus': 0.4,
        'advanced': 0.5, 'advanced-plus': 0.6, 'provincial': 0.8, 'noi': 0.9, 'noi-plus': 1 };

    if (solved.length > 0) {
        const problemRes = await pool.query('SELECT difficulty FROM problems WHERE code = ANY($1)', [solved]);
        for (const p of problemRes.rows) {
            practice += diffMap[p.difficulty] || 0;
        }
        practice = Math.floor(practice);
    }

    let credit = 100;
    let total = practice + credit;
    let color = 'gray';
    if (total >= 210) color = 'red';
    else if (total >= 160) color = 'orange';
    else if (total >= 120) color = 'green';
    else if (total >= 100) color = 'blue';

    await pool.query(`
        INSERT INTO gu_values (user_id, practice, credit, total, color, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
        practice = $2, credit = $3, total = $4, color = $5, updated_at = NOW()
    `, [userId, practice, credit, total, color]);
}

// ========== 数据库初始化 ==========
async function initDB() {
    try {
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS users_uid_seq START 1;`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                uid INT DEFAULT nextval('users_uid_seq') UNIQUE,
                username VARCHAR(50) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                solved TEXT[] DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`UPDATE users SET uid = nextval('users_uid_seq') WHERE uid IS NULL;`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS problems (
                code VARCHAR(20) PRIMARY KEY,
                type VARCHAR(20) DEFAULT 'problem',
                difficulty VARCHAR(20) DEFAULT 'unrated',
                title TEXT,
                time_limit INT DEFAULT 1000,
                memory_limit INT DEFAULT 128,
                tags TEXT[],
                description TEXT,
                test_cases JSONB,
                templates JSONB,
                data_path VARCHAR(100),
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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tweets (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) REFERENCES users(id),
                content TEXT,
                code TEXT,
                lang VARCHAR(20),
                reply_to_id INT REFERENCES tweets(id),
                is_deleted BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                reporter_id VARCHAR(50) REFERENCES users(id),
                target_type VARCHAR(20),
                target_id INT,
                reason TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                owner_id VARCHAR(50) REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS team_members (
                team_id INT REFERENCES teams(id) ON DELETE CASCADE,
                user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(20) DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (team_id, user_id)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS gu_values (
                user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id),
                practice DECIMAL DEFAULT 0,
                credit DECIMAL DEFAULT 100,
                contribution DECIMAL DEFAULT 0,
                competition DECIMAL DEFAULT 0,
                total DECIMAL DEFAULT 0,
                color VARCHAR(20) DEFAULT 'gray',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id VARCHAR(8) PRIMARY KEY DEFAULT substr(md5(random()::text), 1, 8),
                user_id VARCHAR(50) REFERENCES users(id),
                title VARCHAR(200),
                content TEXT,
                status VARCHAR(20) DEFAULT 'open',
                admin_reply TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contests (
                id SERIAL PRIMARY KEY,
                title VARCHAR(200),
                description TEXT,
                is_rated BOOLEAN DEFAULT false,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                created_by VARCHAR(50) REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS versions (
                id SERIAL PRIMARY KEY,
                version VARCHAR(20) NOT NULL,
                title VARCHAR(200),
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_id VARCHAR(50) REFERENCES users(id),
                admin_name VARCHAR(50),
                action VARCHAR(50),
                target_type VARCHAR(20),
                target_id VARCHAR(50),
                target_name VARCHAR(50),
                target_uid INT,
                changes JSONB,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            INSERT INTO versions (version, title, content) VALUES
            ('v1.0.0', '初始版本', 'DCF OJ 初始发布'),
            ('v1.1.0', '大更新', '犇犇、用户主页、团队、咕值、工单'),
            ('v1.1.1', '陶片放逐', '管理员日志'),
            ('v1.1.2', '用户名颜色', '用户颜色、角色修改'),
            ('v1.1.3', 'UID系统', '用户UID、撤销权限、左侧导航')
            ON CONFLICT DO NOTHING;
        `);

        const admin = await pool.query("SELECT * FROM users WHERE username = 'Dan_Chao_Fan'");
        if (admin.rows.length === 0) {
            const hashed = await bcrypt.hash('admin123456', 10);
            await pool.query(
                `INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)`,
                ['admin_001', 'Dan_Chao_Fan', hashed, 'admin']
            );
            console.log('✅ 管理员: Dan_Chao_Fan / admin123456');
        }
        console.log('✅ 数据库已连接');
    } catch (err) {
        console.error('❌ 数据库初始化失败:', err.message);
    }
}
initDB();

// ============================================================
// API 路由
// ============================================================

app.get('/api/versions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM versions ORDER BY id DESC');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: e.message });
    }
});

// ===== 认证 =====
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!/^[a-zA-Z0-9_]{6,20}$/.test(username)) {
        return res.status(400).json({ error: '用户名只能包含英文、数字、下划线，6-20位' });
    }
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

    try {
        const exist = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (exist.rows.length > 0) return res.status(400).json({ error: '用户名已存在' });

        const hashed = await bcrypt.hash(password, 10);
        const userId = 'user_' + Date.now().toString(36);
        await pool.query(
            `INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)`,
            [userId, username, hashed, 'user']
        );

        await pool.query(
            `INSERT INTO gu_values (user_id, credit, total) VALUES ($1, 100, 100)`,
            [userId]
        );

        const token = jwt.sign({ id: userId, username, role: 'user' }, 'dcf_secret', { expiresIn: '7d' });
        res.json({ token, user: { id: userId, username, role: 'user', solved: [] } });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT id, username, role, solved, uid FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: '用户名或密码错误' });
        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: '用户名或密码错误' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, uid: user.uid }, 'dcf_secret', { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role, solved: user.solved || [], uid: user.uid } });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/auth/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未提供token' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        const result = await pool.query('SELECT id, username, role, solved, uid FROM users WHERE id = $1', [decoded.id]);
        if (result.rows.length === 0) return res.status(401).json({ error: '用户不存在' });
        const user = result.rows[0];
        const gu = await pool.query('SELECT * FROM gu_values WHERE user_id = $1', [user.id]);
        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                solved: user.solved || [],
                uid: user.uid,
                gu: gu.rows[0] || { total: 100, color: 'gray' }
            }
        });
    } catch { res.status(401).json({ error: 'token无效' }); }
});

// ===== 用户 =====
app.get('/api/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    try {
        const result = await pool.query('SELECT id, username, role, solved, uid, created_at FROM users ORDER BY uid ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/users/uid/:uid', async (req, res) => {
    try {
        const userRes = await pool.query('SELECT id, username, role, solved, uid, created_at FROM users WHERE uid = $1', [
            req.params.uid
        ]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const user = userRes.rows[0];
        const gu = await pool.query('SELECT * FROM gu_values WHERE user_id = $1', [user.id]);
        const subs = await pool.query('SELECT COUNT(*) FROM submissions WHERE user_id = $1', [user.id]);
        const ac = await pool.query('SELECT COUNT(*) FROM submissions WHERE user_id = $1 AND status = $2', [user.id, 'AC']);

        res.json({
            ...user,
            gu: gu.rows[0] || { total: 100, color: 'gray' },
            totalSubmissions: parseInt(subs.rows[0].count),
            acSubmissions: parseInt(ac.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/users/:username', async (req, res) => {
    try {
        const userRes = await pool.query('SELECT id, username, role, solved, uid, created_at FROM users WHERE username = $1', [
            req.params.username
        ]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const user = userRes.rows[0];
        const gu = await pool.query('SELECT * FROM gu_values WHERE user_id = $1', [user.id]);
        const subs = await pool.query('SELECT COUNT(*) FROM submissions WHERE user_id = $1', [user.id]);
        const ac = await pool.query('SELECT COUNT(*) FROM submissions WHERE user_id = $1 AND status = $2', [user.id, 'AC']);

        res.json({
            ...user,
            gu: gu.rows[0] || { total: 100, color: 'gray' },
            totalSubmissions: parseInt(subs.rows[0].count),
            acSubmissions: parseInt(ac.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/users/:username/teams', async (req, res) => {
    try {
        const userRes = await pool.query('SELECT id FROM users WHERE username = $1', [req.params.username]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const result = await pool.query(`
            SELECT t.* FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            WHERE tm.user_id = $1
        `, [userRes.rows[0].id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 管理员：角色修改 =====
app.put('/api/admin/users/:id/role', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    const { role, reason } = req.body;
    if (!role || !['user', 'admin', 'cheater'].includes(role)) {
        return res.status(400).json({ error: '无效的角色' });
    }

    try {
        const userCheck = await pool.query('SELECT username, uid FROM users WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (userCheck.rows[0].username === 'Dan_Chao_Fan') {
            return res.status(400).json({ error: '不能修改超级管理员的权限' });
        }

        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);

        if (role === 'cheater') {
            const gu = await pool.query('SELECT total FROM gu_values WHERE user_id = $1', [req.params.id]);
            const newTotal = Math.max(0, (gu.rows[0]?.total || 100) - 52);
            await pool.query('UPDATE gu_values SET total = $1 WHERE user_id = $2', [newTotal, req.params.id]);
        }

        await pool.query(
            `INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, target_name, target_uid, changes, reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [decoded.id, decoded.username, '修改用户角色', 'user', req.params.id, userCheck.rows[0].username,
                userCheck.rows[0].uid, JSON.stringify({ new_role: role }), reason || '管理员修改角色'
            ]
        );

        res.json({ success: true, username: userCheck.rows[0].username, role });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 管理员：撤销权限 =====
app.put('/api/admin/users/:id/revoke', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: '请填写撤销原因' });

    try {
        const userCheck = await pool.query('SELECT username, role, uid FROM users WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (userCheck.rows[0].username === 'Dan_Chao_Fan') {
            return res.status(400).json({ error: '不能撤销超级管理员的权限' });
        }

        const oldRole = userCheck.rows[0].role;
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['user', req.params.id]);

        await pool.query(
            `INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, target_name, target_uid, changes, reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [decoded.id, decoded.username, '撤销权限', 'user', req.params.id, userCheck.rows[0].username,
                userCheck.rows[0].uid, JSON.stringify({ old_role: oldRole, new_role: 'user' }), reason
            ]
        );

        res.json({ success: true, username: userCheck.rows[0].username, oldRole });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.put('/api/admin/users/:id/ban', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    try {
        const userCheck = await pool.query('SELECT username, uid FROM users WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (userCheck.rows[0].username === 'Dan_Chao_Fan') {
            return res.status(400).json({ error: '不能封禁超级管理员' });
        }

        await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['banned', req.params.id]);
        await pool.query('UPDATE gu_values SET credit = 0, total = 0 WHERE user_id = $1', [req.params.id]);

        await pool.query(
            `INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, target_name, target_uid, changes, reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [decoded.id, decoded.username, '封禁用户', 'user', req.params.id, userCheck.rows[0].username,
                userCheck.rows[0].uid, JSON.stringify({ role: 'banned' }), '管理员封禁'
            ]
        );

        res.json({ message: '用户已封禁' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 题目 =====
app.get('/api/problems', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM problems ORDER BY code');
        res.json(result.rows);
    } catch (err) {
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
            templates: p.templates || {},
            dataPath: p.data_path
        });
    } catch (err) {
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

    const { code, type, difficulty, title, timeLimit, memoryLimit, tags, description, testCases, templates, dataPath } = req
        .body;
    if (!code || !title || !description) return res.status(400).json({ error: '缺少必要字段' });

    try {
        await pool.query(
            `INSERT INTO problems (code, type, difficulty, title, time_limit, memory_limit, tags, description, test_cases, templates, data_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [code, type || 'problem', difficulty || 'unrated', title, timeLimit || 1000, memoryLimit || 128,
                tags || [], description, testCases || [], templates || {}, dataPath || code
            ]
        );
        res.status(201).json({ code, title });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: '题目编号已存在' });
        res.status(500).json({ error: '服务器错误' });
    }
});

app.put('/api/problems/:code', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    try {
        const decoded = jwt.verify(token, 'dcf_secret');
        if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    } catch { return res.status(401).json({ error: 'token无效' }); }

    const { title, difficulty, type, timeLimit, memoryLimit, tags, description, testCases, dataPath } = req.body;
    if (!title) return res.status(400).json({ error: '标题不能为空' });

    try {
        await pool.query(
            `UPDATE problems SET
                title = $1, difficulty = $2, type = $3, time_limit = $4, memory_limit = $5,
                tags = $6, description = $7, test_cases = $8, data_path = $9
             WHERE code = $10`,
            [title, difficulty || 'unrated', type || 'problem', timeLimit || 1000, memoryLimit || 128,
                tags || [], description, testCases || [], dataPath || req.params.code, req.params.code
            ]
        );
        res.json({ message: '更新成功' });
    } catch (err) {
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
        res.json({ message: '已删除' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 提交 =====
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
        const problemRes = await pool.query('SELECT time_limit, data_path, difficulty FROM problems WHERE code = $1', [
            problemCode
        ]);
        const problem = problemRes.rows[0];
        if (!problem) return res.status(404).json({ error: '题目不存在' });

        await pool.query(
            `INSERT INTO submissions (id, username, user_id, problem_code, code, lang, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [subId, username, userId, problemCode, code.slice(0, 5000), lang, 'PD']
        );

        const dataPath = problem.data_path || problemCode;
        const result = await judge(
            code,
            lang,
            dataPath,
            problem.time_limit || 1000
        );

        await pool.query(
            `UPDATE submissions SET status = $1, time = $2, memory = $3 WHERE id = $4`,
            [result.status, result.totalTime, 0, subId]
        );

        if (result.status === 'AC') {
            const userRes = await pool.query('SELECT solved FROM users WHERE id = $1', [userId]);
            const solved = userRes.rows[0]?.solved || [];
            if (!solved.includes(problemCode)) {
                solved.push(problemCode);
                await pool.query('UPDATE users SET solved = $1 WHERE id = $2', [solved, userId]);
                await updateGuValue(userId);
            }
        }

        res.status(201).json({ id: subId, status: result.status });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/submissions', async (req, res) => {
    const { username, problemCode, status } = req.query;
    let sql = 'SELECT * FROM submissions WHERE 1=1';
    const params = [];
    if (username) { params.push(username);
        sql += ` AND username = $${params.length}`; }
    if (problemCode) { params.push(problemCode);
        sql += ` AND problem_code = $${params.length}`; }
    if (status) { params.push(status);
        sql += ` AND status = $${params.length}`; }
    sql += ' ORDER BY timestamp DESC LIMIT 200';
    try {
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 犇犇 =====
app.get('/api/tweets', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, u.username, u.uid
            FROM tweets t
            JOIN users u ON t.user_id = u.id
            WHERE t.is_deleted = false
            ORDER BY t.created_at DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/tweets', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');

    const { content, code, lang } = req.body;
    if (!content && !code) return res.status(400).json({ error: '内容不能为空' });

    try {
        await pool.query(
            `INSERT INTO tweets (user_id, content, code, lang) VALUES ($1, $2, $3, $4)`,
            [decoded.id, content || '', code || '', lang || '']
        );
        res.status(201).json({ message: '发布成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/tweets/:id/reply', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '回复内容不能为空' });

    try {
        await pool.query(
            `INSERT INTO tweets (user_id, content, reply_to_id) VALUES ($1, $2, $3)`,
            [decoded.id, content, req.params.id]
        );
        res.json({ message: '回复成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/tweets/:id/report', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: '请填写举报原因' });

    try {
        await pool.query(
            `INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4)`,
            [decoded.id, 'tweet', req.params.id, reason]
        );
        res.json({ message: '举报成功，管理员将尽快处理' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 团队 =====
app.get('/api/teams', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, COUNT(tm.user_id) as member_count
            FROM teams t
            LEFT JOIN team_members tm ON t.id = tm.team_id
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/teams', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');

    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '团队名称不能为空' });

    try {
        const result = await pool.query(
            `INSERT INTO teams (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id`,
            [name, description || '', decoded.id]
        );
        await pool.query(
            `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`,
            [result.rows[0].id, decoded.id, 'owner']
        );
        res.status(201).json({ id: result.rows[0].id, message: '团队创建成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/teams/:id', async (req, res) => {
    try {
        const teamRes = await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id]);
        if (teamRes.rows.length === 0) return res.status(404).json({ error: '团队不存在' });
        const members = await pool.query(`
            SELECT u.username, u.id, tm.role
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1
        `, [req.params.id]);
        res.json({ ...teamRes.rows[0], members: members.rows });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/teams/:id/join', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');

    try {
        await pool.query(
            `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`,
            [req.params.id, decoded.id]
        );
        res.json({ message: '加入成功' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: '已加入该团队' });
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 工单 =====
app.get('/api/tickets', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');

    try {
        let result;
        if (decoded.role === 'admin') {
            result = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
        } else {
            result = await pool.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC', [decoded.id]);
        }
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/tickets', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: '请填写完整信息' });

    try {
        const result = await pool.query(
            `INSERT INTO tickets (user_id, title, content) VALUES ($1, $2, $3) RETURNING id`,
            [decoded.id, title, content]
        );
        res.status(201).json({ id: result.rows[0].id, message: '工单提交成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.put('/api/tickets/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });

    const { admin_reply, status } = req.body;
    try {
        await pool.query(
            `UPDATE tickets SET admin_reply = $1, status = $2, updated_at = NOW() WHERE id = $3`,
            [admin_reply, status || 'closed', req.params.id]
        );
        res.json({ message: '工单已更新' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ===== 管理员日志 =====
app.post('/api/admin/log', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    const decoded = jwt.verify(token, 'dcf_secret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });

    const { action, target_type, target_id, target_name, changes, reason } = req.body;
    try {
        await pool.query(
            `INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, target_name, target_uid, changes, reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [decoded.id, decoded.username, action, target_type, target_id, target_name,
                req.body.target_uid || null, changes || {}, reason || ''
            ]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/admin/logs', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '未授权' });
    const decoded = jwt.verify(token, 'dcf_secret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });

    try {
        const result = await pool.query('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 200');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });

    try {
        const users = await pool.query('SELECT COUNT(*) FROM users');
        const problems = await pool.query('SELECT COUNT(*) FROM problems');
        const submissions = await pool.query('SELECT COUNT(*) FROM submissions');
        const tickets = await pool.query('SELECT COUNT(*) FROM tickets WHERE status = $1', ['open']);
        res.json({
            users: parseInt(users.rows[0].count),
            problems: parseInt(problems.rows[0].count),
            submissions: parseInt(submissions.rows[0].count),
            openTickets: parseInt(tickets.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.get('/api/contests', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contests ORDER BY start_time DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

app.post('/api/contests', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    const decoded = jwt.verify(token, 'dcf_secret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });

    const { title, description, is_rated, start_time, end_time } = req.body;
    if (!title) return res.status(400).json({ error: '标题不能为空' });

    try {
        await pool.query(
            `INSERT INTO contests (title, description, is_rated, start_time, end_time, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [title, description || '', is_rated || false, start_time, end_time, decoded.id]
        );
        res.status(201).json({ message: '公开赛创建成功' });
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// ============================================================
// 启动
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 DCF OJ v1.1.3 运行在端口 ${PORT}`);
});

module.exports = app;

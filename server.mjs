/**
 * Photos Wall 3D 后端服务
 *
 * 职责：
 * - 照片管理 API：列表 / 上传 / 删除（Token 认证）
 * - 原图自动压缩（最长边 1600）+ 缩略图生成（320px，3D 墙专用，省显存）
 * - 托管构建产物 dist/（含 wasm / 模型 / 示例照片，全本地离线可用）
 * - COOP/COEP 响应头：启用 WASM 多线程（SharedArrayBuffer），推理提速
 *
 * 运行：node server.mjs  （端口 8787）
 * 管理 Token：首次运行自动生成于 data/.admin_token，可用环境变量 ADMIN_TOKEN 覆盖
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.join(__dirname, 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const DIST_DIR = path.join(__dirname, 'dist');

fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });

// ---------- 管理 Token ----------
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN) {
  const tf = path.join(DATA_DIR, '.admin_token');
  try {
    ADMIN_TOKEN = fs.readFileSync(tf, 'utf8').trim();
  } catch {
    ADMIN_TOKEN = crypto.randomBytes(9).toString('hex');
    fs.writeFileSync(tf, ADMIN_TOKEN);
  }
}
console.log(`[photos-wall] 管理 Token: ${ADMIN_TOKEN}  (data/.admin_token)`);

// ---------- 照片索引 ----------
const loadIndex = () => {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return [];
  }
};
const saveIndex = (idx) => {
  const tmp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2));
  fs.renameSync(tmp, INDEX_FILE);
};

const toPublic = (rec) => ({
  id: rec.id,
  name: rec.name,
  url: `/photos/${rec.file}`,
  thumb: `/thumbs/${rec.file.replace(/\.[^.]+$/, '.jpg')}`,
  addedAt: rec.addedAt,
});

// ---------- 应用 ----------
const app = express();
app.use(express.json());

// COOP/COEP：允许 wasm 多线程（SharedArrayBuffer）
const coopHeaders = (res) => {
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Embedder-Policy', 'require-corp');
};

const auth = (req, res, next) => {
  const t = req.get('X-Admin-Token') || req.query.token;
  if (t !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized: token 错误' });
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 20 },
});

// ---------- API ----------
app.get('/api/photos', (req, res) => {
  res.json(loadIndex().map(toPublic));
});

app.post('/api/photos', auth, upload.array('photo', 20), async (req, res) => {
  const idx = loadIndex();
  const added = [];
  try {
    for (const f of req.files || []) {
      const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const ext = (f.originalname.match(/\.(jpe?g|png|webp|gif|bmp)$/i) || ['.jpg'])[0].toLowerCase();
      const file = `${id}${ext}`;
      const buf = f.buffer;
      const img = sharp(buf).rotate();
      // 原图压缩至最长边 1600（省磁盘 + 省 GPU 纹理内存预算）
      await img.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(path.join(PHOTOS_DIR, file))
        .catch(() => sharp(buf).toFile(path.join(PHOTOS_DIR, file)));
      // 缩略图：3D 墙使用，320px 宽
      await img.clone().resize(320, 320, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toFile(path.join(THUMBS_DIR, `${id}.jpg`))
        .catch(() => {});
      const rec = { id, file, name: f.originalname || file, addedAt: Date.now() };
      idx.push(rec);
      added.push(toPublic(rec));
    }
    saveIndex(idx);
    res.json(added);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete('/api/photos/:id', auth, (req, res) => {
  let idx = loadIndex();
  const rec = idx.find((p) => p.id === req.params.id);
  if (!rec) return res.status(404).json({ error: 'not found' });
  idx = idx.filter((p) => p.id !== req.params.id);
  saveIndex(idx);
  for (const p of [path.join(PHOTOS_DIR, rec.file), path.join(THUMBS_DIR, rec.file.replace(/\.[^.]+$/, '.jpg'))]) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  res.json({ ok: true });
});

// ---------- 静态资源 ----------
app.use('/photos', express.static(PHOTOS_DIR, { maxAge: '7d' }));
app.use('/thumbs', express.static(THUMBS_DIR, { maxAge: '7d' }));

// 构建产物（index.html / js / wasm / models / samples / vendor）
app.use(express.static(DIST_DIR, { maxAge: '1h', setHeaders: coopHeaders }));

// SPA 回退
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    coopHeaders(res);
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[photos-wall] 服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`[photos-wall] 管理后台: http://<IP>:${PORT}/#/admin`);
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhotoItem } from '../types';

const TOKEN_KEY = 'pw3d_admin_token';

/**
 * 照片管理后台（#/admin）：
 * - 上传（多选）、删除照片
 * - 缩略图由后端自动生成，3D 墙自动热更新
 * - Token 认证：首次运行后端时生成于 data/.admin_token
 */
const AdminPanel: React.FC = () => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/photos');
      if (r.ok) setPhotos(await r.json());
    } catch { /* 后端未启动 */ }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveToken = () => {
    localStorage.setItem(TOKEN_KEY, token);
    setMsg({ ok: true, text: 'Token 已保存' });
  };

  const upload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('photo', f);
      const r = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
        body: fd,
      });
      const body = r.ok ? `已上传 ${files.length} 张` : await r.text();
      setMsg({ ok: r.ok, text: body });
      if (r.ok) {
        if (fileRef.current) fileRef.current.value = '';
        load();
      }
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message || e) });
    }
    setBusy(false);
  };

  const del = async (id: string) => {
    if (!window.confirm('删除这张照片？')) return;
    try {
      const r = await fetch(`/api/photos/${id}`, { method: 'DELETE', headers: { 'X-Admin-Token': token } });
      setMsg({ ok: r.ok, text: r.ok ? '已删除' : await r.text() });
      if (r.ok) load();
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message || e) });
    }
  };

  return (
    <div className="min-h-screen bg-[#00050a] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-black tracking-tight">
            PHOTOS WALL <span className="text-cyan-400">ADMIN</span>
          </h1>
          <a href="#/" className="text-xs text-cyan-400 border border-cyan-500/40 rounded px-3 py-1.5 hover:bg-cyan-500/10">
            ← 返回展示端
          </a>
        </div>

        {/* Token */}
        <div className="mb-6 flex items-center gap-3">
          <input
            type="password"
            placeholder="管理 Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="bg-black/50 border border-white/15 rounded px-3 py-2 text-sm w-56 outline-none focus:border-cyan-500/60"
          />
          <button onClick={saveToken} className="text-xs border border-white/20 rounded px-3 py-2 hover:bg-white/5">
            保存
          </button>
          <span className="text-[10px] text-gray-500">Token 在服务器 data/.admin_token 中</span>
        </div>

        {/* 上传 */}
        <div className="mb-8 p-5 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="text-xs text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-300 file:px-3 file:py-1.5 file:text-xs"
            />
            <button
              onClick={upload}
              disabled={busy}
              className="text-xs bg-cyan-500 text-black font-bold rounded px-4 py-2 hover:bg-cyan-400 disabled:opacity-40"
            >
              {busy ? '上传中...' : '上传'}
            </button>
            {msg && (
              <span className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-3">
            支持 jpg/png/webp；原图自动压缩至最长边 1600，并生成 320px 缩略图供 3D 墙使用（省显存）。
          </p>
        </div>

        {/* 照片列表 */}
        <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
          {photos.map((p) => (
            <div key={p.id} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40">
              <img src={p.thumb || p.url} alt={p.name || p.id} className="w-full aspect-[3/4] object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <button
                  onClick={() => del(p.id)}
                  className="text-[10px] bg-red-500/80 text-white rounded px-3 py-1 hover:bg-red-500"
                >
                  删除
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/70 text-[8px] text-white/60 truncate">
                {p.name || p.id}
              </div>
            </div>
          ))}
        </div>
        {photos.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-16">
            还没有照片。上传后会立即出现在 3D 照片墙中。
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

// CDP 探针（开发/验收工具）：连 chromium remote debugging，读 __PW3D__ 状态并截图
// 用法: node scripts/cdp_probe.mjs [截图路径]
import fs from 'fs';

const shotPath = process.argv[2] || '/tmp/pw3d-e2e.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('未找到页面，先启动 chromium --remote-debugging-port=9222'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id).res(m.result);
    pending.delete(m.id);
  }
};
await new Promise((r) => { ws.onopen = r; });

let info = null;
for (let i = 0; i < 40; i++) {
  try {
    const r = await send('Runtime.evaluate', {
      expression: `JSON.stringify({pose: window.__PW3D__?.getPose?.() ?? null, inf: window.__PW3D__?.getInferenceMs?.() ?? -1, sab: typeof SharedArrayBuffer !== 'undefined'})`,
      returnByValue: true,
    });
    info = JSON.parse(r.result.value);
    if (info.pose && info.pose.score > 0.3 && info.inf >= 0) break;
  } catch (e) { /* 页面未就绪 */ }
  await sleep(1000);
}

console.log('状态:', JSON.stringify(info, null, 2));
const ok = info?.pose && info.pose.score > 0.3;
console.log(ok ? '✅ 姿态检测到人物' : '❌ 未检测到人物');

const r2 = await send('Runtime.evaluate', {
  expression: `(() => { const c = document.querySelector('canvas[width="640"]'); if (!c) return 'NO_CANVAS'; const ctx = c.getContext('2d'); const d = ctx.getImageData(0,0,c.width,c.height).data; let n=0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++; return String(n); })()`,
  returnByValue: true,
});
console.log('骨架像素数:', r2.result.value);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
console.log('截图已保存', shotPath);
ws.close();
process.exit(ok ? 0 : 2);

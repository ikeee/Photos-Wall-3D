// 深度诊断：抓页面异常 + DOM 状态
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
await new Promise((r) => { ws.onopen = r; });

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(12000);

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.value;
};

console.log('root 子节点数:', await evalJs(`document.getElementById('root').children.length`));
console.log('body 前 200 字符:', (await evalJs(`document.body.innerHTML.slice(0,200)`))?.slice(0, 200));
console.log('__PW3D__ 存在:', await evalJs(`typeof window.__PW3D__`));
console.log('canvas 数量:', await evalJs(`document.querySelectorAll('canvas').length`));
console.log('错误状态:', await evalJs(`(window.__PW3D_ERROR__ ?? 'none')`));

const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown');
const consoleMsgs = events.filter((e) => e.method === 'Runtime.consoleAPICalled');
const logMsgs = events.filter((e) => e.method === 'Log.entryAdded');
console.log('\n--- 异常 ---');
for (const e of exceptions.slice(0, 5)) {
  const d = e.params.exceptionDetails;
  console.log(d.exception?.description || d.text);
}
console.log('--- console ---');
for (const e of consoleMsgs.slice(0, 15)) {
  console.log(`[${e.params.type}]`, e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
}
console.log('--- log ---');
for (const e of logMsgs.slice(0, 10)) {
  console.log(`[${e.params.entry.level}]`, e.params.entry.text.slice(0, 300));
}
ws.close();
process.exit(0);

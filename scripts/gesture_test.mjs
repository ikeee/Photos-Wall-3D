// 手势引擎单元测试：合成姿态序列验证触发/冷却/防误触
// 运行: npm run test:gestures （先用 esbuild 编译 poseUtils 到 .tmp/）
import { GestureEngine, getCenterOffset } from '../.tmp/poseUtils.mjs';

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

function mk(pts) {
  const lms = [];
  for (let i = 0; i < 33; i++) {
    const p = pts[i];
    lms.push(p ? { x: p[0], y: p[1], z: 0, visibility: p[2] ?? 1 } : { x: 0, y: 0, z: 0, visibility: 0 });
  }
  return lms;
}

const NEUTRAL = {
  11: [0.45, 0.5, 1], 12: [0.55, 0.5, 1],
  15: [0.4, 0.65, 1], 16: [0.6, 0.65, 1],
  23: [0.45, 0.7, 1], 24: [0.55, 0.7, 1],
};
const T_POSE = { ...NEUTRAL, 15: [0.2, 0.42, 1], 16: [0.8, 0.42, 1] };
const HANDS_UP = { ...NEUTRAL, 15: [0.45, 0.3, 1], 16: [0.55, 0.3, 1] };

const OPTS = { cooldownMs: 2000, focusHoldMs: 400, handsUpHoldMs: 350, waveWindowMs: 1200, waveMinReversals: 2 };

function makeEngine() { return new GestureEngine(OPTS); }
function frames(seq) { return seq.map(([pts, t]) => ({ pts, t })); }

console.log('== getCenterOffset ==');
const off = getCenterOffset(mk(NEUTRAL));
assert('居中时 x≈0', Math.abs(off.x) < 0.01, JSON.stringify(off));
assert('居中时 y≈0.2 (肩0.5+髋0.7)', Math.abs(off.y - 0.2) < 0.01, JSON.stringify(off));
assert('空输入返回0', getCenterOffset([]).x === 0);

console.log('== T 字张臂 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [];
  seq.push([NEUTRAL, 0]);
  for (let t = 500; t <= 3000; t += 50) seq.push([T_POSE, t]);   // 持续张臂
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('保持400ms后触发一次', fired.length === 1 && fired[0][0] === 'arms_spread' && fired[0][1] === 900, JSON.stringify(fired));
}

console.log('== T 字破势后可再触发 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [];
  seq.push([NEUTRAL, 0]);
  for (let t = 500; t <= 3000; t += 50) seq.push([T_POSE, t]);   // 触发于 900
  for (let t = 3050; t <= 5400; t += 50) seq.push([NEUTRAL, t]); // 冷却期破势
  for (let t = 5450; t <= 6800; t += 50) seq.push([T_POSE, t]);  // 冷却结束(4900)后重新张臂 → 5450+400=5850 触发
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('第二次触发', fired.length === 2 && fired[1][0] === 'arms_spread' && fired[1][1] === 5850, JSON.stringify(fired));
}

console.log('== 挥手 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [[NEUTRAL, 0]];
  // 右手举起，横向摆动（幅度 0.06/帧，100ms 一帧）
  const xs = [0.6, 0.66, 0.72, 0.66, 0.6, 0.66, 0.72, 0.66, 0.6];
  for (let i = 0; i < xs.length; i++) {
    seq.push([{ ...NEUTRAL, 15: [0.4, 0.65, 1], 16: [xs[i], 0.4, 1] }, 1000 + i * 100]);
  }
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('摆动反转触发 wave', fired.length === 1 && fired[0][0] === 'wave', JSON.stringify(fired));
}

console.log('== 挥手防误触：举起但不动 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [[NEUTRAL, 0]];
  for (let t = 500; t <= 3000; t += 100) seq.push([{ ...NEUTRAL, 15: [0.4, 0.65, 1], 16: [0.6, 0.4, 1] }, t]);
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('无摆动不触发', fired.length === 0, JSON.stringify(fired));
}

console.log('== 挥手：一趟来回（2 次反转）即触发 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [[NEUTRAL, 0]];
  // 右手举起，只挥一趟：右→左→右（2 次反转，旧阈值 3 会失败）
  const xs = [0.6, 0.72, 0.6, 0.72];
  for (let i = 0; i < xs.length; i++) {
    seq.push([{ ...NEUTRAL, 15: [0.4, 0.65, 1], 16: [xs[i], 0.4, 1] }, 1000 + i * 100]);
  }
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('2 次反转即触发', fired.length === 1 && fired[0][0] === 'wave', JSON.stringify(fired));
}

console.log('== 挥手：另一手略低（0.55，旧逻辑需>0.6）仍可触发 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [[NEUTRAL, 0]];
  // 左腕 0.55：仅比肩低 0.05，旧前提（需 >肩+0.1=0.6）会破坏，新容差（>-0.05）通过
  const xs = [0.6, 0.63, 0.6, 0.63];
  for (let i = 0; i < xs.length; i++) {
    seq.push([{ ...NEUTRAL, 15: [0.48, 0.55, 1], 16: [xs[i], 0.4, 1] }, 1000 + i * 100]);
  }
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('宽松容差下触发', fired.length === 1 && fired[0][0] === 'wave', JSON.stringify(fired));
}

console.log('== 双手上举 ==');
{
  const eng = makeEngine();
  const fired = [];
  const seq = [[NEUTRAL, 0]];
  for (let t = 500; t <= 3000; t += 50) seq.push([HANDS_UP, t]);
  for (const f of frames(seq)) { const g = eng.update(mk(f.pts), f.t); if (g) fired.push([g, f.t]); }
  assert('保持350ms触发 hands_up', fired.length === 1 && fired[0][0] === 'hands_up' && fired[0][1] === 850, JSON.stringify(fired));
}

console.log('== 无目标 ==');
{
  const eng = makeEngine();
  assert('空 landmarks 不触发', eng.update([], 100) === null);
  assert('少于25点不触发', eng.update(mk({ 11: [0.5, 0.5, 1] }), 100) === null);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);

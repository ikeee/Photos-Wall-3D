import type { GestureType } from '../types';

/**
 * 姿态几何判定 + 手势状态机（多手势：T字张臂 / 挥手 / 双手上举）
 *
 * 设计原则（弱机友好）：
 * - 纯几何计算，零分配（无中间对象）
 * - 所有状态在引擎内部维护，按帧推进
 * - 上升沿触发 + 全局冷却 + 姿态需保持（防误触、防连发）
 *
 * MediaPipe Pose 关节点：11 左肩 / 12 右肩 / 15 左腕 / 16 右腕 / 23 左髋 / 24 右髋
 * 坐标：0..1 归一化，Y 向下增大（屏幕坐标系）
 */

const LS = 11, RS = 12, LW = 15, RW = 16, LH = 23, RH = 24;

function dist(a: any, b: any): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** 躯干重心偏移（-1..1），按可见度加权 */
export function getCenterOffset(landmarks: any[]): { x: number; y: number } {
  if (!landmarks || landmarks.length === 0) return { x: 0, y: 0 };
  const indices = [LS, RS, LH, RH];
  let sx = 0, sy = 0, sw = 0;
  for (const i of indices) {
    const lm = landmarks[i];
    if (!lm) continue;
    const w = (lm.visibility ?? 0.5) ** 2; // 可见度加权，弱可见点权重低
    sx += lm.x * w;
    sy += lm.y * w;
    sw += w;
  }
  if (sw === 0) return { x: 0, y: 0 };
  return { x: (sx / sw - 0.5) * 2, y: (sy / sw - 0.5) * 2 };
}

export interface GestureEngineOptions {
  cooldownMs: number; // 全局触发冷却
  focusHoldMs: number; // T 字保持时长
  handsUpHoldMs: number; // 双手上举保持时长
  waveWindowMs: number; // 挥手滑动窗口
  waveMinReversals: number; // 挥手方向反转次数阈值
}

/**
 * 手势状态机。每帧调用 update()，仅在新手势触发（上升沿）时返回手势类型。
 */
export class GestureEngine {
  private lastTriggerAt = Number.NEGATIVE_INFINITY; // 初始无冷却（否则开局 4s 无法触发）
  private lastGesture: Exclude<GestureType, null> | null = null;

  // T 字 / 双手上举：保持计时（需姿态稳定持续才触发）
  private spreadSince = 0;
  private handsUpSince = 0;
  private spreadBrokenSince = 0; // 触发后需先破势才能再触发
  private handsUpBrokenSince = 0;
  private spreadFiredAt = Number.NEGATIVE_INFINITY; // 上次 T 字触发时刻（破势门控）
  private handsUpFiredAt = Number.NEGATIVE_INFINITY;

  // 挥手：滑动窗口轨迹 + 方向反转计数
  private wavePoints: { t: number; x: number }[] = [];
  private waveLastDir = 0;
  private waveReversals = 0;
  private waveBrokenSince = 0;

  // 实时状态（HUD 用）
  private spreadNow = false;
  private handsUpNow = false;

  constructor(private opts: GestureEngineOptions) {}

  isSpreadNow() { return this.spreadNow; }
  isHandsUpNow() { return this.handsUpNow; }
  last() { return this.lastGesture; }

  /** 返回 null（无触发）或新触发的手势 */
  update(landmarks: any[], now: number): GestureType {
    if (!landmarks || landmarks.length < 25) {
      this.resetPoses();
      return null;
    }
    const ls = landmarks[LS], rs = landmarks[RS];
    const lw = landmarks[LW], rw = landmarks[RW];
    if (!ls || !rs || !lw || !rw) {
      this.resetPoses();
      return null;
    }

    const vis = (lm: any) => (lm?.visibility ?? 0) > 0.5;
    const shoulderW = Math.max(dist(ls, rs), 0.001);
    const wristDistX = Math.abs(lw.x - rw.x);

    // ---------- T 字张臂 ----------
    const spread = vis(lw) && vis(rw) &&
      wristDistX > shoulderW * 2.0 &&
      lw.y < ls.y + 0.15 && rw.y < rs.y + 0.15;
    this.spreadNow = spread;

    // ---------- 双手上举（投降式） ----------
    const handsUp = !spread && vis(lw) && vis(rw) &&
      lw.y < ls.y - 0.12 && rw.y < rs.y - 0.12 &&
      Math.abs(lw.x - ls.x) < shoulderW * 1.4 &&
      Math.abs(rw.x - rs.x) < shoulderW * 1.4;
    this.handsUpNow = handsUp;

    // ---------- 挥手（单侧手举起并横向摆动） ----------
    // 挥手的"姿态前提"：一侧手腕抬起，另一侧自然下垂，两臂未张开
    const leftWave = lw.y < ls.y + 0.25 && rw.y > rs.y - 0.05 && !spread && !handsUp && vis(lw);
    const rightWave = rw.y < rs.y + 0.25 && lw.y > ls.y - 0.05 && !spread && !handsUp && vis(rw);
    const waveWrist = leftWave ? lw : rightWave ? rw : null;
    const waveX = waveWrist ? waveWrist.x : 0;

    // 冷却检查（全局）
    const inCooldown = now - this.lastTriggerAt < this.opts.cooldownMs;

    // ---------- T 字触发 ----------
    if (spread) {
      if (this.spreadSince === 0) this.spreadSince = now;
      // 注意：不在此处重置 spreadBrokenSince —— 破势证据需保留到下次触发成功
      if (!inCooldown && this.spreadBrokenSince > this.spreadFiredAt && now - this.spreadSince >= this.opts.focusHoldMs) {
        this.spreadSince = 0;
        this.spreadFiredAt = now;
        return this.fire('arms_spread', now);
      }
    } else {
      this.spreadSince = 0;
      if (this.spreadBrokenSince === 0) this.spreadBrokenSince = now;
    }

    // ---------- 双手上举触发 ----------
    if (handsUp) {
      if (this.handsUpSince === 0) this.handsUpSince = now;
      // 同上：破势证据保留到触发成功
      if (!inCooldown && this.handsUpBrokenSince > this.handsUpFiredAt && now - this.handsUpSince >= this.opts.handsUpHoldMs) {
        this.handsUpSince = 0;
        this.handsUpFiredAt = now;
        return this.fire('hands_up', now);
      }
    } else {
      this.handsUpSince = 0;
      if (this.handsUpBrokenSince === 0) this.handsUpBrokenSince = now;
    }

    // ---------- 挥手触发 ----------
    if (waveWrist) {
      this.waveBrokenSince = 0;
      this.wavePoints.push({ t: now, x: waveX });
      // 裁剪窗口外数据
      const cutoff = now - this.opts.waveWindowMs;
      while (this.wavePoints.length && this.wavePoints[0].t < cutoff) this.wavePoints.shift();

      if (this.wavePoints.length >= 3) {
        const pts = this.wavePoints;
        let reversals = 0;
        let dir = 0;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i - 1].x;
          if (Math.abs(dx) < 0.015) continue; // 过滤抖动（0.02→0.015：小幅挥手也能识别）
          const d = dx > 0 ? 1 : -1;
          if (dir !== 0 && d !== dir) reversals++;
          dir = d;
        }
        this.waveReversals = reversals;
        if (!inCooldown && reversals >= this.opts.waveMinReversals) {
          this.wavePoints.length = 0;
          return this.fire('wave', now);
        }
      }
    } else {
      // 前提暂不满足：不清空轨迹，仅裁剪保留最近 300ms（防一两帧抖动/掉帧打断计数）
      const keep = now - 300;
      while (this.wavePoints.length && this.wavePoints[0].t < keep) this.wavePoints.shift();
      this.waveReversals = 0;
      if (this.waveBrokenSince === 0) this.waveBrokenSince = now;
    }

    return null;
  }

  private fire(g: Exclude<GestureType, null>, now: number): Exclude<GestureType, null> {
    this.lastTriggerAt = now;
    this.lastGesture = g;
    this.spreadSince = 0;
    this.handsUpSince = 0;
    this.wavePoints.length = 0;
    // 触发成功：清除破势证据，下次触发需重新破势
    this.spreadBrokenSince = 0;
    this.handsUpBrokenSince = 0;
    return g;
  }

  private resetPoses() {
    this.spreadSince = 0;
    this.handsUpSince = 0;
    this.wavePoints.length = 0;
    this.spreadNow = false;
    this.handsUpNow = false;
    this.spreadBrokenSince = 0;
    this.handsUpBrokenSince = 0;
  }
}

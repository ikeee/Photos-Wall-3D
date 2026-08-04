import React, { useEffect, useState } from 'react';
import { PoseData } from '../types';

interface DebugHudProps {
  poseRef: React.MutableRefObject<PoseData | null>;
  inferenceMsRef: React.MutableRefObject<number>;
}

/** 性能调试浮层（?debug 开启）：3D FPS + 推理耗时 + 姿态状态 */
const DebugHud: React.FC<DebugHudProps> = ({ poseRef, inferenceMsRef }) => {
  const [fps, setFps] = useState(0);
  const [inf, setInf] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let acc = 0;
    const tick = (t: number) => {
      frames++;
      acc += t - last;
      last = t;
      if (acc >= 500) {
        setFps(Math.round((frames * 1000) / acc));
        frames = 0;
        acc = 0;
      }
      setInf(inferenceMsRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inferenceMsRef]);

  const p = poseRef.current;

  return (
    <div className="absolute top-3 left-3 z-40 bg-black/70 border border-cyan-500/30 rounded-lg px-3 py-2 font-mono text-[10px] text-cyan-300 space-y-1 pointer-events-none">
      <div>3D FPS: <span className="text-white">{fps}</span></div>
      <div>Pose: <span className="text-white">{inf}ms</span></div>
      <div>Target: <span className="text-white">{p && p.score > 0.3 ? `x=${p.x.toFixed(2)} y=${p.y.toFixed(2)}` : 'NONE'}</span></div>
      <div>Spread: <span className="text-white">{p ? String(p.isArmsSpread) : '-'}</span></div>
    </div>
  );
};

export default DebugHud;

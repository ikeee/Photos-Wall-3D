import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei';
import PhotoWall from './components/PhotoWall';
import AdminPanel from './components/AdminPanel';
import DebugHud from './components/DebugHud';
import { PosePipeline } from './utils/posePipeline';
import { GestureEngine, getCenterOffset } from './utils/poseUtils';
import { PhotoItem, PoseData, PoseResult, LayoutMode } from './types';
import { APP_CONFIG } from './utils/config';

// 内置示例照片（后端无照片时兜底；全部本地资源，离线可用）
const SAMPLE_PHOTOS: PhotoItem[] = Array.from({ length: APP_CONFIG.samplePhotoCount }, (_, i) => ({
  id: `sample-${i}`,
  url: `/samples/sample-${i}.jpg`,
}));

const DEBUG_POSE = new URLSearchParams(window.location.search).get('debug') === 'pose';
const DEBUG_POSE_IMG = new URLSearchParams(window.location.search).get('poseImg') || '/debug/person.jpg';
const DEBUG_HUD = new URLSearchParams(window.location.search).has('debug');
const IS_ADMIN = window.location.hash.startsWith('#/admin');

// MediaPipe Pose 标准骨架连线（33 点拓扑）
const POSE_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

const App: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoItem[]>(SAMPLE_PHOTOS);
  const [hudPose, setHudPose] = useState<PoseData | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('sphere');
  const [burstUntil, setBurstUntil] = useState(0);
  const [cameraState, setCameraState] = useState<'init' | 'ready' | 'error'>('init');
  const [cameraError, setCameraError] = useState('');
  const [showInstructions, setShowInstructions] = useState(true);
  const [lastGesture, setLastGesture] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 姿态走 ref：每帧更新不触发 React 重渲染（3D 层零开销跟随）
  const poseRef = useRef<PoseData | null>(null);
  const inferenceMsRef = useRef(0);

  // 稳定引用：回调不因 state 变化而重建，杜绝"管线被反复重建"问题
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const lastHudUpdateRef = useRef(0);
  const focusLockUntilRef = useRef(0);

  const triggerRandomFocus = useCallback(() => {
    const now = Date.now();
    if (focusedIdRef.current || now < focusLockUntilRef.current) return;
    const list = photosRef.current;
    if (list.length === 0) return;
    focusLockUntilRef.current = now + APP_CONFIG.gestureCooldownMs;
    const selected = list[Math.floor(Math.random() * list.length)];
    setFocusedId(selected.id);
    setLastGesture('T-POSE → FOCUS');
    window.setTimeout(() => setFocusedId(null), APP_CONFIG.focusDurationMs);
  }, []);

  // 手势动作映射（经 ref 分发，闭包始终最新）
  const handleGestureRef = useRef<(g: 'arms_spread' | 'wave' | 'hands_up') => void>(() => {});
  handleGestureRef.current = (g) => {
    if (g === 'arms_spread') {
      triggerRandomFocus();
    } else if (g === 'wave') {
      setLayout((prev) => (prev === 'sphere' ? 'cube' : prev === 'cube' ? 'waterfall' : 'sphere'));
      setLastGesture('WAVE → LAYOUT');
    } else if (g === 'hands_up') {
      setBurstUntil(Date.now() + APP_CONFIG.burstDurationMs);
      setLastGesture('HANDS UP → BURST');
    }
  };

  // 骨架 HUD 绘制：摄像头实时画面打底 + 33 点全身骨架（实时监控窗）
  const drawSkeleton = useCallback((landmarks: any[], spread: boolean) => {
    const c = canvasRef.current;
    const v = videoRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width, height } = c;
    // 1. 摄像头实时画面（镜像由 CSS transform 处理）
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      ctx.drawImage(v, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    }
    // 2. 骨架连线 + 关节点
    if (!landmarks || landmarks.length === 0) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = spread ? '#00f2ff' : 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
    }
    ctx.stroke();
    ctx.fillStyle = spread ? '#00f2ff' : 'rgba(255,255,255,0.6)';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, []);

  const gestureEngineRef = useRef(new GestureEngine({
    cooldownMs: APP_CONFIG.gestureCooldownMs,
    focusHoldMs: APP_CONFIG.focusHoldMs,
    handsUpHoldMs: APP_CONFIG.handsUpHoldMs,
    waveWindowMs: APP_CONFIG.waveWindowMs,
    waveMinReversals: APP_CONFIG.waveMinReversals,
  }));

  // 推理结果回调（稳定 ref，管线只初始化一次）
  const onResultRef = useRef<(r: PoseResult) => void>(() => {});
  onResultRef.current = (r) => {
    inferenceMsRef.current = r.inferenceMs;

    if (!r.landmarks || r.landmarks.length === 0) {
      poseRef.current = null;
      // 无人：保留实时画面，清掉骨架
      drawSkeleton([], false);
      return;
    }
    const now = performance.now();
    const engine = gestureEngineRef.current;
    const gesture = engine.update(r.landmarks, now);
    const offset = getCenterOffset(r.landmarks);
    const score = r.landmarks[0]?.visibility ?? 0.5;

    poseRef.current = {
      x: offset.x,
      y: offset.y,
      score,
      isArmsSpread: engine.isSpreadNow(),
    };

    if (gesture) handleGestureRef.current(gesture);

    // HUD setState 节流（5Hz），骨架绘制每次推理都画（~15fps）
    drawSkeleton(r.landmarks, engine.isSpreadNow());
    if (now - lastHudUpdateRef.current >= APP_CONFIG.hudUpdateIntervalMs) {
      lastHudUpdateRef.current = now;
      setHudPose(poseRef.current);
    }
  };

  // 初始化姿态管线（仅一次；StrictMode 已移除避免 dev 双摄像头）
  useEffect(() => {
    if (IS_ADMIN || !videoRef.current) return;
    // 调试钩子：CDP/控制台可读取实时状态（kiosk 运维用）
    if (DEBUG_HUD) {
      (window as any).__PW3D__ = {
        getPose: () => poseRef.current,
        getInferenceMs: () => inferenceMsRef.current,
      };
    }
    const pipeline = new PosePipeline(videoRef.current, {
      onReady: () => setCameraState('ready'),
      onError: (e) => {
        setCameraState('error');
        // 安全上下文提示：getUserMedia 仅 HTTPS/localhost 可用
        const hint = !window.isSecureContext
          ? '（摄像头需 HTTPS 或 localhost：局域网测试请用 https://<IP>:8443/ 并信任自签证书）'
          : '';
        setCameraError(String(e?.message || e || '摄像头不可用') + hint);
      },
      onResult: (r) => onResultRef.current(r),
    });
    pipeline.start(DEBUG_POSE ? DEBUG_POSE_IMG : undefined);
    return () => pipeline.stop();
  }, []);

  // 从后端加载照片（管理员上传的）
  useEffect(() => {
    if (IS_ADMIN) return;
    fetch('/api/photos')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        if (Array.isArray(list) && list.length > 0) {
          setPhotos(list.map((p) => ({ id: p.id, url: p.url, thumb: p.thumb, name: p.name })));
        }
      })
      .catch(() => { /* 后端未启动时静默使用示例照片 */ });
  }, []);

  // 引导页自动消失
  useEffect(() => {
    const t = window.setTimeout(() => setShowInstructions(false), 8000);
    return () => window.clearTimeout(t);
  }, []);

  // ---------- 管理后台 ----------
  if (IS_ADMIN) {
    return <AdminPanel />;
  }

  return (
    <div className="relative w-full h-full bg-[#00050a] overflow-hidden select-none">
      {/* 3D 场景 */}
      <Canvas dpr={APP_CONFIG.dpr}>
        <PerspectiveCamera makeDefault position={[0, 0, 16]} fov={55} />
        <color attach="background" args={['#000810']} />

        <Stars radius={100} depth={50} count={APP_CONFIG.starCount} factor={4} saturation={0.5} fade speed={1.5} />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#00f2ff" />
        <pointLight position={[-10, -10, 20]} intensity={1} color="#ff0055" />

        <PhotoWall
          photos={photos}
          poseRef={poseRef}
          focusedId={focusedId}
          layout={layout}
          burstUntil={burstUntil}
        />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={8}
          maxDistance={30}
          // autoRotate 已移除：无人时由 PhotoWall 自身旋转，避免双重旋转
        />
      </Canvas>

      {/* 传感器 HUD（右下） */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3 z-20">
        {hudPose?.isArmsSpread && (
          <div className="bg-cyan-500 text-black px-4 py-2 font-black text-sm rounded shadow-lg animate-bounce uppercase tracking-widest">
            Capture Triggered!
          </div>
        )}
        <div className="w-72 h-56 bg-black/40 backdrop-blur-md border border-cyan-500/30 rounded-xl overflow-hidden shadow-2xl">
          <video ref={videoRef} className="hidden" style={{ transform: 'scaleX(-1)' }} playsInline muted />
          <canvas ref={canvasRef} className="w-full h-full transform scale-x-[-1] opacity-80" width={640} height={480} />
          {cameraState === 'init' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="flex flex-col items-center gap-2">
                <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Waking Sensors...</span>
              </div>
            </div>
          )}
          {cameraState === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="flex flex-col items-center gap-2 px-3 text-center">
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Camera Error</span>
                <span className="text-[9px] text-white/60 break-all">{cameraError}</span>
                <button
                  className="text-[10px] text-cyan-400 border border-cyan-500/40 rounded px-2 py-0.5 hover:bg-cyan-500/10"
                  onClick={() => window.location.reload()}
                >
                  RETRY
                </button>
              </div>
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${hudPose && hudPose.score > 0.3 ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black text-white/70 tracking-widest uppercase">Motion Matrix</span>
          </div>
          <div className="absolute bottom-1.5 right-2.5 text-[9px] font-mono text-cyan-400/80 tracking-wider">
            {hudPose ? `${(hudPose.score * 100).toFixed(0)}%` : '--'} · {inferenceMsRef.current}ms
          </div>
        </div>
      </div>

      {/* 主标题（左上） */}
      <div className="absolute top-10 left-10 z-10 pointer-events-none">
        <h1 className="text-5xl font-black text-white tracking-tighter flex items-center gap-4">
          PHOTOS WALL <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">3D</span>
        </h1>
        <div className="h-[2px] w-32 bg-gradient-to-r from-cyan-500 to-transparent mt-2" />
        <p className="text-cyan-400/60 mt-4 uppercase tracking-[0.3em] text-[10px] font-bold">Interactive Digital Landmark • Campus Hub</p>
      </div>

      {/* 遥测（左下） */}
      <div className="absolute bottom-10 left-10 flex items-center gap-10 z-10">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">Target Lock</span>
          <span className={`text-lg font-mono tracking-tighter ${hudPose && hudPose.score > 0.3 ? 'text-white' : 'text-white/20'}`}>
            {hudPose && hudPose.score > 0.3 ? 'IDENTIFIED_USER' : 'SCANNING_EMPTY'}
          </span>
        </div>
        <div className="w-[1px] h-10 bg-white/10" />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">Data Nodes</span>
          <span className="text-lg font-mono text-cyan-500">{photos.length} ARCHIVES</span>
        </div>
        <div className="w-[1px] h-10 bg-white/10" />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">Layout / Gesture</span>
          <span className="text-lg font-mono text-cyan-500 uppercase tracking-wider">
            {layout} {lastGesture && <span className="text-cyan-300 text-sm ml-2">{lastGesture}</span>}
          </span>
        </div>
      </div>

      {/* 引导页 */}
      {showInstructions && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#00050a]/80 backdrop-blur-xl pointer-events-none transition-all duration-1000">
          <div className="max-w-xl text-center px-12 py-16 rounded-3xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent shadow-2xl">
            <div className="mb-8 inline-block px-4 py-1 rounded-full border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
              System Interface Active
            </div>
            <h2 className="text-4xl font-black text-white mb-6 tracking-tight">INTERACTIVE MODE</h2>

            <div className="grid grid-cols-3 gap-8 mb-10">
              <div className="space-y-3">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                  <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest">走近</h3>
              </div>
              <div className="space-y-3">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 animate-pulse">
                  <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest">张开双臂</h3>
              </div>
              <div className="space-y-3">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                  <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest">挥手换布局</h3>
              </div>
            </div>

            <p className="text-gray-400 text-sm leading-relaxed font-light max-w-sm mx-auto italic">
              照片墙会围绕你转动。<br />
              <strong className="text-white not-italic">张开双臂</strong> 召唤一张照片特写，
              <strong className="text-white not-italic">挥手</strong> 切换布局，
              <strong className="text-white not-italic">双手上举</strong> 触发脉冲彩蛋。
            </p>
          </div>
        </div>
      )}

      {/* 屏幕特效 */}
      {hudPose?.isArmsSpread && (
        <div className="absolute inset-0 pointer-events-none bg-cyan-500/5 z-0 animate-pulse border-[20px] border-cyan-500/10" />
      )}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />

      {/* 调试 HUD（?debug 开启） */}
      {DEBUG_HUD && <DebugHud poseRef={poseRef} inferenceMsRef={inferenceMsRef} />}
    </div>
  );
};

export default App;

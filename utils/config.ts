/**
 * 全局配置 —— 针对 OrangePi 5 Pro (RK3588S / Mali-G610 / 4GB) 弱机调优参数
 * 所有性能敏感参数集中在此，便于按部署环境微调。
 */

export const APP_CONFIG = {
  // ---------- MediaPipe Pose ----------
  poseModelUrl: '/models/pose_landmarker_lite.task', // lite 模型：弱机首选
  wasmBasePath: '/wasm', // tasks-vision wasm 运行时（本地化）
  delegate: 'CPU' as 'CPU' | 'GPU', // GPU delegate 依赖 WebGL2 compute，老 Chromium + Mali blob 不稳定；CPU 走 WASM SIMD + 多线程
  inferenceIntervalMs: 66, // 推理节流 ~15fps（3D 渲染仍 60fps，姿态用插值平滑）
  inputScale: 0.5, // 摄像头 640x480 -> 推理输入 320x240，省一半预处理+内存带宽
  cameraWidth: 640,
  cameraHeight: 480,
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,

  // ---------- HUD ----------
  hudUpdateIntervalMs: 200, // React setState 节流 5Hz，避免整树每帧重渲染

  // ---------- 3D ----------
  dpr: 1, // 1080p LED 屏：1x 渲染足够，弱机不开超采样
  starCount: 1200, // 原 6000 -> 1200
  particleCount: 240, // 原 500 -> 240
  wallRadius: 10,

  // ---------- 手势 ----------
  gestureCooldownMs: 4000, // 任意手势触发后的全局冷却
  focusHoldMs: 400, // T 字张臂需保持 ~400ms 才触发（防误触）
  handsUpHoldMs: 350, // 双手上举保持时间
  waveWindowMs: 1200, // 挥手判定滑动窗口
  waveMinReversals: 3, // 窗口内方向反转次数阈值
  focusDurationMs: 5000, // 特写持续时长
  burstDurationMs: 2600, // 双手上举彩蛋持续时长

  // ---------- 照片 ----------
  samplePhotoCount: 24, // 内置示例照片数（无后端照片时兜底）
} as const;

/** URL 参数覆盖：?delegate=gpu / ?delegate=cpu */
export function getDelegate(): 'CPU' | 'GPU' {
  const v = new URLSearchParams(window.location.search).get('delegate');
  return v === 'gpu' ? 'GPU' : v === 'cpu' ? 'CPU' : APP_CONFIG.delegate;
}

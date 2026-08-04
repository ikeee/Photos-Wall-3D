import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { APP_CONFIG, getDelegate } from './config';
import type { PoseResult } from '../types';

export interface PosePipelineCallbacks {
  onResult: (r: PoseResult) => void;
  onReady: () => void;
  onError: (e: any) => void;
}

/**
 * MediaPipe tasks-vision 姿态管线封装（新版 API，替代 legacy @mediapipe/pose）
 *
 * 弱机优化点：
 * - 推理输入降采样（640x480 -> 320x240）
 * - 推理节流（默认 ~15fps），渲染循环独立于推理
 * - 可选 GPU delegate（?delegate=gpu），失败自动回退 CPU
 * - 摄像头由本类管理，App 不直接操作 getUserMedia
 */
export class PosePipeline {
  private landmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastInferenceAt = 0;
  private running = false;
  private inputCanvas: HTMLCanvasElement | null = null;
  private inputCtx: CanvasRenderingContext2D | null = null;
  private inputW = 0;
  private inputH = 0;
  /** 调试模式：用静态人物图替代摄像头（?debug=pose），无人在场也能验证整条链路 */
  private debugImage: HTMLImageElement | null = null;

  constructor(
    private video: HTMLVideoElement,
    private cb: PosePipelineCallbacks,
  ) {}

  async start(debugImageUrl?: string) {
    this.running = true;
    try {
      if (debugImageUrl) {
        this.debugImage = await this.loadImage(debugImageUrl);
      } else {        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: APP_CONFIG.cameraWidth },
            height: { ideal: APP_CONFIG.cameraHeight },
            facingMode: 'user',
          },
          audio: false,
        });
        if (!this.running) { stream.getTracks().forEach(t => t.stop()); return; } // start() 期间被 stop()
        this.stream = stream;
        this.video.srcObject = stream;
        await this.video.play();
      }

      const vision = await FilesetResolver.forVisionTasks(APP_CONFIG.wasmBasePath);
      if (!this.running) return;

      // GPU delegate 失败自动回退 CPU
      let delegate: 'CPU' | 'GPU' = getDelegate();
      try {
        this.landmarker = await this.createLandmarker(vision, delegate);
      } catch (e) {
        if (delegate === 'GPU') {
          console.warn('[pose] GPU delegate 失败，回退 CPU:', e);
          delegate = 'CPU';
          this.landmarker = await this.createLandmarker(vision, delegate);
        } else {
          throw e;
        }
      }
      if (!this.running) { this.landmarker?.close(); this.landmarker = null; return; }

      // 推理输入画布
      this.inputW = Math.round(APP_CONFIG.cameraWidth * APP_CONFIG.inputScale);
      this.inputH = Math.round(APP_CONFIG.cameraHeight * APP_CONFIG.inputScale);
      this.inputCanvas = document.createElement('canvas');
      this.inputCanvas.width = this.inputW;
      this.inputCanvas.height = this.inputH;
      this.inputCtx = this.inputCanvas.getContext('2d', { willReadFrequently: true });

      this.cb.onReady();
      this.loop();
    } catch (e) {
      this.running = false;
      this.cb.onError(e);
    }
  }

  private createLandmarker(vision: any, delegate: 'CPU' | 'GPU') {
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: APP_CONFIG.poseModelUrl,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: APP_CONFIG.numPoses,
      minPoseDetectionConfidence: APP_CONFIG.minPoseDetectionConfidence,
      minPosePresenceConfidence: APP_CONFIG.minPosePresenceConfidence,
      minTrackingConfidence: APP_CONFIG.minTrackingConfidence,
    });
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`调试图加载失败: ${url}`));
      img.src = url;
    });
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    if (now - this.lastInferenceAt >= APP_CONFIG.inferenceIntervalMs) {
      this.lastInferenceAt = now;
      this.runInference(now);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private runInference(ts: number) {
    if (!this.landmarker || !this.inputCanvas || !this.inputCtx) return;
    try {
      if (this.debugImage) {
        // 调试：静态图 cover 填充推理画布
        const img = this.debugImage;
        const scale = Math.max(this.inputW / img.width, this.inputH / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        this.inputCtx.drawImage(img, (this.inputW - dw) / 2, (this.inputH - dh) / 2, dw, dh);
      } else {
        if (this.video.readyState < 2 || this.video.videoWidth === 0) return;
        this.inputCtx.drawImage(this.video, 0, 0, this.inputW, this.inputH);
      }
      const t0 = performance.now();
      const res = this.landmarker.detectForVideo(this.inputCanvas, ts);
      const inferenceMs = performance.now() - t0;
      const lms = res?.landmarks?.[0];
      this.cb.onResult({
        landmarks: lms ?? [],
        inferenceMs,
        timestampMs: ts,
      });
    } catch (e) {
      // 单帧失败忽略（如检测器内部异常）
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    try { this.landmarker?.close(); } catch { /* ignore */ }
    this.landmarker = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video.srcObject) {
      this.video.srcObject = null;
    }
  }
}

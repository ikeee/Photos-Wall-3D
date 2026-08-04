export interface PoseData {
  x: number; // 归一化重心 X (-1..1)
  y: number; // 归一化重心 Y (-1..1)
  score: number; // 检测置信度
  isArmsSpread: boolean; // 实时 T 字状态（HUD 用）
}

export type GestureType = 'arms_spread' | 'wave' | 'hands_up' | null;

export interface PhotoItem {
  id: string;
  url: string; // 原图 URL
  thumb?: string; // 缩略图 URL（3D 用，省显存）
  name?: string;
}

export type LayoutMode = 'sphere' | 'helix' | 'plane';

export interface WallConfig {
  layout: LayoutMode;
  spacing: number;
}

/** 单次姿态推理结果（归一化坐标，与视频帧同方向，未镜像） */
export interface PoseResult {
  landmarks: any[]; // MediaPipe pose landmarks (33 点)
  inferenceMs: number; // 本次推理耗时
  timestampMs: number;
}


export interface PoseData {
  x: number; // Normalized center X (-1 to 1)
  y: number; // Normalized center Y (-1 to 1)
  isArmsSpread: boolean;
  score: number;
}

export interface PhotoItem {
  id: string;
  url: string;
}

export interface WallConfig {
  layout: 'sphere' | 'plane' | 'helix';
  spacing: number;
}

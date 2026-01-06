
import { PoseData } from '../types';

/**
 * Calculates if arms are spread wide based on landmark coordinates.
 * Landmarks:
 * 11: left shoulder, 12: right shoulder
 * 15: left wrist, 16: right wrist
 */
export const detectArmsSpread = (landmarks: any[]): boolean => {
  if (!landmarks || landmarks.length < 17) return false;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];

  // Calculate shoulder width as a reference unit for depth/scale normalization
  const shoulderWidth = Math.sqrt(
    Math.pow(leftShoulder.x - rightShoulder.x, 2) +
    Math.pow(leftShoulder.y - rightShoulder.y, 2)
  );

  // Calculate horizontal distance between wrists
  const wristDistanceX = Math.abs(leftWrist.x - rightWrist.x);

  // A 'T' or 'Big' pose usually has wrists much further apart than shoulders.
  // Standard arm span is roughly 3x shoulder width.
  // We use 2.0 as a reliable trigger threshold.
  const isWide = wristDistanceX > shoulderWidth * 2.0;

  // Check if wrists are roughly at shoulder level or higher (T or Big pose)
  // MediaPipe Y coordinate increases downwards (0 is top, 1 is bottom)
  const areWristsElevated = leftWrist.y < (leftShoulder.y + 0.15) && rightWrist.y < (rightShoulder.y + 0.15);

  return isWide && areWristsElevated;
};

export const getCenterOffset = (landmarks: any[]): { x: number; y: number } => {
  if (!landmarks || landmarks.length === 0) return { x: 0, y: 0 };
  
  // Use torso center (shoulders and hips average)
  const relevantIndices = [11, 12, 23, 24];
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  relevantIndices.forEach(idx => {
    if (landmarks[idx]) {
      sumX += landmarks[idx].x;
      sumY += landmarks[idx].y;
      count++;
    }
  });

  if (count === 0) return { x: 0, y: 0 };

  // Convert 0..1 to -1..1
  return {
    x: (sumX / count - 0.5) * 2,
    y: (sumY / count - 0.5) * 2
  };
};

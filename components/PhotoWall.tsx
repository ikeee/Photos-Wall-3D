import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import PhotoCard from './PhotoCard';
import { PoseData, PhotoItem, LayoutMode } from '../types';
import { APP_CONFIG } from '../utils/config';

interface PhotoWallProps {
  photos: PhotoItem[];
  /** pose 通过 ref 传递：姿态每帧更新但不触发 React 重渲染（关键性能优化） */
  poseRef: React.MutableRefObject<PoseData | null>;
  focusedId: string | null;
  layout: LayoutMode;
  /** 双手上举彩蛋的结束时间戳（Date.now()） */
  burstUntil: number;
}

/** 按布局模式计算卡片位置/朝向 */
function computeLayout(photos: PhotoItem[], layout: LayoutMode) {
  const count = photos.length;
  const R = APP_CONFIG.wallRadius;
  const dummy = new THREE.Object3D();

  return photos.map((p, i) => {
    let x: number, y: number, z: number;

    if (layout === 'sphere') {
      // 斐波那契球面均匀分布
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      x = R * Math.cos(theta) * Math.sin(phi);
      y = R * Math.sin(theta) * Math.sin(phi);
      z = R * Math.cos(phi);
    } else if (layout === 'helix') {
      // 螺旋柱
      const t = i / Math.max(count - 1, 1);
      const angle = t * Math.PI * 8;
      const r = R * (0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI)));
      x = r * Math.cos(angle);
      y = (t - 0.5) * R * 1.6;
      z = r * Math.sin(angle);
    } else {
      // plane：网格墙
      const cols = Math.ceil(Math.sqrt(count * 1.4));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const spacing = 2.2;
      x = (col - (cols - 1) / 2) * spacing;
      y = (row - (Math.ceil(count / cols) - 1) / 2) * spacing;
      z = 0;
    }

    dummy.position.set(x, y, z);
    dummy.lookAt(0, 0, 0);

    return {
      id: p.id,
      url: p.thumb || p.url,
      position: [x, y, z] as [number, number, number],
      rotation: [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z] as [number, number, number],
    };
  });
}

const PhotoWall: React.FC<PhotoWallProps> = ({ photos, poseRef, focusedId, layout, burstUntil }) => {
  const wallGroupRef = useRef<THREE.Group>(null);

  const cardData = useMemo(() => computeLayout(photos, layout), [photos, layout]);

  // 粒子数组固定（useMemo）：避免每次渲染重建 Float32Array 导致 GPU 缓冲抖动
  const particles = useMemo(() => {
    const n = APP_CONFIG.particleCount;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = (Math.random() - 0.5) * 50;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const g = wallGroupRef.current;
    if (!g) return;

    const pose = poseRef.current;
    if (pose && pose.score > 0.3) {
      // 镜像摄像头：X 反向；平滑跟随（lerp 系数 delta*3 ~ 60fps 下约 0.05/帧）
      const targetY = -pose.x * 0.5;
      const targetX = pose.y * 0.3;
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, Math.min(delta * 3, 1));
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, Math.min(delta * 3, 1));
    } else {
      // 无人：缓慢自转（OrbitControls 不再 autoRotate，避免双重旋转）
      g.rotation.y += delta * 0.1;
    }
  });

  return (
    <group ref={wallGroupRef}>
      {cardData.map((d) => (
        <PhotoCard
          key={d.id}
          url={d.url}
          position={d.position}
          rotation={d.rotation}
          isFocused={focusedId === d.id}
          burstUntil={burstUntil}
        />
      ))}

      {/* 氛围粒子（固定缓冲） */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.05} color="#00f2ff" transparent opacity={0.4} />
      </points>
    </group>
  );
};

export default PhotoWall;

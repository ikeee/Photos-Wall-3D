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

  // 立方体 6 个面基向量：dir=面法线，u/v=面内坐标轴（2026-08-05 替代螺旋）
  const CUBE_FACES = [
    { dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { dir: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] },
    { dir: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { dir: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ] as const;

  return photos.map((p, i) => {
    let x = 0, y = 0, z = 0;
    let lookAtX = 0, lookAtY = 0, lookAtZ = 0; // 默认朝向中心

    if (layout === 'sphere') {
      // 斐波那契球面均匀分布
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      x = R * Math.cos(theta) * Math.sin(phi);
      y = R * Math.sin(theta) * Math.sin(phi);
      z = R * Math.cos(phi);
    } else if (layout === 'cube') {
      // 立方体：6 个面网格排布，卡片朝外（替代原螺旋）
      const perFace = Math.ceil(count / 6);
      const cols = Math.ceil(Math.sqrt(perFace));
      const rows = Math.ceil(perFace / cols);
      const spacing = 2.6;
      const S = Math.max(cols, rows) * spacing + 2; // 边长随照片数自适应
      const face = Math.min(Math.floor(i / perFace), 5);
      const idx = i % perFace;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const f = CUBE_FACES[face];
      const uOff = (col - (cols - 1) / 2) * spacing;
      const vOff = (row - (rows - 1) / 2) * spacing;
      x = f.dir[0] * S / 2 + f.u[0] * uOff + f.v[0] * vOff;
      y = f.dir[1] * S / 2 + f.u[1] * uOff + f.v[1] * vOff;
      z = f.dir[2] * S / 2 + f.u[2] * uOff + f.v[2] * vOff;
      lookAtX = f.dir[0] * S;
      lookAtY = f.dir[1] * S;
      lookAtZ = f.dir[2] * S;
    } else {
      // waterfall：多列瀑布，卡片面向观察者（替代原平面）
      const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count / 2))));
      const rowGap = 2.2, colGap = 2.8;
      const rows = Math.ceil(count / cols);
      const col = i % cols;
      const row = Math.floor(i / cols);
      // 稳定伪随机（瀑布错落感，不随时间变化）
      const h = Math.sin(i * 127.1 + col * 311.7) * 43758.5453;
      const jitter = h - Math.floor(h);
      x = (col - (cols - 1) / 2) * colGap + (jitter - 0.5) * 0.5;
      y = ((rows - 1) / 2 - row) * rowGap + (jitter - 0.5) * 0.3;
      z = (jitter - 0.5) * 0.8;
      lookAtZ = 10; // 全部面向观察者
    }

    dummy.position.set(x, y, z);
    dummy.lookAt(lookAtX, lookAtY, lookAtZ);

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

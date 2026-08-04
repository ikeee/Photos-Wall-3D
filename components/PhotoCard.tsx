import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Image } from '@react-three/drei';

interface PhotoCardProps {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isFocused: boolean;
  /** 双手上举彩蛋结束时间戳；>0 且未过期时播放脉冲 */
  burstUntil: number;
}

// 模块级临时对象：避免每帧 GC 分配
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _FOCUS_SCALE = new THREE.Vector3(4.5, 4.5, 1);
const _ONE = new THREE.Vector3(1, 1, 1);

const FOCUS_DISTANCE = 7;

const PhotoCard: React.FC<PhotoCardProps> = ({ url, position, rotation, isFocused, burstUntil }) => {
  const meshRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const targetQuat = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), [rotation]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const k = Math.min(delta * 3, 1);

    if (isFocused) {
      // 特写：飞向相机正前方中心
      _v.set(0, 0, -FOCUS_DISTANCE).applyQuaternion(state.camera.quaternion).add(state.camera.position);
      if (mesh.parent) {
        mesh.parent.worldToLocal(_v);
        mesh.position.lerp(_v, Math.min(delta * 7, 1));
        mesh.parent.getWorldQuaternion(_q);
        _q.invert().multiply(state.camera.quaternion);
        mesh.quaternion.slerp(_q, Math.min(delta * 7, 1));
      }
      mesh.scale.lerp(_FOCUS_SCALE, Math.min(delta * 7, 1));
      if (glowRef.current) {
        glowRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 12) * 0.08);
      }
    } else {
      // 回归原位
      mesh.position.lerp(targetPos, k);
      mesh.quaternion.slerp(targetQuat, k);

      if (burstUntil > 0) {
        // 彩蛋脉冲：1.5s 内先放大后收回
        const remain = burstUntil - Date.now();
        if (remain > 0) {
          const t = Math.min(1, 1 - remain / 1500);
          const s = 1 + Math.sin(t * Math.PI) * 0.9;
          _s.set(s, s, 1);
          mesh.scale.lerp(_s, Math.min(delta * 10, 1));
        } else {
          mesh.scale.lerp(_ONE, k);
        }
      } else {
        mesh.scale.lerp(_ONE, k);
      }
    }
  });

  return (
    <group ref={meshRef} renderOrder={isFocused ? 9999 : 0}>
      {/* 边框背板 */}
      <mesh renderOrder={isFocused ? 9999 : 0}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshStandardMaterial
          color={isFocused ? '#050505' : '#222'}
          metalness={1}
          roughness={0}
          emissive={isFocused ? '#00f2ff' : '#000'}
          emissiveIntensity={isFocused ? 1.5 : 0}
          depthTest={!isFocused}
        />
      </mesh>

      {/* 照片 */}
      <Image
        url={url}
        transparent
        side={THREE.DoubleSide}
        toneMapped={false}
        renderOrder={isFocused ? 10000 : 1}
        {...({ depthTest: !isFocused } as any)}
      />

      {/* 特写辉光 + 边框 */}
      {isFocused && (
        <>
          <mesh ref={glowRef} position={[0, 0, -0.05]} renderOrder={9998}>
            <planeGeometry args={[1.3, 1.3]} />
            <meshBasicMaterial color="#00f2ff" transparent opacity={0.4} depthTest={false} />
          </mesh>
          <mesh position={[0, 0, 0.02]} rotation={[0, 0, Math.PI / 4]} renderOrder={10001}>
            <ringGeometry args={[0.72, 0.75, 4]} />
            <meshBasicMaterial color="#00f2ff" depthTest={false} />
          </mesh>
          <mesh position={[0, 0, -0.01]} renderOrder={9999}>
            <planeGeometry args={[1.1, 1.1]} />
            <meshBasicMaterial color="#00f2ff" transparent opacity={0.8} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default PhotoCard;

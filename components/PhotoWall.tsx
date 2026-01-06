
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import PhotoCard from './PhotoCard';
import { PoseData, PhotoItem } from '../types';

interface PhotoWallProps {
  photos: PhotoItem[];
  pose: PoseData | null;
  focusedId: string | null;
}

const PhotoWall: React.FC<PhotoWallProps> = ({ photos, pose, focusedId }) => {
  const wallGroupRef = useRef<THREE.Group>(null);
  
  const cardData = useMemo(() => {
    const count = photos.length;
    const radius = 10;
    
    return photos.map((p, i) => {
      // Spherical distribution
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      
      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(phi);
      
      const pos = new THREE.Vector3(x, y, z);
      
      // Calculate rotation to look at center
      const dummy = new THREE.Object3D();
      dummy.position.copy(pos);
      dummy.lookAt(0, 0, 0);
      
      return {
        ...p,
        position: [x, y, z] as [number, number, number],
        rotation: [dummy.rotation.x, dummy.rotation.y, dummy.rotation.z] as [number, number, number],
      };
    });
  }, [photos]);

  useFrame((state, delta) => {
    if (!wallGroupRef.current) return;

    // Follow Pose Logic
    if (pose && pose.score > 0.3) {
      // Invert X because camera is mirrored
      const targetRotationY = -pose.x * 0.5;
      const targetRotationX = pose.y * 0.3;
      
      wallGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        wallGroupRef.current.rotation.y, 
        targetRotationY, 
        delta * 3
      );
      wallGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        wallGroupRef.current.rotation.x, 
        targetRotationX, 
        delta * 3
      );
    } else {
      // Slow idle rotation
      wallGroupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group ref={wallGroupRef}>
      {cardData.map((data) => (
        <PhotoCard
          key={data.id}
          url={data.url}
          position={data.position}
          rotation={data.rotation}
          isFocused={focusedId === data.id}
        />
      ))}
      
      {/* Ambient particles for "deep tech" feel */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={500}
            array={new Float32Array(Array.from({ length: 1500 }, () => (Math.random() - 0.5) * 50))}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.05} color="#00f2ff" transparent opacity={0.4} />
      </points>
    </group>
  );
};

export default PhotoWall;

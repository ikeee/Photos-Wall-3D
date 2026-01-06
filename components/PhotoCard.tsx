
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Image } from '@react-three/drei';

interface PhotoCardProps {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isFocused: boolean;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ 
  url, 
  position, 
  rotation, 
  isFocused 
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  // Initial target values (relative to wall)
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const targetRot = useMemo(() => new THREE.Euler(...rotation), [rotation]);
  const targetQuat = useMemo(() => new THREE.Quaternion().setFromEuler(targetRot), [targetRot]);
  
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isFocused) {
      // 1. Calculate World Focus Position (exactly in front of camera center)
      // distance 7 is quite close to camera (fov 55)
      const distance = 7; 
      const worldFocusPos = new THREE.Vector3(0, 0, -distance).applyQuaternion(state.camera.quaternion).add(state.camera.position);
      
      // 2. Convert World Position to Parent's Local Space
      if (meshRef.current.parent) {
        const localFocusPos = meshRef.current.parent.worldToLocal(worldFocusPos.clone());
        meshRef.current.position.lerp(localFocusPos, delta * 7);

        // 3. Align rotation with camera (World to Local)
        const parentWorldQuat = new THREE.Quaternion();
        meshRef.current.parent.getWorldQuaternion(parentWorldQuat);
        const localFocusQuat = parentWorldQuat.invert().multiply(state.camera.quaternion);
        
        meshRef.current.quaternion.slerp(localFocusQuat, delta * 7);
      }
      
      // 4. Scale up significantly for "Big" effect
      meshRef.current.scale.lerp(new THREE.Vector3(4.5, 4.5, 1), delta * 7);
      
      // Animate glow pulse
      if (glowRef.current) {
        glowRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 12) * 0.08);
      }
    } else {
      // Smoothly return to original wall layout
      meshRef.current.position.lerp(targetPos, delta * 3);
      meshRef.current.quaternion.slerp(targetQuat, delta * 3);
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 3);
    }
  });

  return (
    <group ref={meshRef} renderOrder={isFocused ? 9999 : 0}>
      {/* Frame / Backplate */}
      <mesh renderOrder={isFocused ? 9999 : 0}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshStandardMaterial 
          color={isFocused ? "#050505" : "#222"} 
          metalness={1} 
          roughness={0} 
          emissive={isFocused ? "#00f2ff" : "#000"}
          emissiveIntensity={isFocused ? 1.5 : 0}
          depthTest={!isFocused} // Disable depth test when focused to stay on top
        />
      </mesh>
      
      {/* The Image */}
      <Image 
        url={url} 
        transparent
        side={THREE.DoubleSide}
        toneMapped={false}
        renderOrder={isFocused ? 10000 : 1}
        depthTest={!isFocused} // Ensure it draws over everything else
      />
      
      {/* Dynamic Glow and Border when focused */}
      {isFocused && (
        <>
          <mesh ref={glowRef} position={[0, 0, -0.05]} renderOrder={9998}>
            <planeGeometry args={[1.3, 1.3]} />
            <meshBasicMaterial 
              color="#00f2ff" 
              transparent 
              opacity={0.4} 
              depthTest={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.02]} renderOrder={10001}>
            <ringGeometry args={[0.72, 0.75, 4]} rotation={[0, 0, Math.PI / 4]} />
            <meshBasicMaterial 
              color="#00f2ff" 
              depthTest={false}
            />
          </mesh>
          {/* Subtle light rays or secondary frame */}
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

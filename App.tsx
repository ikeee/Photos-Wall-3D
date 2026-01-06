
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, Text, Environment } from '@react-three/drei';
import * as mpPose from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import PhotoWall from './components/PhotoWall';
import { PhotoItem, PoseData } from './types';
import { detectArmsSpread, getCenterOffset } from './utils/poseUtils';

// Seeded photos for consistent "school gallery" look
const SAMPLE_PHOTOS: PhotoItem[] = Array.from({ length: 80 }, (_, i) => ({
  id: `photo-${i}`,
  url: `https://picsum.photos/seed/school-${i}/600/800`,
}));

const App: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoItem[]>(SAMPLE_PHOTOS);
  const [pose, setPose] = useState<PoseData | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const lastFocusTime = useRef<number>(0);

  // Trigger focus on a random image
  const triggerRandomFocus = useCallback(() => {
    const now = Date.now();
    // Throttle to prevent multiple rapid triggers during one pose
    if (focusedId || (now - lastFocusTime.current < 5000)) return;

    lastFocusTime.current = now;
    const randomIndex = Math.floor(Math.random() * photos.length);
    const selected = photos[randomIndex];
    setFocusedId(selected.id);

    // Auto-dismiss focused photo after 5 seconds
    setTimeout(() => {
      setFocusedId(null);
    }, 5000);
  }, [photos, focusedId]);

  // Handle MediaPipe results
  const onResults = useCallback((results: any) => {
    if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
      setPose(null);
      return;
    }

    const offset = getCenterOffset(results.poseLandmarks);
    const isArmsSpread = detectArmsSpread(results.poseLandmarks);

    setPose({
      x: offset.x,
      y: offset.y,
      isArmsSpread,
      score: results.poseLandmarks[0]?.visibility ?? 0.5,
    });

    if (isArmsSpread) {
      triggerRandomFocus();
    }
    
    // Minimal feedback drawing
    if (canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const { width, height } = canvasRef.current;
        ctx.clearRect(0, 0, width, height);
        
        // Draw pose skeleton for user feedback
        results.poseLandmarks.forEach((lm: any) => {
          ctx.beginPath();
          ctx.arc(lm.x * width, lm.y * height, 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = isArmsSpread ? '#00f2ff' : '#ffffff88';
          ctx.fill();
        });
      }
    }
  }, [triggerRandomFocus]);

  // Initialize MediaPipe
  useEffect(() => {
    const PoseClass = (mpPose as any).Pose || (mpPose as any).default?.Pose || (mpPose as any).default;
    const CameraClass = (cam as any).Camera || (cam as any).default?.Camera || (cam as any).default;
    
    if (!PoseClass || !CameraClass) {
      console.error("MediaPipe modules failed to load correctly.");
      return;
    }

    const poseInstance = new PoseClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    poseInstance.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6, // Increased for more reliable detection
      minTrackingConfidence: 0.6,   // Increased for more stable tracking
    });

    poseInstance.onResults(onResults);
    poseRef.current = poseInstance;

    let cameraInstance: any = null;

    if (videoRef.current) {
      cameraInstance = new CameraClass(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && poseRef.current) {
            await poseRef.current.send({ image: videoRef.current! });
          }
        },
        width: 640,
        height: 480,
      });
      cameraInstance.start().then(() => setIsCameraReady(true));
    }

    return () => {
      if (poseRef.current) poseRef.current.close();
      if (cameraInstance) cameraInstance.stop?.();
    };
  }, [onResults]);

  // Instructions auto-dismiss
  useEffect(() => {
    const timer = setTimeout(() => setShowInstructions(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full h-full bg-[#00050a] overflow-hidden select-none">
      {/* 3D Scene */}
      <Canvas dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 16]} fov={55} />
        <color attach="background" args={['#000810']} />
        
        <Stars radius={100} depth={50} count={6000} factor={4} saturation={0.5} fade speed={1.5} />
        <Environment preset="night" />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#00f2ff" />
        <pointLight position={[-10, -10, 20]} intensity={1} color="#ff0055" />
        
        <PhotoWall photos={photos} pose={pose} focusedId={focusedId} />
        
        <OrbitControls 
          enablePan={false} 
          enableZoom={true} 
          minDistance={8} 
          maxDistance={30}
          autoRotate={!pose || pose.score < 0.3}
          autoRotateSpeed={0.4}
        />
      </Canvas>

      {/* Sensor HUD (Bottom Right) */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3 z-20">
        {pose?.isArmsSpread && (
          <div className="bg-cyan-500 text-black px-4 py-2 font-black text-sm rounded shadow-lg animate-bounce uppercase tracking-widest">
            Capture Triggered!
          </div>
        )}
        <div className="w-56 h-42 bg-black/40 backdrop-blur-md border border-cyan-500/30 rounded-xl overflow-hidden shadow-2xl">
          <video ref={videoRef} className="hidden" style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={canvasRef} className="w-full h-full transform scale-x-[-1] opacity-80" width={640} height={480} />
          {!isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="flex flex-col items-center gap-2">
                <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Waking Sensors...</span>
              </div>
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${pose && pose.score > 0.3 ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black text-white/70 tracking-widest uppercase">Motion Matrix</span>
          </div>
        </div>
      </div>

      {/* Main UI Header */}
      <div className="absolute top-10 left-10 z-10 pointer-events-none">
        <h1 className="text-5xl font-black text-white tracking-tighter flex items-center gap-4">
          PHOTOS WALL <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">3D</span>
        </h1>
        <div className="h-[2px] w-32 bg-gradient-to-r from-cyan-500 to-transparent mt-2" />
        <p className="text-cyan-400/60 mt-4 uppercase tracking-[0.3em] text-[10px] font-bold">Interactive Digital Landmark • Campus Hub</p>
      </div>

      {/* Telemetry Stats (Bottom Left) */}
      <div className="absolute bottom-10 left-10 flex items-center gap-10 z-10">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">Target Lock</span>
          <span className={`text-lg font-mono tracking-tighter ${pose && pose.score > 0.3 ? 'text-white' : 'text-white/20'}`}>
            {pose && pose.score > 0.3 ? 'IDENTIFIED_USER' : 'SCANNING_EMPTY'}
          </span>
        </div>
        <div className="w-[1px] h-10 bg-white/10" />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">Data Nodes</span>
          <span className="text-lg font-mono text-cyan-500">{photos.length} ARCHIVES</span>
        </div>
      </div>

      {/* Interaction Guide */}
      {showInstructions && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#00050a]/80 backdrop-blur-xl pointer-events-none transition-all duration-1000">
           <div className="max-w-xl text-center px-12 py-16 rounded-3xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent shadow-2xl">
              <div className="mb-8 inline-block px-4 py-1 rounded-full border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                System Interface Active
              </div>
              <h2 className="text-4xl font-black text-white mb-6 tracking-tight">INTERACTIVE MODE</h2>
              
              <div className="grid grid-cols-2 gap-12 mb-12">
                <div className="space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                    <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest">Step Forward</h3>
                </div>
                <div className="space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 animate-pulse">
                    <svg className="w-10 h-10 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xs font-black text-cyan-500 uppercase tracking-widest">Spread Arms</h3>
                </div>
              </div>

              <p className="text-gray-400 text-sm leading-relaxed font-light max-w-sm mx-auto italic">
                The gallery orbits around you. 
                <br />
                <strong className="text-white not-italic">Spread your arms wide</strong> to bring a memory into the light.
              </p>
           </div>
        </div>
      )}

      {/* Screen Effects */}
      {pose?.isArmsSpread && (
        <div className="absolute inset-0 pointer-events-none bg-cyan-500/5 z-0 animate-pulse border-[20px] border-cyan-500/10" />
      )}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]" />
    </div>
  );
};

export default App;

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import ArtworkScene from './ArtworkScene';

interface ArtworkRingProps {
  speed?: number;
  rotation?: { x: number; y: number; z: number };
  position?: { x: number; y: number; z: number };
  cardRotation?: number;
  isTransitioning?: boolean;
  isPostRegistration?: boolean;
}

const ArtworkRing = ({
  speed,
  rotation,
  position,
  cardRotation,
  isTransitioning = false,
  isPostRegistration = false,
}: ArtworkRingProps) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <ArtworkScene 
          speed={speed}
          rotation={rotation}
          position={position}
          cardRotation={cardRotation}
          isTransitioning={isTransitioning}
          isPostRegistration={isPostRegistration}
        />
      </Suspense>
    </Canvas>
  );
};

export default ArtworkRing;

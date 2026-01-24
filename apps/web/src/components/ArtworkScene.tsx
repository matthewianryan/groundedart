import { useRef, useMemo, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import ArtworkPlane from './ArtworkPlane';
import artworks from '../utils/artworkData';

interface ArtworkSceneProps {
  speed?: number;
  rotation?: { x: number; y: number; z: number };
  position?: { x: number; y: number; z: number };
  cardRotation?: number;
  isTransitioning?: boolean;
  isPostRegistration?: boolean;
}

const ArtworkScene = ({
  speed = 0.003,
  rotation = { x: 0, y: 0, z: 0 },
  position = { x: 0, y: 0, z: 0 },
  cardRotation = 0,
  isTransitioning = false,
  isPostRegistration = false,
}: ArtworkSceneProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; startAngle: number } | null>(null);
  const rotationSpeed = useRef(speed);
  const orbitalAngle = useRef(0); // Track orbital angle
  const transitionStartTime = useRef<number | null>(null);
  const transitionProgress = useRef(0);
  const postRegistrationStartTime = useRef<number | null>(null);
  const postRegistrationProgress = useRef(0);

  // Update rotation speed when prop changes
  rotationSpeed.current = speed;

  // Handle transition animation
  if (isTransitioning && transitionStartTime.current === null) {
    transitionStartTime.current = performance.now();
  }
  if (!isTransitioning && transitionStartTime.current !== null && !isPostRegistration) {
    transitionStartTime.current = null;
    transitionProgress.current = 0;
  }

  // Handle post-registration animation
  if (isPostRegistration && postRegistrationStartTime.current === null) {
    postRegistrationStartTime.current = performance.now();
    // Continue from where transition left off
    if (transitionProgress.current < 1) {
      transitionProgress.current = 1;
    }
  }
  if (!isPostRegistration && postRegistrationStartTime.current !== null) {
    postRegistrationStartTime.current = null;
    postRegistrationProgress.current = 0;
  }

  // Calculate base angles for artworks in an elliptical ring
  const baseAngles = useMemo(() => {
    const imageCount = artworks.length;
    return artworks.map((_, i) => (i / imageCount) * Math.PI * 2);
  }, []);

  // Ring dimensions
  const radiusX = 18;
  const radiusY = 10;
  const radiusZ = 8;

  // Animate rotation - tidally locked orbital motion
  useFrame(() => {
    if (groupRef.current && groupRef.current.children) {
      // Calculate transition progress
      if (isTransitioning && transitionStartTime.current !== null && !isPostRegistration) {
        const elapsed = (performance.now() - transitionStartTime.current) / 1000;
        const duration = 1.2; // 1.2 seconds for transition
        transitionProgress.current = Math.min(1, elapsed / duration);
      }

      // Calculate post-registration animation progress
      if (isPostRegistration && postRegistrationStartTime.current !== null) {
        const elapsed = (performance.now() - postRegistrationStartTime.current) / 1000;
        const duration = 2.0; // 2 seconds for post-registration animation
        const rawProgress = Math.min(1, elapsed / duration);
        // Ease-in-out for smooth continuation
        const t = rawProgress;
        postRegistrationProgress.current = t < 0.5 
          ? 4 * t * t * t 
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }

      // Update orbital angle (slow down during transition and post-registration)
      if (!dragStart) {
        const speedMultiplier = (isTransitioning || isPostRegistration) ? 0.1 : 1; // Very slow during animations
        orbitalAngle.current += rotationSpeed.current * speedMultiplier;
      }

      // Apply manual rotation from controls to the orbital angle
      const totalAngle = orbitalAngle.current + rotation.z;

      // Apply group-level transformations with transition animation
      // Group moves down slightly, but individual artworks do most of the dropping
      if (isTransitioning || isPostRegistration) {
        if (isPostRegistration) {
          // Post-registration: Continue scaling and dropping dramatically
          const baseScale = 2.2; // Continue from transition end
          const additionalScale = postRegistrationProgress.current * 2.0; // Scale to 4.2x
          const scale = baseScale + additionalScale;
          groupRef.current.scale.setScalar(scale);
          
          // Continue dropping dramatically
          const baseDrop = 12; // Continue from transition end
          const additionalDrop = postRegistrationProgress.current * 40; // Drop additional 40 units
          const totalDrop = baseDrop + additionalDrop;
          
          // Move back in Z space for depth effect
          const zOffset = postRegistrationProgress.current * 20;
          
          groupRef.current.position.x = position.x;
          groupRef.current.position.y = position.y - totalDrop;
          groupRef.current.position.z = position.z - zOffset;
          
          // Add rotation for dynamic effect
          const rotationAmount = postRegistrationProgress.current * Math.PI * 0.3;
          groupRef.current.rotation.x = rotation.x + rotationAmount * 0.2;
          groupRef.current.rotation.y = rotation.y + rotationAmount;
        } else {
          // Initial transition: Scale up the entire group (more subtle, since individuals also scale)
          const scale = 1 + (transitionProgress.current * 1.2); // Scale from 1 to 2.2
          groupRef.current.scale.setScalar(scale);
          
          // Group moves down slightly, but individual artworks cascade down more dramatically
          const dropDistance = transitionProgress.current * 12; // Reduced group drop
          groupRef.current.position.x = position.x;
          groupRef.current.position.y = position.y - dropDistance;
          groupRef.current.position.z = position.z;
          groupRef.current.rotation.x = rotation.x;
          groupRef.current.rotation.y = rotation.y;
        }
      } else {
        groupRef.current.scale.setScalar(1);
        groupRef.current.position.x = position.x;
        groupRef.current.position.y = position.y;
        groupRef.current.position.z = position.z;
        groupRef.current.rotation.x = rotation.x;
        groupRef.current.rotation.y = rotation.y;
      }

      groupRef.current.rotation.x = rotation.x;
      groupRef.current.rotation.y = rotation.y;

      // Update each artwork's position and rotation to maintain tidally locked orbit
      // Filter to only group objects (artworks - each is now a group containing two meshes)
      const artworkGroups = groupRef.current.children.filter(child => child instanceof THREE.Group);
      artworkGroups.forEach((child, i) => {
        if (i < baseAngles.length && child instanceof THREE.Group) {
          const baseAngle = baseAngles[i];
          const currentAngle = baseAngle + totalAngle;

          // Calculate orbital position
          let x = Math.cos(currentAngle) * radiusX;
          let y = Math.sin(currentAngle) * radiusY;
          let z = Math.cos(currentAngle) * radiusZ - 8;

          // During transition, add staggered drop animation - images drop one by one
          // Continue with post-registration animation
          if (isTransitioning || isPostRegistration) {
            if (isPostRegistration) {
              // Post-registration: Continue dropping with even more dramatic effect
              // Each artwork continues from where it left off and drops further
              const baseScale = 2.8; // Continue from transition end (1 + 1.8)
              const additionalScale = postRegistrationProgress.current * 2.5; // Scale to 5.3x
              const individualScale = baseScale + additionalScale;
              
              // Continue dropping dramatically
              const baseDrop = 12; // Continue from transition end
              const additionalDrop = postRegistrationProgress.current * 25; // Drop additional 25 units
              const individualDrop = baseDrop + additionalDrop;
              
              // Scale individual artwork
              child.scale.setScalar(individualScale);
              
              // Add downward movement - continues the cascade
              y -= individualDrop;
              
              // More dramatic rotation during post-registration
              const dropRotation = (1 + postRegistrationProgress.current) * 0.2 * Math.sin(i * 0.5);
              child.userData.dropRotation = dropRotation;
              
              // Fade out opacity during post-registration
              if (child.children) {
                child.children.forEach((mesh) => {
                  if (mesh instanceof THREE.Mesh && mesh.material) {
                    const opacity = Math.max(0, 1 - (postRegistrationProgress.current * 0.9)); // Fade to 10%
                    if (Array.isArray(mesh.material)) {
                      mesh.material.forEach(mat => {
                        if (mat instanceof THREE.MeshStandardMaterial) {
                          mat.opacity = opacity;
                          mat.transparent = true;
                          mat.needsUpdate = true;
                        }
                      });
                    } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
                      mesh.material.opacity = opacity;
                      mesh.material.transparent = true;
                      mesh.material.needsUpdate = true;
                    }
                  }
                });
              }
            } else {
              // Initial transition: Staggered drop animation - images drop one by one
              const totalStaggerDuration = 1.0; // Increased stagger duration for more visible effect
              const staggerDelay = (i / artworkGroups.length) * totalStaggerDuration;
              
              // Calculate individual progress for this artwork (0 to 1)
              // Only starts animating after its stagger delay
              const elapsed = transitionStartTime.current ? (performance.now() - transitionStartTime.current) / 1000 : 0;
              const individualElapsed = Math.max(0, elapsed - staggerDelay);
              const individualDuration = 1.0; // Duration for each individual drop
              const individualProgress = Math.min(1, individualElapsed / individualDuration);
              
              // Easing function for smooth drop (ease-out cubic for natural falling)
              const easedProgress = 1 - Math.pow(1 - individualProgress, 3);
              
              // Individual scale - starts scaling when it starts dropping
              const individualScale = 1 + (easedProgress * 1.8); // More dramatic scaling
              
              // Individual drop - more dramatic drop per artwork
              // Each artwork drops further down with a cascading effect
              const individualDrop = easedProgress * 12; // Increased drop distance for more visible effect
              
              // Scale individual artwork
              child.scale.setScalar(individualScale);
              
              // Add downward movement with stagger - this creates the "dropping one by one" effect
              y -= individualDrop;
              
              // Add slight rotation during drop for more dynamic effect
              // Store rotation in a way that won't be overridden
              const dropRotation = easedProgress * 0.15 * Math.sin(i * 0.5); // Slight rotation variation
              child.userData.dropRotation = dropRotation;
            }
          } else {
            child.scale.setScalar(1);
            child.userData.dropRotation = 0;
          }

          // Update position relative to group
          child.position.set(x, y, z);

          // Tidally locked: edge always faces the center (0, 0, 0 relative to group)
          // The plane's X axis (width/edge dimension) should point toward center
          // Plane: width along X, height along Z, normal along Y
          
          // Create direction vector from artwork to center
          const direction = new THREE.Vector3(-x, -y, -z).normalize();
          
          // We want the plane's X axis to point in the direction vector
          // After rotating 90° around Z, X axis points in +Y direction
          // We need to rotate so that +Y points in the direction vector
          
          // Calculate rotation to make Y axis point in direction
          // This is the same as making the edge (X after Z rotation) point toward center
          const angleY = Math.atan2(direction.x, direction.z);
          const angleX = Math.asin(-direction.y); // Negative because we want Y to point in direction
          
          // Base rotation: Rotate 90° around Z first to stand plane up, then orient
          // Add card rotation on Y axis only (spinning around vertical axis)
          // Preserve the Z rotation from staggered drop animation
          const dropRotation = (child.userData.dropRotation as number) || 0;
          child.rotation.set(
            angleX, 
            angleY + cardRotation, 
            Math.PI / 2 + dropRotation
          );
        }
      });
    }
  });

  // Mouse drag handler
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    setDragStart({ x: e.clientX, y: e.clientY, startAngle: orbitalAngle.current });
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (dragStart) {
      const deltaX = e.clientX - dragStart.x;
      const sensitivity = 0.01;
      orbitalAngle.current = dragStart.startAngle + deltaX * sensitivity;
    }
  };

  const handlePointerUp = () => {
    setDragStart(null);
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />

      <group
        ref={groupRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {artworks.map((artwork, i) => (
          <ArtworkPlane
            key={artwork.id}
            index={i}
            position={[0, 0, 0]}
            rotation={[0, 0, 0]}
            color={artwork.color}
            frontImage={artwork.frontImage}
            backImage={artwork.backImage}
            imageColor={artwork.imageColor}
            imageText={artwork.imageText}
          />
        ))}
      </group>
    </>
  );
};

export default ArtworkScene;

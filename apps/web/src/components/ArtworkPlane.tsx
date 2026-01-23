import { useState, forwardRef, useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateImageDataUrl } from '../utils/artworkData';

interface ArtworkPlaneProps {
  position: [number, number, number];
  rotation: [number, number, number];
  frontImage?: string;
  backImage?: string;
  imageColor?: string;
  imageText?: string;
  color: string;
  index?: number;
}

const ArtworkPlane = forwardRef<THREE.Group, ArtworkPlaneProps>(
  ({ position, rotation, frontImage, backImage, imageColor, imageText, color, index = 0 }, ref) => {
    const [hovered, setHovered] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const groupRef = useRef<THREE.Group>(null);
    const scaleRef = useRef(0);
    const opacityRef = useRef(0);

    // Generate images if not provided, using color and text
    const frontImageUrl = useMemo(() => {
      if (frontImage) return frontImage;
      if (imageColor && imageText) {
        return generateImageDataUrl(imageColor, imageText, false);
      }
      return null;
    }, [frontImage, imageColor, imageText]);

    const backImageUrl = useMemo(() => {
      if (backImage) return backImage;
      if (imageColor && imageText) {
        return generateImageDataUrl(imageColor, imageText, true);
      }
      return null;
    }, [backImage, imageColor, imageText]);

    // Create textures with loading callbacks
    const frontTexture = useMemo(() => {
      if (!frontImageUrl) return null;
      const loader = new THREE.TextureLoader();
      const texture = loader.load(
        frontImageUrl,
        () => {
          // On load callback
          setIsLoaded(true);
        },
        undefined,
        (error) => {
          console.error('Error loading front image:', error);
        }
      );
      texture.flipY = false;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    }, [frontImageUrl]);

    const backTexture = useMemo(() => {
      if (!backImageUrl) return null;
      const loader = new THREE.TextureLoader();
      const texture = loader.load(backImageUrl);
      texture.flipY = false;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    }, [backImageUrl]);

    // Track when animation should start
    const animationStartTime = useRef<number | null>(null);

    useEffect(() => {
      if (isLoaded && animationStartTime.current === null) {
        // Use a small delay to ensure texture is ready
        setTimeout(() => {
          animationStartTime.current = performance.now();
        }, 50);
      }
    }, [isLoaded]);

    // Animate scale and opacity when loaded
    useFrame(() => {
      if (groupRef.current && isLoaded && animationStartTime.current !== null) {
        const targetScale = hovered ? 1.1 : 1;
        const targetOpacity = 1;
        const delay = index * 0.05; // Stagger animation (50ms per card)
        const animationDuration = 0.8; // Duration in seconds
        
        // Calculate elapsed time since animation started
        const elapsed = (performance.now() - animationStartTime.current) / 1000;
        const startTime = delay;
        const progress = Math.min(1, Math.max(0, (elapsed - startTime) / animationDuration));
        
        if (progress > 0) {
          // Ease out cubic for smooth animation
          const eased = 1 - Math.pow(1 - progress, 3);
          
          // Animate scale from 0 to target
          scaleRef.current = eased * targetScale;
          opacityRef.current = eased * targetOpacity;
          
          groupRef.current.scale.setScalar(scaleRef.current);
          
          // Update material opacity for all meshes
          if (groupRef.current.children) {
            groupRef.current.children.forEach((child) => {
              if (child instanceof THREE.Mesh && child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(mat => {
                    if (mat instanceof THREE.MeshStandardMaterial) {
                      mat.opacity = opacityRef.current;
                      mat.needsUpdate = true;
                    }
                  });
                } else if (child.material instanceof THREE.MeshStandardMaterial) {
                  child.material.opacity = opacityRef.current;
                  child.material.needsUpdate = true;
                }
              }
            });
          }
        }
      }
    });

    const emissiveIntensity = hovered ? 0.2 : 0.05;
    
    // Card dimensions with padding
    const cardWidth = 1.5;
    const cardHeight = 2;
    const padding = 0.15; // Padding size (increased for more visible border)
    const imageWidth = cardWidth - (padding * 2);
    const imageHeight = cardHeight - (padding * 2);

    return (
      <group
        ref={(node) => {
          if (node) {
            groupRef.current = node;
            if (ref) {
              if (typeof ref === 'function') {
                ref(node);
              } else {
                ref.current = node;
              }
            }
          }
        }}
        position={position}
        rotation={rotation}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        scale={0}
      >
        {/* Front side: White background plane */}
        <mesh>
          <planeGeometry args={[cardWidth, cardHeight]} />
          <meshStandardMaterial
            color="#FFFFFF"
            side={THREE.FrontSide}
          />
        </mesh>
        {/* Front side: Image plane (slightly smaller to show white padding) */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[imageWidth, imageHeight]} />
          <meshStandardMaterial
            map={frontTexture}
            side={THREE.FrontSide}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
            transparent={true}
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        
        {/* Back side: White background plane (rotated 180 degrees) */}
        <mesh rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[cardWidth, cardHeight]} />
          <meshStandardMaterial
            color="#FFFFFF"
            side={THREE.FrontSide}
            transparent={true}
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        {/* Back side: Pattern/image plane (slightly smaller to show white padding) */}
        <mesh rotation={[0, Math.PI, 0]} position={[0, 0, 0.01]}>
          <planeGeometry args={[imageWidth, imageHeight]} />
          <meshStandardMaterial
            map={backTexture}
            side={THREE.FrontSide}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
            transparent={true}
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>
    );
  }
);

ArtworkPlane.displayName = 'ArtworkPlane';

export default ArtworkPlane;

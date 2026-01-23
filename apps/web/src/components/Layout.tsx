import { useState, useEffect, useRef, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useScroll, useTransform, motion } from 'framer-motion';
import ThemeProvider from './ThemeProvider';
import ArtworkRing from './ArtworkRing';
import RotationControls from './RotationControls';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

declare global {
  interface Window {
    triggerCarouselAnimation?: () => void;
    triggerPostRegistrationAnimation?: () => void;
  }
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotationSpeed, setRotationSpeed] = useState(0.003);
  const [rotation, setRotation] = useState({ x: -0.6, y: 0.4, z: 0.6 });
  const [position, setPosition] = useState({ x: 3, y: 6.2, z: -11 });
  const [cardRotation, setCardRotation] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPostRegistration, setIsPostRegistration] = useState(false);

  // Scroll-based animations for carousel
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Transform scroll progress to opacity and scale
  // Fade out later: start fading at 40% scroll, fully faded at 70% to avoid cutting off pictures
  const carouselOpacity = useTransform(scrollYProgress, [0, 0.4, 0.7], [1, 0.5, 0]);
  const carouselScale = useTransform(scrollYProgress, [0, 0.4, 0.7], [1, 0.98, 0.9]);
  const carouselY = useTransform(scrollYProgress, [0, 0.7], [0, -30]);
  const carouselBlurValue = useTransform(scrollYProgress, [0, 0.4, 0.7], [0, 2, 8]);
  const carouselBlur = useTransform(carouselBlurValue, (v) => `blur(${v}px)`);

  // Expose animation triggers globally
  useEffect(() => {
    window.triggerCarouselAnimation = () => {
      setIsTransitioning(true);
    };
    window.triggerPostRegistrationAnimation = () => {
      setIsPostRegistration(true);
    };
    return () => {
      delete window.triggerCarouselAnimation;
      delete window.triggerPostRegistrationAnimation;
    };
  }, []);

  // Detect route change to /register and trigger animation
  useEffect(() => {
    if (location.pathname === '/register') {
      setIsTransitioning(true);
      setIsPostRegistration(false);
    } else if (location.pathname === '/map' && isTransitioning) {
      // Continue animation when navigating to map after registration
      setIsPostRegistration(true);
    } else {
      setIsTransitioning(false);
      setIsPostRegistration(false);
    }
  }, [location.pathname, isTransitioning]);

  // Only show 3D background on landing and registration pages
  const show3DBackground = location.pathname === '/' || location.pathname === '/register';
  const isMapRoute = location.pathname === '/map';

  return (
    <ThemeProvider>
      <div ref={containerRef} className={`relative w-full ${isMapRoute ? 'h-screen' : 'min-h-screen'}`}>
        {/* 3D Background - scroll-responsive (only on landing and registration pages) */}
        {show3DBackground && (
          <motion.div
            className="fixed inset-0 z-0 pointer-events-none"
            style={{
              opacity: carouselOpacity,
              scale: carouselScale,
              y: carouselY,
              filter: carouselBlur,
              willChange: 'opacity, transform, filter',
            }}
          >
            <ArtworkRing
              speed={rotationSpeed}
              rotation={rotation}
              position={position}
              cardRotation={cardRotation}
              isTransitioning={isTransitioning}
              isPostRegistration={isPostRegistration}
            />
          </motion.div>
        )}

        {/* Theme Toggle */}
        {show3DBackground && (
          <div className="fixed top-0 right-0 z-50 p-6">
            <ThemeToggle />
          </div>
        )}

        {/* Rotation Controls (only on landing and registration pages) */}
        {show3DBackground && (
          <RotationControls
            rotationSpeed={rotationSpeed}
            onSpeedChange={setRotationSpeed}
            rotation={rotation}
            onRotationChange={setRotation}
            position={position}
            onPositionChange={setPosition}
            cardRotation={cardRotation}
            onCardRotationChange={setCardRotation}
          />
        )}

        {/* Page Content */}
        <main className={`relative z-10 w-full ${isMapRoute ? 'h-full' : ''}`}>{children}</main>
      </div>
    </ThemeProvider>
  );
};

export default Layout;

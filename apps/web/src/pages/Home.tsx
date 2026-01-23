import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { useRef } from 'react';
import artworks, { Artwork } from '../utils/artworkData';

interface ScrollGridSectionProps {
  images: Artwork[];
  title?: string;
  subtitle?: string;
  gridCols: string;
  animationType: 'staggered-drop' | 'center-stagger' | 'rotation-fade' | '3d-transform';
  textItems?: Array<{ title: string; text: string }>;
}

// ScrollGridSection Component with different animation types
const ScrollGridSection = ({
  images,
  title,
  subtitle,
  gridCols,
  animationType,
  textItems = [],
}: ScrollGridSectionProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-200px' });
  useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const getAnimationProps = (index: number, total: number) => {
    const baseDelay = index * 0.05;

    switch (animationType) {
      case 'staggered-drop':
        return {
          initial: {
            opacity: 0,
            y: typeof window !== 'undefined' ? window.innerHeight * 1.5 : 800,
            scale: 0.8,
          },
          animate: isInView
            ? {
                opacity: 1,
                y: 0,
                scale: 1,
              }
            : {
                opacity: 0,
                y: typeof window !== 'undefined' ? window.innerHeight * 1.5 : 800,
                scale: 0.8,
              },
          transition: {
            duration: 0.8,
            delay: baseDelay,
            ease: [0.25, 0.46, 0.45, 0.94],
          },
        };

      case 'center-stagger':
        const centerIndex = Math.floor(total / 2);
        const distanceFromCenter = Math.abs(index - centerIndex);
        return {
          initial: {
            opacity: 0,
            y: typeof window !== 'undefined' ? window.innerHeight : 600,
            rotate: index < centerIndex ? distanceFromCenter * 3 : -distanceFromCenter * 3,
            scale: 0.7,
          },
          animate: isInView
            ? {
                opacity: 1,
                y: 0,
                rotate: 0,
                scale: 1,
              }
            : {
                opacity: 0,
                y: typeof window !== 'undefined' ? window.innerHeight : 600,
                rotate: index < centerIndex ? distanceFromCenter * 3 : -distanceFromCenter * 3,
                scale: 0.7,
              },
          transition: {
            duration: 0.6,
            delay: distanceFromCenter * 0.05,
            ease: [0.34, 1.56, 0.64, 1],
          },
        };

      case 'rotation-fade':
        const randomRotation = (index % 2 === 0 ? 1 : -1) * (15 + (index % 5) * 5);
        return {
          initial: {
            opacity: 0,
            y: typeof window !== 'undefined' ? window.innerHeight : 600,
            rotate: randomRotation,
            scale: 0.7,
          },
          animate: isInView
            ? {
                opacity: 1,
                y: 0,
                rotate: 0,
                scale: 1,
              }
            : {
                opacity: 0,
                y: typeof window !== 'undefined' ? window.innerHeight : 600,
                rotate: randomRotation,
                scale: 0.7,
              },
          transition: {
            duration: 0.7,
            delay: baseDelay,
            ease: [0.25, 0.46, 0.45, 0.94],
          },
        };

      case '3d-transform':
        const viewportCenter = {
          width: typeof window !== 'undefined' ? window.innerWidth / 2 : 960,
          height: typeof window !== 'undefined' ? window.innerHeight / 2 : 540,
        };
        // Simulate element position (in real implementation, you'd calculate this from actual element position)
        const elementX = (index % 9) * 100;
        const elementY = Math.floor(index / 9) * 100;
        const distanceX = elementX - viewportCenter.width;
        const distanceY = elementY - viewportCenter.height;
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        const maxDistance = Math.sqrt(
          viewportCenter.width * viewportCenter.width + viewportCenter.height * viewportCenter.height
        );
        const distanceFactor = Math.min(distance / maxDistance, 1);

        return {
          initial: {
            opacity: 0,
            x: distanceX * 0.3,
            y: distanceY * 0.3,
            z: -2000 * distanceFactor,
            rotateX: (distanceY / viewportCenter.height) * 300 * distanceFactor * 0.5,
            rotateY: -(distanceX / viewportCenter.width) * 300 * distanceFactor,
            scale: 0.4,
          },
          animate: isInView
            ? {
                opacity: 1,
                x: 0,
                y: 0,
                z: 0,
                rotateX: 0,
                rotateY: 0,
                scale: 1,
              }
            : {
                opacity: 0,
                x: distanceX * 0.3,
                y: distanceY * 0.3,
                z: -2000 * distanceFactor,
                rotateX: (distanceY / viewportCenter.height) * 300 * distanceFactor * 0.5,
                rotateY: -(distanceX / viewportCenter.width) * 300 * distanceFactor,
                scale: 0.4,
              },
          transition: {
            duration: 1,
            delay: distanceFactor * 0.1,
            ease: [0.25, 0.46, 0.45, 0.94],
          },
        };

      default:
        return {
          initial: { opacity: 0, y: 50 },
          animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 },
          transition: { duration: 0.5, delay: baseDelay },
        };
    }
  };

  return (
    <section ref={sectionRef} className="relative mb-32 min-h-[100vh] flex items-center justify-center">
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12">
        {/* Title Overlay (if provided) */}
        {title && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 100 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 text-center pointer-events-none"
          >
            <h2 className="text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black uppercase tracking-tight text-white dark:text-white mb-2 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm md:text-base uppercase tracking-widest text-grounded-charcoal dark:text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] font-semibold">
                {subtitle}
              </p>
            )}
          </motion.div>
        )}

        {/* Grid Container */}
        <div
          className={`grid ${gridCols} gap-2 md:gap-4 relative`}
          style={{
            transformStyle: animationType === '3d-transform' ? 'preserve-3d' : 'flat',
            perspective: animationType === '3d-transform' ? '1000px' : 'none',
          }}
        >
          {images.map((artwork, index) => (
            <motion.div
              key={artwork.id}
              {...getAnimationProps(index, images.length)}
              className="relative aspect-[2/3] overflow-hidden rounded-sm group cursor-pointer scroll-grid-img"
              style={{
                transformStyle: animationType === '3d-transform' ? 'preserve-3d' : 'flat',
              }}
            >
              <img
                src={artwork.frontImage}
                alt={artwork.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.div>
          ))}
        </div>

        {/* Text Items Overlay (for center-stagger and rotation-fade) */}
        {textItems.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {textItems.map((item, index) => {
              const positions: Record<string, Array<React.CSSProperties>> = {
                'center-stagger': [
                  { left: '8%', top: '50%', transform: 'translateY(-50%)' },
                  { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' },
                  { right: '8%', top: '50%', transform: 'translateY(-50%)' },
                ],
                'rotation-fade': [
                  { left: '5%', top: '20%' },
                  { right: '5%', top: '20%' },
                ],
              };

              const position = positions[animationType]?.[index];
              if (!position) return null;

              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 100 }}
                  animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 100 }}
                  transition={{ duration: 0.8, delay: 0.3 + index * 0.1 }}
                  className="absolute z-10 p-4 md:p-6 bg-grounded-parchment/90 dark:bg-grounded-charcoal/90 backdrop-blur-sm rounded-lg"
                  style={position}
                >
                  <h4 className="text-xs uppercase tracking-widest mb-2 text-grounded-charcoal/60 dark:text-grounded-parchment/60">
                    {item.title}
                  </h4>
                  <p className="text-sm md:text-base text-grounded-charcoal dark:text-grounded-parchment font-medium">
                    {item.text}
                  </p>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  // Track scroll progress for hero section
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  // Transform scroll progress for hero content fade
  const heroContentOpacity = useTransform(scrollYProgress, [0, 0.3, 0.6], [1, 0.5, 0]);
  const heroContentY = useTransform(scrollYProgress, [0, 0.6], [0, -50]);
  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scrollIndicatorY = useTransform(scrollYProgress, [0, 0.15], [0, 20]);

  const handleTitleClick = () => {
    // Trigger animation callback if available
    if (window.triggerCarouselAnimation) {
      window.triggerCarouselAnimation();
    }
    // Navigate after a short delay to allow animation to start
    setTimeout(() => {
      navigate('/register');
    }, 100);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section with scroll fade */}
      <motion.div
        ref={heroRef}
        className="flex items-center justify-center min-h-[95vh] px-6 relative z-10 hero-gradient"
      >
        <motion.div
          className="text-center w-full max-w-7xl mx-auto"
          style={{
            opacity: heroContentOpacity,
            y: heroContentY,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center space-y-1 md:space-y-2"
          >
            <motion.h1
              onClick={handleTitleClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tight uppercase text-grounded-charcoal dark:text-grounded-parchment leading-[1.1] transition-colors duration-300 cursor-pointer hover:text-grounded-copper dark:hover:text-grounded-copper"
            >
              GROUNDED ART
            </motion.h1>
            <h1
              onClick={handleTitleClick}
              className="text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tight uppercase text-grounded-copper leading-[1.1] transition-colors duration-300 cursor-pointer hover:text-grounded-clay dark:hover:text-grounded-clay"
            >
              COLLECTIONS
            </h1>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator - fades out on scroll */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="absolute bottom-4 md:bottom-6 left-1/2 transform -translate-x-1/2 z-20"
          style={{
            opacity: scrollIndicatorOpacity,
            y: scrollIndicatorY,
          }}
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2 text-grounded-charcoal/60 dark:text-grounded-parchment/60"
          >
            <span className="text-sm uppercase tracking-wide font-semibold">Scroll</span>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Transition Spacer - smooth fade between hero and about */}
      <div className="relative z-10 h-20 md:h-24 transition-gradient"></div>

      {/* About Section - Modern & Interactive */}
      <section id="about" className="relative z-20 py-32 px-6 md:px-12 overflow-hidden bg-grounded-parchment dark:bg-grounded-charcoal">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5 dark:opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, #D97706 1px, transparent 0)`,
              backgroundSize: '40px 40px',
            }}
          ></div>
        </div>

        <div className="max-w-7xl mx-auto relative">
          {/* First Image Grid - Staggered Drop Animation */}
          <ScrollGridSection
            images={artworks.slice(0, 17)}
            title="Rawness"
            subtitle="Captured in every moment"
            gridCols="grid-cols-2 md:grid-cols-4 lg:grid-cols-8"
            animationType="staggered-drop"
          />

          {/* Text Section - Enhanced UI/UX */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="mb-24 md:mb-32"
          >
            <div className="max-w-4xl mx-auto">
              <motion.h4
                className="text-xs uppercase tracking-[0.2em] mb-6 text-grounded-copper dark:text-grounded-copper font-semibold"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                About
              </motion.h4>
              <motion.h2
                className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight mb-8 text-grounded-charcoal dark:text-grounded-parchment leading-tight"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >
                Grounded Art
              </motion.h2>
              <div className="space-y-6">
                <motion.p
                  className="text-lg md:text-xl lg:text-2xl leading-relaxed text-grounded-charcoal/90 dark:text-grounded-parchment/90 font-light"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                >
                  Grounded Art is one of the largest and most significant corporate art collections in the Netherlands,
                  featuring over <span className="font-bold text-grounded-copper">2,500 contemporary artworks</span>.
                </motion.p>
                <motion.p
                  className="text-base md:text-lg lg:text-xl leading-relaxed text-grounded-charcoal/80 dark:text-grounded-parchment/80"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                >
                  Since its inception, our mission has been to support artists, make art accessible, and foster dialogue
                  about the role of art in society.
                </motion.p>
              </div>
            </div>
          </motion.section>

          {/* Second Image Grid - Center Stagger */}
          <ScrollGridSection
            images={artworks.slice(17, 23)}
            gridCols="grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
            animationType="center-stagger"
            textItems={[
              { title: 'Vision', text: 'Unveiling the unseen' },
              { title: 'Focus', text: 'Where color meets form' },
              { title: 'Essence', text: 'Moments in motion' },
            ]}
          />

          {/* Third Image Grid - Rotation & Fade */}
          <ScrollGridSection
            images={artworks.slice(23, 28)}
            gridCols="grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
            animationType="rotation-fade"
            textItems={[
              { title: 'Craft', text: "His craft reveals the quiet beauty in life's fleeting moments." },
              { title: 'Perspective', text: 'His perspective finds depth in stillness, where the unseen speaks.' },
            ]}
          />

          {/* Fourth Image Grid - 3D Transform */}
          <ScrollGridSection
            images={artworks.slice(0, 30)}
            gridCols="grid-cols-3 md:grid-cols-6 lg:grid-cols-9"
            animationType="3d-transform"
          />

          {/* Final Text Section - Enhanced UI/UX */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="mb-24 md:mb-32"
          >
            <div className="max-w-4xl mx-auto">
              <motion.h4
                className="text-xs uppercase tracking-[0.2em] mb-6 text-grounded-copper dark:text-grounded-copper font-semibold"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                Future
              </motion.h4>
              <motion.h2
                className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight mb-8 text-grounded-charcoal dark:text-grounded-parchment leading-tight"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >
                Looking Ahead
              </motion.h2>
              <motion.p
                className="text-lg md:text-xl lg:text-2xl leading-relaxed text-grounded-charcoal/90 dark:text-grounded-parchment/90 font-light"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                We envision our work diving deeper into the exploration of art and culture. We're drawn to the idea of
                capturing moments that feel almost invisible—those fleeting seconds between stillness and motion, light
                and shadow.
              </motion.p>
            </div>
          </motion.section>
        </div>
      </section>
    </div>
  );
};

export default Home;

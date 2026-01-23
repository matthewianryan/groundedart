import { useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  onNavigateToRegister?: () => void;
}

const Header = ({ onNavigateToRegister }: HeaderProps) => {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Trigger animation callback
    if (onNavigateToRegister) {
      onNavigateToRegister();
    }
    // Navigate after a short delay to allow animation to start
    setTimeout(() => {
      navigate('/register');
    }, 100);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-grounded-parchment/90 dark:from-grounded-charcoal/90 to-transparent backdrop-blur-sm transition-colors duration-300">
      <div className="flex items-center justify-between px-6 py-4 md:px-12">
        {/* Logo */}
        <button
          onClick={handleClick}
          className="flex items-center gap-2 text-grounded-charcoal dark:text-grounded-parchment hover:text-grounded-copper dark:hover:text-grounded-copper transition-colors cursor-pointer"
        >
          <span className="text-xl font-black uppercase tracking-wide">GROUNDED ART COLLECTIONS</span>
        </button>

        {/* Right side controls */}
        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;

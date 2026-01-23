import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type RegisterStep = 'entry' | 'signin' | 'signup';
type AccountType = 'artist' | 'user' | null;

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<RegisterStep>('entry'); // 'entry', 'signin', 'signup', 'accountType'
  const [accountType, setAccountType] = useState<AccountType>(null); // 'artist', 'user'
  const [walletAddress, setWalletAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [walletError, setWalletError] = useState('');

  const handleEntrySelection = (option: 'continue' | 'signup' | 'signin') => {
    setError('');
    if (option === 'continue') {
      // Continue without registration - navigate to map
      navigate('/map');
    } else if (option === 'signup') {
      setStep('signup');
      setAccountType(null); // Reset account type
      setWalletAddress(''); // Reset wallet address
    } else if (option === 'signin') {
      setStep('signin');
      setWalletAddress(''); // Reset wallet address
    }
  };

  const validateWalletAddress = (address: string): string => {
    if (!address || address.trim().length === 0) {
      return 'Wallet address is required';
    }
    if (address.length < 10) {
      return 'Wallet address is too short';
    }
    // Basic validation - can be enhanced with actual blockchain address validation
    return '';
  };

  const handleAccountTypeSelection = (type: 'artist' | 'user') => {
    setAccountType(type);
    setWalletError(''); // Clear any previous errors
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setWalletError('');

    const validationError = validateWalletAddress(walletAddress);
    if (validationError) {
      setWalletError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log('Sign up:', { accountType, walletAddress });
      // Trigger post-registration animation
      if (window.triggerPostRegistrationAnimation) {
        window.triggerPostRegistrationAnimation();
      }
      // Navigate after a short delay to allow animation to start
      setTimeout(() => {
        navigate('/map');
      }, 200);
    } catch (err) {
      setError('Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setWalletError('');

    const validationError = validateWalletAddress(walletAddress);
    if (validationError) {
      setWalletError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log('Sign in:', { walletAddress });
      // Trigger post-registration animation
      if (window.triggerPostRegistrationAnimation) {
        window.triggerPostRegistrationAnimation();
      }
      // Navigate after a short delay to allow animation to start
      setTimeout(() => {
        navigate('/map');
      }, 200);
    } catch (err) {
      setError('Failed to sign in. Please check your wallet address and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Entry / Registration Gateway
  if (step === 'entry') {
    return (
      <div className="min-h-screen pt-24 pb-12 px-6 md:px-12 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-5xl w-full"
        >
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-4 text-grounded-charcoal dark:text-grounded-parchment">
              Welcome
            </h1>
            <p className="text-lg md:text-xl text-grounded-charcoal/70 dark:text-grounded-parchment/70 max-w-2xl mx-auto">
              Choose your path to explore Grounded Art
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {/* Sign In Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleEntrySelection('signin')}
              className="card-light dark:card-dark p-8 md:p-10 cursor-pointer transition-all duration-300 group"
            >
              <div className="text-center">
                <motion.div
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-grounded-copper/10 dark:bg-grounded-copper/20 flex items-center justify-center group-hover:bg-grounded-copper/20 dark:group-hover:bg-grounded-copper/30 transition-colors duration-300"
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                >
                  <svg className="w-8 h-8 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                    />
                  </svg>
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                  Sign In
                </h2>
                <p className="text-sm md:text-base text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                  Access your existing account
                </p>
              </div>
            </motion.div>

            {/* Sign Up Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleEntrySelection('signup')}
              className="card-light dark:card-dark p-8 md:p-10 cursor-pointer transition-all duration-300 group"
            >
              <div className="text-center">
                <motion.div
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-grounded-copper/10 dark:bg-grounded-copper/20 flex items-center justify-center group-hover:bg-grounded-copper/20 dark:group-hover:bg-grounded-copper/30 transition-colors duration-300"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                >
                  <svg className="w-8 h-8 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                  Sign Up
                </h2>
                <p className="text-sm md:text-base text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                  Create a new account
                </p>
              </div>
            </motion.div>

            {/* Continue Without Registration Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleEntrySelection('continue')}
              className="card-light dark:card-dark p-8 md:p-10 cursor-pointer transition-all duration-300 group"
            >
              <div className="text-center">
                <motion.div
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-grounded-copper/10 dark:bg-grounded-copper/20 flex items-center justify-center group-hover:bg-grounded-copper/20 dark:group-hover:bg-grounded-copper/30 transition-colors duration-300"
                  whileHover={{ x: 5 }}
                  transition={{ duration: 0.3 }}
                >
                  <svg className="w-8 h-8 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                  Continue
                </h2>
                <p className="text-sm md:text-base text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                  Browse without creating an account
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Sign In Flow
  if (step === 'signin') {
    return (
      <div className="min-h-screen pt-24 pb-12 px-6 md:px-12 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="max-w-xl w-full"
        >
          <motion.button
            onClick={() => setStep('entry')}
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
            className="mb-8 text-grounded-charcoal dark:text-grounded-parchment hover:text-grounded-copper transition-colors flex items-center gap-2 group"
          >
            <svg
              className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </motion.button>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold mb-4 text-grounded-charcoal dark:text-grounded-parchment"
          >
            Sign In
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-grounded-charcoal/70 dark:text-grounded-parchment/70 mb-8"
          >
            Enter your wallet address to access your account
          </motion.p>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSignInSubmit} className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <label
                htmlFor="walletAddress"
                className="block text-sm font-semibold uppercase tracking-wide mb-3 text-grounded-parchment"
              >
                Wallet Address
              </label>
              <input
                type="text"
                id="walletAddress"
                name="walletAddress"
                value={walletAddress}
                onChange={(e) => {
                  setWalletAddress(e.target.value);
                  setWalletError('');
                }}
                onBlur={() => {
                  if (walletAddress) {
                    setWalletError(validateWalletAddress(walletAddress));
                  }
                }}
                required
                className={`w-full px-4 py-3 bg-white dark:bg-grounded-charcoal/80 border rounded-lg focus:outline-none focus:ring-2 text-grounded-charcoal dark:text-grounded-parchment transition-all ${
                  walletError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-grounded-copper/20 dark:border-grounded-copper/30 focus:ring-grounded-copper'
                }`}
                placeholder="0x..."
                disabled={isLoading}
              />
              <AnimatePresence>
                {walletError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 text-sm text-red-600 dark:text-red-400"
                  >
                    {walletError}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: isLoading ? 1 : 1.02 }}
              whileTap={{ scale: isLoading ? 1 : 0.98 }}
              className="btn-tactile-light dark:btn-tactile-dark w-full bg-grounded-copper dark:bg-grounded-copper/90 hover:bg-grounded-clay dark:hover:bg-grounded-copper text-white dark:text-grounded-parchment disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </motion.button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Account Type Selection (Sign Up Flow)
  if (step === 'signup') {
    return (
      <div className="min-h-screen pt-24 pb-12 px-6 md:px-12 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="max-w-4xl w-full"
        >
          <motion.button
            onClick={() => {
              setStep('entry');
              setAccountType(null);
              setWalletAddress('');
            }}
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
            className="mb-8 text-grounded-charcoal dark:text-grounded-parchment hover:text-grounded-copper transition-colors flex items-center gap-2 group"
          >
            <svg
              className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </motion.button>

          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold mb-4 text-grounded-charcoal dark:text-grounded-parchment mb-6"
          >
            Choose Account Type
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-grounded-charcoal/70 dark:text-grounded-parchment/70 mb-12 text-lg"
          >
            Select the account type that best describes you
          </motion.p>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-8">
            {/* Artist Account */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              whileHover={{ scale: 1.03, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAccountTypeSelection('artist')}
              className={`card-light dark:card-dark p-8 md:p-10 cursor-pointer transition-all duration-300 group ${
                accountType === 'artist'
                  ? 'ring-2 ring-grounded-copper ring-offset-2 dark:ring-offset-grounded-charcoal shadow-lg'
                  : ''
              }`}
            >
              <div className="text-center">
                <motion.div
                  className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                    accountType === 'artist'
                      ? 'bg-grounded-copper/20 dark:bg-grounded-copper/30 scale-110'
                      : 'bg-grounded-copper/10 dark:bg-grounded-copper/20 group-hover:bg-grounded-copper/20 dark:group-hover:bg-grounded-copper/30'
                  }`}
                  whileHover={{ rotate: 5 }}
                >
                  <svg className="w-10 h-10 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                  Artist Account
                </h2>
                <p className="text-sm md:text-base text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                  For artists who want to showcase and sell their work
                </p>
              </div>
            </motion.div>

            {/* User Account */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              whileHover={{ scale: 1.03, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAccountTypeSelection('user')}
              className={`card-light dark:card-dark p-8 md:p-10 cursor-pointer transition-all duration-300 group ${
                accountType === 'user'
                  ? 'ring-2 ring-grounded-copper ring-offset-2 dark:ring-offset-grounded-charcoal shadow-lg'
                  : ''
              }`}
            >
              <div className="text-center">
                <motion.div
                  className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                    accountType === 'user'
                      ? 'bg-grounded-copper/20 dark:bg-grounded-copper/30 scale-110'
                      : 'bg-grounded-copper/10 dark:bg-grounded-copper/20 group-hover:bg-grounded-copper/20 dark:group-hover:bg-grounded-copper/30'
                  }`}
                  whileHover={{ rotate: -5 }}
                >
                  <svg className="w-10 h-10 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                  User Account
                </h2>
                <p className="text-sm md:text-base text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                  For collectors and art enthusiasts
                </p>
              </div>
            </motion.div>
          </div>

          <AnimatePresence>
            {accountType && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -20, height: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="mt-8 overflow-hidden"
              >
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                    >
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <form onSubmit={handleSignUpSubmit} className="space-y-6">
                  <div>
                    <label
                      htmlFor="walletAddress"
                      className="block text-sm font-semibold uppercase tracking-wide mb-3 text-grounded-parchment"
                    >
                      Wallet Address
                    </label>
                    <input
                      type="text"
                      id="walletAddress"
                      name="walletAddress"
                      value={walletAddress}
                      onChange={(e) => {
                        setWalletAddress(e.target.value);
                        setWalletError('');
                      }}
                      onBlur={() => {
                        if (walletAddress) {
                          setWalletError(validateWalletAddress(walletAddress));
                        }
                      }}
                      required
                      className={`w-full px-4 py-3 bg-white dark:bg-grounded-charcoal/80 border rounded-lg focus:outline-none focus:ring-2 text-grounded-charcoal dark:text-grounded-parchment transition-all ${
                        walletError
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-grounded-copper/20 dark:border-grounded-copper/30 focus:ring-grounded-copper'
                      }`}
                      placeholder="0x..."
                      disabled={isLoading}
                    />
                    <AnimatePresence>
                      {walletError && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 text-sm text-red-600 dark:text-red-400"
                        >
                          {walletError}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: isLoading ? 1 : 1.02 }}
                    whileTap={{ scale: isLoading ? 1 : 0.98 }}
                    className="btn-tactile-light dark:btn-tactile-dark w-full bg-grounded-copper dark:bg-grounded-copper/90 hover:bg-grounded-clay dark:hover:bg-grounded-copper text-white dark:text-grounded-parchment disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return null; // Should not reach here if steps are handled correctly
};

export default Register;

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RotationControlsProps {
  rotationSpeed: number;
  onSpeedChange: (speed: number) => void;
  rotation: { x: number; y: number; z: number };
  onRotationChange: (rotation: { x: number; y: number; z: number }) => void;
  position: { x: number; y: number; z: number };
  onPositionChange: (position: { x: number; y: number; z: number }) => void;
  cardRotation: number;
  onCardRotationChange: (rotation: number) => void;
}

const RotationControls = ({
  rotationSpeed,
  onSpeedChange,
  rotation,
  onRotationChange,
  position,
  onPositionChange,
  cardRotation,
  onCardRotationChange,
}: RotationControlsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'speed' | 'rotation' | 'position' | 'cardRotation'>('speed');

  const SliderControl = ({
    label,
    value,
    onChange,
    min,
    max,
    step,
  }: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min: number;
    max: number;
    step: number;
  }) => (
    <div className="mb-3">
      <label className="text-[#222222] text-xs mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-rabo-blue font-mono text-xs">{value.toFixed(3)}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rabo-blue"
      />
    </div>
  );

  return (
    <>
      {/* Control Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-gray-100 hover:bg-gray-200 backdrop-blur-sm border border-gray-300 rounded-full flex items-center justify-center transition-all duration-300"
        aria-label="3D controls"
      >
        <svg
          className="w-6 h-6 text-[#222222]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Control Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 right-6 z-50 bg-white/95 backdrop-blur-md border border-gray-300 rounded-lg p-4 min-w-[320px] max-h-[70vh] overflow-y-auto shadow-lg"
          >
            <h3 className="text-[#222222] font-semibold mb-3">3D Controls</h3>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setActiveTab('speed')}
                className={`px-3 py-2 text-xs rounded transition-colors ${
                  activeTab === 'speed'
                    ? 'bg-rabo-blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Speed
              </button>
              <button
                onClick={() => setActiveTab('rotation')}
                className={`px-3 py-2 text-xs rounded transition-colors ${
                  activeTab === 'rotation'
                    ? 'bg-rabo-blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Rotation
              </button>
              <button
                onClick={() => setActiveTab('position')}
                className={`px-3 py-2 text-xs rounded transition-colors ${
                  activeTab === 'position'
                    ? 'bg-rabo-blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Position
              </button>
              <button
                onClick={() => setActiveTab('cardRotation')}
                className={`px-3 py-2 text-xs rounded transition-colors ${
                  activeTab === 'cardRotation'
                    ? 'bg-rabo-blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Card Rotation
              </button>
            </div>

            {/* Speed Tab */}
            {activeTab === 'speed' && (
              <div>
                <SliderControl
                  label="Rotation Speed"
                  value={rotationSpeed}
                  onChange={onSpeedChange}
                  min={-0.01}
                  max={0.01}
                  step={0.0001}
                />
                <div className="flex justify-between text-xs text-gray-600 mb-4">
                  <span>← Reverse</span>
                  <span>Forward →</span>
                </div>

                {/* Preset Buttons */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <button
                    onClick={() => onSpeedChange(0)}
                    className="px-2 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-xs rounded transition-colors"
                  >
                    Stop
                  </button>
                  <button
                    onClick={() => onSpeedChange(0.001)}
                    className="px-2 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-xs rounded transition-colors"
                  >
                    Slow
                  </button>
                  <button
                    onClick={() => onSpeedChange(0.003)}
                    className="px-2 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-xs rounded transition-colors"
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => onSpeedChange(0.006)}
                    className="px-2 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-xs rounded transition-colors"
                  >
                    Fast
                  </button>
                </div>
              </div>
            )}

            {/* Rotation Tab */}
            {activeTab === 'rotation' && (
              <div>
                <SliderControl
                  label="Rotation X (Pitch)"
                  value={rotation.x}
                  onChange={(val) => onRotationChange({ ...rotation, x: val })}
                  min={-Math.PI}
                  max={Math.PI}
                  step={0.01}
                />
                <SliderControl
                  label="Rotation Y (Yaw)"
                  value={rotation.y}
                  onChange={(val) => onRotationChange({ ...rotation, y: val })}
                  min={-Math.PI}
                  max={Math.PI}
                  step={0.01}
                />
                <SliderControl
                  label="Rotation Z (Roll)"
                  value={rotation.z}
                  onChange={(val) => onRotationChange({ ...rotation, z: val })}
                  min={-Math.PI}
                  max={Math.PI}
                  step={0.01}
                />
                <button
                  onClick={() => onRotationChange({ x: 0, y: 0, z: 0 })}
                  className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-sm rounded transition-colors mt-2"
                >
                  Reset Rotation
                </button>
              </div>
            )}

            {/* Position Tab */}
            {activeTab === 'position' && (
              <div>
                <SliderControl
                  label="Position X (Left/Right)"
                  value={position.x}
                  onChange={(val) => onPositionChange({ ...position, x: val })}
                  min={-10}
                  max={10}
                  step={0.1}
                />
                <SliderControl
                  label="Position Y (Up/Down)"
                  value={position.y}
                  onChange={(val) => onPositionChange({ ...position, y: val })}
                  min={-10}
                  max={10}
                  step={0.1}
                />
                <SliderControl
                  label="Position Z (Forward/Back)"
                  value={position.z}
                  onChange={(val) => onPositionChange({ ...position, z: val })}
                  min={-10}
                  max={10}
                  step={0.1}
                />
                <button
                  onClick={() => onPositionChange({ x: 0, y: 0, z: 0 })}
                  className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-sm rounded transition-colors mt-2"
                >
                  Reset Position
                </button>
              </div>
            )}

            {/* Card Rotation Tab */}
            {activeTab === 'cardRotation' && (
              <div>
                <SliderControl
                  label="Card Rotation (Y Axis)"
                  value={cardRotation}
                  onChange={onCardRotationChange}
                  min={-Math.PI}
                  max={Math.PI}
                  step={0.01}
                />
                <button
                  onClick={() => onCardRotationChange(0)}
                  className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#222222] text-sm rounded transition-colors mt-2"
                >
                  Reset Card Rotation
                </button>
              </div>
            )}

            {/* Reset All Button */}
            <button
              onClick={() => {
                onSpeedChange(0.003);
                onRotationChange({ x: -0.8, y: 0.4, z: 0.6 });
                onPositionChange({ x: 3, y: 6.2, z: -10 });
                onCardRotationChange(0);
              }}
              className="w-full px-4 py-2 bg-rabo-blue hover:bg-blue-700 text-white text-sm rounded transition-colors mt-4"
            >
              Reset All to Default
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default RotationControls;

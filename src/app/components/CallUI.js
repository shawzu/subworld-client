'use client'

import { useState, useEffect } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  X,
  Loader,
  PhoneIncoming,
  PhoneOutgoing,
  Activity,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const CallUI = ({
  callState,
  contactName,
  onHangUp,
  onToggleMute,
  onAnswerCall,
  onRejectCall,
  isMuted,
  callDuration,
  isOutgoing,
  connectionAttempts = 0 // New prop to track connection attempts
}) => {
  // UI animations
  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: 50, transition: { duration: 0.2 } }
  }

  // State for network type detection
  const [networkType, setNetworkType] = useState('unknown');
  const [networkQuality, setNetworkQuality] = useState('good'); // 'good', 'moderate', 'poor'

  // Audio visualization state
  const [audioLevel, setAudioLevel] = useState(0)
  
  // Check network type if available
  useEffect(() => {
    if (navigator.connection) {
      // Use Network Information API if available
      const updateConnectionInfo = () => {
        const connection = navigator.connection;
        setNetworkType(connection.type || 'unknown');
        
        // Set quality based on effective type
        if (connection.effectiveType === '2g' || connection.saveData) {
          setNetworkQuality('poor');
        } else if (connection.effectiveType === '3g') {
          setNetworkQuality('moderate');
        } else {
          setNetworkQuality('good');
        }
      };
      
      updateConnectionInfo();
      navigator.connection.addEventListener('change', updateConnectionInfo);
      
      return () => {
        navigator.connection.removeEventListener('change', updateConnectionInfo);
      };
    }
  }, []);
  
  // Simulate audio levels for visualization
  useEffect(() => {
    if (callState === 'connected') {
      const interval = setInterval(() => {
        // Generate random value between 0.2 and 1 to simulate audio activity
        setAudioLevel(0.2 + Math.random() * 0.8)
      }, 200)
      
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [callState])

  // Get call status text with enhanced details
  const getStatusText = () => {
    switch (callState) {
      case 'ringing':
        return isOutgoing ? 'Calling...' : 'Incoming call...';
      case 'connecting':
        return connectionAttempts > 0 
          ? `Connecting... (attempt ${connectionAttempts})` 
          : 'Establishing connection...';
      case 'connected':
        return callDuration;
      case 'ended':
        return 'Call ended';
      default:
        return 'Call';
    }
  }

  // Get network type indicator
  const getNetworkIndicator = () => {
    // Only show for active or connecting calls
    if (callState !== 'connected' && callState !== 'connecting' && callState !== 'ringing') {
      return null;
    }
    
    return (
      <div className="flex items-center space-x-1 px-2 py-1 rounded-full text-xs bg-gray-700/40 ml-2">
        {networkType === 'cellular' ? (
          <div className="flex items-center">
            <Activity size={12} className={
              networkQuality === 'poor' ? 'text-yellow-400' : 
              networkQuality === 'moderate' ? 'text-blue-300' : 
              'text-green-400'
            } />
            <span className="ml-1">Mobile</span>
          </div>
        ) : networkType === 'wifi' ? (
          <div className="flex items-center">
            <Wifi size={12} className="text-green-400" />
            <span className="ml-1">WiFi</span>
          </div>
        ) : (
          <div className="flex items-center">
            <Activity size={12} className="text-blue-400" />
            <span className="ml-1">Connected</span>
          </div>
        )}
      </div>
    );
  };

  // Get connection quality indicator
  const getConnectionQualityIndicator = () => {
    if (callState !== 'connected') return null;
    
    return (
      <div className="flex h-4 space-x-0.5">
        {[0, 1, 2, 3, 4].map((level) => (
          <div 
            key={level}
            className={`w-1 rounded-sm ${
              networkQuality === 'poor' && level > 1 ? 'bg-gray-600' :
              networkQuality === 'moderate' && level > 2 ? 'bg-gray-600' :
              audioLevel > level * 0.2 ? 'bg-blue-400' : 'bg-gray-600'
            }`}
            style={{ 
              height: `${Math.max(4, (level + 1) * 4)}px`,
              transition: 'height 0.1s ease-in-out'
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {callState && (
        <motion.div
          key="call-ui"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-x-0 bottom-20 md:bottom-6 mx-auto max-w-md bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-4 z-50"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                callState === 'connecting' ? 'bg-yellow-500' : 
                callState === 'connected' ? 'bg-green-500' : 
                callState === 'ringing' ? (isOutgoing ? 'bg-blue-500' : 'bg-purple-500') : 
                'bg-red-500'
              }`}>
                {callState === 'connecting' ? (
                  <Loader className="text-white animate-spin" size={20} />
                ) : callState === 'ringing' && isOutgoing ? (
                  <PhoneOutgoing className="text-white" size={20} />
                ) : callState === 'ringing' && !isOutgoing ? (
                  <PhoneIncoming className="text-white" size={20} />
                ) : (
                  <Phone className="text-white" size={20} />
                )}
              </div>
              <div>
                <div className="flex items-center">
                  <h3 className="font-medium text-white">{contactName}</h3>
                  {getNetworkIndicator()}
                </div>
                <div className="flex items-center">
                  <p className="text-sm text-gray-300">
                    {getStatusText()}
                  </p>
                  
                  {/* Show mobile data tip if connecting is taking a while */}
                  {callState === 'connecting' && connectionAttempts > 1 && networkType === 'cellular' && (
                    <div className="ml-2 text-xs text-yellow-400 flex items-center">
                      <AlertCircle size={10} className="mr-1" />
                      WiFi recommended
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audio indicators for connected calls */}
            {callState === 'connected' && (
              <div className="flex space-x-3 items-center">
                {isMuted ? (
                  <MicOff size={18} className="text-red-400" />
                ) : (
                  <Mic size={18} className="text-green-400" />
                )}
                {getConnectionQualityIndicator()}
              </div>
            )}
          </div>

          <div className="flex justify-center space-x-6">
            {/* Connected call buttons */}
            {callState === 'connected' && (
              <>
                <button
                  onClick={onToggleMute}
                  className={`w-12 h-12 rounded-full ${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} flex items-center justify-center text-white transition-colors`}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                  onClick={onHangUp}
                  className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors"
                >
                  <PhoneOff size={20} />
                </button>
              </>
            )}

            {/* Ringing call buttons */}
            {callState === 'ringing' && isOutgoing && (
              <button
                onClick={onHangUp}
                className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors"
              >
                <PhoneOff size={20} />
              </button>
            )}

            {/* Incoming call buttons */}
            {callState === 'ringing' && !isOutgoing && (
              <>
                <button
                  onClick={onRejectCall}
                  className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors"
                >
                  <PhoneOff size={20} />
                </button>
                <button
                  onClick={onAnswerCall}
                  className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white hover:bg-green-700 transition-colors"
                >
                  <Phone size={20} />
                </button>
              </>
            )}

            {/* Connecting call buttons */}
            {callState === 'connecting' && (
              <button
                onClick={onHangUp}
                className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors"
              >
                <PhoneOff size={20} />
              </button>
            )}

            {/* Call ended button */}
            {callState === 'ended' && (
              <button
                onClick={onHangUp}
                className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
          
          {/* Troubleshooting tips for difficult connections */}
          {callState === 'connecting' && connectionAttempts > 2 && (
            <div className="mt-4 text-xs text-gray-400 bg-gray-700/40 p-2 rounded">
              <p className="flex items-center">
                <AlertCircle size={12} className="mr-1 text-yellow-400" />
                <span>Connection taking longer than usual.</span>
              </p>
              <p className="mt-1">Tip: Moving to an area with better reception may help.</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CallUI
'use client'

import { useState, useEffect } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const CallUI = ({
  callState,
  contactName,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  isMuted,
  callDuration
}) => {
  // UI animations
  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: 50, transition: { duration: 0.2 } }
  }

  // Audio visualization state (simplified for this demo)
  const [audioLevel, setAudioLevel] = useState(0)
  
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
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center mr-3">
                <Phone className="text-white" size={20} />
              </div>
              <div>
                <h3 className="font-medium text-white">{contactName}</h3>
                <p className="text-sm text-gray-300">
                  {callState === 'incoming' && 'Incoming call...'}
                  {callState === 'outgoing' && 'Calling...'}
                  {callState === 'connected' && callDuration}
                  {callState === 'ended' && 'Call ended'}
                </p>
              </div>
            </div>

            {/* Audio indicators for connected calls */}
            {callState === 'connected' && (
              <div className="flex space-x-2 items-center">
                {isMuted ? (
                  <MicOff size={18} className="text-red-400" />
                ) : (
                  <Mic size={18} className="text-green-400" />
                )}
                <div className="flex h-4 space-x-0.5">
                  {[0.2, 0.4, 0.6, 0.8, 1].map((level, i) => (
                    <div 
                      key={i}
                      className={`w-1 rounded-sm ${audioLevel >= level ? 'bg-blue-400' : 'bg-gray-600'}`}
                      style={{ 
                        height: `${Math.max(4, level * 16)}px`,
                        transition: 'height 0.1s ease-in-out'
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center space-x-6">
            {/* Incoming call buttons */}
            {callState === 'incoming' && (
              <>
                <button
                  onClick={onDecline}
                  className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white hover:bg-red-700 transition-colors"
                >
                  <PhoneOff size={20} />
                </button>
                <button
                  onClick={onAccept}
                  className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white hover:bg-green-700 transition-colors"
                >
                  <Phone size={20} />
                </button>
              </>
            )}

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

            {/* Outgoing call buttons */}
            {callState === 'outgoing' && (
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

          {/* Incoming call ring animation */}
          {callState === 'incoming' && (
            <div className="absolute -inset-1 bg-blue-500/20 rounded-lg animate-pulse z-[-1]"></div>
          )}

          {/* Outgoing call animation */}
          {callState === 'outgoing' && (
            <div className="absolute inset-0 rounded-lg z-[-1] overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-blue-500/40 animate-ping"></div>
                <div className="w-12 h-12 rounded-full bg-blue-500/60 absolute"></div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CallUI
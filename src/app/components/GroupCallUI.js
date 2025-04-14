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
  Users,
  UserPlus,
  Share,
  Grid,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * GroupCallUI component for handling group call interface
 */
const GroupCallUI = ({
  callState,
  groupName,
  participants = [],
  onHangUp,
  onToggleMute,
  onAnswerCall,
  onRejectCall,
  isMuted,
  callDuration,
  isOutgoing,
  connectionAttempts = 0
}) => {
  // UI animations
  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: 50, transition: { duration: 0.2 } }
  }

  // State for UI mode
  const [expandedView, setExpandedView] = useState(false);
  
  // State for network type detection
  const [networkType, setNetworkType] = useState('unknown');
  const [networkQuality, setNetworkQuality] = useState('good'); // 'good', 'moderate', 'poor'

  // Audio visualization state for each participant
  const [participantAudioLevels, setParticipantAudioLevels] = useState({});
  
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
        // Generate random values for each participant
        const newLevels = {};
        participants.forEach(participant => {
          // Generate random value between 0.2 and 1 to simulate audio activity
          newLevels[participant.id] = 0.2 + Math.random() * 0.8;
        });
        setParticipantAudioLevels(newLevels);
      }, 200);
      
      return () => clearInterval(interval);
    } else {
      setParticipantAudioLevels({});
    }
  }, [callState, participants]);

  // Get call status text with enhanced details
  const getStatusText = () => {
    switch (callState) {
      case 'ringing':
        return isOutgoing ? 'Group call starting...' : 'Incoming group call...';
      case 'connecting':
        return connectionAttempts > 0 
          ? `Connecting group call... (attempt ${connectionAttempts})` 
          : 'Establishing group connections...';
      case 'connected':
        return `${participants.length} participant${participants.length !== 1 ? 's' : ''} • ${callDuration}`;
      case 'ended':
        return 'Group call ended';
      default:
        return 'Group Call';
    }
  }

  // Get network indicator
  const getNetworkIndicator = () => {
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
            <Activity size={12} className="text-green-400" />
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

  // Render participant audio indicator
  const renderParticipantAudio = (participant) => {
    const audioLevel = participantAudioLevels[participant.id] || 0;
    
    return (
      <div className="flex h-4 space-x-0.5">
        {[0, 1, 2, 3, 4].map((level) => (
          <div 
            key={level}
            className={`w-1 rounded-sm ${
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

  // Render group call participants grid
  const renderParticipantsGrid = () => {
    if (callState !== 'connected' || participants.length === 0) {
      return null;
    }
    
    return (
      <div className={`grid ${
        participants.length <= 2 ? 'grid-cols-1' : 
        participants.length <= 4 ? 'grid-cols-2' : 
        'grid-cols-3'
      } gap-2 mt-4 mb-2`}>
        {participants.map(participant => (
          <div key={participant.id} className="bg-gray-700/60 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full ${
                  participant.isActive ? 'bg-green-600/80' : 'bg-gray-500/80'
                } flex items-center justify-center mr-2`}>
                  {participant.name[0].toUpperCase()}
                </div>
                <div className="text-sm font-medium truncate max-w-[120px]">
                  {participant.name}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {participant.isMuted ? (
                  <MicOff size={14} className="text-red-400" />
                ) : (
                  renderParticipantAudio(participant)
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {callState && (
        <motion.div
          key="group-call-ui"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={`fixed ${
            expandedView ? 'inset-0 z-50 bg-gray-900/95' : 'inset-x-0 bottom-20 md:bottom-6 mx-auto max-w-md'
          } bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-4 z-50 transition-all duration-300`}
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
                  <Users className="text-white" size={20} />
                )}
              </div>
              <div>
                <div className="flex items-center">
                  <h3 className="font-medium text-white flex items-center">
                    <span className="mr-1">Group:</span> {groupName}
                  </h3>
                  {getNetworkIndicator()}
                </div>
                <p className="text-sm text-gray-300">
                  {getStatusText()}
                </p>
              </div>
            </div>

            {/* Toggle expanded view button */}
            <button
              onClick={() => setExpandedView(!expandedView)}
              className="p-2 hover:bg-gray-700 rounded-full transition-colors"
            >
              {expandedView ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
          
          {/* Participants grid - only shown when expanded or we have few participants */}
          {(expandedView || participants.length <= 4) && renderParticipantsGrid()}

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
                {expandedView && (
                  <button
                    onClick={() => alert('Invite link copied to clipboard!')}
                    className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
                  >
                    <Share size={20} />
                  </button>
                )}
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
          
          {/* Bottom info text */}
          {expandedView && callState === 'connected' && (
            <div className="mt-4 text-center text-sm text-gray-400">
              Group calls are end-to-end encrypted and use peer-to-peer connections when possible.
            </div>
          )}
          
          {/* Troubleshooting tips for difficult connections */}
          {callState === 'connecting' && connectionAttempts > 2 && (
            <div className="mt-4 text-xs text-gray-400 bg-gray-700/40 p-2 rounded">
              <p className="flex items-center">
                <Activity size={12} className="mr-1 text-yellow-400" />
                <span>Group call connection taking longer than usual.</span>
              </p>
              <p className="mt-1">Tip: Group calls work best on WiFi with good internet connection.</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default GroupCallUI
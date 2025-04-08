'use client'

import { useState, useEffect, useRef } from 'react'
import voiceService from '../../utils/VoiceService'
import contactStore from '../../utils/ContactStore'
import CallUI from './CallUI'

/**
 * CallHandler component manages WebRTC calls and renders the CallUI
 * This component should be included once at the app level
 */
const CallHandler = () => {
  const [callState, setCallState] = useState(null)
  const [contactKey, setContactKey] = useState(null)
  const [contactName, setContactName] = useState('Unknown Contact')
  const [isMuted, setIsMuted] = useState(false)
  const [permissionError, setPermissionError] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  
  // Refs for audio elements
  const remoteAudioRef = useRef(null)
  const localAudioRef = useRef(null)
  
  // Timer ref for call duration
  const durationTimerRef = useRef(null)

  // Set up event listeners when component mounts
  useEffect(() => {
    // Initialize voice service
    voiceService.initialize().catch(error => {
      console.error('Failed to initialize voice service:', error)
      console.log('Error name:', error.name);
      console.log('Error message:', error.message);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionError('Microphone access was denied. Please allow microphone access to make calls.');
      }
    });

    // Start call duration timer when connected
    const startDurationTimer = () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      
      setCallDuration(0);
      durationTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    };
    
    // Clear duration timer
    const clearDurationTimer = () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };

    // Set up call event listener
    const removeListener = voiceService.addCallListener((event, data) => {
      console.log('CallHandler received event:', event, data);

      switch (event) {
        case 'call_state_changed':
          console.log('Call state changed to:', data.state);
          setCallState(data.state)
          setContactKey(data.contact)

          // Start or stop duration timer based on call state
          if (data.state === 'connected') {
            startDurationTimer();
          } else if (data.state === 'ended' || data.state === null) {
            clearDurationTimer();
          }

          // If call has ended, reset after a delay
          if (data.state === 'ended') {
            // Wait for UI to show ended state before fully clearing
            setTimeout(() => {
              if (callState === 'ended') {
                setCallState(null)
                setContactKey(null)
                setCallDuration(0)
              }
            }, 3000)
          } else if (data.state === null) {
            // Immediately clear if explicitly set to null
            setCallState(null)
            setContactKey(null)
            setCallDuration(0)
          }
          break

        case 'mute_changed':
          setIsMuted(data.isMuted)
          break
          
        case 'remote_stream_added':
          // Handle remote audio stream
          if (data.stream && remoteAudioRef.current) {
            console.log('Setting remote stream to audio element');
            remoteAudioRef.current.srcObject = data.stream;
            remoteAudioRef.current.play().catch(err => console.error('Error playing remote audio:', err));
          }
          break
      }
    })

    // Clean up listener when component unmounts
    return () => {
      removeListener()
      clearDurationTimer();

      // End any active call
      if (voiceService.isInCall()) {
        voiceService.endCall()
      }
    }
  }, [callState])

  // Update contact name whenever contact key changes
  useEffect(() => {
    if (contactKey) {
      const contact = contactStore.getContact(contactKey)
      setContactName(contact?.alias || contactKey)
    } else {
      setContactName('Unknown Contact')
    }
  }, [contactKey])

  // Handlers
  const handleAcceptCall = () => {
    voiceService.answerCall()
  }

  const handleDeclineCall = () => {
    voiceService.rejectCall()
  }

  const handleHangUp = () => {
    voiceService.endCall()
  }

  const handleToggleMute = () => {
    setIsMuted(voiceService.toggleMute())
  }
  
  // Format duration as mm:ss
  const formatDuration = seconds => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <>
      {/* Hidden audio elements to handle WebRTC streams */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      <audio ref={localAudioRef} autoPlay playsInline muted style={{ display: 'none' }} />
      
      {/* Permission error notification */}
      {permissionError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50">
          <p>{permissionError}</p>
          <button 
            onClick={() => setPermissionError(null)}
            className="mt-2 bg-white text-red-600 px-3 py-1 rounded hover:bg-gray-100"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Don't render call UI if no call */}
      {callState && (
        <CallUI
          callState={callState}
          contactName={contactName}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
          onHangUp={handleHangUp}
          onToggleMute={handleToggleMute}
          isMuted={isMuted}
          callDuration={formatDuration(callDuration)}
        />
      )}
    </>
  )
}

export default CallHandler
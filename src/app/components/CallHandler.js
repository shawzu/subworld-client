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
  const [contactName, setContactName] = useState('Call')
  const [isMuted, setIsMuted] = useState(false)
  const [permissionError, setPermissionError] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  
  // Refs for audio elements
  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)
  
  // Timer ref for call duration
  const durationTimerRef = useRef(null)

  // Set up event listeners when component mounts
  useEffect(() => {
    console.log('CallHandler component mounted');
    
    // Initialize voice service
    if (!voiceService.initialized) {
      console.log('Initializing voice service from CallHandler');
      voiceService.initialize().catch(error => {
        console.error('Failed to initialize voice service:', error)
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setPermissionError('Microphone access was denied. Please allow microphone access to make calls.');
        }
      });
    } else {
      console.log('Voice service was already initialized');
    }

    // Start call duration timer when connected
    const startDurationTimer = () => {
      console.log("Starting call duration timer");
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
      console.log("Clearing call duration timer");
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
          
          // Set contact name if available
          if (data.contact && contactStore) {
            const contact = contactStore.getContact(data.contact);
            setContactName(contact?.alias || data.contact || 'Call');
          }

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
              // Only reset if we're still in ended state
              setCallState(prevState => {
                if (prevState === 'ended') {
                  return null;
                }
                return prevState;
              });
              setCallDuration(0);
            }, 3000);
          }
          break;

        case 'mute_changed':
          setIsMuted(data.isMuted)
          break;
          
        case 'remote_stream_added':
          // Add remote stream to the audio element
          if (data.stream && remoteAudioRef.current) {
            console.log('Setting remote stream to audio element');
            remoteAudioRef.current.srcObject = data.stream;
            remoteAudioRef.current.play().catch(err => console.error('Error playing remote audio:', err));
          }
          
          // Also attach local stream to local audio element for monitoring
          if (voiceService.localStream && localAudioRef.current) {
            console.log('Setting local stream to audio element');
            localAudioRef.current.srcObject = voiceService.localStream;
            localAudioRef.current.play().catch(err => console.error('Error playing local audio:', err));
          }
          break;
      }
    });

    // Clean up listener when component unmounts
    return () => {
      console.log('CallHandler component unmounting, cleaning up');
      removeListener();
      clearDurationTimer();

      // End any active call
      if (voiceService && voiceService.isInCall && voiceService.isInCall()) {
        console.log('Ending active call on unmount');
        voiceService.endCall();
      }
    };
  }, []);

  // Handlers
  const handleHangUp = () => {
    console.log('User initiated hang up');
    voiceService.endCall();
  };

  const handleToggleMute = () => {
    console.log('User toggled mute');
    setIsMuted(voiceService.toggleMute());
  };
  
  // Format duration as mm:ss
  const formatDuration = seconds => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Debug - simulate audio activity
  useEffect(() => {
    if (callState === 'connected') {
      const simulateAudioInterval = setInterval(() => {
        console.log('Call active, duration:', formatDuration(callDuration));
      }, 5000);
      
      return () => clearInterval(simulateAudioInterval);
    }
  }, [callState, callDuration]);

  return (
    <>
      {/* Hidden audio elements for audio playback */}
      <audio ref={localAudioRef} autoPlay playsInline muted style={{ display: 'none' }} />
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      
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
          onHangUp={handleHangUp}
          onToggleMute={handleToggleMute}
          isMuted={isMuted}
          callDuration={formatDuration(callDuration)}
        />
      )}
    </>
  );
};

export default CallHandler;
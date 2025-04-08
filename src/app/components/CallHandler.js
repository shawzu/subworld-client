'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [callDiagnostics, setCallDiagnostics] = useState(null)
  
  // Refs for audio elements
  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)
  
  // Timer ref for call duration
  const durationTimerRef = useRef(null)
  // Diagnostic timer
  const diagnosticTimerRef = useRef(null)

  // Set up event listeners when component mounts
  useEffect(() => {
    console.log('CallHandler component mounted');
    
    // Initialize voice service - defer to window load
    const initVoiceService = () => {
      if (typeof window === 'undefined') return;
      
      // Check if voice service is available globally
      if (!window.voiceService) {
        console.log('Voice service not available yet, trying to load dynamically');
        
        // Try to import the voice service module
        import('../../utils/VoiceService').then(module => {
          window.voiceService = module.default;
          console.log('Voice service loaded dynamically');
          
          if (!window.voiceService.initialized) {
            console.log('Initializing voice service from CallHandler');
            window.voiceService.initialize().catch(error => {
              console.error('Failed to initialize voice service:', error);
              handlePermissionError(error);
            });
          }
          
          // Set up event listeners after dynamic import
          setupEventListeners();
        }).catch(error => {
          console.error('Failed to load voice service dynamically:', error);
        });
      } else {
        console.log('Voice service exists globally');
        
        // Initialize if needed
        if (!window.voiceService.initialized) {
          console.log('Initializing existing voice service');
          window.voiceService.initialize().catch(error => {
            console.error('Failed to initialize voice service:', error);
            handlePermissionError(error);
          });
        }
        
        // Set up event listeners for existing voice service
        setupEventListeners();
      }
    };
    
    // Handle microphone permission errors
    const handlePermissionError = (error) => {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionError('Microphone access was denied. Please allow microphone access to make calls.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionError('No microphone found. Please connect a microphone and try again.');
      } else {
        setPermissionError(`Audio error: ${error.message || 'Unknown error'}`);
      }
    };
    
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
    
    // Start diagnostic timer for debugging connection issues
    const startDiagnosticTimer = () => {
      if (diagnosticTimerRef.current) {
        clearInterval(diagnosticTimerRef.current);
      }
      
      diagnosticTimerRef.current = setInterval(() => {
        if (window.voiceService && window.voiceService.getDiagnosticInfo) {
          const info = window.voiceService.getDiagnosticInfo();
          setCallDiagnostics(info);
          
          // Log every 10 seconds for debugging
          console.log('Call diagnostic info:', info);
        }
      }, 10000); // Every 10 seconds
    };
    
    // Clear timers
    const clearTimers = () => {
      console.log("Clearing call timers");
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      
      if (diagnosticTimerRef.current) {
        clearInterval(diagnosticTimerRef.current);
        diagnosticTimerRef.current = null;
      }
    };

    // Set up call event listeners
    const setupEventListeners = () => {
      if (!window.voiceService) return null;
      
      console.log('Setting up call event listeners');
      
      const removeListener = window.voiceService.addCallListener((event, data) => {
        console.log('CallHandler received event:', event, data);

        switch (event) {
          case 'call_state_changed':
            console.log('Call state changed to:', data.state);
            setCallState(data.state);
            
            // Set contact name if available
            if (data.contact && contactStore) {
              const contact = contactStore.getContact(data.contact);
              setContactName(contact?.alias || data.contact || 'Call');
            }

            // Start or stop timers based on call state
            if (data.state === 'connected') {
              startDurationTimer();
              startDiagnosticTimer();
            } else if (data.state === 'ended' || data.state === null) {
              clearTimers();
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
                setCallDiagnostics(null);
              }, 3000);
            }
            break;

          case 'mute_changed':
            setIsMuted(data.isMuted);
            break;
            
          case 'remote_stream_added':
            // Add remote stream to the audio element
            if (data.stream && remoteAudioRef.current) {
              console.log('Setting remote stream to audio element');
              remoteAudioRef.current.srcObject = data.stream;
              
              // Play with user interaction handling
              const playPromise = remoteAudioRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch(err => {
                  console.error('Error playing remote audio:', err);
                  // Try to play again on next user interaction
                  document.addEventListener('click', function playOnClick() {
                    remoteAudioRef.current.play();
                    document.removeEventListener('click', playOnClick);
                  });
                });
              }
            }
            
            // Also attach local stream to local audio element for monitoring
            if (window.voiceService.localStream && localAudioRef.current) {
              console.log('Setting local stream to audio element');
              localAudioRef.current.srcObject = window.voiceService.localStream;
              localAudioRef.current.play().catch(err => console.error('Error playing local audio:', err));
            }
            break;
        }
      });

      return removeListener;
    };

    // Initialize voice service
    initVoiceService();
    
    // Set up a listener for possible autoplay issues
    const handleUserInteraction = () => {
      // Try to play audio again on user interaction
      if (remoteAudioRef.current && remoteAudioRef.current.paused && remoteAudioRef.current.srcObject) {
        console.log('User interaction detected, trying to play audio');
        remoteAudioRef.current.play().catch(err => console.error('Still could not play audio:', err));
      }
      
      // Also try local audio
      if (localAudioRef.current && localAudioRef.current.paused && localAudioRef.current.srcObject) {
        localAudioRef.current.play().catch(err => console.error('Could not play local audio:', err));
      }
    };
    
    // Add interaction listener
    document.addEventListener('click', handleUserInteraction);

    // Clean up when component unmounts
    return () => {
      console.log('CallHandler component unmounting, cleaning up');
      
      // Clean up event listeners
      const removeListener = setupEventListeners();
      if (removeListener) removeListener();
      
      // Clear all timers
      clearTimers();
      
      // Remove document listeners
      document.removeEventListener('click', handleUserInteraction);

      // End any active call
      if (window.voiceService && window.voiceService.isInCall && window.voiceService.isInCall()) {
        console.log('Ending active call on unmount');
        window.voiceService.endCall();
      }
    };
  }, []);

  // Format duration as mm:ss
  const formatDuration = seconds => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Handlers
  const handleHangUp = () => {
    console.log('User initiated hang up');
    if (window.voiceService) {
      window.voiceService.endCall();
    }
  };

  const handleToggleMute = () => {
    console.log('User toggled mute');
    if (window.voiceService) {
      setIsMuted(window.voiceService.toggleMute());
    }
  };

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
      
      {/* Connection diagnostics panel - only in development */}
      {process.env.NODE_ENV !== 'production' && callState === 'connecting' && callDiagnostics && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-xs text-gray-300 p-3 rounded shadow-lg z-40 max-w-xs">
          <p className="text-yellow-400 font-bold mb-1">Call Debug Info:</p>
          <p>State: {callDiagnostics.callState}</p>
          {callDiagnostics.iceConnectionState && (
            <p>ICE: {callDiagnostics.iceConnectionState}</p>
          )}
          {callDiagnostics.peerConnected !== undefined && (
            <p>Connected: {callDiagnostics.peerConnected ? 'Yes' : 'No'}</p>
          )}
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
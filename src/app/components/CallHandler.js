'use client'

import { useState, useEffect, useRef } from 'react'
import callService from '../../utils/CallService'
import contactStore from '../../utils/ContactStore'
import CallUI from './CallUI'

/**
 * CallHandler component manages calls and renders the CallUI
 * This component should be included once at the app level
 */
const CallHandler = () => {
  const [callState, setCallState] = useState(null)
  const [contactKey, setContactKey] = useState(null)
  const [contactName, setContactName] = useState('Unknown Contact')
  const [isMuted, setIsMuted] = useState(false)

  // Audio refs
  const localAudioRef = useRef(null)
  const remoteAudioRef = useRef(null)

  // Set up event listeners when component mounts
  useEffect(() => {
    // Initialize call service
    callService.initialize().catch(error => {
      console.error('Failed to initialize call service:', error)
    })

    // Set up call event listener with enhanced state handling
    const removeListener = callService.addCallListener((event, data) => {
      console.log('CallHandler received event:', event, data);

      switch (event) {
        case 'call_state_changed':
          console.log('Call state changed to:', data.state);
          setCallState(data.state)
          setContactKey(data.contact)

          // If call has ended, reset after a delay
          if (data.state === 'ended') {
            // Wait for UI to show ended state before fully clearing
            setTimeout(() => {
              if (callState === 'ended') {
                setCallState(null)
                setContactKey(null)
              }
            }, 3000)
          } else if (data.state === null) {
            // Immediately clear if explicitly set to null
            setCallState(null)
            setContactKey(null)
          }
          break

        case 'mute_changed':
          setIsMuted(data.isMuted)
          break

        case 'remote_stream_received':
          console.log('Remote stream received, applying to audio element');
          if (remoteAudioRef.current && data.stream) {
            remoteAudioRef.current.srcObject = data.stream
            // Ensure it plays with autoplay issues on some browsers
            remoteAudioRef.current.play().catch(err => {
              console.warn('Error playing remote audio:', err)
            })
          }
          break

        case 'call_rejected':
          // Handle rejected calls
          console.log('Call rejected, reason:', data.reason);
          break

        case 'connection_state_changed':
          console.log('WebRTC connection state changed:', data.state);
          // If connected, make sure UI shows connected state
          if (data.state === 'connected' && callState !== 'connected') {
            console.log('WebRTC reports connected, updating UI state');
            setCallState('connected');
          }
          break;
      }
    })

    // Clean up listener when component unmounts
    return () => {
      removeListener()

      // End any active call
      if (callService.isInCall()) {
        callService.endCall()
      }
    }
  }, [])

  useEffect(() => {
    // This effect handles call state inconsistencies
    if (!callState) return;

    // If call is in outgoing state for more than 15 seconds, check WebRTC state
    if (callState === 'outgoing') {
      const checkTimeout = setTimeout(() => {
        console.log('Checking for call state inconsistencies...');

        if (!window.callService) return;

        // Check actual WebRTC connection state
        const connection = window.callService.webRTCService?.peerConnection;
        if (connection) {
          // Log current states for debugging
          console.log('CallUI states check:');
          console.log('- UI state:', callState);
          console.log('- WebRTC connection state:', connection.connectionState);
          console.log('- WebRTC ICE state:', connection.iceConnectionState);

          // If actual connection is established but UI doesn't show it
          if (
            connection.connectionState === 'connected' ||
            connection.iceConnectionState === 'connected' ||
            connection.iceConnectionState === 'completed'
          ) {
            console.log('⚠️ UI STATE MISMATCH: Forcing UI update to connected state');
            // Force UI to show connected state
            setCallState('connected');
          }
        }
      }, 15000); // Check after 15 seconds of outgoing state

      return () => clearTimeout(checkTimeout);
    }
  }, [callState]);

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
    callService.answerCall()
  }

  const handleDeclineCall = () => {
    callService.rejectCall()
  }

  const handleHangUp = () => {
    callService.endCall()
  }

  const handleToggleMute = () => {
    setIsMuted(callService.toggleMute())
  }

  const handleForceConnected = () => {
    if (callState === 'outgoing') {
      console.log('Manually forcing call state to connected');
      setCallState('connected');

      // Also try to force the call service to update its state
      if (window.callService && window.callService.forceStateSync) {
        window.callService.forceStateSync();
      }
    }
  };

  // Don't render anything if no call
  if (!callState) return null

  return (
    <CallUI
      callState={callState}
      contactName={contactName}
      onAccept={handleAcceptCall}
      onDecline={handleDeclineCall}
      onHangUp={handleHangUp}
      onToggleMute={handleToggleMute}
      onForceConnected={handleForceConnected}
      isMuted={isMuted}
      localAudioRef={localAudioRef}
      remoteAudioRef={remoteAudioRef}
    />
  )
}

export default CallHandler
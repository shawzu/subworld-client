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
    
    // Set up call event listener
    const removeListener = callService.addCallListener((event, data) => {
      switch (event) {
        case 'call_state_changed':
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
          break
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
      isMuted={isMuted}
      localAudioRef={localAudioRef}
      remoteAudioRef={remoteAudioRef}
    />
  )
}

export default CallHandler
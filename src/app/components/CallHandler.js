'use client'

import { useState, useEffect, useRef } from 'react'
import voiceService from '../../utils/VoiceService'
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

  // Set up event listeners when component mounts
  useEffect(() => {
    // Initialize voice service
    voiceService.initialize().catch(error => {
      console.error('Failed to initialize voice service:', error)
    })

    // Set up call event listener
    const removeListener = voiceService.addCallListener((event, data) => {
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
      }
    })

    // Clean up listener when component unmounts
    return () => {
      removeListener()

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
    />
  )
}

export default CallHandler
'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import voiceService from '../../utils/VoiceService'

export default function CallButton({ 
  contactPublicKey, 
  contactName
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isInitiating, setIsInitiating] = useState(false)
  
  const handleClick = async () => {
    if (isInitiating) return;
    
    console.log('Call button clicked for contact:', contactPublicKey);
    setIsInitiating(true);
    
    try {
      // Check if browser supports required WebRTC APIs
      if (typeof navigator.mediaDevices === 'undefined' || 
          typeof navigator.mediaDevices.getUserMedia === 'undefined' ||
          typeof RTCPeerConnection === 'undefined') {
        alert('Your browser does not support WebRTC. Please use a modern browser like Chrome, Firefox, Safari, or Edge.');
        setIsInitiating(false);
        return;
      }
      
      // Check if voice service is available
      if (typeof window !== 'undefined' && window.voiceService) {
        // Check if already initialized, initialize if needed
        if (!window.voiceService.initialized) {
          await window.voiceService.initialize();
        }
        
        // Check if already in a call
        if (window.voiceService.isInCall()) {
          alert('You are already in a call. Please end the current call before starting a new one.');
          setIsInitiating(false);
          return;
        }
        
        // Initiate call
        const success = await window.voiceService.initiateCall(contactPublicKey);
        if (!success) {
          throw new Error('Failed to initiate call');
        }
      } else {
        console.error('Voice service not available');
        alert('Call service is not available. Please try again later.');
      }
    } catch (error) {
      console.error('Error initiating call:', error);
      
      // Show friendly error message based on the error type
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('Microphone access was denied. Please allow microphone access to make calls.');
      } else {
        alert('Could not start the call. Please try again.');
      }
    } finally {
      setIsInitiating(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isInitiating}
      className={`p-2 rounded-full ${
        isInitiating ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
      } text-white transition-colors duration-200 flex items-center justify-center`}
      title={`Call ${contactName}`}
    >
      <Phone size={20} className={isInitiating ? 'animate-pulse' : ''} />
    </button>
  )
}
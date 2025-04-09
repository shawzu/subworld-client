'use client'

import { useState, useEffect } from 'react'
import { Phone } from 'lucide-react'

export default function CallButton({ 
  contactPublicKey, 
  contactName
}) {
  const [isCalling, setIsCalling] = useState(false)
  const [voiceServiceReady, setVoiceServiceReady] = useState(false)
  
  // Check if voice service is available on mount
  useEffect(() => {
    const checkVoiceService = async () => {
      if (typeof window === 'undefined') return;
      
      if (window.voiceService) {
        setVoiceServiceReady(true);
        return;
      }
      
      // Try to import it if not available
      try {
        const module = await import('../../utils/VoiceService');
        const voiceService = module.default;
        if (voiceService) {
          window.voiceService = voiceService;
          
          if (!voiceService.initialized) {
            await voiceService.initialize();
          }
          
          setVoiceServiceReady(true);
          console.log('Voice service loaded in CallButton');
        }
      } catch (error) {
        console.error('Error loading voice service in CallButton:', error);
      }
    };
    
    checkVoiceService();
  }, []);
  
  const handleClick = async () => {
    if (isCalling) return;
    
    console.log('Call button clicked for contact:', contactPublicKey);
    setIsCalling(true);
    
    try {
      // Check if voice service is available
      if (!window.voiceService) {
        console.error('Voice service not available');
        alert('Voice service not available. Please try again later.');
        throw new Error('Voice service not available');
      }
      
      // Ensure service is initialized
      if (!window.voiceService.initialized) {
        console.log('Voice service not yet initialized, initializing now...');
        await window.voiceService.initialize();
      }
      
      // Initiate call directly with the contact's public key
      const success = await window.voiceService.initiateCall(contactPublicKey);
      
      if (!success) {
        throw new Error('Failed to initiate call');
      }
      
      console.log('Call initiated successfully to:', contactPublicKey);
    } catch (error) {
      console.error('Error initiating call:', error);
      alert(error.message || 'Could not start the call. Please try again.');
    } finally {
      setIsCalling(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isCalling || !voiceServiceReady}
      className={`p-2 rounded-full ${
        !voiceServiceReady ? 'bg-gray-400 cursor-not-allowed' :
        isCalling ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
      } text-white transition-colors duration-200 flex items-center justify-center`}
      title={!voiceServiceReady ? 'Voice service initializing...' : `Call ${contactName}`}
    >
      <Phone size={20} className={isCalling ? 'animate-pulse' : ''} />
    </button>
  )
}
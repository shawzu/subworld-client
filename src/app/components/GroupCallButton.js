'use client'

import { useState, useEffect } from 'react'
import { Phone, Users } from 'lucide-react'

/**
 * GroupCallButton - Button for initiating group calls
 */
export default function GroupCallButton({ 
  group,
  onInitiateGroupCall
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
          console.log('Voice service loaded in GroupCallButton');
        }
      } catch (error) {
        console.error('Error loading voice service in GroupCallButton:', error);
      }
    };
    
    checkVoiceService();
  }, []);
  
  const handleClick = async () => {
    if (isCalling || !group) return;
    
    console.log('Group call button clicked for group:', group.id);
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
      
      // Extract members from the group
      const groupMembers = group.members || [];
      
      // Initiate group call
      if (typeof onInitiateGroupCall === 'function') {
        onInitiateGroupCall(group.id, group.name, groupMembers);
      } else {
        // Directly call voice service if no handler provided
        await window.voiceService.initiateGroupCall(
          group.id, 
          group.name || 'Group Call',
          groupMembers
        );
      }
      
      console.log('Group call initiated successfully for:', group.id);
    } catch (error) {
      console.error('Error initiating group call:', error);
      alert(error.message || 'Could not start the group call. Please try again.');
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
        isCalling ? 'bg-gray-500 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
      } text-white transition-colors duration-200 flex items-center justify-center`}
      title={!voiceServiceReady ? 'Voice service initializing...' : `Start group call with ${group.name || 'group'}`}
    >
      <Phone size={20} className={isCalling ? 'animate-pulse' : ''} />
    </button>
  )
}
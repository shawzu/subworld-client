'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import voiceService from '../../utils/VoiceService'

export default function CallButton({ 
  contactPublicKey, 
  contactName
}) {
  const [isHovered, setIsHovered] = useState(false)
  
  const handleClick = () => {
    if (typeof window !== 'undefined' && window.voiceService) {
      window.voiceService.initiateCall(contactPublicKey);
    } else if (voiceService) {
      voiceService.initiateCall(contactPublicKey);
    } else {
      console.error('Voice service not available');
      alert('Call service is not available. Please try again later.');
    }
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="p-2 rounded-full hover:bg-blue-600 bg-blue-500 text-white transition-colors duration-200 flex items-center justify-center"
      title={`Call ${contactName}`}
    >
      <Phone size={20} />
    </button>
  )
}
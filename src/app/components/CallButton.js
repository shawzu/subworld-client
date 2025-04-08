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
    console.log('Call button clicked for contact:', contactPublicKey);
    
    if (typeof window !== 'undefined' && window.voiceService) {
      console.log('Using window.voiceService to initiate call');
      window.voiceService.initiateCall(contactPublicKey)
        .then(result => {
          console.log('Call initiation result:', result);
        })
        .catch(err => {
          console.error('Call initiation error:', err);
        });
    } else if (voiceService) {
      console.log('Using imported voiceService to initiate call');
      voiceService.initiateCall(contactPublicKey)
        .then(result => {
          console.log('Call initiation result:', result);
        })
        .catch(err => {
          console.error('Call initiation error:', err);
        });
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
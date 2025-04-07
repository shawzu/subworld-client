'use client'

import { useState } from 'react'
import { Phone, PhoneOff, MicOff, Mic } from 'lucide-react'

export default function CallButton({ 
  contactPublicKey, 
  contactName, 
  onInitiateCall 
}) {
  const [isHovered, setIsHovered] = useState(false)
  
  const handleClick = () => {
    onInitiateCall(contactPublicKey)
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
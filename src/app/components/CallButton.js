'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import conversationManager from '../../utils/ConversationManager'

export default function CallButton({ 
  contactPublicKey, 
  contactName
}) {
  const [isSending, setIsSending] = useState(false)
  
  const handleClick = async () => {
    if (isSending) return;
    
    console.log('Call button clicked for contact:', contactPublicKey);
    setIsSending(true);
    
    try {
      // Generate a unique call ID
      const callId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create call invitation message
      const callData = {
        callId,
        startTime: new Date().toISOString()
      };
      
      // Create a special message for the call invitation
      const callMessage = `CALL_INVITATION:${JSON.stringify(callData)}`;
      
      // Send the call invitation message
      await conversationManager.sendMessage(contactPublicKey, callMessage);
      
      console.log('Call invitation sent with ID:', callId);
    } catch (error) {
      console.error('Error sending call invitation:', error);
      alert('Could not send call invitation. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isSending}
      className={`p-2 rounded-full ${
        isSending ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
      } text-white transition-colors duration-200 flex items-center justify-center`}
      title={`Call ${contactName}`}
    >
      <Phone size={20} className={isSending ? 'animate-pulse' : ''} />
    </button>
  )
}
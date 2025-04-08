'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'

export default function CallMessage({ 
  message, 
  formatMessageTime, 
  currentUserKey,
  onJoinCall 
}) {
  const [joining, setJoining] = useState(false)
  const isSentByCurrentUser = message.sender === currentUserKey
  
  // Parse call data from message content
  const getCallData = () => {
    try {
      // Extract JSON between CALL_INVITATION: and end of string
      const match = message.content.match(/CALL_INVITATION:(.*)/s)
      if (match && match[1]) {
        return JSON.parse(match[1])
      }
      return { callId: 'unknown', startTime: new Date().toISOString() }
    } catch (error) {
      console.error('Error parsing call data:', error)
      return { callId: 'unknown', startTime: new Date().toISOString() }
    }
  }
  
  const callData = getCallData()
  const callAge = new Date() - new Date(callData.startTime)
  const callExpired = callAge > 30 * 60 * 1000 // 30 minutes
  
  // Get the sender's public key - needed for establishing the WebRTC connection
  const contactPublicKey = isSentByCurrentUser ? message.recipient : message.sender
  
  const handleJoinCall = () => {
    if (callExpired) return
    
    console.log('Joining call with ID:', callData.callId, 'and contact:', contactPublicKey);
    setJoining(true)
    
    if (typeof window !== 'undefined' && window.voiceService) {
      // Direct call to the voice service to avoid any potential issues
      window.voiceService.joinCall(callData.callId, contactPublicKey)
        .then(() => {
          console.log('Successfully joined call');
        })
        .catch(error => {
          console.error('Error joining call:', error);
          setJoining(false);
          alert('Failed to join call: ' + (error.message || 'Unknown error'));
        });
    } else {
      // Fallback to the provided onJoinCall function
      onJoinCall(callData.callId, contactPublicKey)
        .catch(error => {
          console.error('Error joining call:', error);
          setJoining(false);
          alert('Failed to join call: ' + (error.message || 'Unknown error'));
        });
    }
  }
  
  return (
    <div className={`mb-6 ${isSentByCurrentUser ? 'text-right' : ''}`}>
      <div className={`inline-block p-5 rounded-2xl ${isSentByCurrentUser ? 'bg-blue-600' : 'bg-gray-800'}`}>
        <div className="flex items-center space-x-4 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center">
            <Phone size={20} className="text-blue-300" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-lg">Call</div>
            <div className="text-sm text-blue-300/80">
              Audio Call
            </div>
          </div>
        </div>
        
        <button
          onClick={handleJoinCall}
          disabled={joining || callExpired}
          className={`w-full py-3 px-4 mt-2 rounded-lg flex items-center justify-center gap-2 
            ${callExpired 
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700 text-white'} 
            transition-colors`}
        >
          {joining ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-white animate-spin mr-2"></div>
              Joining Call...
            </>
          ) : callExpired ? (
            'Call Expired'
          ) : (
            <>
              <Phone size={18} />
              Join Call
            </>
          )}
        </button>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        {formatMessageTime(message.timestamp)}
      </div>
    </div>
  )
}
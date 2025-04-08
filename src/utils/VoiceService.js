'use client'

import subworldNetwork from './SubworldNetworkService'
import LocalKeyStorageManager from './LocalKeyStorageManager'

class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'outgoing', 'incoming', 'connected', 'ended', null
    this.callSessionId = null;
    this.callPartner = null;
    this.isMuted = false;
    this.listeners = [];
    
    // Simple flag to prevent duplicate processing
    this.processingCall = false;
  }
  
  /**
   * Initialize the voice service
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      console.log('Initializing voice service (simplified version)');
      this.initialized = true;
      
      // Make available globally
      if (typeof window !== 'undefined') {
        window.voiceService = this;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize voice service:', error);
      return false;
    }
  }
  
  /**
   * Register a listener for call events
   */
  addCallListener(listener) {
    this.listeners.push(listener);
    
    // Return function to remove listener
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Notify all listeners of an event
   */
  _notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in call listener:', error);
      }
    });
  }
  
  /**
   * Initiate a call to a contact
   */
  async initiateCall(contactPublicKey) {
    try {
      // Prevent multiple calls
      if (this.callState || this.processingCall) {
        console.warn('Already in a call or processing a call');
        return false;
      }
      
      this.processingCall = true;
      console.log('Initiating call to:', contactPublicKey);
      
      // Set up call data
      this.callSessionId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.callPartner = contactPublicKey;
      
      // Update state to show call is outgoing
      this.callState = 'outgoing';
      this._notifyListeners('call_state_changed', { 
        state: 'outgoing', 
        contact: contactPublicKey 
      });
      
      // Send call signal through conversation manager
      if (window.conversationManager && typeof window.conversationManager.sendCallSignal === 'function') {
        try {
          // Create a simple call start message
          await window.conversationManager.sendMessage(
            contactPublicKey,
            `CALL_SIGNAL:{"type":"call_start","callSessionId":"${this.callSessionId}"}`
          );
          console.log('Call signal sent successfully');
          
          // Simulate connecting after a delay (in a real implementation, this would happen when the other party answers)
          setTimeout(() => {
            if (this.callState === 'outgoing') {
              this.callState = 'connected';
              this._notifyListeners('call_state_changed', {
                state: 'connected',
                contact: this.callPartner
              });
              
              // Auto-end call after 2 minutes if not ended manually (to prevent stuck calls)
              setTimeout(() => {
                if (this.callState === 'connected') {
                  this.endCall();
                }
              }, 120000);
            }
          }, 5000);
          
          this.processingCall = false;
          return true;
        } catch (signalError) {
          console.error('Failed to send call signal:', signalError);
          this.endCall();
          this.processingCall = false;
          return false;
        }
      } else {
        console.error('Conversation manager not available or missing sendCallSignal method');
        this.endCall();
        this.processingCall = false;
        return false;
      }
    } catch (error) {
      console.error('Error initiating call:', error);
      this.endCall();
      this.processingCall = false;
      return false;
    }
  }
  
  /**
   * Handle an incoming call
   */
  handleIncomingCall(callerKey, callSessionId) {
    try {
      // Ensure we're not already in a call
      if (this.callState) {
        console.warn('Already in a call, rejecting incoming call');
        this.rejectCall(callSessionId);
        return false;
      }
      
      console.log('Handling incoming call from:', callerKey);
      
      // Set call data
      this.callSessionId = callSessionId || `call-${Date.now()}`;
      this.callPartner = callerKey;
      this.callState = 'incoming';
      
      // Notify listeners
      this._notifyListeners('call_state_changed', { 
        state: 'incoming', 
        contact: callerKey
      });
      
      // Auto-reject after 30 seconds if not answered
      setTimeout(() => {
        if (this.callState === 'incoming') {
          this.rejectCall();
        }
      }, 30000);
      
      return true;
    } catch (error) {
      console.error('Error handling incoming call:', error);
      return false;
    }
  }
  
  /**
   * Answer an incoming call
   */
  async answerCall() {
    try {
      if (this.callState !== 'incoming') {
        console.warn('No incoming call to answer');
        return false;
      }
      
      console.log('Answering call from:', this.callPartner);
      
      // Update state
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.callPartner
      });
      
      // Send answer signal
      if (window.conversationManager) {
        try {
          await window.conversationManager.sendMessage(
            this.callPartner,
            `CALL_SIGNAL:{"type":"call_answer","callSessionId":"${this.callSessionId}"}`
          );
        } catch (error) {
          console.warn('Failed to send call answer signal:', error);
          // Continue with call anyway
        }
      }
      
      // Auto-end call after 2 minutes if not ended manually
      setTimeout(() => {
        if (this.callState === 'connected') {
          this.endCall();
        }
      }, 120000);
      
      return true;
    } catch (error) {
      console.error('Error answering call:', error);
      this.endCall();
      return false;
    }
  }
  
  /**
   * Reject an incoming call
   */
  async rejectCall() {
    try {
      if (this.callState !== 'incoming') {
        console.warn('No incoming call to reject');
        return false;
      }
      
      // Send reject signal
      if (window.conversationManager) {
        try {
          await window.conversationManager.sendMessage(
            this.callPartner,
            `CALL_SIGNAL:{"type":"call_reject","callSessionId":"${this.callSessionId}"}`
          );
        } catch (error) {
          console.warn('Failed to send call reject signal:', error);
          // Continue with rejection anyway
        }
      }
      
      // Update state
      const previousPartner = this.callPartner;
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended', 
        contact: previousPartner
      });
      
      // Reset after a short delay
      setTimeout(() => {
        this.callState = null;
        this.callSessionId = null;
        this.callPartner = null;
        this._notifyListeners('call_state_changed', { state: null, contact: null });
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('Error rejecting call:', error);
      
      // Force reset state
      this.callState = null;
      this.callSessionId = null;
      this.callPartner = null;
      this._notifyListeners('call_state_changed', { state: null, contact: null });
      
      return false;
    }
  }
  
  /**
   * End the current call
   */
  async endCall() {
    try {
      if (!this.callState) {
        return false;
      }
      
      // Send end signal if we're in an active call
      if (this.callState !== 'ended' && window.conversationManager) {
        try {
          await window.conversationManager.sendMessage(
            this.callPartner,
            `CALL_SIGNAL:{"type":"call_end","callSessionId":"${this.callSessionId}"}`
          );
        } catch (error) {
          console.warn('Failed to send call end signal:', error);
          // Continue with ending the call anyway
        }
      }
      
      // Update state
      const previousPartner = this.callPartner;
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended', 
        contact: previousPartner
      });
      
      // Reset after a short delay
      setTimeout(() => {
        this.callState = null;
        this.callSessionId = null;
        this.callPartner = null;
        this._notifyListeners('call_state_changed', { state: null, contact: null });
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('Error ending call:', error);
      
      // Force reset state
      this.callState = null;
      this.callSessionId = null;
      this.callPartner = null;
      this._notifyListeners('call_state_changed', { state: null, contact: null });
      
      return false;
    }
  }
  
  /**
   * Toggle microphone mute state (simulated)
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    this._notifyListeners('mute_changed', { isMuted: this.isMuted });
    return this.isMuted;
  }
  
  /**
   * Process a call signal from a message
   */
  processCallSignal(senderKey, signalData) {
    try {
      // Handle call_start
      if (signalData.type === 'call_start') {
        const callSessionId = signalData.callSessionId || `call-${Date.now()}`;
        this.handleIncomingCall(senderKey, callSessionId);
        return true;
      }
      
      // Handle call_answer - if we have an outgoing call to this sender
      if (signalData.type === 'call_answer' && 
          this.callState === 'outgoing' && 
          this.callPartner === senderKey) {
        this.callState = 'connected';
        this._notifyListeners('call_state_changed', { 
          state: 'connected', 
          contact: senderKey 
        });
        return true;
      }
      
      // Handle call_reject
      if (signalData.type === 'call_reject' && 
          this.callState === 'outgoing' && 
          this.callPartner === senderKey) {
        this.endCall();
        return true;
      }
      
      // Handle call_end
      if (signalData.type === 'call_end' && this.callPartner === senderKey) {
        this.endCall();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error processing call signal:', error);
      return false;
    }
  }
  
  /**
   * Check if currently in a call
   */
  isInCall() {
    return !!this.callState;
  }
  
  /**
   * Get current mute state
   */
  getMuteState() {
    return this.isMuted;
  }
}

// Create singleton instance
const voiceService = new VoiceService();
export default voiceService;
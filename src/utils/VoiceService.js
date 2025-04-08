'use client'

class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'connected', 'ended', null
    this.callId = null;
    this.isMuted = false;
    this.listeners = [];
    this.activeCallUsers = new Set(); // Track which users are in calls
    
    // WebRTC objects
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // ICE servers config - using Google's public STUN servers
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ]
    };
  }
  
  /**
   * Initialize the voice service
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      console.log('Initializing WebRTC voice service');
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
   * Join a call with the given ID
   */
  async joinCall(callId) {
    try {
      // Prevent joining multiple calls
      if (this.callState) {
        console.warn('Already in a call');
        return false;
      }
      
      console.log('Setting up call:', callId);
      
      // Set up call data
      this.callId = callId;
      
      try {
        // Request audio permissions
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: false 
        });
        
        // Update UI to show we're connected
        this.callState = 'connected';
        this._notifyListeners('call_state_changed', { 
          state: 'connected',
          contact: 'group-call' // Generic contact since this is just a direct join
        });
        
        // Also notify about the stream
        this._notifyListeners('remote_stream_added', { stream: this.localStream });
        
        console.log('Call joined successfully');
        return true;
      } catch (error) {
        console.error('Error joining call:', error);
        this.endCall();
        throw error;
      }
    } catch (error) {
      console.error('Error in joinCall:', error);
      this.endCall();
      throw error;
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
      
      // Update state
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended',
        contact: 'group-call'
      });
      
      // Clean up after a short delay to allow UI updates
      setTimeout(() => {
        this._cleanupCall();
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('Error ending call:', error);
      this._cleanupCall();
      return false;
    }
  }
  
  /**
   * Clean up call resources
   */
  _cleanupCall() {
    // Stop local media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Reset call state
    this.callState = null;
    this.callId = null;
    
    // Notify listeners
    this._notifyListeners('call_state_changed', { state: null, contact: null });
  }
  
  /**
   * Toggle microphone mute state
   */
  toggleMute() {
    if (!this.localStream) {
      return false;
    }
    
    this.isMuted = !this.isMuted;
    
    // Update all audio tracks
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
    
    this._notifyListeners('mute_changed', { isMuted: this.isMuted });
    return this.isMuted;
  }
  
  /**
   * Check if currently in a call
   */
  isInCall() {
    return this.callState === 'connected';
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
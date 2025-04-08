'use client'

import subworldNetwork from './SubworldNetworkService'
import conversationManager from './ConversationManager'

class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'outgoing', 'incoming', 'connected', 'ended', null
    this.callSessionId = null;
    this.callPartner = null;
    this.isMuted = false;
    this.listeners = [];
    
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
    
    // Signal processing flag
    this.processingSignaling = false;
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
   * Create the RTCPeerConnection object
   */
  async _createPeerConnection() {
    try {
      // Create the peer connection with ICE servers
      this.peerConnection = new RTCPeerConnection(this.iceServers);
      
      // Set up event handlers
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this._sendSignalingMessage({
            type: 'ice-candidate',
            candidate: event.candidate
          });
        }
      };
      
      this.peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event.streams[0]);
        this.remoteStream = event.streams[0];
        this._notifyListeners('remote_stream_added', { stream: this.remoteStream });
      };
      
      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.peerConnection.iceConnectionState);
        
        // Handle disconnection
        if (this.peerConnection.iceConnectionState === 'disconnected' || 
            this.peerConnection.iceConnectionState === 'failed' ||
            this.peerConnection.iceConnectionState === 'closed') {
          this.endCall();
        }
      };
      
      return this.peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }
  
  /**
   * Get local media stream
   */
  async _getLocalStream() {
    try {
      // Request audio only (no video)
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      
      console.log('DEBUG: Got local audio stream successfully');
      return this.localStream;
    } catch (error) {
      console.error('DEBUG: Error getting local stream:', error);
      console.error('Error name:', error.name); // This is important!
      console.error('Error message:', error.message);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        console.error('DEBUG: Microphone permission denied');
        // Don't throw here, handle gracefully
        return null;
      }
      
      throw error;
    }
  }
  
  /**
   * Add local stream to peer connection
   */
  async _addLocalStreamToPeerConnection() {
    if (!this.localStream || !this.peerConnection) {
      throw new Error('Local stream or peer connection not initialized');
    }
    
    // Add all audio tracks to the peer connection
    this.localStream.getAudioTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
      console.log('Added local audio track to peer connection');
    });
  }
  
  /**
   * Send a signaling message through the message channel
   */
  async _sendSignalingMessage(message) {
    if (!this.callPartner || !window.conversationManager) {
      console.error('Cannot send signaling message - conversation manager or call partner not set');
      return false;
    }
    
    try {
      // Add session ID to message
      message.callSessionId = this.callSessionId;
      
      // Send through conversation manager
      const signalData = {
        type: 'webrtc_signal',
        data: message
      };
      
      console.log('Sending signaling message:', message.type);
      
      // Send using conversation manager
      await window.conversationManager.sendCallSignal(this.callPartner, signalData);
      return true;
    } catch (error) {
      console.error('Error sending signaling message:', error);
      return false;
    }
  }
  
  /**
   * Process an incoming signaling message
   */
  async processSignalingMessage(senderKey, signalData) {
    // Prevent concurrent signal processing to avoid race conditions
    if (this.processingSignaling) {
      console.log('Already processing a signal, queueing...');
      setTimeout(() => this.processSignalingMessage(senderKey, signalData), 200);
      return;
    }
    
    this.processingSignaling = true;
    
    try {
      if (!signalData || !signalData.type) {
        console.error('Invalid signaling data:', signalData);
        this.processingSignaling = false;
        return;
      }

      console.log('Processing signaling message:', signalData.type);
      
      // Handle different signal types
      switch (signalData.type) {
        case 'call-offer':
          await this._handleCallOffer(senderKey, signalData);
          break;
        
        case 'call-answer':
          await this._handleCallAnswer(signalData);
          break;
        
        case 'ice-candidate':
          await this._handleIceCandidate(signalData);
          break;
        
        case 'call-end':
          this.endCall();
          break;
        
        default:
          console.warn('Unknown signal type:', signalData.type);
      }
    } catch (error) {
      console.error('Error processing signaling message:', error);
    } finally {
      this.processingSignaling = false;
    }
  }
  
  /**
   * Handle an incoming call offer
   */
  async _handleCallOffer(senderKey, signalData) {
    // Only accept if we're not in a call
    if (this.callState) {
      console.warn('Already in a call, ignoring offer');
      return;
    }
    
    // Set call data
    this.callSessionId = signalData.callSessionId;
    this.callPartner = senderKey;
    this.callState = 'incoming';
    
    // Notify of incoming call
    this._notifyListeners('call_state_changed', { 
      state: 'incoming', 
      contact: senderKey 
    });
    
    // Auto-reject after 30 seconds if not answered
    setTimeout(() => {
      if (this.callState === 'incoming') {
        this.rejectCall();
      }
    }, 30000);

    // Store the offer to use when answering
    this.pendingRemoteOffer = signalData.offer;
  }
  
  /**
   * Handle a call answer
   */
  async _handleCallAnswer(signalData) {
    if (!this.peerConnection || this.callState !== 'outgoing') {
      console.warn('Received answer but not in outgoing call state');
      return;
    }
    
    try {
      // Set the remote description from the answer
      const remoteDesc = new RTCSessionDescription(signalData.answer);
      await this.peerConnection.setRemoteDescription(remoteDesc);
      
      console.log('Call answered, remote description set');
      
      // Update call state
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.callPartner
      });
    } catch (error) {
      console.error('Error handling call answer:', error);
      this.endCall();
    }
  }
  
  /**
   * Handle ICE candidate
   */
  async _handleIceCandidate(signalData) {
    if (!this.peerConnection) {
      console.warn('Received ICE candidate but no peer connection exists');
      return;
    }
    
    try {
      // Add the ICE candidate to the peer connection
      const candidate = new RTCIceCandidate(signalData.candidate);
      await this.peerConnection.addIceCandidate(candidate);
      console.log('Added ICE candidate');
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
  
  /**
   * Initiate a call to a contact
   */
  async initiateCall(contactPublicKey) {
    try {
      // Prevent multiple calls
      if (this.callState || this.peerConnection) {
        console.warn('Already in a call');
        return false;
      }
      
      console.log('DEBUG: Initiating call to:', contactPublicKey);
      
      // Set up call data
      this.callSessionId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.callPartner = contactPublicKey;
      
      // Update state to show call is outgoing
      this.callState = 'outgoing';
      this._notifyListeners('call_state_changed', { 
        state: 'outgoing', 
        contact: contactPublicKey 
      });
      
      try {
        // Create peer connection
        console.log('DEBUG: Creating peer connection');
        await this._createPeerConnection();
        
        // Get local stream
        console.log('DEBUG: Requesting microphone access');
        await this._getLocalStream();
        
        // Add local stream to the peer connection
        console.log('DEBUG: Adding local stream to peer connection');
        await this._addLocalStreamToPeerConnection();
        
        // Create an offer
        console.log('DEBUG: Creating offer');
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        
        // Set local description
        console.log('DEBUG: Setting local description');
        await this.peerConnection.setLocalDescription(offer);
        
        // Send the offer to the recipient
        console.log('DEBUG: Sending offer signal');
        await this._sendSignalingMessage({
          type: 'call-offer',
          offer: this.peerConnection.localDescription
        });
        
        console.log('DEBUG: Call offer sent successfully');
        return true;
      } catch (error) {
        console.error('Error in WebRTC call setup:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        this.endCall();
        return false;
      }
    } catch (error) {
      console.error('Error in initiateCall:', error);
      this.endCall();
      return false;
    }
  }
  
  /**
   * Answer an incoming call
   */
  async answerCall() {
    try {
      if (this.callState !== 'incoming' || !this.pendingRemoteOffer) {
        console.warn('No incoming call to answer');
        return false;
      }
      
      console.log('Answering call from:', this.callPartner);
      
      // Create peer connection
      await this._createPeerConnection();
      
      // Get local stream
      await this._getLocalStream();
      
      // Set the remote description from the saved offer
      const remoteDesc = new RTCSessionDescription(this.pendingRemoteOffer);
      await this.peerConnection.setRemoteDescription(remoteDesc);
      
      // Add local stream to peer connection
      await this._addLocalStreamToPeerConnection();
      
      // Create an answer
      const answer = await this.peerConnection.createAnswer();
      
      // Set local description
      await this.peerConnection.setLocalDescription(answer);
      
      // Send the answer
      await this._sendSignalingMessage({
        type: 'call-answer',
        answer: this.peerConnection.localDescription
      });
      
      // Update state
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.callPartner
      });
      
      console.log('Call answered');
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
      
      // Send rejection signal
      await this._sendSignalingMessage({
        type: 'call-end'
      });
      
      // Update state
      const previousPartner = this.callPartner;
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended', 
        contact: previousPartner
      });
      
      // Reset after a short delay
      setTimeout(() => {
        this._cleanupCall();
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('Error rejecting call:', error);
      this._cleanupCall();
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
      if (this.callState !== 'ended') {
        await this._sendSignalingMessage({
          type: 'call-end'
        });
      }
      
      // Update state
      const previousPartner = this.callPartner;
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended', 
        contact: previousPartner
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
    
    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    // Reset call state
    this.callState = null;
    this.callSessionId = null;
    this.callPartner = null;
    this.pendingRemoteOffer = null;
    this.remoteStream = null;
    
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
    return this.callState === 'connected' || 
           this.callState === 'outgoing' || 
           this.callState === 'incoming';
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
'use client'

import conversationManager from './ConversationManager'

class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'connecting', 'connected', 'ended', null
    this.callId = null;
    this.isMuted = false;
    this.listeners = [];
    this.remoteUserKey = null; // Store the remote user's public key
    this.activeCallUsers = new Set(); // Track which users are in calls
    
    // WebRTC objects
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // ICE servers config - using multiple STUN servers for reliability
    // And a free TURN server as backup when direct connection fails
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.ekiga.net' },
        { urls: 'stun:stun.ideasip.com' },
        { urls: 'stun:stun.schlund.de' },
        // Free TURN servers - will only be used if STUN fails
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };
    
    // Debug settings
    this.debug = true;
  }
  
  /**
   * Debug logger
   */
  log(...args) {
    if (this.debug) {
      console.log('[VoiceService]', ...args);
    }
  }
  
  /**
   * Initialize the voice service
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      this.log('Initializing WebRTC voice service');
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
    this.log(`Notifying listeners: ${event}`, data);
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
      // Prevent initiating multiple calls
      if (this.callState) {
        console.warn('Already in a call');
        return false;
      }
      
      this.log('Initiating call to:', contactPublicKey);
      this.remoteUserKey = contactPublicKey;
      
      // Request audio permissions
      this.log('Requesting microphone access');
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: false 
        });
        
        this.log('Microphone access granted');
      } catch (mediaError) {
        console.error('Failed to get audio stream:', mediaError);
        throw new Error('Microphone access denied. Please allow microphone access to make calls.');
      }
      
      // Generate a unique call ID
      this.callId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.log('Generated call ID:', this.callId);
      
      // Create a new RTCPeerConnection
      this.log('Creating peer connection with ICE servers');
      this.peerConnection = new RTCPeerConnection(this.iceServers);
      
      // Set up connection state monitoring
      this._setupConnectionMonitoring();
      
      // Add local tracks to the connection
      this.log('Adding local audio tracks to peer connection');
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
      // Listen for ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.log('New ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
          this._sendSignalingMessage({
            type: 'ice_candidate',
            candidate: event.candidate
          });
        } else {
          this.log('ICE candidate gathering complete');
        }
      };
      
      // Listen for remote stream
      this.peerConnection.ontrack = (event) => {
        this.log('Received remote track:', event.streams[0]);
        this.remoteStream = event.streams[0];
        this._notifyListeners('remote_stream_added', { stream: this.remoteStream });
      };
      
      // Create offer
      this.log('Creating SDP offer');
      const offer = await this.peerConnection.createOffer();
      this.log('Setting local description (offer)');
      await this.peerConnection.setLocalDescription(offer);
      
      // Send the offer to the remote user
      this.log('Sending offer to remote user');
      this._sendSignalingMessage({
        type: 'offer',
        offer: this.peerConnection.localDescription
      });
      
      // Update call state to connecting
      this.callState = 'connecting';
      this._notifyListeners('call_state_changed', { 
        state: 'connecting',
        contact: contactPublicKey
      });
      
      return true;
    } catch (error) {
      console.error('Error initiating call:', error);
      this.endCall();
      throw error;
    }
  }
  
  /**
   * Join a call with the given ID and contact
   */
  async joinCall(callId, contactPublicKey) {
    try {
      // Prevent joining multiple calls
      if (this.callState) {
        console.warn('Already in a call');
        return false;
      }
      
      this.log('Joining call:', callId, 'with contact:', contactPublicKey);
      
      // Extract contact public key from call invitation if not provided
      if (!contactPublicKey) {
        // Try to extract from call ID format or invitation content
        const senderInfo = callId.split('-')[3]; // Assuming format includes sender info
        if (senderInfo) {
          contactPublicKey = senderInfo;
        }
      }
      
      if (!contactPublicKey) {
        throw new Error('Cannot join call: missing contact information');
      }
      
      this.remoteUserKey = contactPublicKey;
      this.callId = callId;
      
      // Request audio permissions
      this.log('Requesting microphone access');
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: false 
        });
        
        this.log('Microphone access granted');
      } catch (mediaError) {
        console.error('Failed to get audio stream:', mediaError);
        throw new Error('Microphone access denied. Please allow microphone access to make calls.');
      }
      
      // Create a peer connection now to be ready for the offer
      this.log('Creating peer connection with ICE servers');
      this.peerConnection = new RTCPeerConnection(this.iceServers);
      
      // Set up connection state monitoring
      this._setupConnectionMonitoring();
      
      // Add local tracks to the connection
      this.log('Adding local audio tracks to peer connection');
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
      // Listen for ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.log('New ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
          this._sendSignalingMessage({
            type: 'ice_candidate',
            candidate: event.candidate
          });
        } else {
          this.log('ICE candidate gathering complete');
        }
      };
      
      // Listen for remote stream
      this.peerConnection.ontrack = (event) => {
        this.log('Received remote track:', event.streams[0]);
        this.remoteStream = event.streams[0];
        this._notifyListeners('remote_stream_added', { stream: this.remoteStream });
      };
      
      // Update UI to show we're connecting
      this.callState = 'connecting';
      this._notifyListeners('call_state_changed', { 
        state: 'connecting',
        contact: contactPublicKey
      });
      
      // Send a join signal to the caller
      this.log('Sending join signal to caller');
      this._sendSignalingMessage({
        type: 'join',
        callId: this.callId
      });
      
      return true;
    } catch (error) {
      console.error('Error joining call:', error);
      this.endCall();
      throw error;
    }
  }
  
  /**
   * Set up monitoring for the WebRTC connection state
   * @private
   */
  _setupConnectionMonitoring() {
    if (!this.peerConnection) return;
    
    // Monitor connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      this.log('Connection state changed:', this.peerConnection.connectionState);
      
      switch (this.peerConnection.connectionState) {
        case 'connected':
          this.log('WebRTC connection established successfully');
          if (this.callState !== 'connected') {
            this.callState = 'connected';
            this._notifyListeners('call_state_changed', {
              state: 'connected',
              contact: this.remoteUserKey
            });
          }
          break;
          
        case 'disconnected':
        case 'failed':
          console.warn('WebRTC connection failed or disconnected');
          if (this.callState === 'connected' || this.callState === 'connecting') {
            this.callState = 'ended';
            this._notifyListeners('call_state_changed', {
              state: 'ended',
              contact: this.remoteUserKey
            });
            
            // Clean up after a delay
            setTimeout(() => this._cleanupCall(), 3000);
          }
          break;
          
        case 'closed':
          this.log('WebRTC connection closed');
          break;
      }
    };
    
    // Monitor ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      this.log('ICE connection state changed:', this.peerConnection.iceConnectionState);
      
      if (this.peerConnection.iceConnectionState === 'failed') {
        console.warn('ICE connection failed, attempting to restart ICE');
        // Try to restart ICE
        this.peerConnection.restartIce();
      }
    };
    
    // Monitor ICE gathering state
    this.peerConnection.onicegatheringstatechange = () => {
      this.log('ICE gathering state changed:', this.peerConnection.iceGatheringState);
    };
    
    // Monitor signaling state
    this.peerConnection.onsignalingstatechange = () => {
      this.log('Signaling state changed:', this.peerConnection.signalingState);
    };
  }
  
  /**
   * Process signaling messages from remote users
   */
  async processSignalingMessage(senderKey, message) {
    if (!this.initialized) {
      console.warn('Voice service not initialized, cannot process signal');
      return;
    }
    
    this.log('Processing signal from', senderKey, ':', message.type);
    
    try {
      switch (message.type) {
        case 'offer':
          await this._handleOffer(senderKey, message.offer);
          break;
        
        case 'answer':
          await this._handleAnswer(message.answer);
          break;
        
        case 'ice_candidate':
          await this._handleIceCandidate(message.candidate);
          break;
        
        case 'join':
          await this._handleJoin(senderKey, message.callId);
          break;
        
        case 'end_call':
          this._handleEndCall(senderKey);
          break;
        
        default:
          console.warn('Unknown signal type:', message.type);
      }
    } catch (error) {
      console.error('Error processing signal:', error);
    }
  }
  
  /**
   * Handle an offer from a remote user
   */
  async _handleOffer(senderKey, offer) {
    try {
      this.log('Received offer from', senderKey);
      
      // If we're not in a call with this user, initiate one
      if (!this.callState || this.remoteUserKey !== senderKey) {
        // Request audio permissions if not already done
        if (!this.localStream) {
          this.log('Requesting microphone access');
          try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
              audio: true, 
              video: false 
            });
            
            this.log('Microphone access granted');
          } catch (mediaError) {
            console.error('Failed to get audio stream:', mediaError);
            throw new Error('Microphone access denied. Please allow microphone access to make calls.');
          }
        }
        
        this.remoteUserKey = senderKey;
        this.callState = 'connecting';
        this._notifyListeners('call_state_changed', { 
          state: 'connecting',
          contact: senderKey
        });
      }
      
      // Create peer connection if needed
      if (!this.peerConnection) {
        this.log('Creating peer connection with ICE servers');
        this.peerConnection = new RTCPeerConnection(this.iceServers);
        
        // Set up connection state monitoring
        this._setupConnectionMonitoring();
        
        // Add local tracks
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
        
        // Set up ICE candidate handling
        this.peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.log('New ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
            this._sendSignalingMessage({
              type: 'ice_candidate',
              candidate: event.candidate
            });
          } else {
            this.log('ICE candidate gathering complete');
          }
        };
        
        // Set up remote track handling
        this.peerConnection.ontrack = (event) => {
          this.log('Received remote track');
          this.remoteStream = event.streams[0];
          this._notifyListeners('remote_stream_added', { stream: this.remoteStream });
        };
      }
      
      // Set the remote description (the offer)
      this.log('Setting remote description (offer)');
      const offerDesc = new RTCSessionDescription(offer);
      await this.peerConnection.setRemoteDescription(offerDesc);
      
      // Create an answer
      this.log('Creating answer');
      const answer = await this.peerConnection.createAnswer();
      
      this.log('Setting local description (answer)');
      await this.peerConnection.setLocalDescription(answer);
      
      // Send the answer
      this.log('Sending answer to caller');
      this._sendSignalingMessage({
        type: 'answer',
        answer: this.peerConnection.localDescription
      });
    } catch (error) {
      console.error('Error handling offer:', error);
      this.endCall();
    }
  }
  
  /**
   * Handle an answer from a remote user
   */
  async _handleAnswer(answer) {
    try {
      this.log('Received answer from remote user');
      
      if (!this.peerConnection) {
        console.warn('No peer connection established');
        return;
      }
      
      // Set the remote description (the answer)
      this.log('Setting remote description (answer)');
      const answerDesc = new RTCSessionDescription(answer);
      await this.peerConnection.setRemoteDescription(answerDesc);
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
  
  /**
   * Handle an ICE candidate from a remote user
   */
  async _handleIceCandidate(candidate) {
    try {
      if (!this.peerConnection) {
        console.warn('No peer connection established');
        return;
      }
      
      if (!candidate) {
        this.log('Received null ICE candidate - end of candidates');
        return;
      }
      
      // Add the ICE candidate
      this.log('Adding remote ICE candidate');
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }
  
  /**
   * Handle a join message
   */
  async _handleJoin(senderKey, callId) {
    try {
      this.log('Remote user joining call:', senderKey, callId);
      
      // If we're the caller and this is our call ID
      if (this.callId === callId) {
        // If we don't have a peer connection yet, create one
        if (!this.peerConnection) {
          // Request audio permissions if not already done
          if (!this.localStream) {
            this.log('Requesting microphone access');
            try {
              this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: false 
              });
              
              this.log('Microphone access granted');
            } catch (mediaError) {
              console.error('Failed to get audio stream:', mediaError);
              throw new Error('Microphone access denied. Please allow microphone access to make calls.');
            }
          }
          
          this.log('Creating peer connection with ICE servers');
          this.peerConnection = new RTCPeerConnection(this.iceServers);
          
          // Set up connection state monitoring
          this._setupConnectionMonitoring();
          
          // Add local tracks
          this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
          });
          
          // Set up ICE candidate handling
          this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              this.log('New ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
              this._sendSignalingMessage({
                type: 'ice_candidate',
                candidate: event.candidate
              });
            } else {
              this.log('ICE candidate gathering complete');
            }
          };
          
          // Set up remote track handling
          this.peerConnection.ontrack = (event) => {
            this.log('Received remote track');
            this.remoteStream = event.streams[0];
            this._notifyListeners('remote_stream_added', { stream: this.remoteStream });
          };
        }
        
        // Store the remote user key
        this.remoteUserKey = senderKey;
        
        // Create and send an offer
        this.log('Creating offer for remote user');
        const offer = await this.peerConnection.createOffer();
        
        this.log('Setting local description (offer)');
        await this.peerConnection.setLocalDescription(offer);
        
        this.log('Sending offer to remote user');
        this._sendSignalingMessage({
          type: 'offer',
          offer: this.peerConnection.localDescription
        });
      } else {
        console.warn('Received join for unknown call ID:', callId);
      }
    } catch (error) {
      console.error('Error handling join:', error);
    }
  }
  
  /**
   * Handle an end call message
   */
  _handleEndCall(senderKey) {
    // Only end the call if it's from the user we're calling
    if (this.remoteUserKey === senderKey) {
      this.log('Remote user ended the call');
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended',
        contact: senderKey
      });
      
      // Clean up after a short delay
      setTimeout(() => {
        this._cleanupCall();
      }, 3000);
    }
  }
  
  /**
   * Send a signaling message to the remote user
   */
  _sendSignalingMessage(message) {
    if (!this.remoteUserKey) {
      console.warn('Cannot send signaling message: no remote user key');
      return;
    }
    
    try {
      this.log('Sending signal to', this.remoteUserKey, ':', message.type);
      
      // Use conversation manager to send call signal
      if (conversationManager) {
        conversationManager.sendCallSignal(this.remoteUserKey, {
          type: 'webrtc_signal',
          data: message,
          callId: this.callId
        });
      } else {
        console.error('Conversation manager not available for signaling');
      }
    } catch (error) {
      console.error('Error sending signal:', error);
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
      
      this.log('Ending call');
      
      // Notify the remote user
      if (this.remoteUserKey) {
        this._sendSignalingMessage({
          type: 'end_call'
        });
      }
      
      // Update state
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended',
        contact: this.remoteUserKey
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
    this.log('Cleaning up call resources');
    
    // Close peer connection
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
      this.peerConnection = null;
    }
    
    // Stop local media tracks
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (e) {
        console.error('Error stopping local tracks:', e);
      }
      this.localStream = null;
    }
    
    // Reset streams
    this.remoteStream = null;
    
    // Reset call state
    this.callState = null;
    this.callId = null;
    const previousRemoteUser = this.remoteUserKey;
    this.remoteUserKey = null;
    
    // Notify listeners of final state
    this._notifyListeners('call_state_changed', { 
      state: null, 
      contact: previousRemoteUser
    });
  }
  
  /**
   * Toggle microphone mute state
   */
  toggleMute() {
    if (!this.localStream) {
      return false;
    }
    
    this.isMuted = !this.isMuted;
    this.log('Toggle mute:', this.isMuted ? 'Muted' : 'Unmuted');
    
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
    return this.callState === 'connecting' || this.callState === 'connected';
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
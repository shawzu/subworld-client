'use client'

import { io } from 'socket.io-client';
import Peer from 'peerjs';

/**
 * VoiceService - Handles voice calls using Socket.io for signaling and Peer.js for WebRTC
 */
class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'connecting', 'connected', 'ended', null
    this.callId = null;
    this.isMuted = false;
    this.listeners = [];
    this.remoteUserKey = null;
    
    // Socket.io connection
    this.socket = null;
    
    // PeerJS instance
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    
    // Current user's public key
    this.userPublicKey = null;
    
    // Debug settings
    this.debug = true;
    
    // Track connection timing
    this.connectionStartTime = null;
    
    // Set default server address (proxy)
    this.serverUrl = 'https://proxy.inhouses.xyz';
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
      this.log('Initializing VoiceService with Socket.io and PeerJS');
      
      // Check for localStorage to get user's public key
      if (typeof window !== 'undefined') {
        const publicKeyDisplay = localStorage.getItem('subworld_public_key_display');
        if (!publicKeyDisplay) {
          this.log('No public key found in localStorage');
          return false;
        }
        
        this.userPublicKey = publicKeyDisplay;
        this.log(`User public key: ${this.userPublicKey}`);
        
        // Initialize Socket.io
        this.socket = io(this.serverUrl);
        
        // Set up socket event listeners
        this._setupSocketListeners();
        
        // Register with the signaling server
        this.socket.emit('register', { publicKey: this.userPublicKey });
        
        // Initialize PeerJS (set ID later when needed)
        this.peer = new Peer();
        
        this.initialized = true;
        
        // Make available globally
        if (typeof window !== 'undefined') {
          window.voiceService = this;
          this.log('Voice service registered globally');
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to initialize voice service:', error);
      return false;
    }
  }
  
  /**
   * Set up socket event listeners
   */
  _setupSocketListeners() {
    if (!this.socket) return;
    
    this.socket.on('registered', (data) => {
      this.log('Registered with signaling server:', data);
    });
    
    this.socket.on('incoming_call', (data) => {
      this.log('Incoming call:', data);
      this.callId = data.callId;
      this.remoteUserKey = data.caller;
      
      // Update call state
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', {
        state: 'ringing',
        contact: data.caller,
        callId: data.callId
      });
    });
    
    this.socket.on('call_status', (data) => {
      this.log('Call status update:', data);
      
      // Update call state based on status
      if (data.status === 'ringing') {
        this.callState = 'ringing';
        this._notifyListeners('call_state_changed', {
          state: 'ringing',
          contact: this.remoteUserKey
        });
      } else if (data.status === 'failed') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: data.reason
        });
        
        // Clean up after a short delay
        setTimeout(() => this._cleanupCall(), 3000);
      }
    });
    
    this.socket.on('call_response', (data) => {
      this.log('Call response:', data);
      
      if (data.response === 'accepted') {
        // Call accepted, begin WebRTC connection
        this.callState = 'connecting';
        this._notifyListeners('call_state_changed', {
          state: 'connecting',
          contact: data.recipient
        });
        
        // Start the WebRTC connection process
        this._initiateWebRTCConnection();
      } else {
        // Call rejected
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: data.recipient,
          reason: 'rejected'
        });
        
        // Clean up after a short delay
        setTimeout(() => this._cleanupCall(), 3000);
      }
    });
    
    this.socket.on('peer_signal', (data) => {
      this.log('Received peer signal:', data.callId);
      
      // Process the WebRTC signal
      this._processSignal(data.signal, data.sender);
    });
    
    this.socket.on('call_ended', (data) => {
      this.log('Call ended by other party:', data);
      
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', {
        state: 'ended',
        contact: this.remoteUserKey,
        reason: 'remote_ended'
      });
      
      // Clean up after a short delay
      setTimeout(() => this._cleanupCall(), 3000);
    });
    
    this.socket.on('disconnect', () => {
      this.log('Disconnected from signaling server');
      
      // If in a call, end it
      if (this.callState === 'connected' || this.callState === 'connecting' || this.callState === 'ringing') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'signal_server_disconnected'
        });
        
        // Clean up immediately
        this._cleanupCall();
      }
    });
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
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        });
        
        this.log('Microphone access granted, tracks:', this.localStream.getTracks().length);
        
        // Verify audio tracks
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('No audio track available');
        }
        
        this.log('Audio track:', audioTracks[0].label, 'enabled:', audioTracks[0].enabled);
      } catch (mediaError) {
        console.error('Failed to get audio stream:', mediaError);
        throw new Error('Microphone access denied. Please allow microphone access to make calls.');
      }
      
      // Generate a unique call ID
      this.callId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.log('Generated call ID:', this.callId);
      
      // Start tracking connection time
      this.connectionStartTime = Date.now();
      
      // Send call request to signaling server
      this.socket.emit('call_request', {
        callId: this.callId,
        caller: this.userPublicKey,
        recipient: contactPublicKey
      });
      
      // Update call state to ringing
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', { 
        state: 'ringing',
        contact: contactPublicKey,
        outgoing: true
      });
      
      return true;
    } catch (error) {
      console.error('Error initiating call:', error);
      this.endCall();
      throw error;
    }
  }
  
  /**
   * Answer an incoming call
   */
  async answerCall() {
    try {
      if (this.callState !== 'ringing' || !this.callId || !this.remoteUserKey) {
        console.warn('No incoming call to answer');
        return false;
      }
      
      this.log('Answering call from:', this.remoteUserKey);
      
      // Request audio permissions
      this.log('Requesting microphone access');
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        });
        
        this.log('Microphone access granted, tracks:', this.localStream.getTracks().length);
      } catch (mediaError) {
        console.error('Failed to get audio stream:', mediaError);
        throw new Error('Microphone access denied. Please allow microphone access to make calls.');
      }
      
      // Send call accepted message
      this.socket.emit('call_response', {
        callId: this.callId,
        response: 'accepted',
        recipient: this.userPublicKey,
        caller: this.remoteUserKey
      });
      
      // Update call state
      this.callState = 'connecting';
      this._notifyListeners('call_state_changed', { 
        state: 'connecting',
        contact: this.remoteUserKey
      });
      
      // Wait for the caller to initiate the WebRTC connection
      
      return true;
    } catch (error) {
      console.error('Error answering call:', error);
      this.endCall();
      throw error;
    }
  }
  
  /**
   * Reject an incoming call
   */
  rejectCall() {
    if (this.callState !== 'ringing' || !this.callId || !this.remoteUserKey) {
      console.warn('No incoming call to reject');
      return false;
    }
    
    this.log('Rejecting call from:', this.remoteUserKey);
    
    // Send call rejected message
    this.socket.emit('call_response', {
      callId: this.callId,
      response: 'rejected',
      recipient: this.userPublicKey,
      caller: this.remoteUserKey
    });
    
    // Update call state
    this.callState = 'ended';
    this._notifyListeners('call_state_changed', { 
      state: 'ended',
      contact: this.remoteUserKey,
      reason: 'rejected_by_user'
    });
    
    // Clean up
    this._cleanupCall();
    
    return true;
  }
  
  /**
   * Initiate WebRTC connection
   */
  _initiateWebRTCConnection() {
    if (!this.peer || !this.localStream) {
      this.log('Peer or local stream not available');
      return;
    }
    
    this.log('Initiating WebRTC connection with:', this.remoteUserKey);
    
    // Create unique peer ID based on call ID
    const myPeerId = `${this.userPublicKey}-${this.callId}`;
    this.log('My peer ID:', myPeerId);
    
    this.peer = new Peer(myPeerId);
    
    this.peer.on('open', (id) => {
      this.log('PeerJS connection opened with ID:', id);
      
      // Connect to the remote peer
      const remotePeerId = `${this.remoteUserKey}-${this.callId}`;
      this.log('Calling remote peer:', remotePeerId);
      
      // Call the remote peer
      this.peerConnection = this.peer.call(remotePeerId, this.localStream);
      
      if (!this.peerConnection) {
        this.log('Failed to create peer connection');
        this.endCall();
        return;
      }
      
      // Handle the connection
      this._handlePeerConnection();
    });
    
    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      
      // If call is still in progress, end it
      if (this.callState !== 'ended' && this.callState !== null) {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'connection_error'
        });
        
        // Clean up
        this._cleanupCall();
      }
    });
    
    // Listen for incoming calls as well (in case the other side calls us first)
    this.peer.on('call', (incomingCall) => {
      this.log('Received incoming PeerJS call');
      
      // Answer the call with our local stream
      incomingCall.answer(this.localStream);
      
      // Update our connection reference
      this.peerConnection = incomingCall;
      
      // Handle the connection
      this._handlePeerConnection();
    });
  }
  
  /**
   * Handle PeerJS connection events
   */
  _handlePeerConnection() {
    if (!this.peerConnection) return;
    
    // Handle remote stream
    this.peerConnection.on('stream', (stream) => {
      this.log('Received remote stream');
      this.remoteStream = stream;
      
      // Notify listeners of remote stream
      this._notifyListeners('remote_stream_added', { stream });
      
      // Update call state to connected
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.remoteUserKey
      });
    });
    
    // Handle call closing
    this.peerConnection.on('close', () => {
      this.log('Peer connection closed');
      
      if (this.callState !== 'ended') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'connection_closed'
        });
        
        // Clean up
        this._cleanupCall();
      }
    });
    
    // Handle errors
    this.peerConnection.on('error', (err) => {
      console.error('Peer connection error:', err);
      
      if (this.callState !== 'ended') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'connection_error'
        });
        
        // Clean up
        this._cleanupCall();
      }
    });
  }
  
  /**
   * Process a WebRTC signal from a remote peer
   */
  _processSignal(signal, sender) {
    // This is handled by PeerJS internally
    this.log('Signal processing is handled by PeerJS');
  }
  
  /**
   * End the current call
   */
  endCall() {
    try {
      if (!this.callState) {
        return false;
      }
      
      this.log('Ending call');
      
      // Notify signaling server
      if (this.socket && this.callId) {
        this.socket.emit('end_call', {
          callId: this.callId,
          userId: this.userPublicKey
        });
      }
      
      // Update state
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended',
        contact: this.remoteUserKey,
        reason: 'ended_by_user'
      });
      
      // Clean up after a short delay to allow UI updates
      setTimeout(() => {
        this._cleanupCall();
      }, 1000);
      
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
    
    // Close peer connection
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
      this.peerConnection = null;
    }
    
    // Close PeerJS connection
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        console.error('Error destroying peer:', e);
      }
      this.peer = null;
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
    return this.callState === 'connecting' || this.callState === 'connected' || this.callState === 'ringing';
  }
  
  /**
   * Get current mute state
   */
  getMuteState() {
    return this.isMuted;
  }
  
  /**
   * Get diagnostic info for debugging
   */
  getDiagnosticInfo() {
    const info = {
      initialized: this.initialized,
      callState: this.callState,
      callId: this.callId,
      isMuted: this.isMuted,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
      socketConnected: this.socket && this.socket.connected,
      peerInitialized: !!this.peer,
      peerConnectionActive: !!this.peerConnection,
      userPublicKey: this.userPublicKey,
      remoteUserKey: this.remoteUserKey,
      browserInfo: {
        userAgent: navigator.userAgent,
        webRTCSupport: typeof RTCPeerConnection !== 'undefined',
        mediaDevicesSupport: !!navigator.mediaDevices
      }
    };
    
    return info;
  }
}

const voiceService = new VoiceService();
export default voiceService;
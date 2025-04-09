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
    
    // Connection attempts and tracking
    this.currentConnectionAttempt = 0;
    this.maxConnectionAttempts = 8; // Increased from 5 to 8 for more retries
    
    // Detect network type
    this.networkType = 'unknown';
    this.isMobileNetwork = false;
    
    // PeerJS configuration
    this.peerConfig = {
      // Set debug level (0 = errors only, 1 = errors & warnings, 2 = all logs)
      debug: 1,
      // ICE server configuration with TURN servers
      config: {
        iceServers: [
          // STUN servers
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          
          // TURN servers - using multiple TURN servers with different transport options
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          // Additional backup TURN servers
          {
            urls: 'turn:global.turn.twilio.com:3478?transport=udp',
            username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
            credential: 'w1WqTH/+zZXcYTtS235xQc/1UH/lW60SYl1HjZ4NEkQ='
          },
          {
            urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
            username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
            credential: 'w1WqTH/+zZXcYTtS235xQc/1UH/lW60SYl1HjZ4NEkQ='
          }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        // These help with mobile connections
        iceTransportPolicy: 'all', // Try with 'relay' if still having issues
        sdpSemantics: 'unified-plan'
      }
    };
    
    // Track call direction
    this.isOutgoingCall = false;
    
    // Timeouts for cleanup
    this.connectionTimeouts = [];
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
        
        // Detect network type
        this._detectNetworkType();
        
        // Initialize Socket.io
        this.socket = io(this.serverUrl, {
          reconnectionAttempts: 5,
          timeout: 10000,
          transports: ['websocket', 'polling']
        });
        
        // Set up socket event listeners
        this._setupSocketListeners();
        
        // Register with the signaling server
        this.socket.emit('register', { publicKey: this.userPublicKey });
        
        // Initialize PeerJS (but don't connect yet - we'll do this per call)
        this.peer = null; // Will be created on demand per call
        
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
   * Detect and monitor network type
   */
  _detectNetworkType() {
    try {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        // Get initial network type
        this.networkType = connection.type || connection.effectiveType || 'unknown';
        this.isMobileNetwork = this.networkType === 'cellular';
        
        this.log(`Detected network type: ${this.networkType}, Mobile: ${this.isMobileNetwork}`);
        
        // Listen for network changes
        connection.addEventListener('change', () => {
          this.networkType = connection.type || connection.effectiveType || 'unknown';
          this.isMobileNetwork = this.networkType === 'cellular';
          this.log(`Network changed: ${this.networkType}, Mobile: ${this.isMobileNetwork}`);
        });
      } else {
        // Fallback detection based on user agent (less reliable)
        const userAgent = navigator.userAgent.toLowerCase();
        this.isMobileNetwork = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
        this.networkType = this.isMobileNetwork ? 'cellular?' : 'unknown';
        this.log(`Network detection fallback: ${this.networkType}, Mobile: ${this.isMobileNetwork}`);
      }
    } catch (error) {
      console.error('Error detecting network type:', error);
      this.networkType = 'unknown';
      this.isMobileNetwork = false;
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
      this.isOutgoingCall = false;
      
      // Update call state
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', {
        state: 'ringing',
        contact: data.caller,
        callId: data.callId,
        outgoing: false
      });
    });
    
    this.socket.on('call_status', (data) => {
      this.log('Call status update:', data);
      
      // Update call state based on status
      if (data.status === 'ringing') {
        this.callState = 'ringing';
        this._notifyListeners('call_state_changed', {
          state: 'ringing',
          contact: this.remoteUserKey,
          outgoing: this.isOutgoingCall
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
    
    // Handle reconnection
    this.socket.on('reconnect', (attemptNumber) => {
      this.log(`Reconnected to signaling server after ${attemptNumber} attempts`);
      
      // Re-register with server
      this.socket.emit('register', { publicKey: this.userPublicKey });
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
      this.isOutgoingCall = true;
      
      // Re-check network type before starting call
      this._detectNetworkType();
      
      // Request audio permissions first, before any other operations
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
      
      // Reset connection attempt counter
      this.currentConnectionAttempt = 0;
      
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
      
      // Reset connection attempt counter
      this.currentConnectionAttempt = 0;
      
      // Initiate WebRTC connection from the answerer side as well
      this._initiateWebRTCConnection();
      
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
  
  _initiateWebRTCConnection() {
    return this._enhancedWebRTCConnection();
  }

  /**
   * Enhanced WebRTC connection with retry logic and mobile optimization
   * Improved to handle mobile data connections better
   */
  _enhancedWebRTCConnection() {
    if (!this.localStream) {
      this.log('Local stream not available, cannot initiate WebRTC');
      this.endCall();
      return;
    }
    
    this.log('Initiating enhanced WebRTC connection with:', this.remoteUserKey);
    this.log(`Network type: ${this.networkType}, Mobile: ${this.isMobileNetwork}`);
    
    // Clear all previous timeouts
    this._clearAllTimeouts();
    
    // Always create a fresh Peer instance
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        console.warn('Error destroying existing peer:', e);
      }
    }
    
    // Create unique peer ID based on call ID and our key
    const myPeerId = `${this.userPublicKey}-${this.callId}`;
    this.log('My peer ID:', myPeerId);
    
    // Adjust PeerJS config based on network type
    const peerConfig = {...this.peerConfig};
    
    // For mobile networks, prioritize TURN servers by using 'relay' policy
    if (this.isMobileNetwork) {
      this.log('Using mobile-optimized config with relay servers prioritized');
      peerConfig.config.iceTransportPolicy = 'relay';
    }
    
    // Initialize PeerJS with configuration
    this.peer = new Peer(myPeerId, peerConfig);
    
    // Track current connection attempt
    this.currentConnectionAttempt = 0;
    
    // Function to create a timeout with automatic cleanup
    const createTimeout = (callback, timeout) => {
      // Use longer timeout for mobile connections
      const adjustedTimeout = this.isMobileNetwork ? timeout * 2 : timeout;
      
      const timeoutId = setTimeout(() => {
        // Remove from tracked timeouts
        this.connectionTimeouts = this.connectionTimeouts.filter(id => id !== timeoutId);
        // Execute callback
        callback();
      }, adjustedTimeout);
      
      // Track timeout for cleanup
      this.connectionTimeouts.push(timeoutId);
      
      return timeoutId;
    };
    
    // Connection attempt function with improved retry logic
    const attemptConnection = () => {
      this.currentConnectionAttempt++;
      
      // Update the UI with connection attempt
      this._notifyListeners('connection_attempt', {
        attempt: this.currentConnectionAttempt
      });
      
      this.log(`Connection attempt ${this.currentConnectionAttempt} of ${this.maxConnectionAttempts}`);
      
      if (this.currentConnectionAttempt > this.maxConnectionAttempts) {
        this.log('Maximum connection attempts reached, giving up');
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'connection_failed'
        });
        
        this._cleanupCall();
        return;
      }
      
      try {
        const remotePeerId = `${this.remoteUserKey}-${this.callId}`;
        this.log('Calling remote peer:', remotePeerId);
        
        // Call the remote peer with enhanced options
        const callOptions = {
          metadata: {
            callId: this.callId,
            attempt: this.currentConnectionAttempt
          },
          // Lower values improve compatibility with mobile
          sdpTransform: (sdp) => {
            // Force low bitrate for audio to improve reliability on mobile
            return sdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=0; maxaveragebitrate=24000');
          }
        };
        
        // Make the call with audio stream and options
        this.peerConnection = this.peer.call(remotePeerId, this.localStream, callOptions);
        
        if (!this.peerConnection) {
          this.log('Failed to create peer connection');
          
          // Retry after delay
          createTimeout(() => {
            attemptConnection();
          }, 2000 + (this.currentConnectionAttempt * 500)); // Increase delay with each attempt
          
          return;
        }
        
        // Handle the connection
        this._handlePeerConnection();
        
        // Set timeout for this attempt - longer for mobile
        const timeoutDuration = this.isMobileNetwork ? 
          8000 + (this.currentConnectionAttempt * 1000) : // longer for mobile
          5000 + (this.currentConnectionAttempt * 500);   // shorter for wifi
          
        createTimeout(() => {
          // If we're still connecting, try again
          if (this.callState === 'connecting') {
            attemptConnection();
          }
        }, timeoutDuration);
      } catch (err) {
        console.error('Error calling remote peer:', err);
        
        // Retry after delay - progressive backoff
        createTimeout(() => {
          attemptConnection();
        }, 2000 + (this.currentConnectionAttempt * 1000));
      }
    };
    
    this.peer.on('open', (id) => {
      this.log('PeerJS connection opened with ID:', id);
      
      // Handle based on call direction
      if (this.isOutgoingCall) {
        // If this is an outgoing call, initiate connection with retry logic
        attemptConnection();
      }
    });
    
    this.peer.on('error', (err) => {
      this.log('PeerJS error:', err.type);
      
      if (err.type === 'peer-unavailable' && this.callState === 'connecting') {
        // For peer unavailable, if we're on mobile, wait longer between retries
        const retryDelay = this.isMobileNetwork ? 
          3000 + (this.currentConnectionAttempt * 1000) : 
          2000 + (this.currentConnectionAttempt * 500);
          
        createTimeout(() => {
          if (this.callState === 'connecting') {
            attemptConnection();
          }
        }, retryDelay);
        return;
      }
      
      // For network errors, try to reconnect more aggressively
      if (err.type === 'network' && this.callState === 'connecting') {
        this.log('Network error, attempting quick reconnect');
        createTimeout(() => {
          if (this.callState === 'connecting') {
            attemptConnection();
          }
        }, 1000);
        return;
      }
      
      // For server or socket errors, maybe the server is overloaded
      if ((err.type === 'server-error' || err.type === 'socket-error') && 
          this.callState === 'connecting') {
        createTimeout(() => {
          if (this.callState === 'connecting') {
            attemptConnection();
          }
        }, 3000);
        return;
      }
      
      // For other errors, end the call if still active and we've exhausted retries
      if (this.currentConnectionAttempt >= this.maxConnectionAttempts && 
          this.callState !== 'ended' && 
          this.callState !== null) {
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
    
    // Listen for incoming calls (important for the answerer)
    this.peer.on('call', (incomingCall) => {
      this.log('Received incoming PeerJS call');
      
      // Clear any existing timeouts
      this._clearAllTimeouts();
      
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
    if (!this.peerConnection) {
      this.log('No peer connection to handle');
      return;
    }
    
    // Handle remote stream
    this.peerConnection.on('stream', (stream) => {
      this.log('Received remote stream with tracks:', stream.getTracks().length);
      this.remoteStream = stream;
      
      // Notify listeners of remote stream
      this._notifyListeners('remote_stream_added', { stream });
      
      // Update call state to connected
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.remoteUserKey
      });
      
      // Clear all connection attempt timeouts
      this._clearAllTimeouts();
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
    
    // Listen for ICE connection state changes
    if (this.peerConnection.peerConnection) {
      const rtcPeerConn = this.peerConnection.peerConnection;
      
      rtcPeerConn.oniceconnectionstatechange = () => {
        this.log('ICE connection state:', rtcPeerConn.iceConnectionState);
        
        if (rtcPeerConn.iceConnectionState === 'failed') {
          this.log('ICE connection failed - may need to restart ICE');
          
          // Try to restart ICE if supported
          if (rtcPeerConn.restartIce) {
            rtcPeerConn.restartIce();
          }
        }
        
        // Handle disconnections
        if (rtcPeerConn.iceConnectionState === 'disconnected' && 
            this.callState === 'connected') {
          this.log('ICE connection disconnected - waiting to see if it reconnects');
          
          // Wait a bit to see if it reconnects
          setTimeout(() => {
            if (rtcPeerConn.iceConnectionState === 'disconnected' || 
                rtcPeerConn.iceConnectionState === 'failed') {
              this.log('ICE connection remained disconnected, ending call');
              this.endCall();
            }
          }, 5000);
        }
      };
    }
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
    
    // Clear all timeouts
    this._clearAllTimeouts();
    
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
    this.isOutgoingCall = false;
    this.currentConnectionAttempt = 0;
    
    // Notify listeners of final state
    this._notifyListeners('call_state_changed', { 
      state: null, 
      contact: previousRemoteUser
    });
  }
  
  /**
   * Clear all connection timeouts
   */
  _clearAllTimeouts() {
    // Clear all pending timeouts
    this.connectionTimeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.connectionTimeouts = [];
  }
  
  /**
   * Join a call with an existing call ID
   * @param {string} callId - The call ID to join
   * @param {string} contactPublicKey - The contact's public key
   */
  async joinCall(callId, contactPublicKey) {
    try {
      // Prevent joining if already in a call
      if (this.callState) {
        console.warn('Already in a call, cannot join another');
        return false;
      }
      
      this.log('Joining call:', callId, 'with contact:', contactPublicKey);
      
      // Re-check network type before starting call
      this._detectNetworkType();
      
      // Set call parameters
      this.callId = callId;
      this.remoteUserKey = contactPublicKey;
      this.isOutgoingCall = true; // We're initiating the connection
      
      // Request audio permissions
      this.log('Requesting microphone access for join');
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        });
        
        this.log('Microphone access granted for join, tracks:', this.localStream.getTracks().length);
      } catch (mediaError) {
        console.error('Failed to get audio stream for join:', mediaError);
        throw new Error('Microphone access denied. Please allow microphone access to make calls.');
      }
      
      // Update call state
      this.callState = 'connecting';
      this._notifyListeners('call_state_changed', { 
        state: 'connecting',
        contact: contactPublicKey,
        outgoing: true
      });
      
      // Reset connection attempt counter
      this.currentConnectionAttempt = 0;
      
      // Initiate WebRTC connection
      this._initiateWebRTCConnection();
      
      return true;
    } catch (error) {
      console.error('Error joining call:', error);
      this.endCall();
      throw error;
    }
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
   * Process a signaling message from the messaging system
   * This helps with WebRTC signaling over the message channel
   */
  processSignalingMessage(senderKey, signalData) {
    this.log('Processing incoming signaling message from:', senderKey);
    
    // Basic validation
    if (!signalData) {
      this.log('Invalid signal data received');
      return;
    }
    
    // For future implementation of direct signaling
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
      isOutgoingCall: this.isOutgoingCall,
      networkType: this.networkType,
      isMobileNetwork: this.isMobileNetwork,
      currentConnectionAttempt: this.currentConnectionAttempt,
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
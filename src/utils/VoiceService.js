'use client'

import Peer from 'simple-peer'
import conversationManager from './ConversationManager'

class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'connecting', 'connected', 'ended', null
    this.callId = null;
    this.isMuted = false;
    this.listeners = [];
    this.remoteUserKey = null; // Store the remote user's public key
    
    // WebRTC objects
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // Enhanced ICE servers config with more reliable STUN/TURN servers
    this.iceServers = [
      // STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voiparound.com' },
      
      // TURN servers - essential for NAT traversal when STUN fails
      // Coturn public server
      {
        urls: 'turn:ns515130.ip-167-114-103.net:3478',
        username: 'stun',
        credential: 'stun'
      },
      // Public TURN servers from openrelay.metered.ca
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
      }
    ];
    
    // Debug settings
    this.debug = true;
    this.logIceEvents = true; // Log ICE connection events for debugging
    
    // Track connection timing
    this.connectionTimer = null;
    this.connectionStartTime = null;
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
      this.log('Initializing WebRTC voice service with Simple-Peer');
      
      // Check if browser has WebRTC support
      if (typeof RTCPeerConnection === 'undefined') {
        console.error('WebRTC is not supported in this browser');
        return false;
      }
      
      // Check if browser has getUserMedia support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia is not supported in this browser');
        return false;
      }
      
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
      this.connectionTimer = setTimeout(() => {
        if (this.callState === 'connecting') {
          this.log('Connection timeout after 30s, still trying...');
          // Don't end the call, but notify for debugging
        }
      }, 30000);
      
      // Create peer as initiator with explicit config
      this.log('Creating peer connection as initiator');
      try {
        this.peer = new Peer({
          initiator: true,
          stream: this.localStream,
          trickle: true,
          config: { iceServers: this.iceServers },
          sdpTransform: (sdp) => {
            this.log('SDP created:', sdp.split('\n').length, 'lines');
            return sdp;
          }
        });
      } catch (peerError) {
        console.error('Error creating Peer:', peerError);
        throw new Error('Failed to create call connection: ' + peerError.message);
      }
      
      // Set up event handlers with enhanced debugging
      this._setupPeerEvents();
      
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
      
      if (!contactPublicKey) {
        throw new Error('Cannot join call: missing contact information');
      }
      
      this.remoteUserKey = contactPublicKey;
      this.callId = callId;
      
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
      
      // Start tracking connection time
      this.connectionStartTime = Date.now();
      this.connectionTimer = setTimeout(() => {
        if (this.callState === 'connecting') {
          this.log('Connection timeout after 30s, still trying...');
          // Don't end the call, but notify for debugging
        }
      }, 30000);
      
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
   * Set up event handlers for the Simple-Peer instance
   * @private
   */
  _setupPeerEvents() {
    if (!this.peer) return;
    
    // Handle signaling data
    this.peer.on('signal', data => {
      this.log('Generated signal data, sending to peer:', data.type);
      this._sendSignalingMessage({
        type: 'webrtc_signal',
        signal: data
      });
    });
    
    // Handle successful connection
    this.peer.on('connect', () => {
      this.log('Peer connection established!', 
        'Time taken:', (Date.now() - this.connectionStartTime) / 1000, 'seconds');
      
      // Clear connection timer
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.remoteUserKey
      });
      
      // Start heartbeat to keep connection alive
      this._startHeartbeat();
      
      // Send initial "connected" message
      if (this.peer.connected) {
        try {
          this.peer.send(JSON.stringify({ type: 'connected' }));
        } catch (e) {
          console.warn('Failed to send connected message:', e);
        }
      }
    });
    
    // Handle incoming stream
    this.peer.on('stream', stream => {
      this.log('Received remote stream, tracks:', stream.getTracks().length);
      
      // Check if it has audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.log('Remote audio track:', audioTracks[0].label, 'enabled:', audioTracks[0].enabled);
      } else {
        console.warn('Remote stream has no audio tracks');
      }
      
      this.remoteStream = stream;
      this._notifyListeners('remote_stream_added', { stream });
    });
    
    // Handle data channel messages
    this.peer.on('data', data => {
      try {
        const message = JSON.parse(data.toString());
        this.log('Received data channel message:', message.type);
        
        if (message.type === 'heartbeat') {
          // Send heartbeat response
          this.peer.send(JSON.stringify({ type: 'heartbeat_ack' }));
        }
      } catch (e) {
        this.log('Received non-JSON data:', data.toString());
      }
    });
    
    // Handle errors
    this.peer.on('error', err => {
      console.error('Peer connection error:', err);
      
      // Check for specific error types
      if (err.code === 'ERR_ICE_CONNECTION_FAILURE') {
        console.warn('ICE connection failure - STUN/TURN servers may be unreachable');
      }
      
      if (this.callState === 'connected' || this.callState === 'connecting') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          error: err.message
        });
        
        // Clean up after a delay
        setTimeout(() => this._cleanupCall(), 3000);
      }
    });
    
    // Handle peer closing
    this.peer.on('close', () => {
      this.log('Peer connection closed');
      if (this.callState === 'connected' || this.callState === 'connecting') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey
        });
        
        // Clean up after a delay
        setTimeout(() => this._cleanupCall(), 3000);
      }
    });
    
    // Handle ICE connection state changes if available
    try {
      const pc = this.peer._pc;
      if (pc && this.logIceEvents) {
        pc.addEventListener('iceconnectionstatechange', () => {
          this.log('ICE connection state changed:', pc.iceConnectionState);
          
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            const elapsedTime = (Date.now() - this.connectionStartTime) / 1000;
            this.log(`ICE connected in ${elapsedTime.toFixed(1)} seconds`);
          }
        });
        
        pc.addEventListener('icegatheringstatechange', () => {
          this.log('ICE gathering state changed:', pc.iceGatheringState);
        });
        
        pc.addEventListener('signalingstatechange', () => {
          this.log('Signaling state changed:', pc.signalingState);
        });
        
        // Log ICE candidates
        pc.addEventListener('icecandidate', (event) => {
          if (event.candidate) {
            this.log('ICE candidate:', 
              event.candidate.protocol,
              event.candidate.type,
              event.candidate.candidate.includes('relay') ? '(TURN)' : '(STUN)');
          } else {
            this.log('ICE candidate gathering complete');
          }
        });
        
        // Setup ICE connection timeout
        setTimeout(() => {
          if (pc.iceConnectionState === 'checking' || pc.iceConnectionState === 'new') {
            this.log('ICE connection taking too long (15s), may be blocked by firewall');
          }
        }, 15000);
      }
    } catch (e) {
      console.warn('Could not access internal peer connection for monitoring:', e);
    }
  }
  
  /**
   * Process signaling messages from remote users
   */
  async processSignalingMessage(senderKey, message) {
    if (!this.initialized) {
      console.warn('Voice service not initialized, cannot process signal');
      return;
    }
    
    // Extract real data if nested
    let actualMessage = message;
    if (message && message.data) {
      actualMessage = message.data;
    }
    
    const messageType = actualMessage.type || (actualMessage.signal ? actualMessage.signal.type : 'unknown');
    this.log('Processing signal from', senderKey, ':', messageType);
    
    try {
      // Handle WebRTC signaling data
      if (actualMessage.type === 'webrtc_signal' && actualMessage.signal) {
        // If we don't have a peer yet, but we're receiving a signal, create one
        if (!this.peer && ['offer', 'sdp'].includes(actualMessage.signal.type)) {
          this.log('Received offer but no peer exists, creating one');
          
          try {
            // Request microphone access if we don't have it yet
            if (!this.localStream) {
              this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                },
                video: false
              });
              
              // Verify audio tracks
              const audioTracks = this.localStream.getAudioTracks();
              if (audioTracks.length === 0) {
                console.warn('No audio track available after getUserMedia');
              } else {
                this.log('Audio track created:', audioTracks[0].label);
              }
            }
            
            // Create peer as non-initiator since we're receiving an offer
            this.peer = new Peer({
              initiator: false,
              stream: this.localStream,
              trickle: true,
              config: { iceServers: this.iceServers },
              sdpTransform: (sdp) => {
                this.log('SDP received:', sdp.split('\n').length, 'lines');
                return sdp;
              }
            });
            
            // Set up event handlers
            this._setupPeerEvents();
            
            // Set remote user key and update state
            this.remoteUserKey = senderKey;
            this.callState = 'connecting';
            this._notifyListeners('call_state_changed', {
              state: 'connecting',
              contact: senderKey
            });
            
            // Start tracking connection time
            this.connectionStartTime = Date.now();
          } catch (error) {
            console.error('Error creating peer from offer:', error);
            return;
          }
        }
        
        // If we have a peer, signal it with the received data
        if (this.peer) {
          this.log('Signaling peer with received data:', actualMessage.signal.type);
          this.peer.signal(actualMessage.signal);
        } else {
          console.warn('Received signal but no peer exists');
        }
      }
      // Handle join message
      else if (actualMessage.type === 'join') {
        this.log('Remote user joining call:', senderKey, actualMessage.callId);
        
        // If we don't have a peer yet, create one as initiator
        if (!this.peer) {
          try {
            // Request microphone access if we don't have it yet
            if (!this.localStream) {
              this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                },
                video: false
              });
            }
            
            // Create peer as initiator since we're accepting a join
            this.peer = new Peer({
              initiator: true,
              stream: this.localStream,
              trickle: true,
              config: { iceServers: this.iceServers }
            });
            
            // Set up event handlers
            this._setupPeerEvents();
            
            // Set remote user key and update state
            this.remoteUserKey = senderKey;
            this.callState = 'connecting';
            this._notifyListeners('call_state_changed', {
              state: 'connecting',
              contact: senderKey
            });
            
            // Start tracking connection time
            this.connectionStartTime = Date.now();
          } catch (error) {
            console.error('Error creating peer from join:', error);
            return;
          }
        }
      }
      // Handle end call message
      else if (actualMessage.type === 'end_call') {
        this._handleEndCall(senderKey);
      }
    } catch (error) {
      console.error('Error processing signal:', error);
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
          ...message,
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
   * Send periodic heartbeats to keep the connection alive
   * @private
   */
  _startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.peer && this.peer.connected) {
        try {
          this.peer.send(JSON.stringify({ type: 'heartbeat', time: Date.now() }));
        } catch (e) {
          console.warn('Failed to send heartbeat:', e);
        }
      }
    }, 10000); // Every 10 seconds
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
      
      // Clear connection timer if it exists
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      
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
    
    // Clear connection timer if it exists
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Destroy peer connection
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        console.error('Error destroying peer:', e);
      }
      this.peer = null;
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
      peerConnected: this.peer ? this.peer.connected : false,
      peerDestroyed: this.peer ? this.peer.destroyed : true,
      browserInfo: {
        userAgent: navigator.userAgent,
        webRTCSupport: typeof RTCPeerConnection !== 'undefined',
        mediaDevicesSupport: !!navigator.mediaDevices
      }
    };
    
    // Add ICE connection info if available
    try {
      if (this.peer && this.peer._pc) {
        info.iceConnectionState = this.peer._pc.iceConnectionState;
        info.iceGatheringState = this.peer._pc.iceGatheringState;
        info.signalingState = this.peer._pc.signalingState;
      }
    } catch (e) {
      info.peerDiagnosticError = e.message;
    }
    
    return info;
  }
}

// Create singleton instance
const voiceService = new VoiceService();
export default voiceService;
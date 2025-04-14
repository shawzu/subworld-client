'use client'

import { io } from 'socket.io-client';
import Peer from 'peerjs';

/**
 * Enhanced VoiceService - Now with group call support
 * Handles voice calls using Socket.io for signaling and Peer.js for WebRTC
 */
class VoiceService {
  constructor() {
    this.initialized = false;
    this.callState = null; // 'connecting', 'connected', 'ended', null
    this.callId = null;
    this.isMuted = false;
    this.listeners = [];
    this.remoteUserKey = null;

    // Group call properties
    this.isGroupCall = false;
    this.groupId = null;
    this.groupMembers = [];
    this.groupParticipants = new Map(); // Map of publicKey -> {stream, connection}
    this.localStream = null;

    // Socket.io connection
    this.socket = null;

    // PeerJS instance
    this.peer = null;
    this.peerConnections = new Map(); // Map for multiple connections in group calls
    this.remoteStream = null;

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
    this.maxConnectionAttempts = 8;

    // Detect network type
    this.networkType = 'unknown';
    this.isMobileNetwork = false;

    // Audio settings
    this.audioContext = null;
    this.audioProcessor = null;
    this.audioEnabled = true;

    // Improved PeerJS configuration for better audio streaming
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

          // TURN servers with multiple transport options
          {
            urls: [
              'turn:relay1.expressturn.com:3478'
            ],
            username: 'efQX0LFAL6X57HSHIV',
            credential: 'EUOrSrU4chhCfoRT'
          }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        // These help with mobile connections
        iceTransportPolicy: 'all', // Will be set to 'relay' for mobile
        sdpSemantics: 'unified-plan'
      },
      // Key options for audio handling
      constraints: {
        audio: true,
        video: false
      }
    };

    // Track call direction
    this.isOutgoingCall = false;

    // Timeouts for cleanup
    this.connectionTimeouts = [];

    // Audio-specific connection monitoring
    this.audioMonitoringInterval = null;
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

        // Fetch TURN credentials before initializing connections
        await this._fetchTurnCredentials();

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

        // Initialize AudioContext if available (will be fully activated on call)
        if (typeof window !== 'undefined' && window.AudioContext) {
          try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            // Suspend until needed (to save battery and comply with autoplay policies)
            this.audioContext.suspend();
          } catch (audioErr) {
            console.warn('AudioContext initialization failed:', audioErr);
            this.audioContext = null;
          }
        }

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
 * Set up socket event listeners - Extended for group calls
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
      this.isGroupCall = false;

      // Update call state
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', {
        state: 'ringing',
        contact: data.caller,
        callId: data.callId,
        outgoing: false,
        isGroup: false
      });
    });

    // New: Handle incoming group call
    this.socket.on('incoming_group_call', (data) => {
      this.log('Incoming group call:', data);
      this.callId = data.callId;
      this.remoteUserKey = data.caller;
      this.isOutgoingCall = false;
      this.isGroupCall = true;
      this.groupId = data.groupId;
      this.groupMembers = data.members || [];

      // Update call state
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', {
        state: 'ringing',
        contact: data.caller,
        callId: data.callId,
        outgoing: false,
        isGroup: true,
        groupId: data.groupId,
        groupName: data.groupName || 'Group Call',
        members: data.members || []
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
          outgoing: this.isOutgoingCall,
          isGroup: this.isGroupCall
        });
      } else if (data.status === 'failed') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: data.reason,
          isGroup: this.isGroupCall
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
          contact: data.recipient,
          isGroup: this.isGroupCall
        });

        // Start the WebRTC connection process
        this._initiateWebRTCConnection();
      } else {
        // Call rejected
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: data.recipient,
          reason: 'rejected',
          isGroup: this.isGroupCall
        });

        // Clean up after a short delay
        setTimeout(() => this._cleanupCall(), 3000);
      }
    });

    // New: Group call participant joined
    this.socket.on('group_call_participant_joined', (data) => {
      this.log('Group call participant joined:', data);

      if (this.isGroupCall && this.callId === data.callId) {
        // Add participant to tracking
        if (!this.groupParticipants.has(data.participant)) {
          this.groupParticipants.set(data.participant, { connected: false });

          // Notify listeners
          this._notifyListeners('participant_joined', {
            participant: data.participant,
            callId: data.callId
          });

          // If we're already connected and not the joining participant,
          // initiate connection to the new participant
          if (this.callState === 'connected' &&
            this.userPublicKey !== data.participant &&
            this.localStream) {
            this._connectToGroupParticipant(data.participant);
          }
        }
      }
    });

    // New: Group call participant left
    this.socket.on('group_call_participant_left', (data) => {
      this.log('Group call participant left:', data);

      if (this.isGroupCall && this.callId === data.callId) {
        // Remove participant from tracking
        if (this.groupParticipants.has(data.participant)) {
          // Close connection if exists
          const participantData = this.groupParticipants.get(data.participant);
          if (participantData.connection) {
            participantData.connection.close();
          }

          // Remove from map
          this.groupParticipants.delete(data.participant);

          // Notify listeners
          this._notifyListeners('participant_left', {
            participant: data.participant,
            callId: data.callId
          });
        }
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
        reason: 'remote_ended',
        isGroup: this.isGroupCall
      });

      // Clean up after a short delay
      setTimeout(() => this._cleanupCall(), 3000);
    });

    // New: Group call ended
    this.socket.on('group_call_ended', (data) => {
      this.log('Group call ended:', data);

      if (this.isGroupCall && this.callId === data.callId) {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'group_call_ended',
          isGroup: true,
          groupId: this.groupId
        });

        // Clean up after a short delay
        setTimeout(() => this._cleanupCall(), 3000);
      }
    });

    this.socket.on('disconnect', () => {
      this.log('Disconnected from signaling server');

      // If in a call, end it
      if (this.callState === 'connected' || this.callState === 'connecting' || this.callState === 'ringing') {
        this.callState = 'ended';
        this._notifyListeners('call_state_changed', {
          state: 'ended',
          contact: this.remoteUserKey,
          reason: 'signal_server_disconnected',
          isGroup: this.isGroupCall
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
 * Fetch TURN server credentials from our proxy server
 * @returns {Promise<boolean>} Success status
 */
async _fetchTurnCredentials() {
  try {
    this.log('Fetching TURN credentials from proxy server');

    const response = await fetch(`${this.serverUrl}/turn-credentials`);

    if (!response.ok) {
      throw new Error(`Failed to fetch TURN credentials: ${response.status}`);
    }

    const data = await response.json();
    this.log('Received TURN credentials');

    // Update ice servers configuration with the received credentials
    if (data && data.iceServers && Array.isArray(data.iceServers)) {
      // Replace all existing ice servers with our custom ones
      this.peerConfig.config.iceServers = data.iceServers;

      this.log('Updated ICE servers with custom TURN servers');
      return true;
    } else {
      this.log('Invalid TURN credentials format received');
      return false;
    }
  } catch (error) {
    console.warn('Error fetching TURN credentials:', error);
    
    // Use a fallback set of TURN servers
    const fallbackTurnServers = [
      {
        urls: [
          'turn:relay1.expressturn.com:3478'
        ],
        username: 'efQX0LFAL6X57HSHIV',
        credential: 'EUOrSrU4chhCfoRT'
      }
    ];
    
    // Update with fallback servers
    this.peerConfig.config.iceServers = [
      // Keep STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Add fallback TURN servers
      ...fallbackTurnServers
    ];
    
    this.log('Using fallback TURN servers');
    return true;
  }
}

/**
 * Clear all connection timeouts
 * @private
 */
_clearAllTimeouts() {
  // Clear all pending timeouts
  if (this.connectionTimeouts && Array.isArray(this.connectionTimeouts)) {
    this.connectionTimeouts.forEach(timeoutId => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    this.connectionTimeouts = [];
  }
  
  this.log('Cleared all connection timeouts');
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
      this.isGroupCall = false;

      // Request microphone and establish local stream
      await this._setupLocalStream();

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
        outgoing: true,
        isGroup: false
      });

      return true;
    } catch (error) {
      console.error('Error initiating call:', error);
      this.endCall();
      throw error;
    }
  }

  /**
  * Initiate a group call
  * @param {string} groupId - The group ID
  * @param {string} groupName - Name of the group
  * @param {Array} members - Array of member public keys
  * @returns {Promise<boolean>} - Success status
  */
  async initiateGroupCall(groupId, groupName, members) {
    try {
      // Prevent initiating multiple calls
      if (this.callState) {
        console.warn('Already in a call');
        return false;
      }

      this.log('Initiating group call:', groupId, members);
      this.isOutgoingCall = true;
      this.isGroupCall = true;
      this.groupId = groupId;
      this.groupMembers = members;

      // Request microphone and establish local stream
      await this._setupLocalStream();

      // Generate a unique call ID
      this.callId = `grpcall-${groupId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.log('Generated group call ID:', this.callId);

      // Start tracking connection time
      this.connectionStartTime = Date.now();

      // Reset connection attempt counter
      this.currentConnectionAttempt = 0;

      // Initialize empty participants map with the group members
      this.groupParticipants.clear();
      members.forEach(member => {
        if (member !== this.userPublicKey) { // Skip ourselves
          this.groupParticipants.set(member, { connected: false });
        }
      });

      // Send group call request to signaling server
      this.socket.emit('group_call_request', {
        callId: this.callId,
        caller: this.userPublicKey,
        groupId: groupId,
        groupName: groupName,
        members: members
      });

      // Update call state to ringing
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', {
        state: 'ringing',
        groupId: groupId,
        groupName: groupName,
        members: members,
        outgoing: true,
        isGroup: true
      });

      return true;
    } catch (error) {
      console.error('Error initiating group call:', error);
      this.endCall();
      throw error;
    }
  }
  /**
   * Setup local audio stream with optimal settings
   */
  async _setupLocalStream() {
    // Re-check network type before starting call
    this._detectNetworkType();

    this.log('Requesting microphone access with optimized settings');
    try {
      // Optimize audio constraints based on network type
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };

      // On mobile, add additional constraints for better reliability
      if (this.isMobileNetwork) {
        audioConstraints.channelCount = 1; // Mono audio (lower bandwidth)
        audioConstraints.sampleRate = 16000; // Lower sample rate
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });

      this.log('Microphone access granted, tracks:', this.localStream.getTracks().length);

      // Verify audio tracks
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio track available');
      }

      // Process the audio for better quality
      const processedStream = this._processAudioStream(this.localStream);

      // Use processed stream if available, otherwise use original
      if (processedStream && processedStream.getAudioTracks().length > 0) {
        this.localStream = processedStream;
        this.log('Using processed audio stream');
      }

      // Make sure audio tracks are enabled
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true;
        this.log('Audio track enabled:', track.label);
      });

      return this.localStream;
    } catch (mediaError) {
      console.error('Failed to get audio stream:', mediaError);
      throw new Error('Microphone access denied. Please allow microphone access to make calls.');
    }
  }

  /**
   * Detect and monitor network type
   */
  _detectNetworkType() {
    try {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const userAgent = navigator.userAgent.toLowerCase();

      // Multiple detection methods
      const isCellular = connection?.type === 'cellular';
      const isUserAgentMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      const isEffectiveTypeSlow = connection?.effectiveType === 'slow-2g' ||
        connection?.effectiveType === '2g' ||
        connection?.effectiveType === '3g';

      this.isMobileNetwork = isCellular || isUserAgentMobile || isEffectiveTypeSlow;
      this.networkType = this.isMobileNetwork ? 'mobile' : 'wifi';

      this.log(`Network Detection:
        Connection Type: ${connection?.type || 'unknown'}
        Effective Type: ${connection?.effectiveType || 'unknown'}
        Save Data: ${connection?.saveData || 'unknown'}
        Final Network Type: ${this.networkType}
      `);
    } catch (error) {
      console.error('Network detection failed:', error);
    }
  }

  /**
   * Process audio stream to optimize for network conditions
   */
  _processAudioStream(stream) {
    // If we don't have AudioContext or we're not in a call, just return the stream as-is
    if (!this.audioContext || !stream) return stream;

    try {
      // Make sure AudioContext is running
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create a source from the audio stream
      const source = this.audioContext.createMediaStreamSource(stream);

      // Create a gain node to control volume
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 1.0; // Normal volume

      // Create a compressor to improve audibility
      const compressor = this.audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Create destination for output
      const destination = this.audioContext.createMediaStreamDestination();

      // Connect the nodes
      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(destination);

      // Store reference to processor for later adjustment
      this.audioProcessor = {
        source,
        gainNode,
        compressor,
        destination
      };

      // Return the processed stream
      return destination.stream;
    } catch (err) {
      console.warn('Error processing audio stream:', err);
      return stream; // Return original stream on error
    }
  }

  /**
   * Answer an incoming call
   */
  async answerCall() {
    try {
      if (this.callState !== 'ringing' || !this.callId) {
        console.warn('No incoming call to answer');
        return false;
      }

      this.log('Answering call from:', this.remoteUserKey);

      // Setup local audio stream
      await this._setupLocalStream();

      // Send call accepted message
      this.socket.emit('call_response', {
        callId: this.callId,
        response: 'accepted',
        recipient: this.userPublicKey,
        caller: this.remoteUserKey,
        isGroup: this.isGroupCall
      });

      // Update call state
      this.callState = 'connecting';
      this._notifyListeners('call_state_changed', {
        state: 'connecting',
        contact: this.remoteUserKey,
        isGroup: this.isGroupCall
      });

      // Reset connection attempt counter
      this.currentConnectionAttempt = 0;

      // Initiate WebRTC connection
      if (this.isGroupCall) {
        // Send join message to signaling server so others know we've joined
        this.socket.emit('group_call_join', {
          callId: this.callId,
          groupId: this.groupId,
          participant: this.userPublicKey
        });

        // Initialize PeerJS
        await this._initializePeerJS();

        // Connect to all existing participants
        this.groupParticipants.forEach((data, participantKey) => {
          if (participantKey !== this.userPublicKey) {
            this._connectToGroupParticipant(participantKey);
          }
        });
      } else {
        // For regular 1:1 calls
        this._initiateWebRTCConnection();
      }

      return true;
    } catch (error) {
      console.error('Error answering call:', error);
      this.endCall();
      throw error;
    }
  }

  /**
   * Initialize PeerJS for WebRTC connections
   */
  async _initializePeerJS() {
    // Clear all previous timeouts
    this._clearAllTimeouts();

    // Refresh TURN credentials before establishing connection
    await this._fetchTurnCredentials();

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
    const peerConfig = JSON.parse(JSON.stringify(this.peerConfig)); // Deep clone

    // For mobile networks, prioritize TURN servers by using 'relay' policy
    if (this.isMobileNetwork) {
      this.log('Using mobile-optimized config with relay servers prioritized');
      peerConfig.config.iceTransportPolicy = 'relay';
    }

    // Initialize PeerJS with configuration
    this.peer = new Peer(myPeerId, peerConfig);

    // Set up event handlers
    this.peer.on('open', (id) => {
      this.log('PeerJS connection opened with ID:', id);
    });

    this.peer.on('error', (err) => {
      this.log('PeerJS error:', err.type);

      // Handle connection errors
      if (err.type === 'peer-unavailable') {
        // This can happen in group calls when multiple connections are being established
        this.log('Peer unavailable, may retry later if in group call');
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.log('Network or server error in PeerJS');
      }
    });

    // Listen for incoming calls (important for group calls)
    this.peer.on('call', (incomingCall) => {
      this.log('Received incoming PeerJS call from:', incomingCall.peer);

      // Enhanced answer options
      const answerOptions = {
        sdpTransform: (sdp) => {
          // Add additional SDP modifications for better mobile compatibility
          let modifiedSdp = sdp;

          // Force opus codec with specific parameters for better audio
          modifiedSdp = modifiedSdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=0; sprop-stereo=0; maxaveragebitrate=24000');

          // Add b=AS line to limit bandwidth
          const bandwidthValue = this.isMobileNetwork ? '30' : '50'; // kbps
          const lines = modifiedSdp.split('\r\n');
          const audioIndex = lines.findIndex(line => line.startsWith('m=audio'));

          if (audioIndex !== -1) {
            // Add bandwidth restriction after the m=audio line
            lines.splice(audioIndex + 1, 0, `b=AS:${bandwidthValue}`);
            modifiedSdp = lines.join('\r\n');
          }

          // Set audio to high priority
          modifiedSdp = modifiedSdp.replace(/a=mid:0/g, 'a=mid:0\r\na=content:main\r\na=priority:high');

          return modifiedSdp;
        }
      };

      // Extract the caller's public key from the peer ID
      const callerPeerId = incomingCall.peer;
      const callerPublicKey = callerPeerId.split('-')[0];

      // Verify audio tracks are enabled before answering
      this.localStream.getAudioTracks().forEach(track => {
        if (!track.enabled) {
          track.enabled = true;
          this.log('Re-enabled audio track before answering call');
        }
      });

      // Answer the call with our local stream and options
      incomingCall.answer(this.localStream, answerOptions);

      // If in a group call, track this connection
      if (this.isGroupCall) {
        if (this.groupParticipants.has(callerPublicKey)) {
          const participantData = this.groupParticipants.get(callerPublicKey);
          participantData.connection = incomingCall;
          this.groupParticipants.set(callerPublicKey, participantData);
        } else {
          // New participant
          this.groupParticipants.set(callerPublicKey, {
            connection: incomingCall,
            connected: false
          });
        }

        // Handle this participant's stream
        this._handlePeerConnectionForGroup(incomingCall, callerPublicKey);
      } else {
        // For 1:1 calls
        this.peerConnection = incomingCall;
        this._handlePeerConnection();
      }
    });

    return this.peer;
  }

  /**
  * Reject an incoming call - works for both 1:1 and group calls
  */
  rejectCall() {
    if (this.callState !== 'ringing' || !this.callId) {
      console.warn('No incoming call to reject');
      return false;
    }

    this.log('Rejecting call from:', this.remoteUserKey);

    // Send call rejected message
    this.socket.emit('call_response', {
      callId: this.callId,
      response: 'rejected',
      recipient: this.userPublicKey,
      caller: this.remoteUserKey,
      isGroup: this.isGroupCall // Include isGroup flag for group calls
    });

    // Update call state
    this.callState = 'ended';
    this._notifyListeners('call_state_changed', {
      state: 'ended',
      contact: this.remoteUserKey,
      reason: 'rejected_by_user',
      isGroup: this.isGroupCall
    });

    // Clean up
    this._cleanupCall();

    return true;
  }

  /**
   * Connect to a specific group participant
   * @param {string} participantKey - The participant's public key
   * @private
   */
  _connectToGroupParticipant(participantKey) {
    if (!this.peer || !this.localStream) {
      this.log(`Cannot connect to participant ${participantKey} - peer or stream not ready`);
      return;
    }

    try {
      // Create a unique ID for this connection
      const remotePeerId = `${participantKey}-${this.callId}`;
      this.log(`Connecting to group participant: ${participantKey} with peer ID ${remotePeerId}`);

      // Enhanced call options for better audio
      const callOptions = {
        metadata: {
          callId: this.callId,
          groupId: this.groupId,
          isGroup: true
        },
        sdpTransform: (sdp) => {
          // Add SDP modifications for better audio quality
          let modifiedSdp = sdp;

          // Force opus codec with specific parameters
          modifiedSdp = modifiedSdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=0; sprop-stereo=0; maxaveragebitrate=24000');

          // Add bandwidth restriction
          const bandwidthValue = this.isMobileNetwork ? '30' : '50'; // kbps
          const lines = modifiedSdp.split('\r\n');
          const audioIndex = lines.findIndex(line => line.startsWith('m=audio'));

          if (audioIndex !== -1) {
            // Add bandwidth restriction after the m=audio line
            lines.splice(audioIndex + 1, 0, `b=AS:${bandwidthValue}`);
            modifiedSdp = lines.join('\r\n');
          }

          // Set audio priority
          modifiedSdp = modifiedSdp.replace(/a=mid:0/g, 'a=mid:0\r\na=content:main\r\na=priority:high');

          return modifiedSdp;
        }
      };

      // Make the call to this participant
      const connection = this.peer.call(remotePeerId, this.localStream, callOptions);

      if (connection) {
        // Store the connection
        if (this.groupParticipants.has(participantKey)) {
          const participantData = this.groupParticipants.get(participantKey);
          participantData.connection = connection;
          this.groupParticipants.set(participantKey, participantData);
        } else {
          this.groupParticipants.set(participantKey, { connection, connected: false });
        }

        // Handle this connection
        this._handlePeerConnectionForGroup(connection, participantKey);
      } else {
        this.log(`Failed to create connection to participant ${participantKey}`);
      }
    } catch (error) {
      console.error(`Error connecting to group participant ${participantKey}:`, error);
    }
  }

  /**
   * Handle peer connection for a group participant
   * @param {Object} connection - The peer connection
   * @param {string} participantKey - The participant's public key
   * @private
   */
  _handlePeerConnectionForGroup(connection, participantKey) {
    if (!connection) {
      this.log(`No connection to handle for participant ${participantKey}`);
      return;
    }

    this.log(`Setting up connection handlers for participant ${participantKey}`);

    // Handle remote stream
    connection.on('stream', (stream) => {
      this.log(`Received stream from participant ${participantKey}`);

      // Store the stream with the participant data
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);
        participantData.stream = stream;
        participantData.connected = true;
        this.groupParticipants.set(participantKey, participantData);

        // Notify listeners about this stream
        this._notifyListeners('participant_stream_added', {
          participant: participantKey,
          stream: stream
        });

        // If this is our first connection, update call state to connected
        if (this.callState !== 'connected') {
          this.callState = 'connected';
          this._notifyListeners('call_state_changed', {
            state: 'connected',
            isGroup: true,
            groupId: this.groupId
          });
        }
      }
    });

    // Handle connection closing
    connection.on('close', () => {
      this.log(`Connection closed with participant ${participantKey}`);

      // Update participant data
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);
        participantData.connected = false;
        participantData.connection = null;
        this.groupParticipants.set(participantKey, participantData);

        // Notify listeners
        this._notifyListeners('participant_disconnected', {
          participant: participantKey
        });
      }

      // Check if we still have any active connections
      let hasActiveConnections = false;
      this.groupParticipants.forEach((data) => {
        if (data.connected) hasActiveConnections = true;
      });

      // If no active connections and we're not ending the call, try to reconnect
      if (!hasActiveConnections && this.callState === 'connected') {
        // Allow a brief period for reconnection before giving up
        setTimeout(() => {
          let stillNoConnections = true;
          this.groupParticipants.forEach((data) => {
            if (data.connected) stillNoConnections = false;
          });

          if (stillNoConnections && this.callState === 'connected') {
            this.log('All group participants disconnected, ending call');
            this.endCall();
          }
        }, 10000); // 10 second grace period
      }
    });

    // Handle errors
    connection.on('error', (err) => {
      console.error(`Error in connection with participant ${participantKey}:`, err);

      // Mark connection as failed
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);
        participantData.connected = false;
        participantData.error = err.message || 'Connection error';
        this.groupParticipants.set(participantKey, participantData);

        // Try to reconnect
        setTimeout(() => {
          if (this.callState === 'connected' && this.groupParticipants.has(participantKey)) {
            const currentData = this.groupParticipants.get(participantKey);
            if (!currentData.connected) {
              this.log(`Attempting to reconnect to participant ${participantKey}`);
              this._connectToGroupParticipant(participantKey);
            }
          }
        }, 3000); // Wait 3 seconds before retry
      }
    });
  }

  /**
   * End the current call - expanded for group calls
   */
  endCall() {
    try {
      if (!this.callState) {
        return false;
      }

      this.log('Ending call:', this.isGroupCall ? 'group call' : 'direct call');

      // Notify signaling server
      if (this.socket && this.callId) {
        if (this.isGroupCall) {
          this.socket.emit('end_group_call', {
            callId: this.callId,
            groupId: this.groupId,
            userId: this.userPublicKey
          });
        } else {
          this.socket.emit('end_call', {
            callId: this.callId,
            userId: this.userPublicKey
          });
        }
      }

      // Update state
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', {
        state: 'ended',
        contact: this.remoteUserKey,
        reason: 'ended_by_user',
        isGroup: this.isGroupCall,
        groupId: this.isGroupCall ? this.groupId : undefined
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
   * Clean up call resources - enhanced for group calls
   */
  _cleanupCall() {
    this.log('Cleaning up call resources');

    // Clear all timeouts
    this._clearAllTimeouts();

    // Clear audio monitoring
    if (this.audioMonitoringInterval) {
      clearInterval(this.audioMonitoringInterval);
      this.audioMonitoringInterval = null;
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

    // Clean up audio processing
    if (this.audioProcessor) {
      try {
        // Disconnect audio processing nodes
        if (this.audioProcessor.source) {
          this.audioProcessor.source.disconnect();
        }
        if (this.audioProcessor.gainNode) {
          this.audioProcessor.gainNode.disconnect();
        }
        if (this.audioProcessor.compressor) {
          this.audioProcessor.compressor.disconnect();
        }
      } catch (e) {
        console.warn('Error cleaning up audio processor:', e);
      }
      this.audioProcessor = null;
    }

    // Suspend AudioContext to save resources
    if (this.audioContext && this.audioContext.state === 'running') {
      try {
        this.audioContext.suspend();
      } catch (e) {
        console.warn('Error suspending audio context:', e);
      }
    }

    // For group calls, close all participant connections
    if (this.isGroupCall && this.groupParticipants && this.groupParticipants.size > 0) {
      this.groupParticipants.forEach((data, participantKey) => {
        if (data.connection) {
          try {
            data.connection.close();
          } catch (e) {
            console.warn(`Error closing connection to participant ${participantKey}:`, e);
          }
        }
      });

      // Clear group participants
      this.groupParticipants.clear();
    }

    // Close main peer connection
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

    // Reset group call properties
    this.isGroupCall = false;
    this.groupId = null;
    this.groupMembers = [];

    // Notify listeners of final state
    this._notifyListeners('call_state_changed', {
      state: null,
      contact: previousRemoteUser
    });
  }

  /**
   * Process a WebRTC signal from a remote peer - improved for group calls
   */
  _processSignal(signal, sender) {
    // This is handled by PeerJS internally
    this.log(`Signal processing from ${sender} ${this.isGroupCall ? 'for group call' : 'for direct call'}`);
  }

}

const voiceService = new VoiceService();
export default voiceService;
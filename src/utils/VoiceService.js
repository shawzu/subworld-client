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
        
        // ADD THIS LINE HERE - Set up enhanced socket connection for better mobile compatibility
        this._setupEnhancedSocketConnection();
  
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
  * Set up socket event listeners - Fixed for group calls
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
      this.groupName = data.groupName || 'Group Call';
      this.groupMembers = data.members || [];

      // Initialize group participants map
      this.groupParticipants.clear();
      if (Array.isArray(data.members)) {
        data.members.forEach(memberId => {
          if (memberId !== this.userPublicKey) {
            this.groupParticipants.set(memberId, { connected: false });
          }
        });
      }

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

    // ADDED: Critical missing handler for group call participants list
    this.socket.on('group_call_participants', (data) => {
      this.log('Received group call participants list:', data);

      if (this.isGroupCall && this.callId === data.callId && Array.isArray(data.participants)) {
        this.log(`Received ${data.participants.length} participants for group call ${this.callId}`);

        // Reset the participants map first
        this.groupParticipants.clear();

        // Add each participant to the map
        data.participants.forEach(participantId => {
          if (participantId !== this.userPublicKey) { // Skip ourselves
            // Store the participant with connection status
            this.groupParticipants.set(participantId, {
              connected: false,
              connecting: false
            });

            this.log(`Added participant ${participantId} to connect to`);
          }
        });

        // Change to connected state if we're answering and have participants
        if (this.callState === 'connecting' && !this.isOutgoingCall) {
          // A short delay ensures PeerJS is fully initialized
          setTimeout(() => {
            if (this.callState === 'connecting') {
              this.log('Transitioning to connected state after receiving participants list');
              this.callState = 'connected';
              this._notifyListeners('call_state_changed', {
                state: 'connected',
                isGroup: true,
                groupId: this.groupId,
                groupName: this.groupName || 'Group Call'
              });

              // Now connect to each participant
              this.groupParticipants.forEach((data, participantId) => {
                this.log(`Initiating connection to participant: ${participantId}`);
                this._connectToGroupParticipant(participantId);
              });
            }
          }, 1000); // Small delay to ensure PeerJS is ready
        } else if (this.callState === 'connected') {
          // If we're already connected (as the originator), connect to any new participants
          this.groupParticipants.forEach((data, participantId) => {
            if (!data.connected && !data.connecting) {
              this.log(`Initiating connection to new participant: ${participantId}`);
              this._connectToGroupParticipant(participantId);
            }
          });
        }
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
  * Initiate a group call - FIXED VERSION
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

      // Normalize groupId - remove 'group-' prefix if present
      let normalizedGroupId = groupId;
      if (normalizedGroupId.startsWith('group-')) {
        normalizedGroupId = normalizedGroupId.substring(6);
      }

      this.log('Initiating group call:', normalizedGroupId, members);
      this.isOutgoingCall = true;
      this.isGroupCall = true;
      this.groupId = normalizedGroupId;
      this.groupName = groupName || 'Group Call';

      // IMPROVEMENT: Get fresh member list from server when available
      if (typeof window !== 'undefined' && window.conversationManager) {
        try {
          // Refresh the group data to get the latest member list
          const freshGroup = await window.conversationManager.refreshGroup(normalizedGroupId);
          if (freshGroup && Array.isArray(freshGroup.members)) {
            this.log('Using fresh member list from server:', freshGroup.members.length, 'members');
            this.groupMembers = [...freshGroup.members];
          } else {
            this.groupMembers = Array.isArray(members) ? [...members] : [];
          }
        } catch (refreshErr) {
          console.warn('Could not refresh group data, using provided members list:', refreshErr);
          this.groupMembers = Array.isArray(members) ? [...members] : [];
        }
      } else {
        this.groupMembers = Array.isArray(members) ? [...members] : [];
      }

      // Request microphone and establish local stream
      await this._setupLocalStream();

      // Generate a SIMPLER call ID - just use groupId with a timestamp
      this.callId = `${normalizedGroupId}-${Date.now()}`;
      this.log('Generated group call ID:', this.callId);

      // Initialize PeerJS first, wait for it to be ready
      await this._initializePeerJS();

      // Send group call request to signaling server
      this.socket.emit('group_call_request', {
        callId: this.callId,
        caller: this.userPublicKey,
        groupId: normalizedGroupId,
        groupName: this.groupName,
        members: this.groupMembers
      });

      // Update call state to ringing
      this.callState = 'ringing';
      this._notifyListeners('call_state_changed', {
        state: 'ringing',
        groupId: normalizedGroupId,
        groupName: this.groupName,
        members: this.groupMembers,
        outgoing: true,
        isGroup: true
      });

      // Set a timeout to transition from ringing to connected for initiator
      setTimeout(() => {
        if (this.callState === 'ringing') {
          this.log('Transitioning from ringing to connected for group call initiator');
          this.callState = 'connected';
          this._notifyListeners('call_state_changed', {
            state: 'connected',
            isGroup: true,
            groupId: this.groupId,
            groupName: this.groupName,
            members: this.groupMembers
          });
        }
      }, 5000);

      return true;
    } catch (error) {
      console.error('Error initiating group call:', error);
      this.endCall();
      throw error;
    }
  }


  /**
 * Improve socket connection with keepalive and reconnect logic
 * Call this method from initialize()
 */
  _setupEnhancedSocketConnection() {
    if (!this.socket) return;

    // Store the original socket
    const originalSocket = this.socket;

    // Add ping/pong for keepalive (important for mobile)
    this.keepAliveInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        // Send a ping to keep connection alive
        this.socket.emit('ping', { timestamp: Date.now() });
      } else if (this.socket) {
        // Try to reconnect if disconnected
        this.socket.connect();
      }
    }, 25000); // Send keepalive every 25 seconds

    // Enhanced reconnection strategy
    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.log(`Socket reconnect attempt: ${attempt}`);

      // Increase timeout for later reconnection attempts
      this.socket.io.opts.timeout = Math.min(20000, 5000 * (attempt + 1));

      // Disable transport upgrades on mobile to improve stability
      if (this.isMobileNetwork) {
        this.socket.io.opts.upgrade = false;
      }
    });

    // Handle reconnect success
    this.socket.on('reconnect', () => {
      this.log('Socket reconnected. Re-registering with signaling server.');

      // Re-register with the server
      this.socket.emit('register', { publicKey: this.userPublicKey });

      // Check for any missed calls if we have a conversation manager
      this._checkForMissedCalls();
    });


  }

  /**
 * Check for any missed calls or active calls we should join
 * This helps with mobile devices that might have connectivity issues
 */
  async _checkForMissedCalls() {
    try {
      if (typeof window === 'undefined' || !window.conversationManager) return;

      this.log('Checking for missed or active calls after reconnection');

      // Force refresh of conversations to check for call invitations
      await window.conversationManager.fetchNewMessages();


    } catch (err) {
      console.warn('Error checking for missed calls:', err);
    }
  }

  /**
 * Clean up keepalive interval on call end or component unmount
 * Add this call to the _cleanupCall method
 */
  _cleanupSocketEnhancements() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
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

      this.log(`Comprehensive Network Detection:
       Cellular Connection: ${isCellular}
       User Agent Mobile: ${isUserAgentMobile}
       Slow Network Type: ${isEffectiveTypeSlow}
       Final Network Type: ${this.networkType}
     `);
    } catch (error) {
      console.error('Advanced network detection failed:', error);
    }
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
      this.log(`Audio track ${track.label} ${track.enabled ? 'enabled' : 'disabled'}`);
    });

    this._notifyListeners('mute_changed', { isMuted: this.isMuted });
    return this.isMuted;
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
  * Answer an incoming group call - FIXED VERSION
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

      // Check if this is a group call or regular call and handle differently
      if (this.isGroupCall) {
        this.log('Answering group call for group:', this.groupId);

        // Update call state first
        this.callState = 'connecting';
        this._notifyListeners('call_state_changed', {
          state: 'connecting',
          contact: this.remoteUserKey,
          isGroup: true,
          groupId: this.groupId,
          groupName: this.groupName || 'Group Call'
        });

        // CRITICAL FIX: First initialize PeerJS with Promise to ensure it's ready
        try {
          await this._initializePeerJS();
          this.log('PeerJS initialized successfully, ready to join call');

          // After PeerJS is initialized, send group_call_join
          this.socket.emit('group_call_join', {
            callId: this.callId,
            groupId: this.groupId,
            participant: this.userPublicKey
          });

          // Reset connection attempt counter
          this.currentConnectionAttempt = 0;

          // Set a fallback timer to transition to connected state even if no participants join
          setTimeout(() => {
            if (this.callState === 'connecting') {
              this.log('No participants joined yet, transitioning to connected state anyway');
              this.callState = 'connected';
              this._notifyListeners('call_state_changed', {
                state: 'connected',
                isGroup: true,
                groupId: this.groupId,
                groupName: this.groupName || 'Group Call'
              });
            }
          }, 8000);

        } catch (peerError) {
          console.error('Failed to initialize PeerJS:', peerError);
          // Still send join message even if PeerJS fails - it might recover
          this.socket.emit('group_call_join', {
            callId: this.callId,
            groupId: this.groupId,
            participant: this.userPublicKey
          });
        }

      } else {
        // For regular 1:1 calls, send call_response as before
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
          contact: this.remoteUserKey,
          isGroup: false
        });

        // Reset connection attempt counter
        this.currentConnectionAttempt = 0;

        // Initiate WebRTC connection
        this._initiateWebRTCConnection();
      }

      return true;
    } catch (error) {
      console.error('Error answering call:', error);
      this.endCall();
      throw error;
    }
  }


  _initiateWebRTCConnection() {
    return this._enhancedWebRTCConnection();
  }

  /**
 * Enhanced WebRTC connection with retry logic and mobile optimization
 * Improved to handle mobile data connections better with audio focus
 */
  async _enhancedWebRTCConnection() {
    if (!this.localStream) {
      this.log('Local stream not available, cannot initiate WebRTC');
      this.endCall();
      return;
    }

    this.log('Initiating enhanced WebRTC connection with:', this.remoteUserKey);
    this.log(`Network type: ${this.networkType}, Mobile: ${this.isMobileNetwork}`);

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

    // FIXED: Standardize peer ID format - Remove callId from the ID to keep it simple
    const myPeerId = this.userPublicKey;
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
        // FIXED: Use remote public key as the peer ID - not combining with callId
        const remotePeerId = this.remoteUserKey;
        this.log('Calling remote peer:', remotePeerId);

        // Enhanced call options for better audio
        const callOptions = {
          metadata: {
            callId: this.callId,
            attempt: this.currentConnectionAttempt,
            networkType: this.networkType
          },
          // Modify SDP offer to optimize for audio quality
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

        // Verify audio tracks are enabled before calling
        this.localStream.getAudioTracks().forEach(track => {
          if (!track.enabled) {
            track.enabled = true;
            this.log('Re-enabled audio track before call');
          }
        });

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

      // Verify audio tracks are enabled before answering
      this.localStream.getAudioTracks().forEach(track => {
        if (!track.enabled) {
          track.enabled = true;
          this.log('Re-enabled audio track before answering call');
        }
      });

      // Answer the call with our local stream and options
      incomingCall.answer(this.localStream, answerOptions);

      // Update our connection reference
      this.peerConnection = incomingCall;

      // Handle the connection
      this._handlePeerConnection();
    });
  }


  /**
 * Handle PeerJS connection events with advanced audio handling
 */
  _handlePeerConnection() {
    if (!this.peerConnection) {
      this.log('No peer connection to handle');
      return;
    }

    // Handle remote stream with enhanced audio processing
    this.peerConnection.on('stream', (stream) => {
      this.log('Received remote stream with tracks:', stream.getTracks().length);

      // Verify we have audio tracks in the remote stream
      const remoteTracks = stream.getAudioTracks();
      if (remoteTracks.length === 0) {
        this.log('Warning: Remote stream has no audio tracks');
      } else {
        this.log('Remote audio track received:', remoteTracks[0].label, 'enabled:', remoteTracks[0].enabled);

        // Make sure the remote tracks are enabled
        remoteTracks.forEach(track => {
          if (!track.enabled) {
            this.log('Remote track was disabled, enabling it');
            track.enabled = true;
          }
        });
      }

      // Store the remote stream
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

      // Start audio monitoring to ensure continued audio flow
      this._startAudioMonitoring();
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

    // Access the underlying RTCPeerConnection for advanced monitoring
    if (this.peerConnection.peerConnection) {
      const rtcPeerConn = this.peerConnection.peerConnection;

      // Listen for ICE connection state changes
      rtcPeerConn.oniceconnectionstatechange = () => {
        this.log('ICE connection state:', rtcPeerConn.iceConnectionState);

        if (rtcPeerConn.iceConnectionState === 'failed') {
          this.log('ICE connection failed - attempting to restart ICE');

          // Try to restart ICE if supported
          if (rtcPeerConn.restartIce) {
            rtcPeerConn.restartIce();
            this.log('ICE restart requested');
          } else {
            // Fallback: create offer with iceRestart flag
            rtcPeerConn.createOffer({ iceRestart: true })
              .then(offer => rtcPeerConn.setLocalDescription(offer))
              .then(() => {
                this.log('ICE restart via createOffer successful');
              })
              .catch(err => {
                console.error('ICE restart failed:', err);
                this.endCall();
              });
          }
        }

        // Handle disconnections more gracefully
        if (rtcPeerConn.iceConnectionState === 'disconnected' &&
          this.callState === 'connected') {
          this.log('ICE connection disconnected - waiting to see if it reconnects');

          // Wait a bit to see if it reconnects
          setTimeout(() => {
            if ((rtcPeerConn.iceConnectionState === 'disconnected' ||
              rtcPeerConn.iceConnectionState === 'failed') &&
              this.callState === 'connected') {
              this.log('ICE connection remained disconnected, ending call');
              this.endCall();
            }
          }, 5000);
        }

        // If we're reconnected, make sure audio is flowing
        if (rtcPeerConn.iceConnectionState === 'connected' &&
          this.callState === 'connected') {
          this._verifyAudioFlowing();
        }
      };

      // Monitor connection state changes
      rtcPeerConn.onconnectionstatechange = () => {
        this.log('Connection state:', rtcPeerConn.connectionState);

        if (rtcPeerConn.connectionState === 'failed') {
          this.log('Connection failed permanently, ending call');
          this.endCall();
        }
      };

      // Listen for signaling state changes (helps debug)
      rtcPeerConn.onsignalingstatechange = () => {
        this.log('Signaling state:', rtcPeerConn.signalingState);
      };
    }
  }

  /**
 * Start monitoring audio levels to ensure audio is flowing
 */
  _startAudioMonitoring() {
    // Clear any existing monitoring
    if (this.audioMonitoringInterval) {
      clearInterval(this.audioMonitoringInterval);
    }

    // Start monitoring audio
    this.audioMonitoringInterval = setInterval(() => {
      this._verifyAudioFlowing();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Verify audio is flowing and fix if possible
   */
  _verifyAudioFlowing() {
    // Only verify audio when connected
    if (this.callState !== 'connected') {
      return;
    }

    // Check local stream
    if (this.localStream) {
      const localTracks = this.localStream.getAudioTracks();
      if (localTracks.length > 0) {
        // Make sure local tracks are enabled
        localTracks.forEach(track => {
          if (!track.enabled) {
            this.log('Local track was disabled, re-enabling');
            track.enabled = true;
          }
        });
      }
    }

    // Check remote stream
    if (this.remoteStream) {
      const remoteTracks = this.remoteStream.getAudioTracks();
      if (remoteTracks.length > 0) {
        // Check if remote tracks are enabled
        const allEnabled = remoteTracks.every(track => track.enabled);
        if (!allEnabled) {
          this.log('Remote track was disabled, attempting to recover');
          remoteTracks.forEach(track => {
            if (!track.enabled) {
              track.enabled = true;
            }
          });
        }
      } else if (this.callState === 'connected') {
        this.log('No remote audio tracks but call is connected. Possible audio issue.');
        // This is a fallback - if we're connected but have no remote tracks, there might be an issue
        // Wait a bit and check again before handling
        setTimeout(() => {
          if (this.callState === 'connected' && (!this.remoteStream || this.remoteStream.getAudioTracks().length === 0)) {
            this.log('Still no remote audio tracks after grace period. Trying to restart connection.');
            this._tryRestartConnection();
          }
        }, 3000);
      }
    }

    // If we have access to the RTCPeerConnection, check stats to detect issues
    if (this.peerConnection && this.peerConnection.peerConnection) {
      const rtcPeerConn = this.peerConnection.peerConnection;

      rtcPeerConn.getStats(null).then(stats => {
        let audioFlowing = false;
        let bytesReceived = 0;

        // Process stats to check if audio data is flowing
        stats.forEach(stat => {
          // Look for inbound-rtp statistics for audio
          if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
            bytesReceived = stat.bytesReceived || 0;

            // If we're receiving data, audio is likely flowing
            if (bytesReceived > 0) {
              audioFlowing = true;
            }
          }
        });

        // If we've been connected for a while but no audio is flowing, there might be an issue
        if (!audioFlowing && this.callState === 'connected' &&
          (Date.now() - this.connectionStartTime) > 10000) {
          this.log('No audio data flowing detected in stats. Attempting to recover.');
          this._tryRestartConnection();
        }
      }).catch(err => {
        console.warn('Error getting peer connection stats:', err);
      });
    }
  }


  /**
   * Try to restart the connection if audio issues are detected
   */
  _tryRestartConnection() {
    if (!this.peerConnection || !this.peerConnection.peerConnection || this.callState !== 'connected') {
      return;
    }

    try {
      const rtcPeerConn = this.peerConnection.peerConnection;

      // First try an ICE restart
      this.log('Attempting to fix audio issues by restarting ICE');

      // Create a new offer with iceRestart flag
      rtcPeerConn.createOffer({ iceRestart: true })
        .then(offer => rtcPeerConn.setLocalDescription(offer))
        .then(() => {
          this.log('ICE restart for audio recovery initiated');
        })
        .catch(err => {
          console.warn('Failed to restart ICE for audio recovery:', err);

          // If ICE restart fails and we still have no audio, consider ending the call
          setTimeout(() => {
            if (this.callState === 'connected') {
              this._verifyAudioFlowing();
            }
          }, 5000);
        });
    } catch (error) {
      console.warn('Error trying to restart connection:', error);
    }
  }

  /**
  * Initialize PeerJS for WebRTC connections - FIXED VERSION
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
      this.peer = null;
    }

    // FIXED: Simplified peer ID format - just use the user's public key
    const myPeerId = this.userPublicKey;

    this.log('Initializing PeerJS with ID:', myPeerId);

    // Adjust PeerJS config based on network type
    const peerConfig = JSON.parse(JSON.stringify(this.peerConfig)); // Deep clone

    // For mobile networks, prioritize TURN servers
    if (this.isMobileNetwork) {
      peerConfig.config.iceTransportPolicy = 'relay';
    }

    // Create a Promise to know when peer is open
    return new Promise((resolve, reject) => {
      // Initialize PeerJS with configuration
      this.peer = new Peer(myPeerId, peerConfig);

      let peerServerConnected = false;

      // Use a timeout to ensure we don't wait forever
      const connectionTimeout = setTimeout(() => {
        if (!peerServerConnected) {
          this.log('PeerJS connection timed out, resolving anyway');
          resolve(this.peer);
        }
      }, 8000);

      // Set up event handlers
      this.peer.on('open', (id) => {
        this.log('PeerJS connection opened with ID:', id);
        peerServerConnected = true;
        clearTimeout(connectionTimeout);

        // Reset connection attempt counter
        this.currentConnectionAttempt = 0;

        resolve(this.peer);
      });

      this.peer.on('error', (err) => {
        this.log('PeerJS error:', err.type, err);

        if (!peerServerConnected) {
          reject(err);
        }
      });

      this.peer.on('call', (incomingCall) => {
        this.log('Received incoming PeerJS call from:', incomingCall.peer);

        // Extract the caller's public key from the peer ID
        const callerPublicKey = incomingCall.peer;

        this.log(`Call from peer ${incomingCall.peer}, extracted key: ${callerPublicKey}`);

        // Answer the call with our local stream
        incomingCall.answer(this.localStream);

        // Handle by group or direct call
        if (this.isGroupCall) {
          // Track this connection for group calls
          if (this.groupParticipants.has(callerPublicKey)) {
            const participantData = this.groupParticipants.get(callerPublicKey);
            participantData.connection = incomingCall;
            participantData.connecting = true;
            this.groupParticipants.set(callerPublicKey, participantData);
          } else {
            // New participant we didn't know about
            this.groupParticipants.set(callerPublicKey, {
              connection: incomingCall,
              connected: false,
              connecting: true
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
    });
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
   * Connect to a specific group participant - FIXED VERSION
   * @param {string} participantKey - The participant's public key
   * @private
   */
  _connectToGroupParticipant(participantKey) {
    if (!this.peer || !this.localStream) {
      this.log(`Cannot connect to participant ${participantKey} - peer or stream not ready`);

      // Set a retry after peer and stream are ready
      if (this.isGroupCall && this.callState === 'connected') {
        setTimeout(() => {
          if (this.peer && this.localStream && this.groupParticipants.has(participantKey)) {
            this._connectToGroupParticipant(participantKey);
          }
        }, 2000);
      }
      return;
    }

    try {
      // FIXED: Simplified peer ID - just use the participant's key
      const remotePeerId = participantKey;

      this.log(`Connecting to group participant: ${participantKey}`);
      this.log(`Remote peer ID: ${remotePeerId}`);

      // Check if we already have a connection to this participant
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);
        if (participantData.connection) {
          this.log(`Already have a connection to ${participantKey}, checking if active`);

          // If the connection is active and we have a stream, don't create a new one
          if (participantData.connected && participantData.stream) {
            this.log(`Connection to ${participantKey} is already active`);
            return;
          }

          // Close the existing connection to create a new one
          try {
            participantData.connection.close();
          } catch (err) {
            this.log(`Error closing existing connection to ${participantKey}:`, err);
          }
        }
      }

      // Make the call to this participant
      const connection = this.peer.call(remotePeerId, this.localStream);

      if (connection) {
        // Store the connection
        this.log(`Created connection to participant ${participantKey}`);

        if (this.groupParticipants.has(participantKey)) {
          const participantData = this.groupParticipants.get(participantKey);
          participantData.connection = connection;
          participantData.connecting = true;
          this.groupParticipants.set(participantKey, participantData);
        } else {
          this.groupParticipants.set(participantKey, {
            connection,
            connected: false,
            connecting: true
          });
        }

        // Handle this connection
        this._handlePeerConnectionForGroup(connection, participantKey);

        // Set a timeout to retry if not connected after a while
        setTimeout(() => {
          if (this.groupParticipants.has(participantKey)) {
            const participantData = this.groupParticipants.get(participantKey);
            if (!participantData.connected && this.callState === 'connected') {
              this.log(`Connection to ${participantKey} not established, retrying`);
              this.currentConnectionAttempt++;
              this._connectToGroupParticipant(participantKey);
            }
          }
        }, 5000);
      } else {
        this.log(`Failed to create connection to participant ${participantKey}`);

        // Set a retry after a delay
        setTimeout(() => {
          if (this.isGroupCall && this.callState === 'connected' &&
            this.groupParticipants.has(participantKey)) {
            this.log(`Retrying connection to participant ${participantKey} after failure`);
            this._connectToGroupParticipant(participantKey);
          }
        }, 3000);
      }
    } catch (error) {
      console.error(`Error connecting to group participant ${participantKey}:`, error);

      // Set a retry after error
      setTimeout(() => {
        if (this.isGroupCall && this.callState === 'connected' &&
          this.groupParticipants.has(participantKey)) {
          this.log(`Retrying connection to participant ${participantKey} after error`);
          this._connectToGroupParticipant(participantKey);
        }
      }, 5000);
    }
  }

  /**
  * Handle peer connection for a group participant - Improved implementation
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
      this.log(`Received stream from participant ${participantKey} with ${stream.getTracks().length} tracks`);

      // Verify the stream has audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        this.log(`Warning: Stream from ${participantKey} has no audio tracks`);
      } else {
        this.log(`Received ${audioTracks.length} audio tracks from ${participantKey}`);

        // Make sure tracks are enabled
        audioTracks.forEach(track => {
          if (!track.enabled) {
            this.log(`Enabling disabled track from ${participantKey}`);
            track.enabled = true;
          }
        });
      }

      // Store the stream with the participant data
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);
        participantData.stream = stream;
        participantData.connected = true;
        participantData.connecting = false;
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
            groupId: this.groupId,
            groupName: this.groupName || 'Group Call'
          });
        }

        // Important: Create audio element to play this participant's audio
        try {
          // Create a new audio element for this participant
          const audioEl = document.createElement('audio');
          audioEl.id = `group-audio-${participantKey}`;
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioEl.controls = false;
          audioEl.style.display = 'none';

          // Assign the stream to the audio element
          audioEl.srcObject = stream;

          // Add error handling
          audioEl.onerror = (err) => {
            this.log(`Error with audio element for ${participantKey}:`, err);
          };

          // Safe play method with error handling
          const playAudio = () => {
            const playPromise = audioEl.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                this.log(`Error playing audio for ${participantKey}:`, error);

                // If it's an autoplay policy error, try again on user interaction
                if (error.name === 'NotAllowedError') {
                  document.addEventListener('click', () => {
                    audioEl.play().catch(e => this.log(`Still couldn't play audio:`, e));
                  }, { once: true });
                }
              });
            }
          };

          // Try to play the audio
          playAudio();

          // Add the audio element to the document body
          document.body.appendChild(audioEl);

          // Store the element reference for cleanup
          participantData.audioElement = audioEl;
          this.groupParticipants.set(participantKey, participantData);

          this.log(`Created audio element for participant ${participantKey}`);
        } catch (audioErr) {
          this.log(`Error creating audio element for ${participantKey}:`, audioErr);
        }
      }
    });

    // Handle connection closing
    connection.on('close', () => {
      this.log(`Connection closed with participant ${participantKey}`);

      // Update participant data
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);

        // Clean up audio element if it exists
        if (participantData.audioElement) {
          try {
            participantData.audioElement.srcObject = null;
            participantData.audioElement.remove();
          } catch (e) {
            this.log(`Error removing audio element for ${participantKey}:`, e);
          }
        }

        participantData.connected = false;
        participantData.connection = null;
        participantData.connecting = false;
        this.groupParticipants.set(participantKey, participantData);

        // Notify listeners
        this._notifyListeners('participant_disconnected', {
          participant: participantKey
        });

        // Try to reconnect if we're still in an active call
        if (this.callState === 'connected') {
          setTimeout(() => {
            if (this.callState === 'connected' && this.groupParticipants.has(participantKey)) {
              const currentData = this.groupParticipants.get(participantKey);
              if (!currentData.connected && !currentData.connecting) {
                this.log(`Connection closed, attempting to reconnect to ${participantKey}`);
                this._connectToGroupParticipant(participantKey);
              }
            }
          }, 3000); // Wait 3 seconds before retry
        }
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
            this.log('All group participants disconnected, attempting global reconnect');

            // Try to reconnect to all participants
            this.groupParticipants.forEach((data, partKey) => {
              this._connectToGroupParticipant(partKey);
            });
          }
        }, 5000); // 5 second grace period
      }
    });

    // Handle errors
    connection.on('error', (err) => {
      console.error(`Error in connection with participant ${participantKey}:`, err);

      // Mark connection as failed
      if (this.groupParticipants.has(participantKey)) {
        const participantData = this.groupParticipants.get(participantKey);
        participantData.connected = false;
        participantData.connecting = false;
        participantData.error = err.message || 'Connection error';
        this.groupParticipants.set(participantKey, participantData);

        // Try to reconnect
        setTimeout(() => {
          if (this.callState === 'connected' && this.groupParticipants.has(participantKey)) {
            const currentData = this.groupParticipants.get(participantKey);
            if (!currentData.connected && !currentData.connecting) {
              this.log(`Error in connection, attempting to reconnect to ${participantKey}`);
              this._connectToGroupParticipant(participantKey);
            }
          }
        }, 3000); // Wait 3 seconds before retry
      }
    });

    // Access the underlying RTCPeerConnection for advanced monitoring
    if (connection.peerConnection) {
      const rtcPeerConn = connection.peerConnection;

      // Listen for ICE connection state changes
      rtcPeerConn.oniceconnectionstatechange = () => {
        this.log(`ICE connection state for ${participantKey}: ${rtcPeerConn.iceConnectionState}`);

        if (rtcPeerConn.iceConnectionState === 'failed') {
          this.log(`ICE connection failed for ${participantKey} - attempting to restart ICE`);

          // Try to restart ICE if supported
          if (rtcPeerConn.restartIce) {
            rtcPeerConn.restartIce();
            this.log(`ICE restart requested for ${participantKey}`);
          } else {
            // Fallback: create offer with iceRestart flag
            rtcPeerConn.createOffer({ iceRestart: true })
              .then(offer => rtcPeerConn.setLocalDescription(offer))
              .then(() => {
                this.log(`ICE restart via createOffer successful for ${participantKey}`);
              })
              .catch(err => {
                console.error(`ICE restart failed for ${participantKey}:`, err);

                // If ICE restart fails, try to create a completely new connection
                if (this.callState === 'connected') {
                  setTimeout(() => {
                    this.log(`ICE restart failed, creating new connection to ${participantKey}`);
                    this._connectToGroupParticipant(participantKey);
                  }, 2000);
                }
              });
          }
        }

        // Handle disconnections more gracefully
        if (rtcPeerConn.iceConnectionState === 'disconnected' &&
          this.callState === 'connected') {
          this.log(`ICE connection disconnected for ${participantKey} - waiting to see if it reconnects`);

          // Wait a bit to see if it reconnects
          setTimeout(() => {
            if ((rtcPeerConn.iceConnectionState === 'disconnected' ||
              rtcPeerConn.iceConnectionState === 'failed') &&
              this.callState === 'connected') {
              this.log(`ICE connection remained disconnected for ${participantKey}, creating new connection`);
              this._connectToGroupParticipant(participantKey);
            }
          }, 5000);
        }
      };
    }
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

    this._cleanupSocketEnhancements();

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
'use client'

import { io } from 'socket.io-client';
import Peer from 'peerjs';

/**
 * VoiceService - Handles voice calls using Socket.io for signaling and Peer.js for WebRTC
 * With improved audio streaming between WiFi and mobile networks
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

          // Primary TURN servers with multiple transport options
          {
            urls: 'https://proxy.inhouses.xyz:3478',
            username: 'subworlduser',
            credential: 'subworldpass'
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
          const prevNetwork = this.networkType;
          const prevIsMobile = this.isMobileNetwork;

          this.networkType = connection.type || connection.effectiveType || 'unknown';
          this.isMobileNetwork = this.networkType === 'cellular';

          this.log(`Network changed: ${this.networkType}, Mobile: ${this.isMobileNetwork}`);

          // If we're in a call and network type changed dramatically, we may need to adjust
          if (this.callState === 'connected' && prevIsMobile !== this.isMobileNetwork) {
            this.log('Network type changed significantly during call, adjusting audio settings');
            this._adjustAudioForNetwork();
          }
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
   * Adjust audio settings based on network type
   * Called when network changes during a call
   */
  _adjustAudioForNetwork() {
    if (!this.peerConnection || !this.callState === 'connected') return;

    try {
      const rtcPeerConn = this.peerConnection.peerConnection;
      if (!rtcPeerConn) return;

      // Get all RTCRtpSenders that are sending audio
      const audioSenders = rtcPeerConn.getSenders().filter(sender =>
        sender.track && sender.track.kind === 'audio'
      );

      if (audioSenders.length === 0) return;

      audioSenders.forEach(sender => {
        // Get current parameters
        const parameters = sender.getParameters();

        // Clone the parameters to modify
        if (parameters.encodings && parameters.encodings.length > 0) {
          // On mobile, reduce bitrate and prioritize reliability
          if (this.isMobileNetwork) {
            parameters.encodings.forEach(encoding => {
              // Lower bitrate for mobile networks
              encoding.maxBitrate = 24000; // 24 kbps
              encoding.priority = 'high';
            });
          } else {
            // On WiFi, allow higher quality
            parameters.encodings.forEach(encoding => {
              // Higher bitrate for WiFi
              encoding.maxBitrate = 48000; // 48 kbps
              encoding.priority = 'high';
            });
          }

          // Apply the modified parameters
          sender.setParameters(parameters)
            .then(() => {
              this.log('Successfully adjusted audio parameters for network type:', this.networkType);
            })
            .catch(err => {
              console.warn('Failed to adjust audio parameters:', err);
            });
        }
      });
    } catch (err) {
      console.warn('Error adjusting audio for network:', err);
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
   * Process audio stream to optimize for network conditions
   * This helps audio quality on mobile networks
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

      // Create a compressor to improve audibility on mobile
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

      // Request audio permissions with optimized constraints
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

      // Re-check network type before answering
      this._detectNetworkType();

      // Request audio permissions with optimized constraints
      this.log('Requesting microphone access');
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

      // Request audio permissions with optimized constraints
      this.log('Requesting microphone access for join');
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
          audioConstraints.sampleSize = 16000; // Lower sample rate
        }

        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false
        });

        this.log('Microphone access granted for join, tracks:', this.localStream.getTracks().length);

        // Process the audio for better quality
        const processedStream = this._processAudioStream(this.localStream);

        // Use processed stream if available, otherwise use original
        if (processedStream && processedStream.getAudioTracks().length > 0) {
          this.localStream = processedStream;
          this.log('Using processed audio stream for join');
        }

        // Make sure audio tracks are enabled
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = true;
          this.log('Audio track enabled for join:', track.label);
        });
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
      this.log(`Audio track ${track.label} ${track.enabled ? 'enabled' : 'disabled'}`);
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
      return false;
    }
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
      localStreamTracks: this.localStream ? this.localStream.getTracks().length : 0,
      hasRemoteStream: !!this.remoteStream,
      remoteStreamTracks: this.remoteStream ? this.remoteStream.getTracks().length : 0,
      socketConnected: this.socket && this.socket.connected,
      peerInitialized: !!this.peer,
      peerConnectionActive: !!this.peerConnection,
      iceConnectionState: this.peerConnection && this.peerConnection.peerConnection ?
        this.peerConnection.peerConnection.iceConnectionState : 'unknown',
      connectionState: this.peerConnection && this.peerConnection.peerConnection ?
        this.peerConnection.peerConnection.connectionState : 'unknown',
      userPublicKey: this.userPublicKey,
      remoteUserKey: this.remoteUserKey,
      isOutgoingCall: this.isOutgoingCall,
      networkType: this.networkType,
      isMobileNetwork: this.isMobileNetwork,
      currentConnectionAttempt: this.currentConnectionAttempt,
      audioContextState: this.audioContext ? this.audioContext.state : 'none',
      hasAudioProcessor: !!this.audioProcessor,
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
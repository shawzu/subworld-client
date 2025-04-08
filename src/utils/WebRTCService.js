'use client'

/**
 * WebRTCService.js
 * Manages WebRTC connections for audio calls with peer signaling handled via the
 * existing messaging system.
 */

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isInitiator = false;
    this.isMuted = false;
    this.currentCallPartner = null;
    this.onIceCandidate = null;
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;

    // ICE servers for NAT traversal
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ]
    };
  }

  /**
   * Initialize the WebRTC service
   * @param {Function} onIceCandidate Callback for ICE candidates
   * @param {Function} onRemoteStream Callback for remote stream
   * @param {Function} onConnectionStateChange Callback for connection state changes
   */
  initialize(onIceCandidate, onRemoteStream, onConnectionStateChange) {
    this.onIceCandidate = onIceCandidate;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionStateChange = onConnectionStateChange;
  }

  /**
   * Start a new outgoing call
   * @param {string} partnerKey Partner's public key
   * @returns {Promise<RTCSessionDescription>} Local session description
   */
  async startCall(partnerKey) {
    try {
      this.currentCallPartner = partnerKey;
      this.isInitiator = true;

      // Create a new RTCPeerConnection
      await this._createPeerConnection();

      // Get local audio stream
      await this._getLocalStream();

      // Create and set local description (offer)
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await this.peerConnection.setLocalDescription(offer);

      return offer;
    } catch (error) {
      console.error('Error starting call:', error);
      this._cleanup();
      throw error;
    }
  }

  /**
   * Accept an incoming call
   * @param {string} partnerKey Partner's public key
   * @param {RTCSessionDescription} remoteDescription Remote session description
   * @returns {Promise<RTCSessionDescription>} Local session description
   */
  /**
 * Accept an incoming call
 * @param {string} partnerKey Partner's public key
 * @param {RTCSessionDescription|Object|string} remoteDescription Remote session description
 * @returns {Promise<RTCSessionDescription>} Local session description
 */
  async acceptCall(partnerKey, remoteDescription) {
    try {
      console.log('Accepting call from:', partnerKey);
      this.currentCallPartner = partnerKey;
      this.isInitiator = false;

      // Create a new RTCPeerConnection
      await this._createPeerConnection();

      // Make sure remoteDescription is in the right format
      let sessionDesc;

      // Handle different input formats
      if (typeof remoteDescription === 'string') {
        // If it's a string, try to parse it as JSON
        try {
          const parsed = JSON.parse(remoteDescription);
          sessionDesc = new RTCSessionDescription(parsed);
        } catch (error) {
          console.error('Failed to parse remote description string:', error);
          throw new Error('Invalid remote description format (string parsing failed)');
        }
      } else if (remoteDescription instanceof RTCSessionDescription) {
        // If it's already an RTCSessionDescription, use it directly
        sessionDesc = remoteDescription;
      } else if (typeof remoteDescription === 'object' && remoteDescription !== null) {
        // If it's an object with type and sdp, create a new RTCSessionDescription
        if (!remoteDescription.type || !remoteDescription.sdp) {
          console.error('Remote description missing type or sdp:', remoteDescription);
          throw new Error('Invalid remote description: missing type or sdp');
        }

        try {
          sessionDesc = new RTCSessionDescription({
            type: remoteDescription.type,
            sdp: remoteDescription.sdp
          });
        } catch (error) {
          console.error('Failed to create RTCSessionDescription from object:', error);
          throw new Error('Invalid remote description format (object conversion failed)');
        }
      } else {
        console.error('Unsupported remote description format:', typeof remoteDescription);
        throw new Error('Unsupported remote description format');
      }

      console.log('Setting remote description with type:', sessionDesc.type);

      // Set remote description with proper error handling
      try {
        await this.peerConnection.setRemoteDescription(sessionDesc);
      } catch (error) {
        console.error('Error setting remote description:', error);
        throw new Error(`Failed to set remote description: ${error.message}`);
      }

      // Get local audio stream
      await this._getLocalStream();

      // Create and set local description (answer)
      try {
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        console.log('Created and set local answer with type:', answer.type);
        return answer;
      } catch (error) {
        console.error('Error creating/setting local answer:', error);
        throw new Error(`Failed to create/set answer: ${error.message}`);
      }
    } catch (error) {
      console.error('Error accepting call:', error);
      this._cleanup();
      throw error;
    }
  }

  /**
   * Process an answer from the remote peer
   * @param {RTCSessionDescription} remoteDescription Remote session description
   */
  /**
 * Process an answer from the remote peer
 * @param {RTCSessionDescription|Object|string} remoteDescription Remote session description
 */
async processAnswer(remoteDescription) {
  try {
    console.log('Processing remote answer:', typeof remoteDescription);
    
    if (!this.peerConnection) {
      console.error('No active peer connection when processing answer');
      throw new Error('No active peer connection');
    }
    
    // Convert the remote description to the right format
    let sessionDesc;
    
    // Handle different input formats
    if (typeof remoteDescription === 'string') {
      // If it's a string, try to parse it as JSON
      try {
        const parsed = JSON.parse(remoteDescription);
        sessionDesc = new RTCSessionDescription(parsed);
        console.log('Created RTCSessionDescription from parsed string');
      } catch (error) {
        console.error('Failed to parse remote description string:', error);
        throw new Error('Invalid remote description format (string parsing failed)');
      }
    } else if (remoteDescription instanceof RTCSessionDescription) {
      // If it's already an RTCSessionDescription, use it directly
      sessionDesc = remoteDescription;
      console.log('Using provided RTCSessionDescription directly');
    } else if (typeof remoteDescription === 'object' && remoteDescription !== null) {
      // If it's an object with type and sdp, create a new RTCSessionDescription
      if (!remoteDescription.type || !remoteDescription.sdp) {
        console.error('Remote description missing type or sdp:', remoteDescription);
        throw new Error('Invalid remote description: missing type or sdp');
      }
      
      try {
        sessionDesc = new RTCSessionDescription({
          type: remoteDescription.type,
          sdp: remoteDescription.sdp
        });
        console.log('Created RTCSessionDescription from object');
      } catch (error) {
        console.error('Failed to create RTCSessionDescription from object:', error);
        throw new Error('Invalid remote description format (object conversion failed)');
      }
    } else {
      console.error('Unsupported remote description format:', typeof remoteDescription);
      throw new Error('Unsupported remote description format');
    }
    
    // Check if we have a remote description already
    const currentRemoteDesc = this.peerConnection.currentRemoteDescription;
    if (currentRemoteDesc) {
      console.warn('Remote description already set, may be overwriting. Current type:', 
        currentRemoteDesc.type, 'New type:', sessionDesc.type);
    }
    
    // Set the remote description
    try {
      console.log('Setting remote description of type:', sessionDesc.type);
      await this.peerConnection.setRemoteDescription(sessionDesc);
      console.log('Remote description set successfully');
    } catch (error) {
      console.error('Error setting remote description:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error processing answer:', error);
    throw error;
  }
}
  /**
   * Add an ICE candidate from the remote peer
   * @param {RTCIceCandidate} candidate ICE candidate
   */
  async addIceCandidate(candidate) {
    try {
      console.log('Adding ICE candidate');

      if (!this.peerConnection) {
        throw new Error('No active peer connection');
      }

      // Parse candidate if it's a string
      let iceCandidate;
      if (typeof candidate === 'string') {
        try {
          const parsed = JSON.parse(candidate);
          iceCandidate = new RTCIceCandidate(parsed);
        } catch (parseError) {
          console.error('Error parsing ICE candidate:', parseError);
          throw new Error('Invalid ICE candidate format');
        }
      } else {
        iceCandidate = new RTCIceCandidate(candidate);
      }

      // Wait for remote description before adding candidates
      if (!this.peerConnection.remoteDescription) {
        console.warn('Remote description not set yet, cannot add ICE candidate');
        throw new Error('Cannot add ICE candidate, remote description not set');
      }

      await this.peerConnection.addIceCandidate(iceCandidate);
      console.log('ICE candidate added successfully');

      return true;
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      throw error;
    }
  }

  /**
   * Toggle the microphone mute state
   * @returns {boolean} New mute state
   */
  toggleMute() {
    if (!this.localStream) {
      return this.isMuted;
    }

    this.isMuted = !this.isMuted;

    // Update all audio tracks
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    return this.isMuted;
  }

  /**
   * End the current call and clean up resources
   */
  endCall() {
    this._cleanup();
  }

  /**
   * Get the local audio stream
   * @returns {Promise<MediaStream>} Local audio stream
   * @private
   */
  async _getLocalStream() {
    try {
      if (!this.localStream) {
        console.log('Requesting microphone access...');
        try {
          // Request microphone access with explicit error handling
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });
          console.log('Microphone access granted');
        } catch (mediaError) {
          console.error('Microphone access failed:', mediaError);

          // Try to get a more helpful error message
          let errorMessage = 'Could not access microphone';
          if (mediaError.name === 'NotAllowedError') {
            errorMessage = 'Microphone access denied by user or already in use';
          } else if (mediaError.name === 'NotFoundError') {
            errorMessage = 'No microphone found on this device';
          } else if (mediaError.name === 'NotReadableError') {
            errorMessage = 'Microphone is already in use by another application';
          }

          // Re-throw with better error
          throw new Error(errorMessage);
        }
      }

      // Add tracks to peer connection
      if (this.peerConnection && this.localStream) {
        const audioTracks = this.localStream.getAudioTracks();
        console.log(`Adding ${audioTracks.length} audio tracks to peer connection`);

        audioTracks.forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      } else {
        console.warn('Cannot add tracks: peer connection or local stream not available');
      }

      return this.localStream;
    } catch (error) {
      console.error('Error getting local stream:', error);
      throw error;
    }
  }
  /**
   * Create a new RTCPeerConnection
   * @private
   */
  async _createPeerConnection() {
    try {
      // Close any existing connection
      if (this.peerConnection) {
        console.log('Closing existing peer connection before creating new one');
        this._cleanup();
      }

      console.log('Creating new RTCPeerConnection with ICE servers:', this.iceServers);

      // Create new connection
      this.peerConnection = new RTCPeerConnection(this.iceServers);

      // Set up event handlers
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.onIceCandidate) {
          console.log('ICE candidate generated:', event.candidate.candidate.substr(0, 50) + '...');
          this.onIceCandidate(event.candidate);
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        const iceState = this.peerConnection.iceConnectionState;
        console.log('ICE connection state changed to:', iceState);
        
        // If ICE connection is established or completed, consider the call connected
        if (iceState === 'connected' || iceState === 'completed') {
            console.log('🟢 ICE CONNECTION ESTABLISHED 🟢');
            if (this.onConnectionStateChange) {
                // Force a "connected" state notification
                this.onConnectionStateChange('connected');
            }
        }
    };

      this.peerConnection.onicegatheringstatechange = () => {
        console.log('ICE gathering state changed to:', this.peerConnection.iceGatheringState);
      };

      this.peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state changed to:', this.peerConnection.signalingState);
      };

      this.peerConnection.ontrack = (event) => {
        console.log('Remote track received:',
          event.streams && event.streams.length ?
            `${event.streams[0].getTracks().length} tracks` : 'No tracks');

        if (event.streams && event.streams[0] && this.onRemoteStream) {
          this.remoteStream = event.streams[0];
          console.log('Remote stream received with audio tracks:',
            this.remoteStream.getAudioTracks().length);
          this.onRemoteStream(this.remoteStream);
        }
      };

      // Watch connection state
      this.peerConnection.onconnectionstatechange = () => {
        const connectionState = this.peerConnection.connectionState;
        console.log('Connection state changed to:', connectionState);
    
        // Enhanced logging
        if (connectionState === 'connected') {
            console.log('🟢 WEBRTC CONNECTION ESTABLISHED 🟢');
        }
    
        if (this.onConnectionStateChange) {
            // Always call the callback regardless of state
            this.onConnectionStateChange(connectionState);
        }
    
        // Auto cleanup on disconnection
        if (
            connectionState === 'disconnected' ||
            connectionState === 'failed' ||
            connectionState === 'closed'
        ) {
            console.log('Connection state indicates call has ended, cleaning up');
            this._cleanup();
        }
    };

      console.log('RTCPeerConnection created successfully');
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }


  /**
   * Clean up resources
   * @private
   */
  _cleanup() {
    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Reset state
    this.remoteStream = null;
    this.isInitiator = false;
    this.isMuted = false;
    this.currentCallPartner = null;
  }

  /**
   * Check if the service is currently in a call
   * @returns {boolean} True if in a call
   */
  isInCall() {
    return !!this.peerConnection;
  }

  /**
   * Get the current mute state
   * @returns {boolean} True if muted
   */
  getMuteState() {
    return this.isMuted;
  }

  /**
   * Get the current call partner key
   * @returns {string|null} Partner's public key
   */
  getCurrentCallPartner() {
    return this.currentCallPartner;
  }
}

// Create and export singleton instance
const webRTCService = new WebRTCService();
export default webRTCService;
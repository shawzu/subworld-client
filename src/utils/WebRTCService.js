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
  async acceptCall(partnerKey, remoteDescription) {
    try {
      this.currentCallPartner = partnerKey;
      this.isInitiator = false;
      
      // Create a new RTCPeerConnection
      await this._createPeerConnection();
      
      // Set remote description
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(remoteDescription)
      );
      
      // Get local audio stream
      await this._getLocalStream();
      
      // Create and set local description (answer)
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      return answer;
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
  async processAnswer(remoteDescription) {
    try {
      if (!this.peerConnection) {
        throw new Error('No active peer connection');
      }
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(remoteDescription)
      );
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
      if (!this.peerConnection) {
        throw new Error('No active peer connection');
      }
      
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
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
        // Request microphone access
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: false 
        });
      }
      
      // Add tracks to peer connection
      this.localStream.getAudioTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
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
        this._cleanup();
      }
      
      // Create new connection
      this.peerConnection = new RTCPeerConnection(this.iceServers);
      
      // Set up event handlers
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.onIceCandidate) {
          this.onIceCandidate(event.candidate);
        }
      };
      
      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0] && this.onRemoteStream) {
          this.remoteStream = event.streams[0];
          this.onRemoteStream(this.remoteStream);
        }
      };
      
      // Watch connection state
      this.peerConnection.onconnectionstatechange = () => {
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange(this.peerConnection.connectionState);
        }
        
        // Auto cleanup on disconnection
        if (
          this.peerConnection.connectionState === 'disconnected' ||
          this.peerConnection.connectionState === 'failed' ||
          this.peerConnection.connectionState === 'closed'
        ) {
          this._cleanup();
        }
      };
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
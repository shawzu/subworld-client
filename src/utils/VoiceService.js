'use client'

/**
 * VoiceService.js
 * Provides voice call functionality using server-relayed audio chunks
 */

import subworldNetwork from './SubworldNetworkService'
import LocalKeyStorageManager from './LocalKeyStorageManager'

class VoiceService {
  constructor() {
    this.initialized = false;
    this.recorder = null;
    this.audioContext = null;
    this.mediaStream = null;
    
    this.callState = null; // 'outgoing', 'incoming', 'connected', 'ended', null
    this.callSessionId = null;
    this.callPartner = null;
    
    this.isMuted = false;
    this.listeners = [];
    this.audioQueue = [];
    
    this.lastFetchTime = 0;
    this.fetchInterval = null;
    this.recordingInterval = null;
    
    // Chunk size (smaller = more real-time but more overhead)
    this.chunkDuration = 200; // milliseconds
    
    // Play chunks in sequence
    this.audioPlayer = null;
    this.isPlaying = false;
  }
  
  /**
   * Initialize the voice service
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Make sure we have audio context
      if (typeof window !== 'undefined' && !this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Audio context initialized');
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
      // Ensure we're not already in a call
      if (this.callState) {
        console.warn('Already in a call');
        return false;
      }
      
      console.log('Initiating call to:', contactPublicKey);
      
      // Request microphone access
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('Microphone access granted');
      } catch (mediaError) {
        console.error('Microphone access failed:', mediaError);
        alert('Microphone access is required for calls');
        return false;
      }
      
      // Generate a call session ID
      this.callSessionId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      this.callPartner = contactPublicKey;
      
      // Update state
      this.callState = 'outgoing';
      this._notifyListeners('call_state_changed', { 
        state: 'outgoing', 
        contact: contactPublicKey 
      });
      
      // Send call start notification
      const startResult = await subworldNetwork.makeApiRequest(
        'voice/start',
        'POST',
        {
          caller_id: LocalKeyStorageManager.getKeyPair().publicKeyDisplay,
          recipient_id: contactPublicKey,
          call_session_id: this.callSessionId
        }
      );
      
      if (!startResult.success) {
        console.error('Failed to start call:', startResult.error);
        this.endCall();
        return false;
      }
      
      console.log('Call initiated successfully, session ID:', this.callSessionId);
      
      // Start recording and streaming audio
      this._startRecording();
      
      // Start fetching audio from the recipient
      this._startFetching();
      
      return true;
    } catch (error) {
      console.error('Error initiating call:', error);
      this.endCall();
      return false;
    }
  }
  
  /**
   * Handle an incoming call
   */
  handleIncomingCall(callerKey, callSessionId) {
    try {
      // Ensure we're not already in a call
      if (this.callState) {
        this.rejectCall(callSessionId);
        return false;
      }
      
      console.log('Handling incoming call from:', callerKey);
      
      // Set call data
      this.callSessionId = callSessionId;
      this.callPartner = callerKey;
      this.callState = 'incoming';
      
      // Notify listeners
      this._notifyListeners('call_state_changed', { 
        state: 'incoming', 
        contact: callerKey
      });
      
      // Auto-reject after 30 seconds if not answered
      setTimeout(() => {
        if (this.callState === 'incoming') {
          this.rejectCall();
        }
      }, 30000);
      
      return true;
    } catch (error) {
      console.error('Error handling incoming call:', error);
      return false;
    }
  }
  
  /**
   * Answer an incoming call
   */
  async answerCall() {
    try {
      if (this.callState !== 'incoming') {
        console.warn('No incoming call to answer');
        return false;
      }
      
      // Request microphone access
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('Microphone access granted');
      } catch (mediaError) {
        console.error('Microphone access failed:', mediaError);
        alert('Microphone access is required for calls');
        this.endCall();
        return false;
      }
      
      // Update state
      this.callState = 'connected';
      this._notifyListeners('call_state_changed', {
        state: 'connected',
        contact: this.callPartner
      });
      
      // Start recording and streaming audio
      this._startRecording();
      
      // Start fetching audio from the caller
      this._startFetching();
      
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
      
      // Send call end notification
      await subworldNetwork.makeApiRequest(
        'voice/end',
        'POST',
        {
          call_session_id: this.callSessionId,
          sender_id: LocalKeyStorageManager.getKeyPair().publicKeyDisplay,
          recipient_id: this.callPartner
        }
      );
      
      // Update state
      const previousPartner = this.callPartner;
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended', 
        contact: previousPartner
      });
      
      // Reset after a short delay
      setTimeout(() => {
        this.callState = null;
        this.callSessionId = null;
        this.callPartner = null;
        this._notifyListeners('call_state_changed', { state: null, contact: null });
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('Error rejecting call:', error);
      
      // Force reset state
      this.callState = null;
      this.callSessionId = null;
      this.callPartner = null;
      this._notifyListeners('call_state_changed', { state: null, contact: null });
      
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
      
      // Stop recording and streaming
      this._stopRecording();
      this._stopFetching();
      
      // Release microphone
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      // Clear audio queue
      this.audioQueue = [];
      
      // Send call end notification if appropriate
      if (this.callState !== 'incoming') {
        try {
          await subworldNetwork.makeApiRequest(
            'voice/end',
            'POST',
            {
              call_session_id: this.callSessionId,
              sender_id: LocalKeyStorageManager.getKeyPair().publicKeyDisplay,
              recipient_id: this.callPartner
            }
          );
        } catch (error) {
          console.warn('Error sending call end notification:', error);
        }
      }
      
      // Update state
      const previousPartner = this.callPartner;
      this.callState = 'ended';
      this._notifyListeners('call_state_changed', { 
        state: 'ended', 
        contact: previousPartner
      });
      
      // Reset after a short delay
      setTimeout(() => {
        this.callState = null;
        this.callSessionId = null;
        this.callPartner = null;
        this._notifyListeners('call_state_changed', { state: null, contact: null });
      }, 3000);
      
      return true;
    } catch (error) {
      console.error('Error ending call:', error);
      
      // Force reset state
      this.callState = null;
      this.callSessionId = null;
      this.callPartner = null;
      this._notifyListeners('call_state_changed', { state: null, contact: null });
      
      return false;
    }
  }
  
  /**
   * Toggle microphone mute state
   */
  toggleMute() {
    if (!this.mediaStream) {
      return this.isMuted;
    }
    
    this.isMuted = !this.isMuted;
    
    // Update audio tracks
    this.mediaStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
    
    // Notify listeners
    this._notifyListeners('mute_changed', { isMuted: this.isMuted });
    
    return this.isMuted;
  }
  
  /**
   * Start recording and sending audio chunks
   */
  _startRecording() {
    if (!this.mediaStream) {
      console.warn('No media stream available for recording');
      return;
    }
    
    try {
      // Create a new recorder
      this.recorder = new MediaRecorder(this.mediaStream);
      
      // Set up data handling
      this.recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.callState === 'connected') {
          // Process and send the audio chunk
          await this._processAndSendAudioChunk(event.data);
        }
      };
      
      // Start recording with small chunks
      this.recorder.start(this.chunkDuration);
      
      // Set up interval to restart recording periodically (for continuous chunks)
      this.recordingInterval = setInterval(() => {
        if (this.recorder && this.recorder.state === 'recording') {
          this.recorder.stop();
          this.recorder.start(this.chunkDuration);
        }
      }, this.chunkDuration);
      
      console.log('Audio recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }
  
  /**
   * Stop recording
   */
  _stopRecording() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    
    if (this.recorder) {
      try {
        if (this.recorder.state === 'recording') {
          this.recorder.stop();
        }
        this.recorder = null;
      } catch (error) {
        console.warn('Error stopping recorder:', error);
      }
    }
  }
  
  /**
   * Process recorded audio and send it to the recipient
   */
  async _processAndSendAudioChunk(audioBlob) {
    try {
      // Convert blob to base64
      const base64Data = await this._blobToBase64(audioBlob);
      
      // Encrypt the audio data
      const encryptedData = await LocalKeyStorageManager.encryptMessage(
        base64Data,
        this.callPartner
      );
      
      // Send to the server
      await subworldNetwork.makeApiRequest(
        'voice/stream',
        'POST',
        {
          call_session_id: this.callSessionId,
          sender_id: LocalKeyStorageManager.getKeyPair().publicKeyDisplay,
          recipient_id: this.callPartner,
          audio_data: encryptedData,
          timestamp: Date.now(),
          chunk_id: `${this.callSessionId}-${Date.now()}`
        }
      );
    } catch (error) {
      console.warn('Error sending audio chunk:', error);
    }
  }
  
  /**
   * Convert a Blob to a base64 string
   */
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Extract the base64 part from the data URL
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  /**
   * Start fetching audio chunks from the server
   */
  _startFetching() {
    // Start immediate fetch
    this._fetchAudioChunks();
    
    // Set up interval for regular fetching
    this.fetchInterval = setInterval(() => {
      this._fetchAudioChunks();
    }, this.chunkDuration);
  }
  
  /**
   * Stop fetching audio chunks
   */
  _stopFetching() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
    
    // Clear any remaining audio
    this.audioQueue = [];
    this.isPlaying = false;
    
    // Stop audio context if active
    if (this.audioPlayer) {
      try {
        this.audioPlayer.disconnect();
      } catch (error) {}
      this.audioPlayer = null;
    }
  }
  
  /**
   * Fetch audio chunks from the server
   */
  async _fetchAudioChunks() {
    try {
      if (!this.callSessionId || !this.callPartner) {
        return;
      }
      
      // Rate limit to prevent excessive requests
      const now = Date.now();
      if (now - this.lastFetchTime < 100) { // Max 10 fetches per second
        return;
      }
      this.lastFetchTime = now;
      
      // Fetch new chunks
      const response = await subworldNetwork.makeApiRequest(
        `voice/fetch?recipient_id=${LocalKeyStorageManager.getKeyPair().publicKeyDisplay}&call_session_id=${this.callSessionId}&since_timestamp=${Math.floor((now - 5000) / 1000)}`,
        'GET'
      );
      
      if (!response.success || !Array.isArray(response.data)) {
        return;
      }
      
      // Process each chunk
      for (const chunk of response.data) {
        // Skip if from ourselves or special message types
        if (chunk.sender_id === LocalKeyStorageManager.getKeyPair().publicKeyDisplay) {
          continue;
        }
        
        // Handle call control messages
        if (chunk.encrypted_data && chunk.encrypted_data.includes('call_end')) {
          console.log('Received call end signal');
          this.endCall();
          return;
        }
        
        // Skip if not an audio chunk
        if (!chunk.encrypted_data || chunk.encrypted_data.includes('call_start') || chunk.encrypted_data.includes('call_end')) {
          continue;
        }
        
        // Decrypt and queue the audio
        await this._decryptAndQueueAudio(chunk.encrypted_data, chunk.sender_id);
      }
      
      // Start playing if not already playing
      if (!this.isPlaying && this.audioQueue.length > 0) {
        this._playNextInQueue();
      }
    } catch (error) {
      console.warn('Error fetching audio chunks:', error);
    }
  }
  
  /**
   * Decrypt audio data and add to the playback queue
   */
  async _decryptAndQueueAudio(encryptedData, senderId) {
    try {
      // Decrypt the audio data
      const base64Audio = await LocalKeyStorageManager.decryptMessage(
        encryptedData,
        senderId
      );
      
      // Convert base64 to audio blob
      const blob = this._base64ToBlob(base64Audio, 'audio/webm');
      
      // Add to queue
      this.audioQueue.push(blob);
      
      // Keep queue manageable
      if (this.audioQueue.length > 20) { // Max 4 seconds of audio at 200ms chunks
        this.audioQueue.shift(); // Remove oldest
      }
    } catch (error) {
      console.warn('Error decrypting audio:', error);
    }
  }
  
  /**
   * Convert a base64 string to a Blob
   */
  _base64ToBlob(base64, contentType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: contentType });
  }
  
  /**
   * Play the next audio chunk in the queue
   */
  async _playNextInQueue() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }
    
    this.isPlaying = true;
    
    try {
      // Get the next blob from the queue
      const audioBlob = this.audioQueue.shift();
      
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Decode the audio
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Create a source node for playback
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect to output
      source.connect(this.audioContext.destination);
      
      // When playback ends, play the next chunk
      source.onended = () => {
        this._playNextInQueue();
      };
      
      // Start playback
      source.start();
      
      // Store current player
      this.audioPlayer = source;
    } catch (error) {
      console.warn('Error playing audio:', error);
      
      // Try next chunk on error
      setTimeout(() => {
        this._playNextInQueue();
      }, 100);
    }
  }
  
  /**
   * Process a signal from a message
   */
  processCallSignal(senderKey, signalData) {
    try {
      // Handle call_start
      if (signalData.type === 'call_start') {
        const callSessionId = signalData.callSessionId || `call-${Date.now()}`;
        this.handleIncomingCall(senderKey, callSessionId);
        return true;
      }
      
      // Handle call_end
      if (signalData.type === 'call_end') {
        if (this.callState && this.callPartner === senderKey) {
          this.endCall();
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error processing call signal:', error);
      return false;
    }
  }
  
  /**
   * Check if currently in a call
   */
  isInCall() {
    return !!this.callState;
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
'use client'

import webRTCService from './WebRTCService'
import subworldNetwork from './SubworldNetworkService'
import conversationManager from './ConversationManager'

/**
 * CallService.js
 * Manages call signaling through the message system
 */

class CallService {
    constructor() {
        this.activeCall = null;
        this.incomingCall = null;
        this.callListeners = [];
        this.isInitialized = false;

        // Signaling message types
        this.SIGNAL_TYPES = {
            OFFER: 'call_offer',
            ANSWER: 'call_answer',
            ICE_CANDIDATE: 'call_ice_candidate',
            HANG_UP: 'call_hang_up',
            BUSY: 'call_busy'
        };
    }

    /**
     * Initialize the call service
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
          console.log("Initializing call service...");
          
          // Initialize WebRTC service
          webRTCService.initialize(
            this.handleIceCandidate.bind(this),
            this.handleRemoteStream.bind(this),
            this.handleConnectionStateChange.bind(this)
          );
          
          // Check if we have access to the conversation manager through the window
          if (typeof window !== 'undefined' && window.conversationManager) {
            console.log("Found conversation manager for call signaling");
          } else {
            console.warn("ConversationManager not available for call signaling yet");
            // We'll try to use it later when needed
          }
          
          this.isInitialized = true;
          console.log('Call service initialized successfully');
          return true;
        } catch (error) {
          console.error('Failed to initialize call service:', error);
          throw error;
        }
      }

    /**
     * Register a call event listener
     * @param {Function} listener Callback function for call events
     * @returns {Function} Function to remove the listener
     */
    addCallListener(listener) {
        this.callListeners.push(listener);

        // Return function to remove listener
        return () => {
            this.callListeners = this.callListeners.filter(l => l !== listener);
        };
    }

    /**
     * Notify all registered listeners of call events
     * @param {string} event Event type
     * @param {any} data Event data
     * @private
     */
    _notifyListeners(event, data) {
        this.callListeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (err) {
                console.error('Error in call listener:', err);
            }
        });
    }

    /**
     * Initialize a call to a contact
     * @param {string} contactPublicKey Contact's public key
     * @returns {Promise<boolean>} True if call initiated successfully
     */
    async initiateCall(contactPublicKey) {
        try {
            // Check if already in a call
            if (this.activeCall || this.incomingCall) {
                console.warn('Already in a call');
                return false;
            }

            // Initialize call service if needed
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Create the call offer
            const offer = await webRTCService.startCall(contactPublicKey);

            // Save active call
            this.activeCall = {
                contactKey: contactPublicKey,
                state: 'outgoing',
                startTime: Date.now()
            };

            // Notify listeners
            this._notifyListeners('call_state_changed', { state: 'outgoing', contact: contactPublicKey });

            // Send the offer as a message
            const signalMessage = {
                type: this.SIGNAL_TYPES.OFFER,
                payload: JSON.stringify(offer)
            };

            await this._sendSignalingMessage(contactPublicKey, signalMessage);
            console.log('Call offer sent to:', contactPublicKey);

            return true;
        } catch (error) {
            console.error('Failed to initiate call:', error);
            this.endCall();
            return false;
        }
    }

    /**
     * Handle an incoming call
     * @param {string} callerKey Caller's public key
     * @param {Object} offer WebRTC session description offer
     */
    handleIncomingCall(callerKey, offer) {
        try {
            // Reject if already in a call
            if (this.activeCall) {
                this._sendSignalingMessage(callerKey, {
                    type: this.SIGNAL_TYPES.BUSY,
                    payload: 'User is busy'
                });
                return;
            }

            // Save incoming call
            this.incomingCall = {
                contactKey: callerKey,
                offer: offer,
                receivedTime: Date.now()
            };

            // Auto-reject after 30 seconds if not answered
            this.incomingCallTimeout = setTimeout(() => {
                if (this.incomingCall && this.incomingCall.contactKey === callerKey) {
                    this.rejectCall();
                }
            }, 30000);

            // Notify listeners
            this._notifyListeners('call_state_changed', { state: 'incoming', contact: callerKey });

            // Play ringtone
            this._playRingtone();
        } catch (error) {
            console.error('Error handling incoming call:', error);
            this.rejectCall();
        }
    }

    /**
     * Answer an incoming call
     * @returns {Promise<boolean>} True if call answered successfully
     */
    async answerCall() {
        try {
            if (!this.incomingCall) {
                console.warn('No incoming call to answer');
                return false;
            }

            // Clear ringtone and timeout
            this._stopRingtone();
            if (this.incomingCallTimeout) {
                clearTimeout(this.incomingCallTimeout);
                this.incomingCallTimeout = null;
            }

            const { contactKey, offer } = this.incomingCall;

            // Create the answer
            const answer = await webRTCService.acceptCall(contactKey, offer);

            // Update call state
            this.activeCall = {
                contactKey: contactKey,
                state: 'connected',
                startTime: Date.now()
            };
            this.incomingCall = null;

            // Notify listeners
            this._notifyListeners('call_state_changed', { state: 'connected', contact: contactKey });

            // Send the answer
            const signalMessage = {
                type: this.SIGNAL_TYPES.ANSWER,
                payload: JSON.stringify(answer)
            };

            await this._sendSignalingMessage(contactKey, signalMessage);
            console.log('Call answer sent to:', contactKey);

            return true;
        } catch (error) {
            console.error('Failed to answer call:', error);
            this.endCall();
            return false;
        }
    }

    /**
     * Reject an incoming call
     * @returns {Promise<boolean>} True if call rejected successfully
     */
    async rejectCall() {
        try {
            if (!this.incomingCall) {
                console.warn('No incoming call to reject');
                return false;
            }

            // Clear ringtone and timeout
            this._stopRingtone();
            if (this.incomingCallTimeout) {
                clearTimeout(this.incomingCallTimeout);
                this.incomingCallTimeout = null;
            }

            const contactKey = this.incomingCall.contactKey;

            // Send hang up signal
            await this._sendSignalingMessage(contactKey, {
                type: this.SIGNAL_TYPES.HANG_UP,
                payload: 'Call rejected'
            });

            // Update state
            this.incomingCall = null;

            // Notify listeners
            this._notifyListeners('call_state_changed', { state: null, contact: null });

            return true;
        } catch (error) {
            console.error('Failed to reject call:', error);
            this.incomingCall = null;
            this._notifyListeners('call_state_changed', { state: null, contact: null });
            return false;
        }
    }

    /**
     * End the current call
     * @returns {Promise<boolean>} True if call ended successfully
     */
    async endCall() {
        try {
            // Get contact key before cleaning up
            const contactKey = this.activeCall?.contactKey;

            // Clean up WebRTC connection
            webRTCService.endCall();

            // Send hang up signal if in active call
            if (contactKey) {
                // Don't wait for this to complete, just fire it off
                this._sendSignalingMessage(contactKey, {
                    type: this.SIGNAL_TYPES.HANG_UP,
                    payload: 'Call ended'
                }).catch(err => {
                    console.warn('Failed to send hang up signal:', err);
                });
            }

            // Clean up state
            const wasInCall = !!this.activeCall || !!this.incomingCall;

            this.activeCall = null;
            this.incomingCall = null;

            if (this.incomingCallTimeout) {
                clearTimeout(this.incomingCallTimeout);
                this.incomingCallTimeout = null;
            }

            // Stop ringtone
            this._stopRingtone();

            // Notify listeners if we were in a call
            if (wasInCall) {
                this._notifyListeners('call_state_changed', {
                    state: 'ended',
                    contact: contactKey
                });

                // Short delay then change to null state
                setTimeout(() => {
                    this._notifyListeners('call_state_changed', { state: null, contact: null });
                }, 3000);
            } else {
                this._notifyListeners('call_state_changed', { state: null, contact: null });
            }

            return true;
        } catch (error) {
            console.error('Failed to end call cleanly:', error);

            // Force reset state anyway
            this.activeCall = null;
            this.incomingCall = null;

            if (this.incomingCallTimeout) {
                clearTimeout(this.incomingCallTimeout);
                this.incomingCallTimeout = null;
            }

            // Notify listeners
            this._notifyListeners('call_state_changed', { state: null, contact: null });

            return false;
        }
    }

    /**
     * Toggle the mute state
     * @returns {boolean} New mute state
     */
    toggleMute() {
        const isMuted = webRTCService.toggleMute();
        this._notifyListeners('mute_changed', { isMuted });
        return isMuted;
    }

    /**
     * Get the current mute state
     * @returns {boolean} True if muted
     */
    isMuted() {
        return webRTCService.getMuteState();
    }

    /**
     * Handle an ICE candidate from the local peer
     * @param {RTCIceCandidate} candidate ICE candidate
     * @private
     */
    async handleIceCandidate(candidate) {
        try {
            if (!this.activeCall || !this.activeCall.contactKey) return;

            const signalMessage = {
                type: this.SIGNAL_TYPES.ICE_CANDIDATE,
                payload: JSON.stringify(candidate)
            };

            await this._sendSignalingMessage(this.activeCall.contactKey, signalMessage);
        } catch (error) {
            console.error('Failed to send ICE candidate:', error);
        }
    }

    /**
     * Handle remote stream from peer
     * @param {MediaStream} stream Remote media stream
     * @private
     */
    handleRemoteStream(stream) {
        this._notifyListeners('remote_stream_received', { stream });
    }

    /**
     * Handle WebRTC connection state changes
     * @param {string} state Connection state
     * @private
     */
    handleConnectionStateChange(state) {
        try {
            console.log('WebRTC connection state changed:', state);

            // If we're in a call, notify listeners
            if (this.activeCall) {
                this._notifyListeners('connection_state_changed', { state });

                // Auto end call on disconnection
                if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.endCall();
                }
            }
        } catch (error) {
            console.error('Error handling connection state change:', error);
        }
    }

    /**
     * Process a signaling message from another peer
     * @param {string} senderKey Sender's public key
     * @param {Object} message Signaling message
     * @returns {Promise<boolean>} True if message processed successfully
     */
    async processSignalingMessage(senderKey, message) {
        try {
            if (!message || !message.type || !this.SIGNAL_TYPES[message.type]) {
                console.warn('Invalid signaling message:', message);
                return false;
            }

            console.log('Processing signaling message:', message.type, 'from:', senderKey);

            switch (message.type) {
                case this.SIGNAL_TYPES.OFFER:
                    // Handle incoming call offer
                    if (this.activeCall || this.incomingCall) {
                        // Already in a call, send busy signal
                        console.log("Already in a call, sending busy signal");
                        await this._sendSignalingMessage(senderKey, {
                            type: this.SIGNAL_TYPES.BUSY,
                            payload: 'User is busy'
                        });
                        return true;
                    }

                    try {
                        console.log("Processing incoming call offer");
                        const offer = JSON.parse(message.payload);
                        this.handleIncomingCall(senderKey, offer);
                        return true;
                    } catch (error) {
                        console.error('Error parsing call offer:', error);
                        return false;
                    }

                case this.SIGNAL_TYPES.ANSWER:
                    // Handle call answer
                    if (!this.activeCall || this.activeCall.contactKey !== senderKey) {
                        console.warn('Received answer from unexpected sender:', senderKey);
                        return false;
                    }

                    try {
                        const answer = JSON.parse(message.payload);
                        await webRTCService.processAnswer(answer);

                        // Update call state
                        this.activeCall.state = 'connected';
                        this._notifyListeners('call_state_changed', {
                            state: 'connected',
                            contact: senderKey
                        });

                        return true;
                    } catch (error) {
                        console.error('Error processing call answer:', error);
                        this.endCall();
                        return false;
                    }

                case this.SIGNAL_TYPES.ICE_CANDIDATE:
                    // Handle ICE candidate
                    if (!this.activeCall || (this.activeCall.contactKey !== senderKey &&
                        (!this.incomingCall || this.incomingCall.contactKey !== senderKey))) {
                        console.warn('Received ICE candidate from unexpected sender:', senderKey);
                        return false;
                    }

                    try {
                        const candidate = JSON.parse(message.payload);
                        await webRTCService.addIceCandidate(candidate);
                        return true;
                    } catch (error) {
                        console.error('Error processing ICE candidate:', error);
                        return false;
                    }

                case this.SIGNAL_TYPES.HANG_UP:
                    // Handle hang up
                    if ((this.activeCall && this.activeCall.contactKey === senderKey) ||
                        (this.incomingCall && this.incomingCall.contactKey === senderKey)) {
                        this.endCall();
                        return true;
                    }
                    return false;

                case this.SIGNAL_TYPES.BUSY:
                    // Handle busy signal
                    if (this.activeCall && this.activeCall.contactKey === senderKey) {
                        // Notify that the call was rejected due to busy
                        this._notifyListeners('call_rejected', { reason: 'busy' });
                        this.endCall();
                        return true;
                    }
                    return false;

                default:
                    console.warn('Unknown signaling message type:', message.type);
                    return false;
            }
        } catch (error) {
            console.error('Error processing signaling message:', error);
            return false;
        }
    }

    /**
     * Send a signaling message to another peer
     * @param {string} recipientKey Recipient's public key
     * @param {Object} message Signaling message
     * @returns {Promise<boolean>} True if message sent successfully
     * @private
     */
    async _sendSignalingMessage(recipientKey, message) {
        try {
          // Check if we have access to the conversation manager
          if (typeof window === 'undefined' || !window.conversationManager || 
              typeof window.conversationManager.sendCallSignal !== 'function') {
            
            // Fallback: Try direct import if available
            if (typeof conversationManager !== 'undefined' && 
                typeof conversationManager.sendCallSignal === 'function') {
              await conversationManager.sendCallSignal(recipientKey, message);
              return true;
            }
            
            console.error('No valid conversation manager available for sending call signals');
            console.log('Will try to send message using alternative method');
            
            // Fallback to direct message
            if (typeof window !== 'undefined' && window.conversationManager && 
                typeof window.conversationManager.sendMessage === 'function') {
              
              const callSignalPrefix = "CALL_SIGNAL:";
              const signalMessage = `${callSignalPrefix}${JSON.stringify(message)}`;
              await window.conversationManager.sendMessage(recipientKey, signalMessage);
              return true;
            }
            
            return false;
          }
          
          // Send call signal
          await window.conversationManager.sendCallSignal(recipientKey, message);
          return true;
        } catch (error) {
          console.error('Failed to send signaling message:', error);
          return false;
        }
      }

    /**
     * Play the ringtone for incoming calls
     * @private
     */
    _playRingtone() {
        try {
            // Stop any existing ringtone
            this._stopRingtone();

            // Create audio element
            this.ringtone = new Audio('/sounds/ringtone.mp3');

            // Set properties
            this.ringtone.loop = true;
            this.ringtone.volume = 0.7;

            // Start playing
            this.ringtone.play().catch(error => {
                console.warn('Failed to play ringtone:', error);
            });
        } catch (error) {
            console.warn('Error playing ringtone:', error);
        }
    }

    /**
     * Stop the ringtone
     * @private
     */
    _stopRingtone() {
        if (this.ringtone) {
            try {
                this.ringtone.pause();
                this.ringtone.currentTime = 0;
                this.ringtone = null;
            } catch (error) {
                console.warn('Error stopping ringtone:', error);
            }
        }
    }

    /**
     * Check if currently in a call
     * @returns {boolean} True if in a call
     */
    isInCall() {
        return !!this.activeCall;
    }

    /**
     * Get the current call state
     * @returns {string|null} Call state or null if not in a call
     */
    getCallState() {
        if (this.activeCall) return this.activeCall.state;
        if (this.incomingCall) return 'incoming';
        return null;
    }

    /**
     * Get the current call partner key
     * @returns {string|null} Partner's public key or null if not in a call
     */
    getCurrentCallPartner() {
        if (this.activeCall) return this.activeCall.contactKey;
        if (this.incomingCall) return this.incomingCall.contactKey;
        return null;
    }
}

// Create and export singleton instance
const callService = new CallService();
export default callService;
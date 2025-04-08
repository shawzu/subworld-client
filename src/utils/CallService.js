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

        // Enable detailed debug logging for call service
        this.debugMode = true;

        // Signaling message types
        this.SIGNAL_TYPES = {
            OFFER: 'call_offer',
            ANSWER: 'call_answer',
            ICE_CANDIDATE: 'call_ice_candidate',
            HANG_UP: 'call_hang_up',
            BUSY: 'call_busy'
        };

        // Log initialization
        console.log('Call service instance created');
    }

    /**
     * Initialize the call service
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('Call service already initialized');
            return true;
        }

        try {
            console.log("Initializing call service...");

            // Initialize WebRTC service
            webRTCService.initialize(
                this.handleIceCandidate.bind(this),
                this.handleRemoteStream.bind(this),
                this.handleConnectionStateChange.bind(this)
            );

            // Make the call service globally available
            if (typeof window !== 'undefined') {
                window.callService = this;
                console.log("Call service registered globally as window.callService");
            }

            // Try to find the conversation manager
            if (typeof window !== 'undefined' && window.conversationManager) {
                console.log("Found conversation manager during initialization");
                this.conversationManager = window.conversationManager;

                // Create a two-way connection
                if (window.conversationManager && !window.conversationManager.callService) {
                    window.conversationManager.callService = this;
                    console.log("Set reference from conversation manager to call service");
                }
            } else {
                console.log("Conversation manager not found yet, will connect when available");

                // Set up a check to find the conversation manager later
                if (typeof window !== 'undefined') {
                    const checkForConversationManager = () => {
                        if (window.conversationManager) {
                            console.log("Found conversation manager in delayed check");
                            this.conversationManager = window.conversationManager;

                            // Register back-reference
                            if (!window.conversationManager.callService) {
                                window.conversationManager.callService = this;
                                console.log("Set delayed reference from conversation manager to call service");
                            }
                        } else {
                            console.log("Still waiting for conversation manager...");
                            setTimeout(checkForConversationManager, 1000);
                        }
                    };

                    // Start checking
                    setTimeout(checkForConversationManager, 1000);
                }
            }

            // Set up periodic state check to catch and fix any state inconsistencies
            if (typeof window !== 'undefined') {
                // Check every 2 seconds if the call state matches the WebRTC state
                this.stateCheckInterval = setInterval(() => {
                    if (this.activeCall && this.activeCall.state === 'outgoing') {
                        // If call has been in outgoing state for more than 10 seconds
                        // and WebRTC shows it's connected, force a state update
                        const callDuration = Date.now() - this.activeCall.startTime;
                        if (callDuration > 10000) { // 10 seconds
                            this.forceStateSync();
                        }
                    }
                }, 2000);
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
    /**
 * Handle an incoming call
 * @param {string} callerKey Caller's public key
 * @param {Object|string} offer WebRTC session description offer
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

            console.log('Handling incoming call from:', callerKey);
            console.log('Offer type:', typeof offer);

            // Make sure offer is properly formatted for storage
            let processedOffer = offer;

            // If it's a string, we need to parse it
            if (typeof offer === 'string') {
                try {
                    processedOffer = JSON.parse(offer);
                    console.log('Parsed offer from string:', typeof processedOffer);
                } catch (err) {
                    console.error('Error parsing offer string:', err);
                    // Keep as string if parsing fails - WebRTCService will handle it
                }
            }

            // Save incoming call
            this.incomingCall = {
                contactKey: callerKey,
                offer: processedOffer,
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
            console.log('Answering call from:', contactKey);
            console.log('Using offer:', typeof offer, offer ? 'with data' : 'missing!');

            // Create the answer
            try {
                const answer = await webRTCService.acceptCall(contactKey, offer);
                console.log('Call accepted with answer:', answer ? 'received' : 'missing');

                // Validate that the answer is in proper format before sending
                if (!answer || (!answer.type && !answer.sdp && typeof answer !== 'object')) {
                    console.error('Invalid answer format:', answer);
                    throw new Error('Failed to create valid answer');
                }

                // For debug - log the answer details
                console.log('Answer details:',
                    answer.type,
                    answer.sdp ? 'has sdp' : 'no sdp',
                    typeof answer.toJSON === 'function' ? 'has toJSON method' : 'no toJSON method'
                );

                // Update call state
                this.activeCall = {
                    contactKey: contactKey,
                    state: 'connected',
                    startTime: Date.now()
                };
                this.incomingCall = null;

                // Notify listeners
                this._notifyListeners('call_state_changed', { state: 'connected', contact: contactKey });

                // Convert to plain object if needed
                let answerForSignal;
                if (typeof answer.toJSON === 'function') {
                    answerForSignal = answer.toJSON();
                    console.log('Converted answer to JSON for signaling');
                } else {
                    answerForSignal = {
                        type: answer.type,
                        sdp: answer.sdp
                    };
                    console.log('Created answer object for signaling');
                }

                // Send the answer signal
                const signalMessage = {
                    type: this.SIGNAL_TYPES.ANSWER,
                    payload: JSON.stringify(answerForSignal)
                };

                // Log the signal we're about to send
                console.log('Sending answer signal to:', contactKey);
                console.log('Signal type:', signalMessage.type);
                console.log('Payload is stringified:', typeof signalMessage.payload === 'string');

                const sent = await this._sendSignalingMessage(contactKey, signalMessage);
                if (sent) {
                    console.log('Call answer sent successfully to:', contactKey);
                } else {
                    console.error('Failed to send call answer to:', contactKey);
                    throw new Error('Failed to send answer signal');
                }

                return true;
            } catch (error) {
                console.error('Failed to create or send answer:', error);
                throw error;
            }
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

            if (this.stateCheckInterval) {
                clearInterval(this.stateCheckInterval);
                this.stateCheckInterval = null;
            }
            
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

            // Notify listeners
            this._notifyListeners('connection_state_changed', { state });

            // If connected, make sure the call state is updated
            if (state === 'connected' && this.activeCall) {
                console.log('WebRTC connected, ensuring call state is updated');

                // Force state update for both outgoing and connected calls
                const currentState = this.activeCall.state;
                if (currentState === 'outgoing' || currentState === 'connecting') {
                    console.log(`Forcing state change from ${currentState} to connected`);
                    this.activeCall.state = 'connected';
                    this._notifyListeners('call_state_changed', {
                        state: 'connected',
                        contact: this.activeCall.contactKey
                    });
                }
            }

            // Auto end call on disconnection
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                this.endCall();
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
            console.log(`Processing signal from ${senderKey}, type:`, message.type);

            if (!message || !message.type) {
                console.warn('Invalid signaling message:', message);
                return false;
            }

            // Make sure the type is one we recognize
            if (!Object.values(this.SIGNAL_TYPES).includes(message.type)) {
                console.warn('Unknown signal type:', message.type);
                return false;
            }

            switch (message.type) {
                case this.SIGNAL_TYPES.OFFER:
                    console.log("Received call offer from:", senderKey);

                    // Make sure the payload is properly formatted
                    let offer = message.payload;
                    if (typeof offer === 'string') {
                        try {
                            offer = JSON.parse(offer);
                            console.log("Parsed offer payload from string");
                        } catch (parseError) {
                            console.error("Failed to parse offer payload:", parseError);
                            // Continue with string format - handleIncomingCall will attempt to handle it
                        }
                    }

                    // Always log the offer format to help with debugging
                    console.log("Offer format:", typeof offer);
                    if (typeof offer === 'object') {
                        console.log("Offer content:", offer.type, offer.sdp ? "has sdp" : "no sdp");
                    }

                    this.handleIncomingCall(senderKey, offer);
                    return true;

                case this.SIGNAL_TYPES.ANSWER:
                    // Handle call answer
                    console.log("Received call answer from:", senderKey);

                    if (!this.activeCall) {
                        console.warn('Received answer but no active call exists');
                        return false;
                    }

                    if (this.activeCall.contactKey !== senderKey) {
                        console.warn(`Received answer from ${senderKey} but active call is with ${this.activeCall.contactKey}`);
                        return false;
                    }

                    console.log(`Processing answer for active call with ${this.activeCall.contactKey}`);

                    try {
                        let answer = message.payload;
                        console.log("Answer payload type:", typeof answer);

                        if (typeof answer === 'string') {
                            try {
                                answer = JSON.parse(answer);
                                console.log("Parsed answer payload from string, now type:", typeof answer);

                                // Make sure we have valid SDP content
                                if (typeof answer === 'object' && answer.type && answer.sdp) {
                                    console.log(`Answer appears valid: type=${answer.type}, has sdp=${!!answer.sdp}`);
                                } else {
                                    console.warn("Parsed answer doesn't have expected structure:", answer);
                                }

                            } catch (parseError) {
                                console.error("Failed to parse answer payload:", parseError);
                                return false;
                            }
                        }

                        // Process the answer with extra logging
                        console.log("Calling webRTCService.processAnswer with:", typeof answer);
                        const result = await webRTCService.processAnswer(answer);
                        console.log("processAnswer result:", result);

                        // FIX: Update call state BEFORE notifying listeners
                        if (this.activeCall) {
                            console.log(`Changing call state from ${this.activeCall.state} to connected`);
                            // Ensure we update the active call state first
                            this.activeCall.state = 'connected';
                        }

                        // Notify listeners about the state change
                        // This is the key fix: Always notify with 'connected' state when we receive an answer
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
                        let candidate = message.payload;
                        if (typeof candidate === 'string') {
                            try {
                                candidate = JSON.parse(candidate);
                            } catch (parseError) {
                                console.error("Failed to parse ICE candidate:", parseError);
                                return false;
                            }
                        }

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
            console.log(`Sending ${message.type} signal to ${recipientKey}`);

            // Try conversation manager from different sources in order of preference
            let conversationMgr = null;

            // First try instance variable
            if (this.conversationManager) {
                console.log("Using instance conversationManager");
                conversationMgr = this.conversationManager;
            }
            // Then try window reference
            else if (typeof window !== 'undefined' && window.conversationManager) {
                console.log("Using window.conversationManager");
                conversationMgr = window.conversationManager;
            }
            // Then try direct import
            else if (typeof conversationManager !== 'undefined') {
                console.log("Using imported conversationManager");
                conversationMgr = conversationManager;
            }

            if (!conversationMgr) {
                console.error('No conversation manager available for sending call signals');
                return false;
            }

            // Determine the call signal prefix
            const callSignalPrefix = conversationMgr.callSignalPrefix || "CALL_SIGNAL:";

            // Ensure the payload is a string
            let payloadToSend = message.payload;
            if (typeof payloadToSend !== 'string' && payloadToSend !== undefined) {
                try {
                    payloadToSend = JSON.stringify(payloadToSend);
                } catch (err) {
                    console.error('Failed to stringify payload:', err);
                    return false;
                }
            }

            // Create the complete signaling message
            const signalMessage = `${callSignalPrefix}${JSON.stringify({
                type: message.type,
                payload: payloadToSend
            })}`;

            // Send using conversation manager
            console.log(`Sending signal of type ${message.type} to ${recipientKey}`);
            await conversationMgr.sendMessage(recipientKey, signalMessage);

            console.log(`${message.type} signal sent successfully to ${recipientKey}`);
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
 * Force state synchronization for active calls
 * This method will check if there's an active WebRTC connection
 * and ensure the UI state matches the actual connection state
 */
    forceStateSync() {
        try {
            // If we have an active call but it's still in outgoing state
            if (this.activeCall && this.activeCall.state === 'outgoing') {
                // Check the actual WebRTC connection state
                if (window.callService && window.callService.webRTCService) {
                    const connection = window.callService.webRTCService.peerConnection;

                    if (connection) {
                        console.log('Force syncing call state. Current states:');
                        console.log('- Call state:', this.activeCall.state);
                        console.log('- Connection state:', connection.connectionState);
                        console.log('- ICE connection state:', connection.iceConnectionState);
                        console.log('- Signaling state:', connection.signalingState);

                        // If WebRTC shows connected but our UI doesn't, fix it
                        if (
                            connection.connectionState === 'connected' ||
                            connection.iceConnectionState === 'connected' ||
                            connection.iceConnectionState === 'completed'
                        ) {
                            console.log('⚠️ State mismatch detected! Fixing call state');
                            this.activeCall.state = 'connected';
                            this._notifyListeners('call_state_changed', {
                                state: 'connected',
                                contact: this.activeCall.contactKey
                            });
                            return true;
                        }
                    }
                }
            }
            return false;
        } catch (error) {
            console.error('Error in forceStateSync:', error);
            return false;
        }
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
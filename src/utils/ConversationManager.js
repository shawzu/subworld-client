'use client'

import subworldNetwork from './SubworldNetworkService'
import contactStore from './ContactStore'
import LocalKeyStorageManager from './LocalKeyStorageManager'

/**
 * Manages conversations and messages
 */
class ConversationManager {
  constructor() {
    this.conversations = [];
    this.lastFetch = null;
    this.fetchInterval = null;
    this.initialized = false;
    this.currentUserKey = null;
    this._lastFetchTime = 0; // Rate limiting
    this.disableAutoFetch = true; // Auto-fetching disabled by default

    this.callSignalPrefix = "CALL_SIGNAL:";
    this.isProcessingCallMessages = false;

    // Reference to call service (will be set later)
    this.callService = null;

    this.groups = [];
    this.groupMessages = {};
  }

  /**
   * Initialize the conversation manager
   * @param {string} currentUserKey - Current user's public key
   */
  async initialize(currentUserKey) {
    if (this.initialized) return true;

    try {
      if (!currentUserKey) {
        console.error('No user key provided for initialization');
        return false;
      }

      this.currentUserKey = currentUserKey;

      // Initialize the contact store
      if (contactStore && typeof contactStore.initialize === 'function') {
        await contactStore.initialize();
      } else {
        console.warn('Contact store not available or initialize method missing');
      }

      // Load conversation data from localStorage (for persistence)
      try {
        const savedConversations = localStorage.getItem('subworld_conversations');
        if (savedConversations) {
          const parsed = JSON.parse(savedConversations);
          this.conversations = Array.isArray(parsed) ? parsed : [];
        } else {
          this.conversations = [];
        }
      } catch (storageError) {
        console.error('Error loading conversations from storage:', storageError);
        this.conversations = [];
      }

      await this.initializeGroups();

      this.initialized = true;

      // Auto-fetching disabled
      console.log('Auto-fetching disabled to reduce server load');

      // Make self available globally for other services
      if (typeof window !== 'undefined') {
        window.conversationManager = this;
        console.log('Conversation manager registered globally');
      }

      return true;
    } catch (error) {
      console.error('Error initializing conversation manager:', error);
      this.conversations = [];
      return false;
    }
  }

  /**
   * Start periodic fetching of new messages - DISABLED
   */
  startFetchInterval() {
    // EMERGENCY: Disabled to prevent excessive calls
    console.log('Auto-fetching disabled to reduce server load');
    return;
  }

  /**
   * Stop periodic fetching
   */
  stopFetchInterval() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval)
      this.fetchInterval = null
    }
  }

  /**
   * Get all conversations
   * @returns {Array} - Array of conversations
   */
  getAllConversations() {
    return [...this.conversations]
  }

  /**
   * Get a conversation by contact public key
   * @param {string} contactPublicKey - Contact's public key
   * @returns {Object|null} - Conversation object or null
   */
  getConversation(contactPublicKey) {
    return this.conversations.find(c => c.contactPublicKey === contactPublicKey) || null
  }

  /**
   * Create a new conversation or update an existing one
   * @param {string} contactPublicKey - Contact's public key
   * @param {string} alias - Optional alias for the contact
   * @returns {Object} - The conversation
   */
  createOrUpdateConversation(contactPublicKey, alias = null) {
    // Save or update the contact
    if (alias) {
      contactStore.saveContact(contactPublicKey, alias)
    }

    // Check if conversation exists
    let conversation = this.getConversation(contactPublicKey)

    if (!conversation) {
      // Create new conversation
      conversation = {
        id: Date.now(), // Temporary ID
        contactPublicKey,
        messages: [],
        lastMessageTime: null,
        unreadCount: 0,
        createdAt: new Date().toISOString()
      }

      this.conversations.push(conversation)
      this._persistConversations()
    }

    return conversation
  }

  /**
   * Process call signals from messages
   * @param {Array} messages - Array of messages to check for call signals
   * @private
   */
  _processCallSignals(messages) {
    // Skip if call service not available or already processing
    if (typeof window === 'undefined' || !window.voiceService || this.isProcessingCallMessages) {
      return;
    }

    try {
      this.isProcessingCallMessages = true;

      // Find call signaling messages
      for (const message of messages) {
        // Skip our own messages
        if (message.sender === this.currentUserKey) continue;

        // Check if this is a call signaling message
        if (typeof message.content === 'string' && message.content.startsWith(this.callSignalPrefix)) {
          console.log('Found call signal message:', message.id);

          // Extract the signaling data
          try {
            const signalString = message.content.substring(this.callSignalPrefix.length);
            const signalData = JSON.parse(signalString);

            // Log the signal type for debugging
            console.log('Processing call signal type:', signalData.type);

            // Process the signaling message
            if (window.voiceService && typeof window.voiceService.processSignalingMessage === 'function') {
              window.voiceService.processSignalingMessage(message.sender, signalData.data || signalData);
            } else {
              console.warn('Call service not available for processing signal');
            }
          } catch (err) {
            console.warn('Error parsing call signal:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error processing call signals:', error);
    } finally {
      this.isProcessingCallMessages = false;
    }
  }

  /**
  * Process a new message and handle any special message types (like call signals)
  * @param {Object} message - The message to process
  * @private
  */
  _processMessage(message) {
    // Skip processing our own messages
    if (message.sender === this.currentUserKey) return;

    try {
      // Check if this is a call signaling message
      if (typeof message.content === 'string' && message.content.startsWith(this.callSignalPrefix)) {
        console.log('Found call signal in _processMessage:', message.content.substring(0, 100) + '...');

        try {
          // Extract the signaling data
          const signalString = message.content.substring(this.callSignalPrefix.length);
          const signalData = JSON.parse(signalString);

          // Process WebRTC signal immediately
          if (typeof window !== 'undefined' && window.voiceService) {
            if (signalData.data) {
              window.voiceService.processSignalingMessage(message.sender, signalData.data);
            } else {
              window.voiceService.processSignalingMessage(message.sender, signalData);
            }
          }
        } catch (err) {
          console.warn('Error parsing call signal:', err);
        }
      }
    } catch (error) {
      console.error('Error in message processor:', error);
    }
  }

  /**
   * Send a call signal message
   * @param {string} recipientPublicKey - Recipient's public key 
   * @param {Object} signalData - Call signal data
   * @returns {Promise<boolean>} - Success status
   */
  async sendCallSignal(recipientPublicKey, signalData) {
    try {
      console.log("Sending call signal:", signalData.type || signalData.data?.type);
      // Add prefix to identify as call signal
      const signalMessage = `${this.callSignalPrefix}${JSON.stringify(signalData)}`;

      // Send using regular message channel
      await this.sendMessage(recipientPublicKey, signalMessage);
      console.log("Call signal sent successfully");
      return true;
    } catch (error) {
      console.error('Failed to send call signal:', error);
      return false;
    }
  }

  /**
   * Process WebRTC signaling messages
   * @param {Object} message - The message to process
   * @private
   */
  _processWebRTCSignal(message) {
    if (typeof window === 'undefined' || !window.voiceService) {
      return;
    }

    try {
      // Extract the JSON part after the prefix
      const signalString = message.content.substring(this.callSignalPrefix.length);
      const signalData = JSON.parse(signalString);

      // Log the signal type for debugging
      console.log('Processing call signal type:', signalData.type);

      // Process the signaling message with the voice service
      if (window.voiceService && typeof window.voiceService.processSignalingMessage === 'function') {
        window.voiceService.processSignalingMessage(message.sender, signalData);
      } else {
        console.warn('Voice service not available for processing signal');
      }
    } catch (error) {
      console.warn('Error processing WebRTC signal:', error);
    }
  }

  /**
   * Send a message in a conversation
   * @param {string} contactPublicKey - Recipient's public key
   * @param {string} content - Message content
   * @returns {Promise<Object>} - The sent message
   */
  async sendMessage(contactPublicKey, content) {
    try {
      // Ensure conversation exists
      const conversation = this.createOrUpdateConversation(contactPublicKey)

      // Send through network service
      const result = await subworldNetwork.sendMessage(contactPublicKey, content)

      // Create message object
      const message = {
        id: result.messageId || `local-${Date.now()}`,
        sender: this.currentUserKey,
        recipient: contactPublicKey,
        content,
        timestamp: new Date().toISOString(),
        status: 'sent'
      }

      // Add to conversation
      conversation.messages.push(message)
      conversation.lastMessageTime = message.timestamp

      // Update conversation order based on last message time
      this._sortConversationsByTime()

      // Persist changes
      this._persistConversations()

      return message
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  /**
 * Fetch new messages from the network
 * @returns {Promise<number>} - Number of new messages
 */
  async fetchNewMessages() {
    try {
      // Rate limiting - only fetch every 30 seconds at most
      const now = Date.now();
      if (now - this._lastFetchTime < 30000) { // 30 seconds
        console.log('Skipping message fetch - fetched recently');
        return 0;
      }
      this._lastFetchTime = now;
      console.log('Fetching messages (rate limited)...');

      // Check if network service is available
      if (!subworldNetwork) {
        console.warn('Network service unavailable');
        return 0;
      }

      // Check if user key is available
      if (!this.currentUserKey) {
        console.warn('No current user key available');
        return 0;
      }

      // Get messages from network service with explicit try/catch
      let messages;
      let newMessageCount = 0;

      try {
        messages = await subworldNetwork.fetchMessages();
        console.log('Messages received:', messages ? (Array.isArray(messages) ? messages.length : 'non-array') : 'null');
      } catch (fetchError) {
        console.error('Error in network fetchMessages:', fetchError);
        messages = [];
      }

      // Validate that messages is an array
      if (!messages) {
        console.warn('No messages returned');
        messages = [];
      }

      if (!Array.isArray(messages)) {
        console.warn('Invalid messages format:', typeof messages);
        messages = [];
      }

      // Process new messages
      const processedIds = [];

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];

        // Skip invalid messages
        if (!message || typeof message !== 'object') {
          console.warn('Skipping invalid message at index', i, ':', message);
          continue;
        }

        // Ensure message has required properties
        if (!message.sender || !message.recipient) {
          console.warn('Message missing sender or recipient at index', i, ':', message);
          continue;
        }

        try {
          // Process any call signals in this message immediately
          this._processMessage(message);

          // Check if this is a file metadata message
          if (typeof message.content === 'string') {
            try {
              const potentialMetadata = JSON.parse(message.content);
              if (potentialMetadata && potentialMetadata.messageType === 'file') {
                // This is a file metadata message - convert it to a file message
                message.isFile = true;
                message.fileID = potentialMetadata.fileID;
                message.fileName = potentialMetadata.fileName;
                message.fileType = potentialMetadata.fileType;
                message.fileSize = potentialMetadata.fileSize;
                // Update the content to show it's a file
                message.content = `[File: ${potentialMetadata.fileName}]`;
                console.log('Converted message to file message:', message);
              }
            } catch (jsonError) {
              // Not JSON, just a regular message
            }
          }

          // Determine the other party (sender if received, recipient if sent)
          const contactPublicKey = message.sender === this.currentUserKey
            ? message.recipient
            : message.sender;

          // Get or create conversation
          const conversation = this.createOrUpdateConversation(contactPublicKey);

          // Skip if no valid conversation
          if (!conversation || !conversation.messages) {
            console.warn('Invalid conversation for', contactPublicKey);
            continue;
          }

          // Generate message ID if missing
          if (!message.id) {
            message.id = `gen-${Date.now()}-${i}`;
          }

          // Check if message already exists in conversation
          const messageExists = conversation.messages.some(m => m && m.id === message.id);

          if (!messageExists) {
            // Add message to conversation
            conversation.messages.push(message);

            // Update last message time safely
            const messageTime = new Date(message.timestamp || Date.now());
            const lastTime = conversation.lastMessageTime ? new Date(conversation.lastMessageTime) : new Date(0);
            if (messageTime > lastTime) {
              conversation.lastMessageTime = message.timestamp || new Date().toISOString();
            }

            // Increment unread count for received messages
            if (message.sender !== this.currentUserKey) {
              conversation.unreadCount = (conversation.unreadCount || 0) + 1;
              newMessageCount++;

              // Collect ID for delivery receipt
              if (message.id) {
                processedIds.push(message.id);
              }
            }
          }
        } catch (messageError) {
          // Catch errors for individual messages to prevent full failure
          console.error('Error processing message at index', i, ':', messageError);
        }
      }

      console.log("Processing call signals from messages if any...");
      this._processCallSignals(messages);

      // Mark messages as delivered on the server if any were found
      if (newMessageCount > 0 && processedIds.length > 0) {
        try {
          // Fire and forget - don't wait for this to complete
          subworldNetwork.markMessagesAsDelivered(this.currentUserKey, processedIds)
            .catch(err => console.log('Failed to mark messages as delivered:', err));
        } catch (markError) {
          console.error('Error initiating mark as delivered:', markError);
        }
      }

      // Additionally fetch group messages for all groups
      try {
        // Refresh groups list first
        await this.fetchGroups();

        // Then fetch messages for each group
        if (Array.isArray(this.groups)) {
          for (const group of this.groups) {
            if (group && group.id) {
              try {
                const previousMessages = this.groupMessages[group.id] ?
                  this.groupMessages[group.id].length : 0;

                await this.fetchGroupMessages(group.id);

                // Check if we got new messages by comparing counts
                if (this.groupMessages[group.id]) {
                  const newMessages = this.groupMessages[group.id].length - previousMessages;
                  if (newMessages > 0) {
                    newMessageCount += newMessages;

                    // Update the last message timestamp for sorting
                    const sortedMessages = [...this.groupMessages[group.id]].sort(
                      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                    );

                    if (sortedMessages.length > 0) {
                      // Find the group and update its information
                      const groupIndex = this.groups.findIndex(g => g.id === group.id);
                      if (groupIndex >= 0) {
                        this.groups[groupIndex].lastMessageTime = sortedMessages[0].timestamp;
                      }
                    }
                  }
                }
              } catch (groupMsgError) {
                console.warn(`Error fetching messages for group ${group.id}:`, groupMsgError);
              }
            }
          }
        }
      } catch (groupError) {
        console.error('Error refreshing group messages:', groupError);
      }

      try {
        // Update last fetch time
        this.lastFetch = new Date();

        // Sort conversations
        this._sortConversationsByTime();

        // Persist changes
        this._persistConversations();
        this._persistGroupMessages();
        this._persistGroups();
      } catch (updateError) {
        console.error('Error updating conversation state:', updateError);
      }

      return newMessageCount;
    } catch (error) {
      // Use a safer error logging approach
      console.error('Error in fetchNewMessages:', error ? error.message : 'Unknown error');

      // Additional debug info that won't cause errors
      if (error) {
        console.log('Error name:', error.name);
        console.log('Error stack:', error.stack);
      }

      return 0;
    }
  }

  /**
   * Send a file in a conversation through the network
   * @param {string} contactPublicKey - Recipient's public key
   * @param {File} file - The file to send
   * @returns {Promise<Object>} - The sent message
   */
  async sendFile(contactPublicKey, file) {
    try {
      // Ensure conversation exists
      const conversation = this.createOrUpdateConversation(contactPublicKey);

      // Show original file size
      const fileSizeFormatted = this.formatFileSize(file.size);

      // Upload the file to the network (now with encryption)
      const uploadResult = await subworldNetwork.uploadFile(
        contactPublicKey,
        file
      );

      if (!uploadResult.success || !uploadResult.fileId) {
        throw new Error('Failed to upload file to the network');
      }

      // Create a unique ID for this message
      const messageId = `file-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create message object with file reference
      const message = {
        id: messageId,
        sender: this.currentUserKey,
        recipient: contactPublicKey,
        content: `[File: ${file.name}]`,
        timestamp: new Date().toISOString(),
        status: 'sent',
        isFile: true,
        fileID: uploadResult.fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      };

      // Add to conversation
      conversation.messages.push(message);
      conversation.lastMessageTime = message.timestamp;

      // Update conversation order
      this._sortConversationsByTime();

      // Persist changes
      this._persistConversations();

      // Send a message with the file metadata
      try {
        const fileMetadata = {
          messageType: 'file',
          fileID: uploadResult.fileId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        };

        // Send as JSON string
        await this.sendMessage(
          contactPublicKey,
          JSON.stringify(fileMetadata)
        );
      } catch (networkError) {
        console.log('Network notification failed, but file was uploaded');
      }

      return message;
    } catch (error) {
      console.error('Error sending file:', error);
      throw error;
    }
  }

  // Helper method to format file size
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  // Helper method to convert file to base64
  async convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Mark conversation as read
   * @param {string} contactPublicKey - Contact's public key
   */
  markConversationAsRead(contactPublicKey) {
    const conversation = this.getConversation(contactPublicKey)
    if (conversation) {
      conversation.unreadCount = 0
      this._persistConversations()
    }
  }

  /**
 * Get conversation preview data (for conversation list)
 * @returns {Array} - Array of conversation previews
 */
  getConversationPreviews() {
    // Direct message conversations only - explicitly filter out any potential groups
    const directPreviews = this.conversations.map(conversation => {
      const contact = contactStore?.getContact(conversation.contactPublicKey);
      const lastMessage = this._getLastMessage(conversation);

      return {
        id: `direct-${conversation.id || conversation.contactPublicKey}`, // Prefix for uniqueness
        contactPublicKey: conversation.contactPublicKey,
        contactName: contact?.alias || conversation.contactPublicKey,
        lastMessage: lastMessage?.content || '',
        lastMessageTime: lastMessage?.timestamp || conversation.createdAt,
        unreadCount: conversation.unreadCount || 0,
        isOnline: false,
        isGroup: false // Explicitly mark as not a group
      };
    });

    return directPreviews;
  }

  markGroupAsRead(groupId) {
    if (!groupId) return;

    // Find the group
    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex >= 0) {
      // Update the last read timestamp to now
      this.groups[groupIndex].lastReadTimestamp = new Date().toISOString();
      this._persistGroups();
    }
  }

  /**
   * Get the last message in a conversation
   * @param {Object} conversation - Conversation object
   * @returns {Object|null} - Last message or null
   * @private
   */
  _getLastMessage(conversation) {
    if (!conversation.messages || conversation.messages.length === 0) {
      return null
    }

    // Sort messages by timestamp (newest first)
    const sortedMessages = [...conversation.messages].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    )

    return sortedMessages[0]
  }

  /**
   * Sort conversations by last message time
   * @private
   */
  _sortConversationsByTime() {
    try {
      // Make sure conversations is an array
      if (!Array.isArray(this.conversations)) {
        console.warn('Conversations is not an array, initializing empty array');
        this.conversations = [];
        return;
      }

      // Filter out any invalid conversations
      this.conversations = this.conversations.filter(conv => {
        return conv && typeof conv === 'object';
      });

      // Sort conversations safely
      this.conversations.sort((a, b) => {
        try {
          const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(a.createdAt || 0);
          const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(b.createdAt || 0);

          // Check if both are valid dates
          if (isNaN(timeA.getTime()) || isNaN(timeB.getTime())) {
            return 0; // Keep order unchanged for invalid dates
          }

          return timeB - timeA; // Newest first
        } catch (sortError) {
          console.warn('Error sorting conversations:', sortError);
          return 0; // Keep order unchanged on error
        }
      });
    } catch (error) {
      console.error('Error in _sortConversationsByTime:', error);
      // Don't throw, just continue execution
    }
  }

  /**
   * Persist conversations to localStorage
   * @private
   */
  _persistConversations() {
    try {
      // Make sure conversations is an array
      if (!Array.isArray(this.conversations)) {
        console.warn('Conversations is not an array, initializing empty array');
        this.conversations = [];
      }

      // Filter out any invalid conversations
      const cleanConversations = this.conversations.filter(conv => {
        return conv && typeof conv === 'object';
      });

      // Only save if we have localStorage available
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('subworld_conversations', JSON.stringify(cleanConversations));
      }
    } catch (error) {
      console.error('Error persisting conversations:', error);
      // Don't throw, just continue execution
    }
  }

  /**
   * Delete message history and conversation
   * @param {string} contactPublicKey - Contact's public key
   * @returns {boolean} - Success status
   */
  deleteConversation(contactPublicKey) {
    try {
      // Filter out the conversation
      const originalLength = this.conversations.length
      this.conversations = this.conversations.filter(c => c.contactPublicKey !== contactPublicKey)

      // Check if a conversation was removed
      if (this.conversations.length < originalLength) {
        this._persistConversations()
        return true
      }
      return false
    } catch (error) {
      console.error('Error deleting conversation:', error)
      return false
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopFetchInterval()
  }

  /**
 * Initialize groups from localStorage
 */
  async initializeGroups() {
    try {
      // Load groups from localStorage
      const savedGroups = localStorage.getItem('subworld_groups');
      if (savedGroups) {
        const parsed = JSON.parse(savedGroups);
        this.groups = Array.isArray(parsed) ? parsed : [];
      } else {
        this.groups = [];
      }

      // Load group messages
      const savedGroupMessages = localStorage.getItem('subworld_group_messages');
      if (savedGroupMessages) {
        this.groupMessages = JSON.parse(savedGroupMessages);
      } else {
        this.groupMessages = {};
      }

      // Fetch latest groups from network
      await this.fetchGroups();

      return true;
    } catch (error) {
      console.error('Error initializing groups:', error);
      return false;
    }
  }

  /**
   * Fetch groups from the network
   */
  async fetchGroups() {
    if (!subworldNetwork) return false;

    try {
      const groups = await subworldNetwork.listUserGroups();
      this.groups = groups || [];
      this._persistGroups();
      return true;
    } catch (error) {
      console.error('Error fetching groups:', error);
      return false;
    }
  }

  /**
   * Create a new group
   */
  async createGroup(name, description, members = []) {
    if (!subworldNetwork) {
      throw new Error('Network service not available');
    }

    try {
      const result = await subworldNetwork.createGroup(name, description, members);
      if (!result.success) {
        throw new Error('Failed to create group');
      }


      const group = await subworldNetwork.getGroup(result.groupId);


      const existingGroupIndex = this.groups.findIndex(g => g.id === group.id);

      if (existingGroupIndex >= 0) {

        this.groups[existingGroupIndex] = group;
      } else {

        this.groups.push(group);
      }

      this._persistGroups();

      return group;
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  }

  /**
 * Remove a member from a group (admin only)
 * @param {string} groupId - The group ID
 * @param {string} memberPublicKey - The member's public key to remove
 * @returns {Promise<boolean>} - Success status
 */
  async removeGroupMember(groupId, memberPublicKey) {
    // Direct approach - access the network service through window global
    const networkService = typeof window !== 'undefined' ? window.subworldNetwork : null;
    
    // If the global isn't available, try the imported module
    if (!networkService && typeof subworldNetwork !== 'undefined') {
      console.log('Using imported network service');
    } else if (!networkService) {
      throw new Error('Network service is not available');
    }
    
    try {
      // Call the API directly with the proxy
      const response = await fetch(`https://proxy.inhouses.xyz/api/bootstrap1/groups/remove_member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          group_id: groupId,
          user_id: memberPublicKey,
          admin_id: this.currentUserKey
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to remove member: ${response.status}`);
      }
      
      // Parse response
      const data = await response.json();
      
      // Immediately refresh the group
      await this.refreshGroup(groupId);
      
      // Dispatch events for UI update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('groupUpdated', {
          detail: {
            groupId,
            action: 'memberRemoved',
            memberPublicKey
          }
        }));
        
        window.dispatchEvent(new CustomEvent('conversationsUpdated'));
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error removing group member:', error);
      throw error;
    }
  }

  /**
 * Remove a member from a group (admin only)
 * @param {string} groupId - Group ID
 * @param {string} memberPublicKey - Public key of member to remove
 * @returns {Promise<{success: boolean}>} Success response
 */
  async removeGroupMember(groupId, memberPublicKey) {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }

      // Prepare the request data
      const removeData = {
        group_id: groupId,
        user_id: memberPublicKey,
        admin_id: this.keyPair.publicKeyDisplay // Current user must be admin
      };

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap1';
      console.log('Removing member from group via proxy:',
        `${this.proxyBaseUrl}${nodeId}/groups/remove_member`);

      // Make the API request
      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/remove_member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(removeData)
      });

      // Handle errors
      if (!response.ok) {
        // Try to get error details
        let errorText = '';
        try {
          const errorData = await response.text();
          errorText = errorData;
        } catch (e) {
          errorText = `Status code: ${response.status}`;
        }

        throw new Error(`Failed to remove group member: ${errorText}`);
      }

      // Parse success response
      const data = await response.json();

      // Also refresh the group info immediately
      await this.getGroup(groupId);

      return { success: true };
    } catch (error) {
      console.error('Error removing group member:', error);
      throw error;
    }
  }

  /**
   * Send a message to a group
   */
  async sendGroupMessage(groupId, content) {
    if (!subworldNetwork) {
      throw new Error('Network service not available');
    }

    try {
      // Send the message
      const result = await subworldNetwork.sendGroupMessage(groupId, content);

      // Create message object
      const message = {
        id: result.messageId,
        sender: this.currentUserKey,
        groupId: groupId,
        content: content,
        timestamp: new Date().toISOString(),
        status: 'sent',
        isGroupMsg: true
      };

      // Add to local messages
      if (!this.groupMessages[groupId]) {
        this.groupMessages[groupId] = [];
      }

      this.groupMessages[groupId].push(message);
      this._persistGroupMessages();

      return message;
    } catch (error) {
      console.error('Error sending group message:', error);
      throw error;
    }
  }

  /**
 * Fetch messages for a group
 * @param {string} groupId - The ID of the group to fetch messages for
 * @returns {Promise<Array>} - Array of messages
 */
  async fetchGroupMessages(groupId) {
    if (!subworldNetwork || !groupId) {
      return this.groupMessages[groupId] || [];
    }

    try {
      console.log(`Fetching messages for group: ${groupId}`);

      // Make the network request to get group messages
      const messages = await subworldNetwork.getGroupMessages(groupId);
      console.log(`Received ${Array.isArray(messages) ? messages.length : 'no'} messages for group ${groupId}`);

      // Ensure we have a storage location for this group's messages
      if (!this.groupMessages) {
        this.groupMessages = {};
      }

      if (!this.groupMessages[groupId]) {
        this.groupMessages[groupId] = [];
      }

      // Create a map of existing message IDs for faster lookup
      const existingMessageIds = new Map();
      this.groupMessages[groupId].forEach(msg => {
        if (msg && msg.id) {
          existingMessageIds.set(msg.id, true);
        }
      });

      // Ensure messages is an array
      const messageArray = Array.isArray(messages) ? messages : [];

      // Process and normalize new messages
      let newMessagesCount = 0;

      const processedMessages = messageArray.map(msg => {
        // Generate a reliable ID if missing
        const messageId = msg.id ||
          `grp-${groupId}-${msg.sender_id || msg.senderID || 'unknown'}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Structure the message consistently
        return {
          id: messageId,
          sender: msg.sender_id || msg.senderID || 'unknown',
          groupId: msg.group_id || msg.groupID || groupId,
          content: msg.encrypted_data || msg.encryptedData || '[No content]',
          timestamp: msg.timestamp || new Date().toISOString(),
          status: 'received',
          isGroupMsg: true
        };
      });

      // Add only new messages to avoid duplicates
      for (const message of processedMessages) {
        if (!existingMessageIds.has(message.id)) {
          this.groupMessages[groupId].push(message);
          newMessagesCount++;

          // Update the group's last message time if this is the newest message
          this._updateGroupLastMessageTime(groupId, message.timestamp);
        }
      }

      // Sort messages by timestamp
      this.groupMessages[groupId].sort((a, b) => {
        return new Date(a.timestamp) - new Date(b.timestamp); // Oldest first for displaying
      });

      // Persist changes
      this._persistGroupMessages();

      console.log(`Added ${newMessagesCount} new messages for group ${groupId}`);

      return this.groupMessages[groupId];
    } catch (error) {
      console.error(`Error fetching group messages for ${groupId}:`, error);
      // Return existing messages instead of throwing
      return this.groupMessages[groupId] || [];
    }
  }

  /**
   * Helper method to update a group's last message time
   * @private
   */
  _updateGroupLastMessageTime(groupId, timestamp) {
    if (!groupId || !timestamp) return;

    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex >= 0) {
      const newTime = new Date(timestamp);
      const currentLastMessageTime = this.groups[groupIndex].lastMessageTime ?
        new Date(this.groups[groupIndex].lastMessageTime) : new Date(0);

      // Only update if this message is newer
      if (newTime > currentLastMessageTime) {
        this.groups[groupIndex].lastMessageTime = timestamp;
        // Persist the updated group data
        this._persistGroups();
      }
    }
  }



  /**
   * Join a group
   */
  async joinGroup(groupId) {
    if (!subworldNetwork) {
      throw new Error('Network service not available');
    }

    try {
      await subworldNetwork.joinGroup(groupId);

      // Refresh groups
      await this.fetchGroups();

      return true;
    } catch (error) {
      console.error('Error joining group:', error);
      throw error;
    }
  }

  async addMemberToGroup(groupId, memberPublicKey) {
    if (!subworldNetwork) {
      throw new Error('Network service not available');
    }

    try {
      const group = await subworldNetwork.getGroup(groupId);


      if (group.members.includes(memberPublicKey)) {
        return true;
      }

      const updatedMembers = [...group.members, memberPublicKey];
      const result = await subworldNetwork.addGroupMember(groupId, memberPublicKey);

      await this.fetchGroupMessages(groupId);

      const updatedGroup = await this.refreshGroup(groupId);

      this._updateConversationList();

      return result.success;
    } catch (error) {
      console.error('Error adding member to group:', error);
      throw error;
    }
  }


  _updateConversationList() {

    const conversationPreviews = this.getConversationPreviews();


    if (typeof window !== 'undefined') {
      const event = new CustomEvent('conversationsUpdated', {
        detail: { conversations: conversationPreviews }
      });
      window.dispatchEvent(event);
    }
  }


  async addGroupMember(groupId, memberPublicKey) {
    if (!subworldNetwork) {
      throw new Error('Network service not available');
    }

    try {
      // First, get the current group data
      let group = await this.refreshGroup(groupId);

      // Check if the member is already in the group
      if (group.members.includes(memberPublicKey)) {
        return true; // Member already exists, nothing to do
      }

      console.log(`Adding member ${memberPublicKey} to group ${groupId}`);

      // Call the network service to add the member
      const result = await subworldNetwork.addGroupMember(groupId, memberPublicKey);

      if (!result.success) {
        throw new Error('Failed to add group member via network service');
      }

      // Immediately refresh the group from the network to get updated members list
      const updatedGroup = await this.refreshGroup(groupId);

      // Update local cache
      const groupIndex = this.groups.findIndex(g => g.id === groupId);
      if (groupIndex >= 0) {
        this.groups[groupIndex] = updatedGroup;
      }

      // Force update conversation previews
      const conversationPreviews = this.getConversationPreviews();

      // Dispatch a custom event for components to refresh
      if (typeof window !== 'undefined') {
        // Specific group update event
        const groupEvent = new CustomEvent('groupUpdated', {
          detail: {
            groupId,
            updatedGroup,
            action: 'memberAdded',
            memberPublicKey
          }
        });
        window.dispatchEvent(groupEvent);

        // General conversations update event
        const convEvent = new CustomEvent('conversationsUpdated', {
          detail: {
            conversations: conversationPreviews
          }
        });
        window.dispatchEvent(convEvent);
      }

      return true;
    } catch (error) {
      console.error('Error adding member to group:', error);
      throw error;
    }
  }




  /**
   * Leave a group
   */
  async leaveGroup(groupId) {
    if (!subworldNetwork) {
      throw new Error('Network service not available');
    }

    try {
      await subworldNetwork.leaveGroup(groupId);

      // Remove from local list
      this.groups = this.groups.filter(g => g.id !== groupId);
      this._persistGroups();

      return true;
    } catch (error) {
      console.error('Error leaving group:', error);
      throw error;
    }
  }

  /**
 * Refresh a group's information
 */
  async refreshGroup(groupId) {
    if (!groupId || !subworldNetwork) {
      return null;
    }

    try {
      // Get a fresh copy of the group from the network
      const freshGroup = await subworldNetwork.getGroup(groupId);

      if (!freshGroup) {
        throw new Error(`Failed to fetch group ${groupId} from network`);
      }

      // Update the local copy
      const groupIndex = this.groups.findIndex(g => g.id === groupId);
      if (groupIndex >= 0) {
        this.groups[groupIndex] = freshGroup;
      } else {
        // Add to groups list if not found
        this.groups.push(freshGroup);
      }

      // Force persistence
      this._persistGroups();

      return freshGroup;
    } catch (error) {
      console.error('Error refreshing group:', error);

      // Try to get the local version as fallback
      const localGroup = this.getGroup(groupId);
      return localGroup;
    }
  }



  getGroupMessages(groupId) {
    if (!groupId) {
      console.warn('No groupId provided to getGroupMessages');
      return [];
    }

    try {
      // Make sure this.groupMessages exists and has the groupId key
      if (!this.groupMessages) {
        this.groupMessages = {};
      }

      // Get messages or return empty array
      const messages = this.groupMessages[groupId] || [];

      // Sort messages by timestamp (oldest first for consistent chat display)
      return [...messages].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      );
    } catch (error) {
      console.error('Error getting group messages:', error);
      return []; // Return empty array instead of throwing
    }
  }


  /**
   * Get all groups
   */
  getAllGroups() {
    return [...this.groups];
  }

  /**
  * Get a group by ID - with improved ID handling
  * This method now handles 'group-' prefixed IDs automatically
  */
  getGroup(groupId) {
    if (!groupId) return null;


    let foundGroup = this.groups.find(g => g.id === groupId);


    if (!foundGroup && groupId.startsWith('group-')) {
      const unprefixedId = groupId.substring(6);
      foundGroup = this.groups.find(g => g.id === unprefixedId);

      if (foundGroup) {
        console.log(`Found group with unprefixed ID: ${unprefixedId}`);
      }
    }


    if (!foundGroup && !groupId.startsWith('group-')) {
      const prefixedId = `group-${groupId}`;
      foundGroup = this.groups.find(g => g.id === prefixedId);

      if (foundGroup) {
        console.log(`Found group with prefixed ID: ${prefixedId}`);
      }
    }

    return foundGroup;
  }

  /**
   * Persist groups to localStorage
   */
  _persistGroups() {
    localStorage.setItem('subworld_groups', JSON.stringify(this.groups));
  }

  /**
   * Persist group messages to localStorage
   */
  _persistGroupMessages() {
    localStorage.setItem('subworld_group_messages', JSON.stringify(this.groupMessages));
  }

  /**
  * Get group previews for the conversation list
  * This method ensures group IDs are consistently formatted
  */
  getGroupPreviews() {
    if (!this.groups || !Array.isArray(this.groups)) {
      console.log("Groups not available or invalid format");
      return [];
    }

    // Filter out any invalid groups
    const validGroups = this.groups.filter(group =>
      group && typeof group === 'object' && group.id);

    // Get previews with consistent IDs
    return validGroups.map(group => {
      // Make sure the ID includes the 'group-' prefix for consistency
      let formattedId = group.id;
      if (!formattedId.startsWith('group-')) {
        formattedId = `group-${formattedId}`;
      }

      // Get the group's messages
      const messages = this.groupMessages[group.id] || [];

      // Find the last message
      const sortedMessages = [...messages].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      const lastMessage = sortedMessages.length > 0 ? sortedMessages[0] : null;

      // Return a clean group preview with consistent ID
      return {
        id: formattedId, // Use the formatted ID with prefix
        originalId: group.id, // Keep the original ID for reference
        name: group.name || 'Unnamed Group',
        description: group.description || '',
        members: Array.isArray(group.members) ? group.members.length : 0,
        isAdmin: Array.isArray(group.admins) ? group.admins.includes(this.currentUserKey) : false,
        lastMessage: lastMessage ? lastMessage.content : '',
        lastMessageTime: lastMessage ? lastMessage.timestamp : group.created,
        avatar: group.avatar || null,
        isGroup: true // Explicitly mark as a group
      };
    }).sort((a, b) => {
      // Sort by last message time, newest first
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(0);
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(0);
      return timeB - timeA;
    });
  }


}

// Create singleton instance
const conversationManager = new ConversationManager()

export default conversationManager
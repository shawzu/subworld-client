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

      this.initialized = true;

      // Auto-fetching disabled
      console.log('Auto-fetching disabled to reduce server load');

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
      // Rate limiting - only fetch messages every 30 seconds at most
      const now = Date.now();
      if (now - this._lastFetchTime < 30000) {
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
      try {
        messages = await subworldNetwork.fetchMessages();
        console.log('Messages received:', messages ? (Array.isArray(messages) ? messages.length : 'non-array') : 'null');
      } catch (fetchError) {
        console.error('Error in network fetchMessages:', fetchError);
        return 0;
      }

      // Validate that messages is an array
      if (!messages) {
        console.warn('No messages returned');
        return 0;
      }

      if (!Array.isArray(messages)) {
        console.warn('Invalid messages format:', typeof messages);
        return 0;
      }

      // Process new messages
      let newMessageCount = 0;
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

      try {
        // Update last fetch time
        this.lastFetch = new Date();

        // Sort conversations
        this._sortConversationsByTime();

        // Persist changes
        this._persistConversations();
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
    return this.conversations.map(conversation => {
      const contact = contactStore.getContact(conversation.contactPublicKey)
      const lastMessage = this._getLastMessage(conversation)

      return {
        id: conversation.id,
        contactPublicKey: conversation.contactPublicKey,
        contactName: contact?.alias || conversation.contactPublicKey,
        lastMessage: lastMessage?.content || '',
        lastMessageTime: lastMessage?.timestamp || conversation.createdAt,
        unreadCount: conversation.unreadCount || 0,
        isOnline: false // Would be determined by network connectivity
      }
    }).sort((a, b) => {
      // Sort by last message time, newest first
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    })
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
}

// Create singleton instance
const conversationManager = new ConversationManager()

export default conversationManager
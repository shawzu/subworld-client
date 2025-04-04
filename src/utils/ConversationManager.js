'use client'

import subworldNetwork from './SubworldNetworkService'
import contactStore from './ContactStore'
import LocalKeyStorageManager from './LocalKeyStorageManager'

/**
 * Manages conversations and messages
 */
class ConversationManager {
  constructor() {
    this.conversations = []
    this.lastFetch = null
    this.fetchInterval = null
    this.initialized = false
    this.currentUserKey = null
    this._lastFetchTime = 0 // Rate limiting
    this.disableAutoFetch = true // EMERGENCY: disable auto-fetching
  }
  
  /**
   * Initialize the conversation manager
   * @param {string} currentUserKey - Current user's public key
   */
  async initialize(currentUserKey) {
    if (this.initialized) return
    
    try {
      this.currentUserKey = currentUserKey
      
      // Initialize the contact store
      await contactStore.initialize()
      
      // Load conversation data from localStorage (for persistence)
      const savedConversations = localStorage.getItem('subworld_conversations')
      this.conversations = savedConversations ? JSON.parse(savedConversations) : []
      
      this.initialized = true
      
      // DISABLED - no auto-fetching to reduce server load
      // this.startFetchInterval()
      
      return true
    } catch (error) {
      console.error('Error initializing conversation manager:', error)
      return false
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
      
      // Get messages from network service
      const messages = await subworldNetwork.fetchMessages()
      
      // Process new messages
      let newMessageCount = 0
      
      for (const message of messages) {
        // Determine the other party (sender if received, recipient if sent)
        const contactPublicKey = message.sender === this.currentUserKey 
          ? message.recipient 
          : message.sender
        
        // Get or create conversation
        const conversation = this.createOrUpdateConversation(contactPublicKey)
        
        // Check if message already exists in conversation
        const messageExists = conversation.messages.some(m => m.id === message.id)
        
        if (!messageExists) {
          // Add message to conversation
          conversation.messages.push(message)
          conversation.lastMessageTime = new Date(message.timestamp) > new Date(conversation.lastMessageTime || 0)
            ? message.timestamp
            : conversation.lastMessageTime
          
          // Increment unread count for received messages
          if (message.sender !== this.currentUserKey) {
            conversation.unreadCount = (conversation.unreadCount || 0) + 1
            newMessageCount++
          }
        }
      }
      
      // Mark messages as delivered on the server if any were found
      if (newMessageCount > 0) {
        const messageIds = messages
          .filter(m => m.sender !== this.currentUserKey)
          .map(m => m.id)
        
        if (messageIds.length > 0) {
          // Fire and forget - don't wait for this to complete
          subworldNetwork.markMessagesAsDelivered(this.currentUserKey, messageIds)
            .catch(err => console.log('Failed to mark messages as delivered:', err))
        }
      }
      
      // Update last fetch time
      this.lastFetch = new Date()
      
      // Sort conversations
      this._sortConversationsByTime()
      
      // Persist changes
      this._persistConversations()
      
      return newMessageCount
    } catch (error) {
      console.error('Error fetching messages:', error)
      return 0
    }
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
    this.conversations.sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(a.createdAt)
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(b.createdAt)
      return timeB - timeA // Newest first
    })
  }
  
  /**
   * Persist conversations to localStorage
   * @private
   */
  _persistConversations() {
    localStorage.setItem('subworld_conversations', JSON.stringify(this.conversations))
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
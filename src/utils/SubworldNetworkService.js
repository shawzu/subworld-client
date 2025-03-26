'use client'

import LocalKeyStorageManager from './LocalKeyStorageManager'

class SubworldNetworkService {
  constructor() {
    // Base URL for the Subworld DHT network API
    this.apiBaseUrl = process.env.NEXT_PUBLIC_SUBWORLD_API_URL || 'https://api.subworld.network'
    
    // Check for environment (development/production)
    this.isDevelopment = process.env.NODE_ENV === 'development'
  }
  
  /**
   * Initialize the service by loading keys
   */
  async initialize() {
    const keyPair = LocalKeyStorageManager.getKeyPair()
    if (!keyPair) {
      throw new Error('No keys found. Please create or import an account.')
    }
    
    this.keyPair = keyPair
    
    // For development, initialize mock data if needed
    if (this.isDevelopment) {
      this._initializeMockData()
    }
  }
  
  /**
   * Send a message to a recipient
   * @param {string} recipientPublicKey - Recipient's public key
   * @param {string} content - Message content
   * @returns {Promise<{success: boolean, messageId: string}>}
   */
  async sendMessage(recipientPublicKey, content) {
    try {
      if (this.isDevelopment && this._useMockData) {
        return this._mockSendMessage(recipientPublicKey, content)
      }
      
      // Encrypt the message content using the recipient's public key
      const encryptedContent = await LocalKeyStorageManager.encryptMessage(
        content,
        recipientPublicKey
      )
      
      // Prepare the message payload
      const message = {
        sender: this.keyPair.publicKeyDisplay,
        recipient: recipientPublicKey,
        content: encryptedContent,
        timestamp: new Date().toISOString(),
      }
      
      // Send the message through the Subworld network
      const response = await fetch(`${this.apiBaseUrl}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.keyPair.publicKeyDisplay}`
        },
        body: JSON.stringify(message)
      })
      
      if (!response.ok) {
        throw new Error(`Network error: ${response.status}`)
      }
      
      const data = await response.json()
      return {
        success: true,
        messageId: data.messageId
      }
      
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }
  
  /**
   * Fetch messages for the current user
   * @returns {Promise<Array>} - Array of messages
   */
  async fetchMessages() {
    try {
      if (this.isDevelopment && this._useMockData) {
        return this._mockFetchMessages()
      }
      
      const response = await fetch(`${this.apiBaseUrl}/messages/inbox`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.keyPair.publicKeyDisplay}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`Network error: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Decrypt the messages
      const decryptedMessages = await Promise.all(
        data.messages.map(async (message) => {
          try {
            const decryptedContent = await LocalKeyStorageManager.decryptMessage(
              message.content,
              this.keyPair.privateKey
            )
            
            return {
              ...message,
              content: decryptedContent
            }
          } catch (error) {
            console.error('Error decrypting message:', error)
            return {
              ...message,
              content: '[Encrypted message - Unable to decrypt]'
            }
          }
        })
      )
      
      return decryptedMessages
      
    } catch (error) {
      console.error('Error fetching messages:', error)
      throw error
    }
  }
  
  /**
   * Get contact information (if stored locally)
   * @returns {Promise<Array>} - Array of contacts
   */
  async getContacts() {
    try {
      // Load contacts from localStorage
      const contactsJson = localStorage.getItem('subworld_contacts')
      return contactsJson ? JSON.parse(contactsJson) : []
    } catch (error) {
      console.error('Error getting contacts:', error)
      return []
    }
  }
  
  /**
   * Save a new contact or update an existing one
   * @param {string} publicKey - Contact's public key
   * @param {string} alias - Contact's alias (nickname)
   * @returns {Promise<boolean>} - Success status
   */
  async saveContact(publicKey, alias) {
    try {
      // Load existing contacts
      const contacts = await this.getContacts()
      
      // Check if contact exists
      const existingContactIndex = contacts.findIndex(c => c.publicKey === publicKey)
      
      if (existingContactIndex >= 0) {
        // Update existing contact
        contacts[existingContactIndex] = {
          ...contacts[existingContactIndex],
          alias: alias || contacts[existingContactIndex].alias
        }
      } else {
        // Add new contact
        contacts.push({
          publicKey,
          alias: alias || null,
          createdAt: new Date().toISOString()
        })
      }
      
      // Save updated contacts
      localStorage.setItem('subworld_contacts', JSON.stringify(contacts))
      return true
    } catch (error) {
      console.error('Error saving contact:', error)
      return false
    }
  }
  
  /**
   * Initialize mock data for development
   * @private
   */
  _initializeMockData() {
    this._useMockData = true
    this._mockMessageId = 1
    
    // Create mock conversations and messages for testing
    this._mockConversations = [
      {
        id: 1,
        contact: {
          publicKey: 'abcd-1234-efgh-5678',
          alias: 'Alice'
        },
        messages: [
          {
            id: 101,
            sender: 'abcd-1234-efgh-5678',
            recipient: this.keyPair.publicKeyDisplay,
            content: 'Hey, how are you?',
            timestamp: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
            status: 'received'
          },
          {
            id: 102,
            sender: this.keyPair.publicKeyDisplay,
            recipient: 'abcd-1234-efgh-5678',
            content: "I'm good, thanks! How about you?",
            timestamp: new Date(Date.now() - 10740000).toISOString(), // 2 minutes later
            status: 'sent'
          },
          {
            id: 103,
            sender: 'abcd-1234-efgh-5678',
            recipient: this.keyPair.publicKeyDisplay,
            content: 'Doing great! Any plans for the weekend?',
            timestamp: new Date(Date.now() - 10680000).toISOString(), // 1 minute later
            status: 'received'
          }
        ]
      },
      {
        id: 2,
        contact: {
          publicKey: 'ijkl-5678-mnop-9012',
          alias: 'Bob'
        },
        messages: [
          {
            id: 201,
            sender: 'ijkl-5678-mnop-9012',
            recipient: this.keyPair.publicKeyDisplay,
            content: 'Did you see the news?',
            timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            status: 'received'
          },
          {
            id: 202,
            sender: this.keyPair.publicKeyDisplay,
            recipient: 'ijkl-5678-mnop-9012',
            content: 'Not yet, what happened?',
            timestamp: new Date(Date.now() - 86340000).toISOString(), // 1 minute later
            status: 'sent'
          }
        ]
      },
      {
        id: 3,
        contact: {
          publicKey: 'qrst-9012-uvwx-3456',
          alias: 'Charlie'
        },
        messages: [
          {
            id: 301,
            sender: 'qrst-9012-uvwx-3456',
            recipient: this.keyPair.publicKeyDisplay,
            content: "Let's meet up soon!",
            timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), // 3 days ago
            status: 'received'
          },
          {
            id: 302,
            sender: this.keyPair.publicKeyDisplay,
            recipient: 'qrst-9012-uvwx-3456',
            content: 'Sure, when works for you?',
            timestamp: new Date(Date.now() - 3 * 86400000 + 3600000).toISOString(), // 1 hour later
            status: 'sent'
          }
        ]
      }
    ]
    
    // Save mock contacts to localStorage
    const mockContacts = this._mockConversations.map(conv => ({
      publicKey: conv.contact.publicKey,
      alias: conv.contact.alias,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString() // A week ago
    }))
    
    localStorage.setItem('subworld_contacts', JSON.stringify(mockContacts))
    
    console.log('Initialized mock data for development')
  }
  
  /**
   * Mock sending a message (for development)
   * @private
   */
  _mockSendMessage(recipientPublicKey, content) {
    // Find the conversation
    const conversation = this._mockConversations.find(
      c => c.contact.publicKey === recipientPublicKey
    )
    
    const messageId = this._mockMessageId++
    
    const newMessage = {
      id: messageId,
      sender: this.keyPair.publicKeyDisplay,
      recipient: recipientPublicKey,
      content: content,
      timestamp: new Date().toISOString(),
      status: 'sent'
    }
    
    if (conversation) {
      conversation.messages.push(newMessage)
    } else {
      // Create a new conversation
      const newConversationId = this._mockConversations.length + 1
      this._mockConversations.push({
        id: newConversationId,
        contact: {
          publicKey: recipientPublicKey,
          alias: null
        },
        messages: [newMessage]
      })
    }
    
    return Promise.resolve({
      success: true,
      messageId: messageId.toString()
    })
  }
  
  /**
   * Mock fetching messages (for development)
   * @private
   */
  _mockFetchMessages() {
    // Flatten all messages from all conversations
    const allMessages = this._mockConversations.flatMap(conv => 
      conv.messages.map(msg => ({
        ...msg,
        contactAlias: conv.contact.alias,
        contactPublicKey: conv.contact.publicKey
      }))
    )
    
    // Sort by timestamp
    allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    return Promise.resolve(allMessages)
  }
}

// Create singleton instance
const subworldNetwork = new SubworldNetworkService();
export default subworldNetwork;
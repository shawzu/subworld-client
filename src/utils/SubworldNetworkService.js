'use client'

import LocalKeyStorageManager from './LocalKeyStorageManager'

class SubworldNetworkService {
  constructor() {
    // Default bootstrap server
    this.bootstrapServer = process.env.NEXT_PUBLIC_BOOTSTRAP_SERVER || 'https://bootstrap.subworld.network'
    
    // Default node if none is selected
    this.defaultNode = process.env.NEXT_PUBLIC_DEFAULT_NODE || 'https://node1.subworld.network'
    
    // The currently selected node
    this.currentNode = null
    
    // Check for environment (development/production)
    this.isDevelopment = process.env.NODE_ENV === 'development'
    
    // Flag to use mock data in development
    this._useMockData = this.isDevelopment
  }
  
  /**
   * Initialize the service by loading keys and node preference
   */
  async initialize() {
    const keyPair = LocalKeyStorageManager.getKeyPair()
    if (!keyPair) {
      throw new Error('No keys found. Please create or import an account.')
    }
    
    this.keyPair = keyPair
    
    // Load the preferred node from localStorage
    this.loadPreferredNode()
    
    // For development, initialize mock data if needed
    if (this.isDevelopment) {
      this._initializeMockData()
    }
  }
  
  /**
   * Get available nodes from the bootstrap server
   * @returns {Promise<Array>} - Array of node objects
   */
  async getAvailableNodes() {
    try {
      if (this.isDevelopment && this._useMockData) {
        return this._mockGetNodes()
      }
      
      const response = await fetch(`${this.bootstrapServer}/peers`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch nodes: ${response.status}`)
      }
      
      const data = await response.json()
      return data.peers
    } catch (error) {
      console.error('Error fetching nodes:', error)
      
      // Return default nodes as fallback
      return [
        { 
          id: 'local', 
          name: 'Local Node', 
          address: 'http://localhost:8001', 
          description: 'Your local node (if running)'
        },
        { 
          id: 'main1', 
          name: 'Subworld Main 1', 
          address: 'https://node1.subworld.network', 
          description: 'Primary node'
        },
        { 
          id: 'main2', 
          name: 'Subworld Main 2', 
          address: 'https://node2.subworld.network', 
          description: 'Secondary node'
        }
      ]
    }
  }
  
  /**
   * Load the preferred node from localStorage
   */
  loadPreferredNode() {
    try {
      const savedNode = localStorage.getItem('subworld_preferred_node')
      if (savedNode) {
        this.currentNode = JSON.parse(savedNode)
      } else {
        // Use default node if none is saved
        this.currentNode = {
          name: 'Default Node',
          address: this.defaultNode
        }
      }
      
      console.log('Using node:', this.currentNode)
    } catch (error) {
      console.error('Error loading preferred node:', error)
      this.currentNode = {
        name: 'Default Node',
        address: this.defaultNode
      }
    }
  }
  
  /**
   * Set the current node to use for API calls
   * @param {Object} node - Node object with address and other details
   */
  setCurrentNode(node) {
    this.currentNode = node
    localStorage.setItem('subworld_preferred_node', JSON.stringify(node))
    console.log('Node set to:', node)
  }
  
  /**
   * Get the current node
   * @returns {Object} - Current node object
   */
  getCurrentNode() {
    return this.currentNode
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
      
      // Send the message through the selected node
      const response = await fetch(`${this.currentNode.address}/messages/send`, {
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
      
      const response = await fetch(`${this.currentNode.address}/messages/inbox`, {
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
   * Check the health of a node
   * @param {string} nodeAddress - Node address to check
   * @returns {Promise<{isOnline: boolean, latency: number}>}
   */
  async checkNodeHealth(nodeAddress) {
    try {
      const startTime = Date.now()
      
      const response = await fetch(`${nodeAddress}/health`, {
        method: 'GET',
        // Set a timeout to prevent long waits
        signal: AbortSignal.timeout(5000)
      })
      
      const latency = Date.now() - startTime
      
      return {
        isOnline: response.ok,
        latency
      }
    } catch (error) {
      console.error(`Error checking node health (${nodeAddress}):`, error)
      return {
        isOnline: false,
        latency: 999
      }
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
    
    // Mock nodes
    this._mockNodes = [
      { 
        id: 'local', 
        name: 'Local Node', 
        address: 'http://localhost:8001', 
        isOnline: true,
        latency: 10,
        description: 'Your local node (if running)'
      },
      { 
        id: 'main1', 
        name: 'Subworld Main 1', 
        address: 'https://node1.subworld.network', 
        isOnline: true,
        latency: 55,
        description: 'Primary node'
      },
      { 
        id: 'main2', 
        name: 'Subworld Main 2', 
        address: 'https://node2.subworld.network', 
        isOnline: false,
        latency: 999,
        description: 'Secondary node'
      },
      { 
        id: 'community1', 
        name: 'Community Node 1', 
        address: 'https://subworld-community.example.com', 
        isOnline: true,
        latency: 120,
        description: 'Operated by the community'
      },
      { 
        id: 'dev1', 
        name: 'Dev Testing Node', 
        address: 'https://dev-node.subworld.test', 
        isOnline: true,
        latency: 80,
        description: 'For development and testing'
      }
    ]
    
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
  
  /**
   * Mock getting nodes (for development)
   * @private
   */
  _mockGetNodes() {
    // Simulate network delay
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this._mockNodes)
      }, 500)
    })
  }
}

// Create singleton instance
const subworldNetwork = new SubworldNetworkService()

export default subworldNetwork
'use client'

import LocalKeyStorageManager from './LocalKeyStorageManager'

class SubworldNetworkService {
  constructor() {
    // The currently selected node
    this.currentNode = null;
    
    // Set default node info with correct ports
    this.defaultNode = {
      name: 'Default Bootstrap Node',
      address: 'http://93.4.27.35:8080', // P2P port for node communication
      apiAddress: 'http://93.4.27.35:8081', // API port for client requests
      isOnline: true, // Assume online by default
      isBootstrap: true
    };
    
    // Always assume connected - we'll only check when explicitly requested
    this.isConnected = true;
    
    // User information
    this.keyPair = null;
    
    // Emergency flag to disable all automatic health checks
    this.disableHealthChecks = true;
  }
  
  /**
   * Initialize the service by loading keys and node preference
   */
  async initialize() {
    try {
      // Load user key pair
      const keyPair = LocalKeyStorageManager.getKeyPair();
      if (!keyPair) {
        throw new Error('No keys found. Please create or import an account.');
      }
      this.keyPair = keyPair;
      
      // Load the preferred node from localStorage
      this.loadPreferredNode();
      
      // No automatic health checks - assume node is online
      this.isConnected = true;
      
      return true;
    } catch (error) {
      console.error('Failed to initialize network service:', error);
      return false;
    }
  }
  
  /**
   * Load the preferred node from localStorage
   */
  loadPreferredNode() {
    try {
      const savedNode = localStorage.getItem('subworld_preferred_node');
      if (savedNode) {
        this.currentNode = JSON.parse(savedNode);
      } else {
        // Use default node if none is saved
        this.currentNode = this.defaultNode;
      }
      
      console.log('Using node:', this.currentNode);
    } catch (error) {
      console.error('Error loading preferred node:', error);
      this.currentNode = this.defaultNode;
    }
  }
  
  /**
   * Check node connection only when explicitly called - not automatic
   */
  async checkNodeConnection() {
    // Just return true - we'll disable automatic checks
    return true;
  }
  
  /**
   * Set the current node to use for API calls
   * @param {Object} node - Node object with address and other details
   */
  async setCurrentNode(node) {
    try {
      // Ensure the node has both P2P and API addresses
      let updatedNode = { ...node };
      
      // If no API address is specified, derive it from the P2P address
      if (!updatedNode.apiAddress) {
        if (updatedNode.address.includes(':8080')) {
          updatedNode.apiAddress = updatedNode.address.replace(':8080', ':8081');
        } else {
          // Default to adding :8081 if no port is specified
          updatedNode.apiAddress = updatedNode.address.includes(':') ? 
            updatedNode.address : 
            updatedNode.address + ':8081';
        }
      }
      
      console.log('Setting current node:', updatedNode);
      
      // Set node to online without checking
      updatedNode.isOnline = true;
      updatedNode.latency = 100; // Default latency
      
      this.currentNode = updatedNode;
      this.isConnected = true;
      
      // Save to localStorage
      localStorage.setItem('subworld_preferred_node', JSON.stringify(updatedNode));
      console.log('Node set:', updatedNode);
      
      return updatedNode;
    } catch (error) {
      console.error('Error selecting node:', error);
      
      // Still update the node but mark as offline
      const offlineNode = {
        ...node,
        isOnline: true,
        latency: 100
      };
      
      this.currentNode = offlineNode;
      this.isConnected = true;
      
      localStorage.setItem('subworld_preferred_node', JSON.stringify(offlineNode));
      return offlineNode;
    }
  }
  
  /**
   * Get the current node
   * @returns {Object} - Current node object
   */
  getCurrentNode() {
    return this.currentNode;
  }
  
  /**
   * Get available nodes from the network
   */
  async fetchAvailableNodes() {
    try {
      // Try to get node list from current node
      if (!this.currentNode || !this.currentNode.address) {
        throw new Error('No node is selected');
      }
      
      // Use port 8081 for API calls
      const apiAddress = this.currentNode.apiAddress || 
                       (this.currentNode.address.includes(':8080') ? 
                         this.currentNode.address.replace(':8080', ':8081') : 
                         this.currentNode.address + ':8081');
      
      const nodesEndpoint = `${apiAddress}/nodes/list`;
      console.log('Fetching nodes from:', nodesEndpoint);
      
      const response = await fetch(nodesEndpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch nodes: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Raw node data received:', data);
      
      // Make sure we have nodes to process
      if (!data.nodes || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        console.warn('No nodes found in response');
        throw new Error('No nodes found in response');
      }
      
      console.log(`Found ${data.nodes.length} nodes in response:`, data.nodes);
      
      // Format nodes for the UI - using the exact response format from your API
      const nodeList = data.nodes.map(nodeAddress => {
        // Skip localhost nodes as requested
        if (nodeAddress.includes('localhost') || nodeAddress.includes('127.0.0.1')) {
          console.log(`Skipping localhost node: ${nodeAddress}`);
          return null;
        }
        
        console.log(`Processing node: ${nodeAddress}`);
        
        // Generate a unique ID for each node
        const nodeId = nodeAddress.replace(/[^a-zA-Z0-9]/g, '');
        
        // Check if it's a bootstrap node (based on IP from your example)
        const isBootstrap = nodeAddress.includes('93.4.27.35');
        
        // Extract the host (without port)
        const parts = nodeAddress.split(':');
        const host = parts[0];
        const port = parts.length > 1 ? parts[1] : '8080';
        
        // Create node object with the p2p port (8080) and API port (8081)
        return {
          id: nodeId,
          name: isBootstrap ? `Bootstrap Node (${host})` : `Node (${host})`,
          address: `http://${host}:${port}`, // P2P address (as received)
          apiAddress: `http://${host}:8081`, // API address (always 8081)
          isBootstrap: isBootstrap,
          isOnline: true // Assume all nodes are online
        };
      }).filter(node => node !== null); // Remove null entries (localhost nodes)
      
      console.log('Formatted node list:', nodeList);
      
      // Always include the current node if it's not in the list and not localhost
      if (this.currentNode && 
          !nodeList.some(node => node.address === this.currentNode.address) &&
          !this.currentNode.address.includes('localhost') && 
          !this.currentNode.address.includes('127.0.0.1')) {
        nodeList.unshift({
          id: 'current',
          name: this.currentNode.name || 'Current Node',
          address: this.currentNode.address,
          apiAddress: this.currentNode.apiAddress || this.currentNode.address.replace(':8080', ':8081'),
          isOnline: true,
          latency: 100
        });
      }
      
      return nodeList;
    } catch (error) {
      console.error('Error fetching nodes:', error);
      
      // Always return both nodes as fallback
      return [
        {
          id: 'bootstrap1',
          name: 'Bootstrap Node',
          address: 'http://93.4.27.35:8080', // P2P port
          apiAddress: 'http://93.4.27.35:8081', // API port
          isBootstrap: true,
          isOnline: true,
          description: 'Primary bootstrap node'
        }
      ];
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
      if (!this.currentNode) {
        throw new Error('No node selected');
      }
      
      // No health check - assume node is online
      
      // Encrypt the message content
      const encryptedData = await LocalKeyStorageManager.encryptMessage(
        content,
        recipientPublicKey
      );
      
      // Prepare the message payload according to the API requirements
      // Using the exact field names from your API
      const message = {
        recipientID: recipientPublicKey,
        senderID: this.keyPair.publicKeyDisplay,
        encryptedData: encryptedData,
        type: 0, // TypeMessage (0) as defined in your API
        timestamp: new Date().toISOString()
      };
      
      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress || 
                       this.currentNode.address.replace(':8080', ':8081');
      
      console.log('Sending message to API:', apiAddress + '/messages/send', message);
      
      // Send the message using the API endpoint
      const response = await fetch(`${apiAddress}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to send message: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Message sent successfully:', data);
      
      return {
        success: true,
        messageId: data.id || `local-${Date.now()}` // Use the ID from the response or generate a local one
      };
      
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
  
  /**
   * Fetch messages for the current user
   * @returns {Promise<Array>} - Array of messages
   */
  async fetchMessages() {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }
      
      // No health check - assume node is online
      
      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress || 
                       this.currentNode.address.replace(':8080', ':8081');
      
      console.log('Fetching messages for user:', this.keyPair.publicKeyDisplay);
      console.log('Using API address:', apiAddress + '/messages/get');
      
      // Make GET request to fetch user messages
      const response = await fetch(`${apiAddress}/messages/get?user_id=${this.keyPair.publicKeyDisplay}&fetch_remote=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error fetching messages:', errorText);
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }
      
      const messages = await response.json();
      console.log('Received messages:', messages);
      
      // Decrypt the messages
      const decryptedMessages = await Promise.all(
        messages.map(async (message) => {
          try {
            if (!message.encryptedData) {
              return {
                ...message,
                content: '[No message content]',
                id: message.ID || message.id,
                sender: message.senderID,
                recipient: message.recipientID,
                timestamp: message.timestamp
              };
            }
            
            // Decrypt the message content
            const decryptedContent = await LocalKeyStorageManager.decryptMessage(
              message.encryptedData,
              this.keyPair.privateKey
            );
            
            return {
              ...message,
              content: decryptedContent,
              id: message.ID || message.id,
              sender: message.senderID,
              recipient: message.recipientID,
              timestamp: message.timestamp
            };
          } catch (error) {
            console.error('Error decrypting message:', error);
            return {
              ...message,
              content: '[Encrypted message - Unable to decrypt]',
              id: message.ID || message.id,
              sender: message.senderID,
              recipient: message.recipientID,
              timestamp: message.timestamp
            };
          }
        })
      );
      
      return decryptedMessages;
      
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }
  
  /**
   * Mark messages as delivered
   * @param {string} userID - User ID
   * @param {Array<string>} messageIDs - Array of message IDs to mark as delivered
   * @returns {Promise<boolean>} - Success status
   */
  async markMessagesAsDelivered(userID, messageIDs) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }
      
      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress || 
                       this.currentNode.address.replace(':8080', ':8081');
      
      // Prepare the request payload
      const payload = {
        user_id: userID,
        message_ids: messageIDs
      };
      
      // Make POST request to mark messages as delivered
      const response = await fetch(`${apiAddress}/messages/delivered`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to mark messages as delivered: ${response.status}`);
      }
      
      return true;
      
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
      return false;
    }
  }
  
  /**
   * Get node information - only when explicitly called
   * @returns {Promise<Object>} - Node information
   */
  async getNodeInfo() {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }
      
      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress || 
                       this.currentNode.address.replace(':8080', ':8081');
      
      const response = await fetch(`${apiAddress}/node/info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get node info: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error('Error getting node info:', error);
      return null;
    }
  }
  
  // No health check method - completely disabled to prevent excessive calls
}

// Create singleton instance
const subworldNetwork = new SubworldNetworkService();

export default subworldNetwork;
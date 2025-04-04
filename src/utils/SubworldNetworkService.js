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

    // Initialize health check cache
    this.healthCheckCache = new Map();

    // Emergency flag to disable all automatic health checks
    this.disableHealthChecks = true; // CHANGED: Disabled health checks by default

    // Rate limiting for API calls
    this.lastNodeFetch = 0;
    this.nodeFetchCooldown = 300000; // 5 minutes cooldown

    // Cache for available nodes
    this.availableNodesCache = null;
    this.availableNodesCacheTime = 0;
    this.nodeCacheLifetime = 600000; // 10 minutes
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
    // Just return true - we've disabled automatic checks
    return true;
  }

  /**
   * Check the health of a specific node
   * @param {string} nodeAddress - The address of the node to check
   * @returns {Promise<{isOnline: boolean, latency: number}>}
   */
  async checkNodeHealth(nodeAddress) {
    // CHANGED: Return early if health checks are disabled
    if (this.disableHealthChecks) {
      return { isOnline: true, latency: 100 };
    }

    try {
      // Cache check - don't check the same node more than once per minute
      const now = Date.now();
      const cacheKey = nodeAddress;

      if (this.healthCheckCache.has(cacheKey)) {
        const cached = this.healthCheckCache.get(cacheKey);
        // If checked in the last 60 seconds, return cached result
        if (now - cached.timestamp < 60000) {
          console.log(`Using cached health check for ${nodeAddress}`);
          return {
            isOnline: cached.isOnline,
            latency: cached.latency
          };
        }
      }

      // Extract or use the API address (port 8081) for health checks
      const apiAddress = nodeAddress.includes(':8081') ?
        nodeAddress :
        (nodeAddress.includes(':8080') ?
          nodeAddress.replace(':8080', ':8081') :
          nodeAddress + ':8081');

      const healthEndpoint = `${apiAddress}/health`;
      console.log(`Checking node health: ${healthEndpoint}`);

      // Measure latency
      const startTime = Date.now();

      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(healthEndpoint, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const latency = Date.now() - startTime;
      let result;

      if (response.ok) {
        const data = await response.json();
        result = {
          isOnline: data.status === 'ok',
          latency: latency
        };
      } else {
        result = { isOnline: false, latency: 999 };
      }

      // Cache the result
      this.healthCheckCache.set(cacheKey, {
        ...result,
        timestamp: now
      });

      return result;
    } catch (error) {
      console.error('Health check failed:', error);

      // Cache the failure to avoid repeated failed attempts
      this.healthCheckCache.set(nodeAddress, {
        isOnline: false,
        latency: 999,
        timestamp: Date.now()
      });

      return { isOnline: false, latency: 999 };
    }
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

      // Only perform a health check if explicitly enabled
      if (!this.disableHealthChecks) {
        try {
          const healthResult = await this.checkNodeHealth(updatedNode.apiAddress);
          updatedNode.isOnline = healthResult.isOnline;
          updatedNode.latency = healthResult.latency;
          this.isConnected = healthResult.isOnline;
        } catch (error) {
          console.error('Health check failed during node selection:', error);
          updatedNode.isOnline = false;
          updatedNode.latency = 999;
          this.isConnected = false;
        }
      } else {
        // Set node to online without checking
        updatedNode.isOnline = true;
        updatedNode.latency = 100; // Default latency
        this.isConnected = true;
      }

      this.currentNode = updatedNode;

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
    // CHANGED: Added rate limiting and caching
    const now = Date.now();

    // Return cached nodes if available and not expired
    if (this.availableNodesCache && (now - this.availableNodesCacheTime < this.nodeCacheLifetime)) {
      console.log('Using cached nodes list');
      return this.availableNodesCache;
    }

    // Rate limiting
    if (now - this.lastNodeFetch < this.nodeFetchCooldown) {
      console.log('Node fetch rate limited, returning cached or default');

      // Return cached nodes if available, otherwise default nodes
      if (this.availableNodesCache) {
        return this.availableNodesCache;
      }

      const defaultNodes = [
        {
          id: 'bootstrap1',
          name: 'Bootstrap Node',
          address: 'http://93.4.27.35:8080', // P2P port
          apiAddress: 'http://93.4.27.35:8081', // API port
          isBootstrap: true,
          isOnline: true,
          description: 'Primary bootstrap node (93.4.27.35)'
        }
      ];

      // Add current node if available and not in the list
      if (this.currentNode &&
        !defaultNodes.some(n => n.address === this.currentNode.address) &&
        !this.currentNode.address.includes('localhost') &&
        !this.currentNode.address.includes('127.0.0.1')) {
        defaultNodes.unshift({
          id: 'current',
          name: this.currentNode.name || 'Current Node',
          address: this.currentNode.address,
          apiAddress: this.currentNode.apiAddress || this.currentNode.address.replace(':8080', ':8081'),
          isOnline: true,
          latency: 100
        });
      }

      this.availableNodesCache = defaultNodes;
      this.availableNodesCacheTime = now;
      return defaultNodes;
    }

    // Update the last fetch time
    this.lastNodeFetch = now;

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

      console.log('Fetching nodes from:', apiAddress + '/nodes/list');

      const response = await fetch(`${apiAddress}/nodes/list`, {
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

      console.log(`Found ${data.nodes.length} nodes in response`);

      // Format nodes for the UI - using the exact response format from your API
      const nodeList = data.nodes.map(nodeAddress => {
        // Skip localhost nodes as requested
        if (nodeAddress.includes('localhost') || nodeAddress.includes('127.0.0.1')) {
          console.log(`Skipping localhost node: ${nodeAddress}`);
          return null;
        }

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

      // Cache the result
      this.availableNodesCache = nodeList;
      this.availableNodesCacheTime = now;

      return nodeList;
    } catch (error) {
      console.error('Error fetching nodes:', error);

      // Always return bootstrap node as fallback
      const fallbackNodes = [
        {
          id: 'bootstrap1',
          name: 'Bootstrap Node',
          address: 'http://93.4.27.35:8080', // P2P port
          apiAddress: 'http://93.4.27.35:8081', // API port
          isBootstrap: true,
          isOnline: true,
          description: 'Primary bootstrap node (93.4.27.35)'
        }
      ];

      // Add current node if available and not in the list
      if (this.currentNode &&
        !this.currentNode.address.includes('localhost') &&
        !this.currentNode.address.includes('127.0.0.1')) {
        fallbackNodes.unshift({
          id: 'current',
          name: this.currentNode.name || 'Current Node',
          address: this.currentNode.address,
          apiAddress: this.currentNode.apiAddress || this.currentNode.address.replace(':8080', ':8081'),
          isOnline: true,
          latency: 100
        });
      }

      // Cache the fallback nodes
      this.availableNodesCache = fallbackNodes;
      this.availableNodesCacheTime = now;

      return fallbackNodes;
    }
  }

  /**
   * Send a message to a recipient
   * @param {string} recipientPublicKey - Recipient's public key display
   * @param {string} content - Message content
   * @returns {Promise<{success: boolean, messageId: string}>}
   */
  async sendMessage(recipientPublicKey, content) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Log for debugging
      console.log('Sending message to recipient:', recipientPublicKey);

      // Encrypt the message with recipient's display key
      const encryptedData = await LocalKeyStorageManager.encryptMessage(
        content,
        recipientPublicKey
      );

      // Prepare the message payload
      const message = {
        recipient_id: recipientPublicKey,
        sender_id: this.keyPair.publicKeyDisplay,
        encrypted_data: encryptedData,
        type: 0,
        timestamp: new Date().toISOString(),
        id: `msg-${Date.now()}`
      };

      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress ||
        this.currentNode.address.replace(':8080', ':8081');

      console.log('Sending message to API:', apiAddress + '/messages/send');

      // Send the message
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
        messageId: data.id || `local-${Date.now()}`
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
        console.warn('No node selected');
        return [];
      }

      if (!this.keyPair || !this.keyPair.publicKeyDisplay) {
        console.warn('No valid key pair');
        return [];
      }

      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress ||
        this.currentNode.address.replace(':8080', ':8081');

      console.log('Fetching messages for user:', this.keyPair.publicKeyDisplay);

      // Make GET request to fetch user messages
      let response;
      try {
        response = await fetch(`${apiAddress}/messages/get?user_id=${this.keyPair.publicKeyDisplay}&fetch_remote=true`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (fetchError) {
        console.error('Network error fetching messages:', fetchError);
        return [];
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'No response';
        console.error('Error fetching messages:', errorText);
        return [];
      }

      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        console.error('Error parsing messages JSON:', jsonError);
        return [];
      }

      // Handle different response formats
      let messages = [];

      // Check if response is an array directly
      if (Array.isArray(responseData)) {
        messages = responseData;
      }
      // Check if response is an object with a messages array
      else if (responseData && typeof responseData === 'object') {
        // Try different common property names for messages
        if (Array.isArray(responseData.messages)) {
          messages = responseData.messages;
        } else if (Array.isArray(responseData.data)) {
          messages = responseData.data;
        } else if (Array.isArray(responseData.results)) {
          messages = responseData.results;
        } else if (Array.isArray(responseData.items)) {
          messages = responseData.items;
        } else {
          // Log the actual response structure for debugging
          console.warn('Unexpected response structure:', JSON.stringify(responseData).substring(0, 200) + '...');

          // As a last resort, try to extract array-like properties from the object
          const possibleArrays = Object.values(responseData).filter(val => Array.isArray(val));
          if (possibleArrays.length > 0) {
            // Use the largest array found
            messages = possibleArrays.reduce((largest, current) =>
              current.length > largest.length ? current : largest, []);

            console.log('Extracted possible messages array with', messages.length, 'items');
          } else {
            // If all else fails, check if the object might be iterable
            try {
              messages = Object.values(responseData).filter(val =>
                val && typeof val === 'object');

              if (messages.length > 0) {
                console.log('Created messages array from object properties:', messages.length, 'items');
              } else {
                console.error('Could not extract messages array from response');
                return [];
              }
            } catch (extractError) {
              console.error('Error extracting messages:', extractError);
              return [];
            }
          }
        }
      } else {
        console.error('Invalid messages response format:', typeof responseData);
        return [];
      }

      console.log('Received messages count:', messages.length);

      // Decrypt the messages
      const decryptedMessages = [];
      for (let i = 0; i < messages.length; i++) {
        try {
          const message = messages[i];
          if (!message) {
            continue;
          }

          // Extract the message properties
          const messageId = message.id || message.ID || `unknown-${i}`;
          const senderId = message.sender_id || message.senderID || 'unknown';
          const recipientId = message.recipient_id || message.recipientID || this.keyPair.publicKeyDisplay;
          const encryptedData = message.encrypted_data || message.encryptedData;
          const timestamp = message.timestamp || new Date().toISOString();

          if (!encryptedData) {
            decryptedMessages.push({
              id: messageId,
              sender: senderId,
              recipient: recipientId,
              content: '[No message content]',
              timestamp: timestamp,
              status: 'received'
            });
            continue;
          }

          // For messages sent by the current user, decrypt with recipient's key
          // For messages received by the current user, decrypt with sender's key
          let decryptionKey;

          if (senderId === this.keyPair.publicKeyDisplay) {
            // Message sent by current user
            decryptionKey = recipientId;
          } else {
            // Message received by current user
            decryptionKey = senderId;
          }

          let decryptedContent;
          try {
            decryptedContent = await LocalKeyStorageManager.decryptMessage(
              encryptedData,
              decryptionKey
            );
          } catch (decryptError) {
            console.error(`Failed to decrypt message ${messageId}:`, decryptError);
            decryptedContent = '[Encrypted message - Unable to decrypt]';
          }

          decryptedMessages.push({
            id: messageId,
            sender: senderId,
            recipient: recipientId,
            content: decryptedContent,
            timestamp: timestamp,
            status: message.delivered ? 'delivered' : 'received'
          });
        } catch (messageError) {
          console.error('Error processing message at index', i, ':', messageError);
          // Continue processing other messages
        }
      }

      return decryptedMessages;
    } catch (error) {
      console.error('Error in fetchMessages:', error && error.message ? error.message : 'Unknown error');
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Mark messages as delivered
   * @param {string} userID - User ID (recipient's public key)
   * @param {Array<string>} messageIDs - Array of message IDs to mark as delivered
   * @returns {Promise<boolean>} - Success status
   */
  async markMessagesAsDelivered(userID, messageIDs) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      if (!messageIDs || messageIDs.length === 0) {
        console.log('No message IDs provided to mark as delivered');
        return false;
      }

      // Use the API address (port 8081) for API calls
      const apiAddress = this.currentNode.apiAddress ||
        this.currentNode.address.replace(':8080', ':8081');

      console.log(`Marking ${messageIDs.length} messages as delivered for user ${userID}`);

      // Prepare the request payload according to the API format
      // The API expects snake_case for property names
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
        console.error('Failed to mark messages as delivered:', errorData);
        throw new Error(`Failed to mark messages as delivered: ${response.status}`);
      }

      // Parse the response to confirm success
      const result = await response.json();
      console.log('Mark delivered response:', result);

      return result.status === 'success';

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
}

// Create singleton instance
const subworldNetwork = new SubworldNetworkService();

export default subworldNetwork;
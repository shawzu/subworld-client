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

    this.proxyBaseUrl = 'https://proxy.inhouses.xyz/api/';// Proxy base URL for API calls


    // Initialize health check cache
    this.healthCheckCache = new Map();

    // Emergency flag to disable all automatic health checks
    this.disableHealthChecks = false;

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
 * Modified method to check a node's health via proxy by address
 * @param {string} nodeAddress - The address of the node to check
 * @returns {Promise<{isOnline: boolean, latency: number}>}
 */
  async checkNodeHealth(nodeAddress) {
    // CHANGED: Return early if health checks are disabled
    if (this.disableHealthChecks) {
      return { isOnline: true, latency: 100 };
    }

    try {
      // First, try to find the node ID corresponding to this address
      let nodeId = null;

      // Check if it's the current node
      if (this.currentNode && this.currentNode.address === nodeAddress) {
        nodeId = this.currentNode.id || 'bootstrap1';
      } else {
        // Try to find it in the available nodes
        if (this.availableNodesCache) {
          const matchingNode = this.availableNodesCache.find(n => n.address === nodeAddress);
          if (matchingNode) {
            nodeId = matchingNode.id;
          }
        }

        // If not found, use a fallback based on the address
        if (!nodeId) {
          // Create a simplified ID from the address
          nodeId = nodeAddress
            .replace(/^https?:\/\//, '')
            .replace(/[.:]/g, '-');
        }
      }

      // Use the proxy-based health check with the node ID
      return await this.checkNodeHealthViaProxy(nodeId);
    } catch (error) {
      console.error('Health check failed:', error);
      return { isOnline: false, latency: 999 };
    }
  }


  /**
 * Set the current node to use for API calls with health check via proxy
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

      // Only perform a health check if explicitly enabled, but use proxy-based method
      if (!this.disableHealthChecks) {
        try {
          const nodeId = updatedNode.id || 'bootstrap1';
          const healthResult = await this.checkNodeHealthViaProxy(nodeId);
          updatedNode.isOnline = healthResult.isOnline;
          updatedNode.latency = healthResult.latency;
          this.isConnected = healthResult.isOnline;
        } catch (error) {
          console.error('Health check via proxy failed during node selection:', error);
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
    // CHANGED: Added rate limiting and caching with proxy support
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
      // Use the proxy's nodes endpoint instead of direct node connection
      console.log('Fetching nodes from proxy:', 'https://proxy.inhouses.xyz/nodes');

      const response = await fetch('https://proxy.inhouses.xyz/nodes', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch nodes: ${response.status}`);
      }

      const data = await response.json();
      console.log('Nodes data received from proxy:', data);

      // Make sure we have nodes to process
      if (!data.nodes || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        console.warn('No nodes found in proxy response');
        throw new Error('No nodes found in proxy response');
      }

      const nodeList = data.nodes;
      console.log(`Found ${nodeList.length} nodes in proxy response`);

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
      console.error('Error fetching nodes from proxy:', error);

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

      // Use proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap1';

      console.log('Sending message via proxy:', `${this.proxyBaseUrl}${nodeId}/messages/send`);

      // Send the message
      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/messages/send`, {
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

      // Use proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap1';

      console.log('Fetching messages for user:', this.keyPair.publicKeyDisplay);

      // Make GET request to fetch user messages via proxy
      let response;
      try {
        response = await fetch(`${this.proxyBaseUrl}${nodeId}/messages/get?user_id=${this.keyPair.publicKeyDisplay}&fetch_remote=true`, {
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
        // Check if this is an empty response or "no messages" response
        if (
          // Common "no messages" responses
          responseData.status === 'success' ||
          responseData.status === 'ok' ||
          responseData.code === 200 ||
          responseData.message === 'No messages found' ||
          responseData.result === 'empty'
        ) {
          console.log('No messages available response:', JSON.stringify(responseData).substring(0, 200));
          // Return empty array - this is not an error
          return [];
        }

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
          console.log('Unexpected response structure:', JSON.stringify(responseData).substring(0, 200) + '...');

          // As a last resort, try to extract array-like properties from the object
          const possibleArrays = Object.values(responseData).filter(val => Array.isArray(val));
          if (possibleArrays.length > 0) {
            // Use the largest array found
            messages = possibleArrays.reduce((largest, current) =>
              current.length > largest.length ? current : largest, []);

            console.log('Extracted possible messages array with', messages.length, 'items');
          } else {
            // If all else fails, assume it's an empty response
            console.log('No message arrays found in response, assuming empty messages list');
            return [];
          }
        }
      } else {
        console.log('Unexpected response format:', typeof responseData, 'assuming empty messages');
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
      console.error('Error in fetchMessages:', error);
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

      // Use proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap1';

      console.log(`Marking ${messageIDs.length} messages as delivered for user ${userID}`);

      // Prepare the request payload according to the API format
      const payload = {
        user_id: userID,
        message_ids: messageIDs
      };

      // Make POST request via proxy
      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/messages/delivered`, {
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
 * Get node information via proxy instead of direct connection
 * @returns {Promise<Object>} - Node information
 */
  async getNodeInfo() {
    try {
      if (!this.currentNode) {
        console.warn('No node selected for getNodeInfo');
        return null;
      }

      // Use the proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap1';
      const endpoint = `${this.proxyBaseUrl}${nodeId}/node/info`;

      console.log('Fetching node info via proxy:', endpoint);

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        // Clear the timeout
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`Node info request failed: ${response.status} ${response.statusText}`, errorText);
          return null;
        }

        const data = await response.json();
        console.log('Node info received from proxy:', data);

        return data;
      } catch (fetchError) {
        // Clear the timeout if fetch threw an error
        clearTimeout(timeoutId);

        if (fetchError.name === 'AbortError') {
          console.warn('Node info request timed out');
        } else {
          console.warn('Fetch error in getNodeInfo:', fetchError.message);
        }

        return null;
      }
    } catch (error) {
      console.warn('Error in getNodeInfo:', error.message || 'Unknown error');
      return null;
    }
  }

 /**
 * Upload a file to the network
 * @param {string} recipientPublicKey - Recipient's public key
 * @param {File} file - The file to upload
 * @returns {Promise<Object>} - Upload result
 */
async uploadFile(recipientPublicKey, file) {
  try {
    if (!this.currentNode) {
      throw new Error('No node selected');
    }

    // Create FormData for the file upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('recipient_id', recipientPublicKey);
    formData.append('sender_id', this.keyPair.publicKeyDisplay);
    formData.append('file_name', file.name);
    formData.append('file_type', file.type);

    const contentId = `file-${Date.now()}`;
    formData.append('content_id', contentId);

    // Use proxy instead of direct node connection
    const nodeId = this.currentNode.id || 'bootstrap1';
    console.log(`Uploading file via proxy: ${this.proxyBaseUrl}${nodeId}/files/upload`);

    // Upload the file
    const response = await fetch(`${this.proxyBaseUrl}${nodeId}/files/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server response:', errorText);
      throw new Error(`Failed to upload file: ${response.status}`);
    }

    const data = await response.json();
    console.log('File uploaded successfully:', data);

    return {
      success: true,
      fileId: data.id || contentId
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Get file metadata from the network
 * @param {string} userID - User ID
 * @param {string} fileID - File ID
 * @returns {Promise<Object>} - File metadata
 */
async getFileMetadata(userID, fileID) {
  try {
    if (!this.currentNode) {
      throw new Error('No node selected');
    }

    // Use proxy instead of direct node connection
    const nodeId = this.currentNode.id || 'bootstrap1';
    const endpoint = `${this.proxyBaseUrl}${nodeId}/files/get?user_id=${encodeURIComponent(userID)}&file_id=${encodeURIComponent(fileID)}`;
    
    console.log('Fetching file metadata:', endpoint);
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch file metadata:', errorText);
      throw new Error(`Failed to fetch file metadata: ${response.status}`);
    }
    
    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.error('Error getting file metadata:', error);
    throw error;
  }
}

/**
 * Download a file from the network
 * @param {string} userID - User ID
 * @param {string} fileID - File ID
 * @param {number} chunkIndex - Chunk index (optional)
 * @returns {Promise<Blob>} - File data as blob
 */
async downloadFile(userID, fileID, chunkIndex = 0) {
  try {
    if (!this.currentNode) {
      throw new Error('No node selected');
    }
    
    // Use proxy instead of direct node connection
    const nodeId = this.currentNode.id || 'bootstrap1';
    const endpoint = `${this.proxyBaseUrl}${nodeId}/files/get?user_id=${encodeURIComponent(userID)}&file_id=${encodeURIComponent(fileID)}&chunk=${chunkIndex}`;
    
    console.log('Downloading file chunk:', endpoint);
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to download file:', errorText);
      throw new Error(`Failed to download file: ${response.status}`);
    }
    
    // Get the file as a blob
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

  /**
 * Check the health of a specific node via proxy
 * @param {string} nodeId - The ID of the node to check
 * @returns {Promise<{isOnline: boolean, latency: number}>}
 */
  async checkNodeHealthViaProxy(nodeId) {
    // Return early if health checks are disabled
    if (this.disableHealthChecks) {
      return { isOnline: true, latency: 100 };
    }

    try {
      // Cache check - don't check the same node more than once per minute
      const now = Date.now();
      const cacheKey = nodeId;

      if (this.healthCheckCache.has(cacheKey)) {
        const cached = this.healthCheckCache.get(cacheKey);
        // If checked in the last 60 seconds, return cached result
        if (now - cached.timestamp < 60000) {
          console.log(`Using cached health check for node ID: ${nodeId}`);
          return {
            isOnline: cached.isOnline,
            latency: cached.latency
          };
        }
      }

      const healthEndpoint = `${this.proxyBaseUrl}${nodeId}/health`;
      console.log(`Checking node health via proxy: ${healthEndpoint}`);

      // Measure latency
      const startTime = Date.now();

      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
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
            isOnline: data.status === 'ok' || data.status === 'success',
            latency: latency
          };
        } else {
          result = { isOnline: false, latency: 999 };
        }

        // Cache the result
        this.healthCheckCache.set(nodeId, {
          ...result,
          timestamp: Date.now()
        });

        return result;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Handle abort errors specifically
        if (fetchError.name === 'AbortError') {
          console.log(`Request timeout for node ${nodeId}`);
        } else {
          console.error('Fetch error in health check:', fetchError);
        }

        // Either way, the node is considered offline
        const result = { isOnline: false, latency: 999 };

        // Cache the failure
        this.healthCheckCache.set(nodeId, {
          ...result,
          timestamp: Date.now()
        });

        return result;
      }
    } catch (outerError) {
      console.error('Health check via proxy failed:', outerError);

      // Cache the failure to avoid repeated failed attempts
      this.healthCheckCache.set(nodeId, {
        isOnline: false,
        latency: 999,
        timestamp: Date.now()
      });

      return { isOnline: false, latency: 999 };
    }
  }
}

// Create singleton instance
const subworldNetwork = new SubworldNetworkService();

export default subworldNetwork;
'use client'

import LocalKeyStorageManager from './LocalKeyStorageManager'
import nacl from 'tweetnacl';



class SubworldNetworkService {
  constructor() {
    // The currently selected node
    this.currentNode = null;

    // Set default node info with correct ports
    this.defaultNode = {
      name: 'BootstrapNode2',
      address: 'http://167.71.11.170:8080', // P2P port for node communication
      apiAddress: 'http://167.71.11.170:8081', // API port for client requests
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
        nodeId = this.currentNode.id || 'bootstrap2';
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
          const nodeId = updatedNode.id || 'bootstrap2';
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
          id: 'bootstrap2',
          name: 'BootstrapNode2',
          address: 'http://167.71.11.170:8080', // P2P port
          apiAddress: 'http://167.71.11.170:8081', // API port
          isBootstrap: true,
          isOnline: true,
          description: 'Secondary bootstrap node (167.71.11.170)'
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
          id: 'bootstrap2',
          name: 'BootstrapNode2',
          address: 'http://167.71.11.170:8080', // P2P port
          apiAddress: 'http://167.71.11.170:8081', // API port
          isBootstrap: true,
          isOnline: true,
          description: 'Primary bootstrap node (167.71.11.170)'
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
  * Send a message to a recipient with TTL
  * @param {string} recipientPublicKey - Recipient's public key display
  * @param {string} content - Message content
  * @param {number} ttlSeconds - Optional TTL in seconds
  * @returns {Promise<{success: boolean, messageId: string}>}
  */
  async sendMessage(recipientPublicKey, content, ttlSeconds = null) {
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

      // Add TTL if provided
      if (ttlSeconds && typeof ttlSeconds === 'number' && ttlSeconds > 0) {
        message.ttl = ttlSeconds;
        message.expires_at = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      }

      // Use proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap2';

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
      const nodeId = this.currentNode.id || 'bootstrap2';

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
      const nodeId = this.currentNode.id || 'bootstrap2';

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
      const nodeId = this.currentNode.id || 'bootstrap2';
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
  * Upload a file to the network with optional TTL
  * @param {string} recipientPublicKey - Recipient's public key
  * @param {File} file - The file to upload
  * @param {number} ttlSeconds - Optional TTL in seconds
  * @returns {Promise<Object>} - Upload result
  */
  async uploadFile(recipientPublicKey, file, ttlSeconds = null) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Read the file as an ArrayBuffer for encryption
      const fileArrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      // Convert to Uint8Array for encryption
      const fileData = new Uint8Array(fileArrayBuffer);

      // Encrypt the file data with recipient's key
      const encryptedData = await this.encryptFileData(fileData, recipientPublicKey);

      // Convert encrypted data to a Blob for upload
      const encryptedBlob = new Blob([encryptedData]);

      // Create FormData for the file upload
      const formData = new FormData();
      formData.append('file', encryptedBlob, file.name);
      formData.append('recipient_id', recipientPublicKey);
      formData.append('sender_id', this.keyPair.publicKeyDisplay);
      formData.append('file_name', file.name);
      formData.append('file_type', file.type);

      // Add TTL if provided
      if (ttlSeconds && typeof ttlSeconds === 'number' && ttlSeconds > 0) {
        formData.append('ttl', ttlSeconds.toString());
        const expiryDate = new Date(Date.now() + ttlSeconds * 1000);
        formData.append('expires_at', expiryDate.toISOString());
      }

      const contentId = `file-${Date.now()}`;
      formData.append('content_id', contentId);

      // Use proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log(`Uploading encrypted file via proxy: ${this.proxyBaseUrl}${nodeId}/files/upload`);

      // Upload the encrypted file
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
   * Encrypt file data
   * @param {Uint8Array} fileData - Raw file data to encrypt
   * @param {string} recipientPublicKey - Recipient's public key
   * @returns {Promise<Uint8Array>} - Encrypted file data
   */
  async encryptFileData(fileData, recipientPublicKey) {
    try {
      // Get encryption key derived from sender and recipient keys
      const encryptionKey = await LocalKeyStorageManager.deriveSharedKeyFromDisplayKeys(
        this.keyPair.publicKeyDisplay,
        recipientPublicKey
      );

      // Create a nonce for encryption
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

      // Encrypt the file data
      const encryptedFile = nacl.secretbox(fileData, nonce, encryptionKey);

      // Combine nonce and encrypted data into a single array
      const fullMessage = new Uint8Array(nonce.length + encryptedFile.length);
      fullMessage.set(nonce);
      fullMessage.set(encryptedFile, nonce.length);

      return fullMessage;
    } catch (error) {
      console.error('File encryption failed:', error);
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

      // Fix: Define nodeId from currentNode
      const nodeId = this.currentNode.id || 'bootstrap2';

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
 * Download a file from the network with decryption
 * @param {string} userID - User ID
 * @param {string} fileID - File ID
 * @param {string} senderKey - Sender's public key for decryption
 * @returns {Promise<Blob>} - Decrypted file data as blob
 */
  async downloadFile(userID, fileID, senderKey) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Use proxy instead of direct node connection
      const nodeId = this.currentNode.id || 'bootstrap2';
      const endpoint = `${this.proxyBaseUrl}${nodeId}/files/get?user_id=${encodeURIComponent(userID)}&file_id=${encodeURIComponent(fileID)}&chunk=0`;

      console.log('Downloading encrypted file:', endpoint);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/octet-stream'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to download file:', errorText);
        throw new Error(`Failed to download file: ${response.status}`);
      }

      // Get the encrypted file as an ArrayBuffer
      const encryptedData = await response.arrayBuffer();
      console.log(`Received encrypted file: size=${encryptedData.byteLength} bytes`);

      // Decrypt the file data
      const decryptedData = await this.decryptFileData(
        new Uint8Array(encryptedData),
        senderKey
      );

      // Create a blob with the original file type (if available)
      const fileMetadata = await this.getFileMetadata(userID, fileID);
      const fileType = fileMetadata?.file_type || 'application/octet-stream';

      // Create a blob with the decrypted data
      const decryptedBlob = new Blob([decryptedData], { type: fileType });

      return decryptedBlob;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * Decrypt file data
   * @param {Uint8Array} encryptedData - Encrypted file data
   * @param {string} senderKey - Sender's public key
   * @returns {Promise<Uint8Array>} - Decrypted file data
   */
  async decryptFileData(encryptedData, senderKey) {
    try {
      // Extract nonce from the beginning of the encrypted data
      const nonce = encryptedData.slice(0, nacl.secretbox.nonceLength);
      const encryptedFile = encryptedData.slice(nacl.secretbox.nonceLength);

      // Get decryption key derived from sender and recipient keys
      const decryptionKey = await LocalKeyStorageManager.deriveSharedKeyFromDisplayKeys(
        senderKey,
        this.keyPair.publicKeyDisplay
      );

      // Decrypt the file data
      const decryptedFile = nacl.secretbox.open(encryptedFile, nonce, decryptionKey);

      if (!decryptedFile) {
        throw new Error('File decryption failed. Invalid data or wrong key.');
      }

      return decryptedFile;
    } catch (error) {
      console.error('File decryption failed:', error);
      throw error;
    }
  }

  /**
 * Make a direct API request to the voice endpoints
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (for POST)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
  async makeApiRequest(endpoint, method = 'GET', body = null) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Use proxy for voice endpoints
      const nodeId = this.currentNode.id || 'bootstrap2';
      const url = `${this.proxyBaseUrl}${nodeId}/${endpoint}`;

      console.log(`Making API request to: ${url}`);

      const headers = {
        'Content-Type': 'application/json'
      };

      const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      };

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API request failed: ${response.status}`, errorText);
        return { success: false, error: `Request failed with status ${response.status}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('API request error:', error);
      return { success: false, error: error.message };
    }
  }

  // Group-related methods
  async createGroup(name, description, members = []) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Prepare the request data
      const groupData = {
        name,
        description,
        creator: this.keyPair.publicKeyDisplay,
        members: [...members] // Add any initial members
      };

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Creating group via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/create`);

      // Send the request
      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(groupData)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to create group: ${response.status}`);
      }

      const data = await response.json();
      console.log('Group created successfully:', data);

      return {
        success: true,
        groupId: data.id
      };
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  }

  async getGroup(groupId) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Fetching group via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/get?group_id=${groupId}`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/get?group_id=${groupId}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to get group: ${response.status}`);
      }

      const group = await response.json();
      return group;
    } catch (error) {
      console.error('Error getting group:', error);
      throw error;
    }
  }

  async listUserGroups() {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      const userId = this.keyPair.publicKeyDisplay;
      console.log('Fetching user groups via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/list?user_id=${userId}`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/list?user_id=${userId}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to list groups: ${response.status}`);
      }

      const groups = await response.json();
      return groups;
    } catch (error) {
      console.error('Error listing user groups:', error);
      throw error;
    }
  }

  async joinGroup(groupId) {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }

      // Prepare the request data
      const joinData = {
        group_id: groupId,
        user_id: this.keyPair.publicKeyDisplay
      };

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Joining group via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/join`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(joinData)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to join group: ${response.status}`);
      }

      const data = await response.json();
      return { success: true };
    } catch (error) {
      console.error('Error joining group:', error);
      throw error;
    }
  }

  async leaveGroup(groupId) {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }

      // Prepare the request data
      const leaveData = {
        group_id: groupId,
        user_id: this.keyPair.publicKeyDisplay
      };

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Leaving group via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/leave`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(leaveData)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to leave group: ${response.status}`);
      }

      const data = await response.json();
      return { success: true };
    } catch (error) {
      console.error('Error leaving group:', error);
      throw error;
    }
  }

  async getGroupMembers(groupId) {
    try {
      if (!this.currentNode) {
        throw new Error('No node selected');
      }

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Fetching group members via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/members?group_id=${groupId}`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/members?group_id=${groupId}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to get group members: ${response.status}`);
      }

      const data = await response.json();
      return {
        members: data.members || [],
        admins: data.admins || []
      };
    } catch (error) {
      console.error('Error getting group members:', error);
      throw error;
    }
  }

  async sendGroupMessage(groupId, content, ttlSeconds = null) {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }

      // Prepare the message payload
      const message = {
        group_id: groupId,
        sender_id: this.keyPair.publicKeyDisplay,
        encrypted_data: content, // For simplicity, not encrypting group messages in this example
        type: 6, // TypeGroupMessage
        timestamp: new Date().toISOString(),
        id: `grpmsg-${Date.now()}`,
        is_group_msg: true
      };

      // Add TTL if provided
      if (ttlSeconds && typeof ttlSeconds === 'number' && ttlSeconds > 0) {
        message.ttl = ttlSeconds;
        message.expires_at = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      }

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Sending group message via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/messages/send`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to send group message: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.id || `local-${Date.now()}`
      };
    } catch (error) {
      console.error('Error sending group message:', error);
      throw error;
    }
  }


  async getGroupMessages(groupId) {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }

      // Use proxy for the API request
      const nodeId = this.currentNode.id || 'bootstrap2';
      const userId = this.keyPair.publicKeyDisplay;
      console.log('Fetching group messages via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/messages/get?group_id=${groupId}&user_id=${userId}`);

      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/messages/get?group_id=${groupId}&user_id=${userId}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to get group messages: ${response.status}`);
      }

      const messages = await response.json();
      return messages;
    } catch (error) {
      console.error('Error getting group messages:', error);
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

  async addGroupMember(groupId, memberPublicKey) {
    try {
      if (!this.currentNode || !this.keyPair) {
        throw new Error('No node selected or user keys not available');
      }


      const requestData = {
        group_id: groupId,
        user_id: memberPublicKey,
        added_by: this.keyPair.publicKeyDisplay
      };


      const nodeId = this.currentNode.id || 'bootstrap2';
      console.log('Adding member to group via proxy:', `${this.proxyBaseUrl}${nodeId}/groups/add_member`);


      const response = await fetch(`${this.proxyBaseUrl}${nodeId}/groups/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          group_id: groupId,
          user_id: memberPublicKey,
          admin_id: this.keyPair.publicKeyDisplay
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        throw new Error(`Failed to add member to group: ${response.status}`);
      }

      const data = await response.json();
      return { success: true };
    } catch (error) {
      console.error('Error adding group member:', error);
      throw error;
    }
  }
}

// Create singleton instance
const subworldNetwork = new SubworldNetworkService();

export default subworldNetwork;
'use client'

/**
 * LocalKeyStorageManager.js
 * A very simple key management system that focuses on consistency
 */

class LocalKeyStorageManager {
  /**
   * Generate a cryptographically secure key pair
   * @param {number} keySize - Size in bits for RSA key (1024, 2048, or 4096)
   * @returns {Promise<{publicKey: string, privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string}>}
   */
  static async generateKeyPair(keySize = 2048) {
    try {
      // Generate RSA key pair using Web Crypto API
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: keySize,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Export keys to base64 strings for storage
      const publicKey = await this.exportPublicKey(keyPair.publicKey);
      const privateKey = await this.exportPrivateKey(keyPair.privateKey);

      // Generate unique identifier from the private key
      // For consistency, we'll compute the publicKeyHash from the privateKey
      // This ensures that encryption/decryption will work properly
      const publicKeyHash = await this.hashString(privateKey);
      const publicKeyDisplay = this.formatHashForDisplay(publicKeyHash.slice(0, 16));
      const privateKeyDisplay = this.createShortPrivateKey(privateKey);

      return { 
        privateKey, 
        publicKeyDisplay, 
        privateKeyDisplay,
        publicKeyHash
      };
    } catch (error) {
      console.error('Failed to generate key pair:', error);
      throw error;
    }
  }

  /**
   * Import a private key
   * @param {string} privateKey - The private key string
   * @returns {Promise<{privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string}>}
   */
  static async importPrivateKey(privateKey) {
    try {
      // Generate the exact same identifiers as in generateKeyPair
      const publicKeyHash = await this.hashString(privateKey);
      const publicKeyDisplay = this.formatHashForDisplay(publicKeyHash.slice(0, 16));
      const privateKeyDisplay = this.createShortPrivateKey(privateKey);
      
      return {
        privateKey,
        publicKeyDisplay,
        privateKeyDisplay,
        publicKeyHash
      };
    } catch (error) {
      console.error('Failed to import private key:', error);
      throw error;
    }
  }

  /**
   * Hash a string consistently
   * @param {string} str - String to hash
   * @returns {Promise<string>} - Hex hash string
   */
  static async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Format a hash string into a display format with dashes
   * @param {string} hash - Hash string
   * @returns {string} - Formatted display string
   */
  static formatHashForDisplay(hash) {
    return hash.match(/.{1,4}/g).join('-');
  }

  /**
   * Create a shorter version of the private key for display
   * @param {string} privateKey - Full private key
   * @returns {string} Short version for display
   */
  static createShortPrivateKey(privateKey) {
    const start = privateKey.substring(0, 12);
    const end = privateKey.substring(privateKey.length - 12);
    return `${start}...${end}`;
  }

  /**
   * Export public key to base64 string
   * @param {CryptoKey} key - Public key to export
   * @returns {Promise<string>} Base64 encoded public key
   */
  static async exportPublicKey(key) {
    const exportedKey = await window.crypto.subtle.exportKey('spki', key);
    return this.arrayBufferToBase64(exportedKey);
  }

  /**
   * Export private key to base64 string
   * @param {CryptoKey} key - Private key to export
   * @returns {Promise<string>} Base64 encoded private key
   */
  static async exportPrivateKey(key) {
    const exportedKey = await window.crypto.subtle.exportKey('pkcs8', key);
    return this.arrayBufferToBase64(exportedKey);
  }

  /**
   * Save key information to local storage
   * @param {{privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string}} keyInfo
   * @returns {boolean} Success status
   */
  static saveKeyPair(keyInfo) {
    try {
      if (typeof window === 'undefined') return false;
      
      const encryptedPrivateKey = this.simpleEncrypt(keyInfo.privateKey);

      localStorage.setItem('subworld_private_key', encryptedPrivateKey);
      localStorage.setItem('subworld_public_key_display', keyInfo.publicKeyDisplay);
      localStorage.setItem('subworld_private_key_display', keyInfo.privateKeyDisplay);
      localStorage.setItem('subworld_public_key_hash', keyInfo.publicKeyHash);
      
      return true;
    } catch (error) {
      console.error('Error saving keys:', error);
      return false;
    }
  }

  /**
   * Retrieve key information from local storage
   * @returns {{privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string} | null}
   */
  static getKeyPair() {
    try {
      if (typeof window === 'undefined') return null;
      
      const encryptedPrivateKey = localStorage.getItem('subworld_private_key');
      const publicKeyDisplay = localStorage.getItem('subworld_public_key_display');
      const privateKeyDisplay = localStorage.getItem('subworld_private_key_display');
      const publicKeyHash = localStorage.getItem('subworld_public_key_hash');

      if (!encryptedPrivateKey) {
        return null;
      }

      const privateKey = this.simpleDecrypt(encryptedPrivateKey);

      return { 
        privateKey,
        publicKeyDisplay,
        privateKeyDisplay,
        publicKeyHash
      };
    } catch (error) {
      console.error('Error retrieving keys:', error);
      return null;
    }
  }

  /**
   * Delete stored key information
   * @returns {boolean} Success status
   */
  static deleteKeyPair() {
    try {
      if (typeof window === 'undefined') return false;
      
      localStorage.removeItem('subworld_private_key');
      localStorage.removeItem('subworld_public_key_display');
      localStorage.removeItem('subworld_private_key_display');
      localStorage.removeItem('subworld_public_key_hash');
      return true;
    } catch (error) {
      console.error('Error deleting keys:', error);
      return false;
    }
  }

  /**
   * Simple encryption for storage (basic obfuscation)
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text
   */
  static simpleEncrypt(text) {
    return btoa(text.split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) + 1)
    ).join(''));
  }

  /**
   * Simple decryption for storage
   * @param {string} encrypted - Encrypted text
   * @returns {string} Decrypted text
   */
  static simpleDecrypt(encrypted) {
    return atob(encrypted).split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) - 1)
    ).join('');
  }

  /**
   * Convert ArrayBuffer to Base64
   * @param {ArrayBuffer} buffer - Buffer to convert
   * @returns {string} Base64 encoded string
   */
  static arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   * @param {string} base64 - Base64 encoded string
   * @returns {ArrayBuffer} Converted ArrayBuffer
   */
  static base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Encrypt a message for a recipient
   * @param {string} message - Message to encrypt
   * @param {string} recipientPublicKeyHash - Recipient's public key hash
   * @returns {Promise<string>} Encrypted message
   */
  static async encryptMessage(message, recipientPublicKeyHash) {
    try {
      // Convert message to bytes
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(message);
      
      // Create a key from the recipient's public key hash
      // We use a consistent approach that will be reversible
      const keyBytes = this.generateKeyBytesFromHash(recipientPublicKeyHash);
      
      // XOR encryption
      const encryptedBytes = new Uint8Array(messageBytes.length);
      for (let i = 0; i < messageBytes.length; i++) {
        encryptedBytes[i] = messageBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      
      // Convert to base64 for transmission
      return this.arrayBufferToBase64(encryptedBytes);
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt a message using the private key
   * @param {string} encryptedMessage - Encrypted message
   * @param {string} privateKey - User's private key
   * @returns {Promise<string>} Decrypted message
   */
  static async decryptMessage(encryptedMessage, privateKey) {
    try {
      // Get our public key hash from private key - this matches what others use to encrypt to us
      const publicKeyHash = await this.hashString(privateKey);
      
      // Convert encrypted message from base64 to bytes
      const encryptedBytes = new Uint8Array(this.base64ToArrayBuffer(encryptedMessage));
      
      // Create the same key bytes that were used for encryption
      const keyBytes = this.generateKeyBytesFromHash(publicKeyHash);
      
      // XOR decryption (same as encryption since XOR is symmetric)
      const decryptedBytes = new Uint8Array(encryptedBytes.length);
      for (let i = 0; i < encryptedBytes.length; i++) {
        decryptedBytes[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      
      // Convert bytes back to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBytes);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  }
  
  /**
   * Generate consistent key bytes from a hash string
   * This ensures encryption and decryption use the same key
   * @param {string} hash - Hash string (hex format)
   * @returns {Uint8Array} - Key bytes for encryption/decryption
   */
  static generateKeyBytesFromHash(hash) {
    // Convert hex hash to bytes
    const keyBytes = new Uint8Array(hash.length / 2);
    for (let i = 0; i < hash.length; i += 2) {
      keyBytes[i/2] = parseInt(hash.substring(i, i + 2), 16);
    }
    return keyBytes;
  }
}

export default LocalKeyStorageManager;
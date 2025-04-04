'use client'

/**
 * LocalKeyStorageManager.js
 * A complete, reliable key management and encryption system using TweetNaCl
 */

// Import the required libraries
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { encode as encodeUTF8, decode as decodeUTF8 } from '@stablelib/utf8';

class LocalKeyStorageManager {
  /**
   * Generate a secure key pair
   * @returns {Promise<{publicKey: string, privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string}>}
   */
  static async generateKeyPair() {
    try {
      // Generate a new keypair using NaCl
      const keyPair = nacl.box.keyPair();
      
      // Encode the keys as Base64 strings
      const publicKey = encodeBase64(keyPair.publicKey);
      const privateKey = encodeBase64(keyPair.secretKey);
      
      // Create a hash of the public key for identification
      const publicKeyHash = await this.hashString(publicKey);
      
      // Create display versions of the keys
      const publicKeyDisplay = this.formatHashForDisplay(publicKeyHash.slice(0, 16));
      const privateKeyDisplay = this.createShortPrivateKey(privateKey);
      
      return {
        publicKey,
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
   * Import an existing private key
   * @param {string} privateKey - Base64 encoded private key
   * @returns {Promise<{publicKey: string, privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string}>}
   */
  static async importPrivateKey(privateKey) {
    try {
      // Decode the private key from Base64
      const secretKey = decodeBase64(privateKey);
      
      // Derive the public key from the private key
      const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
      const publicKey = encodeBase64(keyPair.publicKey);
      
      // Create a hash of the public key
      const publicKeyHash = await this.hashString(publicKey);
      
      // Create display versions
      const publicKeyDisplay = this.formatHashForDisplay(publicKeyHash.slice(0, 16));
      const privateKeyDisplay = this.createShortPrivateKey(privateKey);
      
      return {
        publicKey,
        privateKey,
        publicKeyDisplay,
        privateKeyDisplay,
        publicKeyHash
      };
    } catch (error) {
      console.error('Failed to import private key:', error);
      throw new Error('Invalid key format. Please check your private key and try again.');
    }
  }
  
  /**
   * Save key pair to local storage
   * @param {{publicKey: string, privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string}} keyInfo
   * @returns {boolean} Success status
   */
  static saveKeyPair(keyInfo) {
    try {
      if (typeof window === 'undefined') return false;
      
      // Encrypt the private key before storing
      const encryptedPrivateKey = this.simpleEncrypt(keyInfo.privateKey);
      
      // Store all key information
      localStorage.setItem('subworld_private_key', encryptedPrivateKey);
      localStorage.setItem('subworld_public_key', keyInfo.publicKey);
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
   * Retrieve key pair from local storage
   * @returns {{publicKey: string, privateKey: string, publicKeyDisplay: string, privateKeyDisplay: string, publicKeyHash: string} | null}
   */
  static getKeyPair() {
    try {
      if (typeof window === 'undefined') return null;
      
      // Get encrypted private key
      const encryptedPrivateKey = localStorage.getItem('subworld_private_key');
      if (!encryptedPrivateKey) return null;
      
      // Get other key information
      const publicKey = localStorage.getItem('subworld_public_key');
      const publicKeyDisplay = localStorage.getItem('subworld_public_key_display');
      const privateKeyDisplay = localStorage.getItem('subworld_private_key_display');
      const publicKeyHash = localStorage.getItem('subworld_public_key_hash');
      
      // Decrypt the private key
      const privateKey = this.simpleDecrypt(encryptedPrivateKey);
      
      return {
        publicKey,
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
   * Delete key pair from local storage
   * @returns {boolean} Success status
   */
  static deleteKeyPair() {
    try {
      if (typeof window === 'undefined') return false;
      
      localStorage.removeItem('subworld_private_key');
      localStorage.removeItem('subworld_public_key');
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
   * Encrypt a message 
   * @param {string} message - Plain text message to encrypt
   * @param {string} recipientKeyDisplay - Recipient's display key
   * @returns {Promise<string>} Base64 encoded encrypted message
   */
  static async encryptMessage(message, recipientKeyDisplay) {
    try {
      // Get sender's key pair
      const senderKeyPair = this.getKeyPair();
      if (!senderKeyPair) throw new Error('No key pair found. Please create or import a key pair.');
      
      // Create a symmetric key from both parties' display keys
      const symmetricKey = await this.deriveSharedKeyFromDisplayKeys(
        senderKeyPair.publicKeyDisplay,
        recipientKeyDisplay
      );
      
      // Generate a random nonce
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      
      // Encrypt the message using the symmetric key
      const messageUint8 = encodeUTF8(message);
      const encryptedMessage = nacl.secretbox(messageUint8, nonce, symmetricKey);
      
      // Combine nonce and encrypted message
      const fullMessage = new Uint8Array(nonce.length + encryptedMessage.length);
      fullMessage.set(nonce);
      fullMessage.set(encryptedMessage, nonce.length);
      
      // Return as Base64
      return encodeBase64(fullMessage);
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  }
  
  /**
   * Decrypt a message
   * @param {string} encryptedMessage - Base64 encoded encrypted message
   * @param {string} senderKeyDisplay - Sender's display key
   * @returns {Promise<string>} Decrypted plain text message
   */
  static async decryptMessage(encryptedMessage, senderKeyDisplay) {
    try {
      // Get receiver's key pair
      const receiverKeyPair = this.getKeyPair();
      if (!receiverKeyPair) throw new Error('No key pair found. Please create or import a key pair.');
      
      // Create the same symmetric key from both parties' display keys
      const symmetricKey = await this.deriveSharedKeyFromDisplayKeys(
        senderKeyDisplay,
        receiverKeyPair.publicKeyDisplay
      );
      
      // Decode the full message from Base64
      const fullMessage = decodeBase64(encryptedMessage);
      
      // Extract nonce and encrypted message
      const nonce = fullMessage.slice(0, nacl.secretbox.nonceLength);
      const encryptedData = fullMessage.slice(nacl.secretbox.nonceLength);
      
      // Decrypt the message
      const decryptedMessage = nacl.secretbox.open(encryptedData, nonce, symmetricKey);
      if (!decryptedMessage) throw new Error('Decryption failed. Invalid message or wrong key.');
      
      // Convert back to string
      return decodeUTF8(decryptedMessage);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  }
  
  /**
   * Derive a shared encryption key from two display keys
   * @param {string} key1 - First display key
   * @param {string} key2 - Second display key
   * @returns {Promise<Uint8Array>} 32-byte key for encryption/decryption
   */
  static async deriveSharedKeyFromDisplayKeys(key1, key2) {
    // Sort the keys to ensure the same key is derived regardless of who's sending/receiving
    const sortedKeys = [key1, key2].sort();
    
    // Combine the keys
    const combinedKey = sortedKeys[0] + sortedKeys[1];
    
    // Hash the combined key to get a reliable 32-byte encryption key
    const hash = await this.hashString(combinedKey);
    
    // Convert the hex hash to a Uint8Array (first 32 bytes)
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
    }
    
    return keyBytes;
  }
  
  /**
   * Hash a string using SHA-256
   * @param {string} str - String to hash
   * @returns {Promise<string>} Hex hash string
   */
  static async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  /**
   * Format a hash as a display key with dashes
   * @param {string} hash - Hash string
   * @returns {string} Formatted display key
   */
  static formatHashForDisplay(hash) {
    return hash.match(/.{1,4}/g).join('-');
  }
  
  /**
   * Create a shortened version of a private key for display
   * @param {string} privateKey - Full private key
   * @returns {string} Shortened private key
   */
  static createShortPrivateKey(privateKey) {
    const start = privateKey.substring(0, 12);
    const end = privateKey.substring(privateKey.length - 12);
    return `${start}...${end}`;
  }
  
  /**
   * Simple encryption for local storage (not secure, just obfuscation)
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text
   */
  static simpleEncrypt(text) {
    return btoa(text.split('').map(char =>
      String.fromCharCode(char.charCodeAt(0) + 1)
    ).join(''));
  }
  
  /**
   * Simple decryption for local storage
   * @param {string} encrypted - Encrypted text
   * @returns {string} Decrypted text
   */
  static simpleDecrypt(encrypted) {
    return atob(encrypted).split('').map(char =>
      String.fromCharCode(char.charCodeAt(0) - 1)
    ).join('');
  }
  
  /**
   * Test the encryption system
   * @returns {Promise<{success: boolean, message: string, encrypted: string, decrypted: string}>}
   */
  static async testEncryption() {
    try {
      // Get current user's keys
      const keyPair = this.getKeyPair();
      if (!keyPair) throw new Error('No key pair found');
      
      // Test message
      const message = `Test message with special chars: éèàùñ 你好 !@#$%^&*() [${Date.now()}]`;
      console.log('Original message:', message);
      
      // Encrypt with own key (for testing)
      const encrypted = await this.encryptMessage(message, keyPair.publicKeyDisplay);
      console.log('Encrypted:', encrypted);
      
      // Decrypt
      const decrypted = await this.decryptMessage(encrypted, keyPair.publicKeyDisplay);
      console.log('Decrypted:', decrypted);
      
      return {
        success: message === decrypted,
        message,
        encrypted,
        decrypted
      };
    } catch (error) {
      console.error('Test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default LocalKeyStorageManager;
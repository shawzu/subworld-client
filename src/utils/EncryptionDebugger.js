// Debugging the encryption and decryption process

class EncryptionDebugger {
    // Helper functions from LocalKeyStorageManager
    static arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  
    static base64ToArrayBuffer(base64) {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
  
    static async hashString(str) {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  
    static generateKeyBytesFromHash(hash) {
      // Convert hex hash to bytes
      const keyBytes = new Uint8Array(hash.length / 2);
      for (let i = 0; i < hash.length; i += 2) {
        keyBytes[i/2] = parseInt(hash.substring(i, i + 2), 16);
      }
      return keyBytes;
    }
  
    // Fixed version of encryption
    static async encryptMessageFixed(message, recipientPublicKeyHash) {
      try {
        // Convert message to bytes
        const encoder = new TextEncoder();
        const messageBytes = encoder.encode(message);
        
        // Create a key from the recipient's public key hash
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
  
    // Fixed version of decryption
    static async decryptMessageFixed(encryptedMessage, privateKey) {
      try {
        // Get our public key hash from private key
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
  
    // Original (buggy) encryption implementation for comparison
    static async encryptMessageBuggy(message, recipientPublicKeyHash) {
      try {
        // Convert message to bytes
        const encoder = new TextEncoder();
        const messageBytes = encoder.encode(message);
        
        // Create a key from the recipient's public key hash
        // We use a consistent approach that will be reversible
        const keyBytes = this.generateKeyBytesFromHash(recipientPublicKeyHash);
        
        // XOR encryption - THIS HAS A BUG
        const encryptedBytes = new Uint8Array(messageBytes.length);
        encryptedBytes[0] = messageBytes[0] ^ keyBytes[0]; // Only encrypts first byte correctly
        for (let i = 1; i < messageBytes.length; i++) {
          encryptedBytes[i] = messageBytes[i]; // Simply copies the rest
        }
        
        // Convert to base64 for transmission
        return this.arrayBufferToBase64(encryptedBytes);
      } catch (error) {
        console.error('Encryption failed:', error);
        throw error;
      }
    }
  
    // Run tests to diagnose the issue
    static async runTests() {
      console.log("Running encryption/decryption tests...");
  
      // Test message with multiple words to see where it breaks
      const testMessage = "Hello! This is a test message with multiple words.";
      console.log(`Original message: "${testMessage}"`);
      
      // Generate test keys
      const testPrivateKey = "test-private-key-12345";
      const publicKeyHash = await this.hashString(testPrivateKey);
      console.log(`Public key hash: ${publicKeyHash}`);
      
      // Test with buggy implementation (simulating the issue)
      console.log("\n--- Testing with buggy implementation ---");
      const encryptedBuggy = await this.encryptMessageBuggy(testMessage, publicKeyHash);
      console.log(`Encrypted (buggy): ${encryptedBuggy}`);
      
      const decryptedBuggy = await this.decryptMessageFixed(encryptedBuggy, testPrivateKey);
      console.log(`Decrypted (buggy): "${decryptedBuggy}"`);
      console.log(`Matches original? ${decryptedBuggy === testMessage}`);
      
      // Test character-by-character comparison for buggy version
      console.log("\nCharacter-by-character comparison (buggy):");
      for (let i = 0; i < Math.min(testMessage.length, decryptedBuggy.length); i++) {
        const originalChar = testMessage.charAt(i);
        const decryptedChar = decryptedBuggy.charAt(i);
        const match = originalChar === decryptedChar;
        console.log(`Position ${i}: '${originalChar}' vs '${decryptedChar}' - ${match ? 'Match' : 'MISMATCH'}`);
        if (!match) break; // Stop at first mismatch
      }
      
      // Test with fixed implementation
      console.log("\n--- Testing with fixed implementation ---");
      const encryptedFixed = await this.encryptMessageFixed(testMessage, publicKeyHash);
      console.log(`Encrypted (fixed): ${encryptedFixed}`);
      
      const decryptedFixed = await this.decryptMessageFixed(encryptedFixed, testPrivateKey);
      console.log(`Decrypted (fixed): "${decryptedFixed}"`);
      console.log(`Matches original? ${decryptedFixed === testMessage}`);
      
      // Demonstrate the fix needed in LocalKeyStorageManager.js
      console.log("\n--- Fix recommendation ---");
      console.log("In LocalKeyStorageManager.js, ensure the encryption loop properly processes all bytes:");
      console.log(`
  // INCORRECT implementation (might be causing your issue):
  const encryptedBytes = new Uint8Array(messageBytes.length);
  encryptedBytes[0] = messageBytes[0] ^ keyBytes[0]; // Only first byte encrypted
  for (let i = 1; i < messageBytes.length; i++) {
    encryptedBytes[i] = messageBytes[i]; // Rest are just copied!
  }
  
  // CORRECT implementation:
  const encryptedBytes = new Uint8Array(messageBytes.length);
  for (let i = 0; i < messageBytes.length; i++) {
    encryptedBytes[i] = messageBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  `);
    }
  }
  
  // Run the tests
  EncryptionDebugger.runTests();
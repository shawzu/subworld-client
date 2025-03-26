'use client'

import { useState, useEffect } from 'react'
import LocalKeyStorageManager from '../../utils/LocalKeyStorageManager'

export default function TestPage() {
  const [testResults, setTestResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [logs, setLogs] = useState([])

  // Function to add logs
  const log = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toISOString() }])
  }

  // Clear logs
  const clearLogs = () => {
    setLogs([])
  }

  // Test encryption and decryption
  const testEncryptionDecryption = async () => {
    setIsLoading(true)
    clearLogs()
    
    try {
      log("Starting encryption/decryption test...")
      
      // Step 1: Generate a key pair for Alice
      log("Generating Alice's key pair...")
      const aliceKeys = await LocalKeyStorageManager.generateKeyPair(1024)
      log(`Alice's public key display: ${aliceKeys.publicKeyDisplay}`)
      log(`Alice's private key (first few chars): ${aliceKeys.privateKey.substring(0, 20)}...`)
      
      // Step 2: Generate a key pair for Bob
      log("Generating Bob's key pair...")
      const bobKeys = await LocalKeyStorageManager.generateKeyPair(1024)
      log(`Bob's public key display: ${bobKeys.publicKeyDisplay}`)
      log(`Bob's private key (first few chars): ${bobKeys.privateKey.substring(0, 20)}...`)
      
      // Step 3: Alice encrypts a message for Bob
      const originalMessage = "Hello Bob! This is a secret message from Alice."
      log(`Original message: ${originalMessage}`)
      
      log("Alice encrypting message for Bob...")
      const encryptedMessage = await LocalKeyStorageManager.encryptMessage(
        originalMessage, 
        bobKeys.publicKeyHash
      )
      log(`Encrypted message: ${encryptedMessage}`)
      
      // Step 4: Bob decrypts the message from Alice
      log("Bob decrypting message from Alice...")
      const decryptedMessage = await LocalKeyStorageManager.decryptMessage(
        encryptedMessage, 
        bobKeys.privateKey
      )
      log(`Decrypted message: ${decryptedMessage}`)
      
      // Step 5: Verify the decryption worked correctly
      const success = originalMessage === decryptedMessage
      log(`Basic encryption/decryption test: ${success ? "SUCCESS ✅" : "FAILED ❌"}`, success ? 'success' : 'error')
      
      // Step 6: Test key import and message decryption
      log("\nTesting key import...")
      const importedBobKeys = await LocalKeyStorageManager.importPrivateKey(bobKeys.privateKey)
      log(`Imported Bob's public key display: ${importedBobKeys.publicKeyDisplay}`)
      log(`Original Bob's public key display: ${bobKeys.publicKeyDisplay}`)
      
      const displayMatch = importedBobKeys.publicKeyDisplay === bobKeys.publicKeyDisplay
      log(`Public key displays match: ${displayMatch ? "YES ✅" : "NO ❌"}`, displayMatch ? 'success' : 'error')
      
      log("Decrypting message with imported key...")
      const decryptedWithImported = await LocalKeyStorageManager.decryptMessage(
        encryptedMessage, 
        importedBobKeys.privateKey
      )
      log(`Decrypted message with imported key: ${decryptedWithImported}`)
      
      const importSuccess = originalMessage === decryptedWithImported
      log(`Decryption with imported key: ${importSuccess ? "SUCCESS ✅" : "FAILED ❌"}`, importSuccess ? 'success' : 'error')
      
      setTestResults({ 
        success, 
        importSuccess,
        displayMatch
      })
    } catch (error) {
      log(`Error during test: ${error.message}`, 'error')
      setTestResults({ 
        success: false, 
        importSuccess: false,
        displayMatch: false,
        error: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Test store and retrieve
  const testStoreAndRetrieve = async () => {
    setIsLoading(true)
    clearLogs()
    
    try {
      log("Testing key storage and retrieval...")
      
      // Generate a key pair
      log("Generating test key pair...")
      const testKeys = await LocalKeyStorageManager.generateKeyPair(1024)
      log(`Generated public key display: ${testKeys.publicKeyDisplay}`)
      log(`Generated private key (first few chars): ${testKeys.privateKey.substring(0, 20)}...`)
      
      // Store the key pair
      log("Storing key pair in localStorage...")
      const storeSuccess = LocalKeyStorageManager.saveKeyPair(testKeys)
      log(`Storage success: ${storeSuccess ? "YES ✅" : "NO ❌"}`, storeSuccess ? 'success' : 'error')
      
      // Retrieve the key pair
      log("Retrieving key pair from localStorage...")
      const retrievedKeys = LocalKeyStorageManager.getKeyPair()
      
      if (!retrievedKeys) {
        log("Failed to retrieve keys!", 'error')
        setTestResults({
          storeSuccess,
          retrieveSuccess: false
        })
        return
      }
      
      log(`Retrieved public key display: ${retrievedKeys.publicKeyDisplay}`)
      log(`Retrieved private key (first few chars): ${retrievedKeys.privateKey.substring(0, 20)}...`)
      
      // Verify the keys match
      const displayMatch = retrievedKeys.publicKeyDisplay === testKeys.publicKeyDisplay
      log(`Public key display match: ${displayMatch ? "YES ✅" : "NO ❌"}`, displayMatch ? 'success' : 'error')
      
      const privateMatch = retrievedKeys.privateKey === testKeys.privateKey
      log(`Private key match: ${privateMatch ? "YES ✅" : "NO ❌"}`, privateMatch ? 'success' : 'error')
      
      // Test decryption with retrieved keys
      const testMessage = "This is a test message for storage and retrieval."
      log(`Test message: ${testMessage}`)
      
      log("Encrypting message with original public key hash...")
      const encryptedMessage = await LocalKeyStorageManager.encryptMessage(
        testMessage,
        testKeys.publicKeyHash
      )
      
      log("Decrypting message with retrieved private key...")
      const decryptedMessage = await LocalKeyStorageManager.decryptMessage(
        encryptedMessage,
        retrievedKeys.privateKey
      )
      log(`Decrypted message: ${decryptedMessage}`)
      
      const decryptSuccess = testMessage === decryptedMessage
      log(`Decryption success with retrieved keys: ${decryptSuccess ? "YES ✅" : "NO ❌"}`, decryptSuccess ? 'success' : 'error')
      
      setTestResults({
        storeSuccess,
        retrieveSuccess: true,
        displayMatch,
        privateMatch,
        decryptSuccess
      })
      
      // Clean up - delete the test keys
      log("Cleaning up - deleting test keys...")
      const deleteSuccess = LocalKeyStorageManager.deleteKeyPair()
      log(`Cleanup success: ${deleteSuccess ? "YES ✅" : "NO ❌"}`)
      
    } catch (error) {
      log(`Error during test: ${error.message}`, 'error')
      setTestResults({ 
        storeSuccess: false,
        retrieveSuccess: false,
        error: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Encryption System Test Page</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Test Buttons */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Test Functions</h2>
            <div className="space-y-4">
              <button 
                onClick={testEncryptionDecryption}
                disabled={isLoading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
              >
                {isLoading ? 'Testing...' : 'Test Encryption & Decryption'}
              </button>
              
              <button 
                onClick={testStoreAndRetrieve}
                disabled={isLoading}
                className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300 transition"
              >
                {isLoading ? 'Testing...' : 'Test Storage & Retrieval'}
              </button>
              
              <button 
                onClick={clearLogs}
                className="w-full py-2 px-4 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
              >
                Clear Logs
              </button>
            </div>
          </div>
          
          {/* Test Results */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            {testResults ? (
              <div className="space-y-2">
                {testResults.success !== undefined && (
                  <div className={`p-3 rounded ${testResults.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Basic Encryption/Decryption: {testResults.success ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.importSuccess !== undefined && (
                  <div className={`p-3 rounded ${testResults.importSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Import & Decrypt: {testResults.importSuccess ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.displayMatch !== undefined && (
                  <div className={`p-3 rounded ${testResults.displayMatch ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Public Key Display Match: {testResults.displayMatch ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.storeSuccess !== undefined && (
                  <div className={`p-3 rounded ${testResults.storeSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Key Storage: {testResults.storeSuccess ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.retrieveSuccess !== undefined && (
                  <div className={`p-3 rounded ${testResults.retrieveSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Key Retrieval: {testResults.retrieveSuccess ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.privateMatch !== undefined && (
                  <div className={`p-3 rounded ${testResults.privateMatch ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Private Key Match: {testResults.privateMatch ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.decryptSuccess !== undefined && (
                  <div className={`p-3 rounded ${testResults.decryptSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Decrypt with Retrieved Keys: {testResults.decryptSuccess ? 'Success ✅' : 'Failed ❌'}
                  </div>
                )}
                
                {testResults.error && (
                  <div className="p-3 bg-red-100 text-red-800 rounded">
                    Error: {testResults.error}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 italic">No tests run yet. Click a test button to begin.</p>
            )}
          </div>
        </div>
        
        {/* Logs Panel */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Test Logs</h2>
          <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500">No logs yet...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`
                  mb-1 
                  ${log.type === 'error' ? 'text-red-400' : ''} 
                  ${log.type === 'success' ? 'text-green-500 font-bold' : ''}
                `}>
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
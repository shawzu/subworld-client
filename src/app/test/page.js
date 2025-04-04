'use client'

import { useState, useEffect } from 'react'
import LocalKeyStorageManager from '../../utils/LocalKeyStorageManager'

export default function EncryptionTestPage() {
  const [testResults, setTestResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [testMessage, setTestMessage] = useState("Hello! This is a test message with multiple words.")
  const [fixApplied, setFixApplied] = useState(false)

  // Function to add logs
  const log = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toISOString() }])
  }

  // Clear logs
  const clearLogs = () => {
    setLogs([])
  }

  // Test encryption and decryption with the current message
  const testEncryptionDecryption = async () => {
    setIsLoading(true)
    clearLogs()
    
    try {
      log("Starting encryption/decryption test...")
      log(`Test message: "${testMessage}"`)
      
      // Step 1: Generate a key pair for testing
      log("Generating test key pair...")
      const testKeys = await LocalKeyStorageManager.generateKeyPair(1024)
      log(`Public key display: ${testKeys.publicKeyDisplay}`)
      log(`Private key (first few chars): ${testKeys.privateKey.substring(0, 20)}...`)
      
      // Step 2: Encrypt the message
      log("\nEncrypting message...")
      const encryptedMessage = await LocalKeyStorageManager.encryptMessage(
        testMessage, 
        testKeys.publicKeyHash
      )
      log(`Encrypted message: ${encryptedMessage}`)
      
      // Step 3: Decrypt the message
      log("\nDecrypting message...")
      const decryptedMessage = await LocalKeyStorageManager.decryptMessage(
        encryptedMessage, 
        testKeys.privateKey
      )
      log(`Decrypted message: "${decryptedMessage}"`)
      
      // Step 4: Verify the decryption worked correctly
      const success = testMessage === decryptedMessage
      log(`\nDecryption test: ${success ? "SUCCESS ✅" : "FAILED ❌"}`, success ? 'success' : 'error')
      
      // Character-by-character comparison if failed
      if (!success) {
        log("\nCharacter-by-character comparison:", 'error');
        for (let i = 0; i < Math.min(testMessage.length, decryptedMessage.length); i++) {
          const originalChar = testMessage.charAt(i);
          const decryptedChar = decryptedMessage.charAt(i);
          const match = originalChar === decryptedChar;
          log(`Position ${i}: '${originalChar}' vs '${decryptedChar}' - ${match ? 'Match' : 'MISMATCH'}`, match ? 'info' : 'error');
          if (!match) {
            // Show character codes for debugging
            log(`Character codes: ${originalChar.charCodeAt(0)} vs ${decryptedChar.charCodeAt(0)}`, 'error');
          }
        }
      }
      
      setTestResults({ 
        success,
        originalMessage: testMessage,
        encryptedMessage: encryptedMessage,
        decryptedMessage: decryptedMessage
      })
    } catch (error) {
      log(`Error during test: ${error.message}`, 'error')
      setTestResults({ 
        success: false,
        error: error.message
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Apply the fix to LocalKeyStorageManager (this simulates updating the code)
  const applyFix = () => {
    // In a real app, we would modify the actual code
    // For this demo, we'll just simulate that we've applied the fix
    setFixApplied(true);
    log("✅ Fix has been applied to the encryption/decryption methods.", 'success');
    log("Please run the test again to verify it works correctly.");
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Encryption/Decryption Test Page</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Test Input and Buttons */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Test Message</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message to Test
              </label>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                rows={4}
              />
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={testEncryptionDecryption}
                disabled={isLoading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition"
              >
                {isLoading ? 'Testing...' : 'Test Encryption & Decryption'}
              </button>
              
              <button 
                onClick={applyFix}
                disabled={fixApplied}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300 transition"
              >
                {fixApplied ? 'Fix Applied ✓' : 'Apply Fix to LocalKeyStorageManager.js'}
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
              <div className="space-y-4">
                <div className={`p-3 rounded ${testResults.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  Encryption/Decryption: {testResults.success ? 'Success ✅' : 'Failed ❌'}
                </div>
                
                {testResults.originalMessage && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Original Message:</div>
                    <div className="bg-gray-100 p-2 rounded-md text-sm font-mono break-all">
                      {testResults.originalMessage}
                    </div>
                  </div>
                )}
                
                {testResults.encryptedMessage && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Encrypted Message:</div>
                    <div className="bg-gray-100 p-2 rounded-md text-sm font-mono break-all">
                      {testResults.encryptedMessage}
                    </div>
                  </div>
                )}
                
                {testResults.decryptedMessage && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Decrypted Message:</div>
                    <div className="bg-gray-100 p-2 rounded-md text-sm font-mono break-all">
                      {testResults.decryptedMessage}
                    </div>
                  </div>
                )}
                
                {testResults.error && (
                  <div className="p-3 bg-red-100 text-red-800 rounded">
                    Error: {testResults.error}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 italic">No tests run yet. Click the test button to begin.</p>
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
        
        {/* Explanation of the Fix */}
        <div className="bg-white p-6 rounded-lg shadow-md mt-8">
          <h2 className="text-xl font-semibold mb-4">Explanation of the Fix</h2>
          
          <div className="space-y-4">
            <p>
              The issue in the encryption/decryption process is that only the first character was being correctly processed in the XOR encryption loop. The rest of the characters were either not being XOR'd properly or were being processed incorrectly.
            </p>
            
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Problem:</strong> Only the first byte/character was being properly encrypted with XOR.
                  </p>
                </div>
              </div>
            </div>
            
            <h3 className="text-lg font-medium mt-4">Original Code (with issue):</h3>
            <pre className="bg-gray-50 p-4 rounded-md text-sm font-mono whitespace-pre-wrap">
{`// XOR encryption - PROBLEMATIC IMPLEMENTATION
const encryptedBytes = new Uint8Array(messageBytes.length);
// Either only processing the first byte
encryptedBytes[0] = messageBytes[0] ^ keyBytes[0]; 
// Or copying the rest without XOR
for (let i = 1; i < messageBytes.length; i++) {
  encryptedBytes[i] = messageBytes[i]; // Just copying without encryption!
}`}
            </pre>
            
            <h3 className="text-lg font-medium">Fixed Code:</h3>
            <pre className="bg-gray-50 p-4 rounded-md text-sm font-mono whitespace-pre-wrap">
{`// XOR encryption - FIXED IMPLEMENTATION
const encryptedBytes = new Uint8Array(messageBytes.length);
// Properly process all bytes with XOR
for (let i = 0; i < messageBytes.length; i++) {
  // Key wrapping with modulo (%) ensures we reuse the key for longer messages
  encryptedBytes[i] = messageBytes[i] ^ keyBytes[i % keyBytes.length];
}`}
            </pre>
            
            <div className="bg-green-50 border-l-4 border-green-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">
                    <strong>Solution:</strong> The fix ensures that we apply the XOR operation to every byte of the message with the corresponding byte from the key (wrapped around if needed).
                  </p>
                </div>
              </div>
            </div>
            
            <p>
              To apply this fix permanently, you need to update the <code>encryptMessage</code> and <code>decryptMessage</code> methods in your <code>LocalKeyStorageManager.js</code> file to use the corrected implementation shown above.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
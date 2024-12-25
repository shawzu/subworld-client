'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { sha256 } from 'js-sha256'

export default function ImportAccount() {
  const router = useRouter()
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')

  const handleImport = () => {
    
    if (privateKey.length !== 64) {
      setError('Invalid private key. Please enter a valid 64-character hexadecimal string.')
      return
    }

  
    const publicKey = sha256(privateKey).slice(0, 40)

  
    router.push('/app')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-black  text-white flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto space-y-12">
        {/* Logo */}
        <div className="text-center">
          <Image 
            src="/Planet-logo-blue.png" 
            alt="Logo" 
            width={200} 
            height={200} 
            className="mx-auto"
          />
        </div>

        {/* Import Form */}
        <div className="space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold text-center">Import Your Account</h1>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="privateKey" className="block text-sm font-medium text-gray-300 mb-2">
                Enter your Private Key
              </label>
              <input
                type="password"
                id="privateKey"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your 64-character private key"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              onClick={handleImport}
              className="w-full max-w-md mx-auto h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl"
            >
              Start Messaging
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-gray-800 p-4 rounded-lg text-sm">
          <strong className="block mb-2">Security Notice:</strong>
          <p>
            Ensure you&apos;re on the correct Subworld website before entering your private key. 
            We will never ask for your private key outside of this import process.
          </p>
        </div>

        {/* Terms Text */}
        <p className="text-sm text-gray-500 text-center">
          By importing your account, you agree to Subworld&apos;s Terms of Service and Privacy Policy
        </p>
      </div>
    </main>
  )
}

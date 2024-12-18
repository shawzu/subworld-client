'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { sha256 } from 'js-sha256'

export default function CreateAccount() {
  const router = useRouter()
  const [privateKey, setPrivateKey] = useState('')
  const [publicKey, setPublicKey] = useState('')

  useEffect(() => {
    
    const mockPrivateKey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
    setPrivateKey(mockPrivateKey)

 
    const mockPublicKey = sha256(mockPrivateKey).slice(0, 40) 
    setPublicKey(mockPublicKey)
  }, [])

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 md:p-8">
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

        {/* Account Information */}
        <div className="space-y-6 text-center">
          
          
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Private Key</h2>
              <p className="bg-[#0F0F0F]/90 p-4 rounded-lg break-all ">{privateKey}</p>
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-2">Your Username</h2>
              <p className="bg-[#0F0F0F]/90 p-4 rounded-lg break-all ">{publicKey}</p>
            </div>
          </div>

          <div className="bg-yellow-900 text-yellow-100 p-4 rounded-lg text-sm">
            <strong>Warning:</strong> Store your private key in a secure environment. 
            Never share it with anyone. If you lose it, you'll lose access to your account.
          </div>
        </div>

        {/* Button */}
        <div className="space-y-4">
          <button
            className="w-full max-w-md mx-auto h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl"
            onClick={() => router.push('/app')}
          >
            Start Messaging
          </button>
        </div>

        {/* Terms Text */}
        <p className="text-sm text-gray-500 text-center">
          By creating an account, you agree to Subworld's Terms of Service and Privacy Policy
        </p>
      </div>
    </main>
  )
}

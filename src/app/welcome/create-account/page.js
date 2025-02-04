'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { sha256 } from 'js-sha256'
import { motion } from 'framer-motion'
import { Copy, Check, ArrowLeft, Shield, AlertTriangle } from 'lucide-react'

export default function CreateAccount() {
  const router = useRouter()
  const [privateKey, setPrivateKey] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [copiedPrivate, setCopiedPrivate] = useState(false)
  const [copiedPublic, setCopiedPublic] = useState(false)

  useEffect(() => {
    const mockPrivateKey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
    setPrivateKey(mockPrivateKey)

    const mockPublicKey = sha256(mockPrivateKey).slice(0, 40) 
    setPublicKey(mockPublicKey)
  }, [])

  const copyToClipboard = (text, isPrivate) => {
    navigator.clipboard.writeText(text)
    if (isPrivate) {
      setCopiedPrivate(true)
      setTimeout(() => setCopiedPrivate(false), 2000)
    } else {
      setCopiedPublic(true)
      setTimeout(() => setCopiedPublic(false), 2000)
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#0E0F14] text-white flex flex-col items-center justify-center p-4 md:p-8"
    >
      <div className="w-full max-w-2xl mx-auto space-y-12">
        {/* Back Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/welcome')}
          className="absolute top-4 left-4 text-gray-400 hover:text-white flex items-center space-x-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </motion.button>

        {/* Logo */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center"
        >
          <Image 
            src="/Planet-logo-blue.png" 
            alt="Logo" 
            width={150} 
            height={150} 
            className="mx-auto drop-shadow-2xl"
          />
        </motion.div>

        {/* Account Information */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-8 bg-gray-800/50 p-8 rounded-2xl backdrop-blur-sm"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
            Your New Account
          </h1>
          
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-green-500" />
                Private Key
              </h2>
              <div className="relative">
                <p className="bg-gray-700/50 p-4 rounded-lg break-all text-sm">{privateKey}</p>
                <button
                  onClick={() => copyToClipboard(privateKey, true)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-white"
                  aria-label="Copy private key"
                >
                  {copiedPrivate ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-2">Your Username</h2>
              <div className="relative">
                <p className="bg-gray-700/50 p-4 rounded-lg break-all text-sm">{publicKey}</p>
                <button
                  onClick={() => copyToClipboard(publicKey, false)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-white"
                  aria-label="Copy username"
                >
                  {copiedPublic ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="bg-yellow-900/50 border border-yellow-700 text-yellow-100 p-4 rounded-lg text-sm flex items-start space-x-2"
          >
            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>
              <strong>Warning:</strong> Store your private key in a secure environment. 
              Never share it with anyone. If you lose it, you&apos;ll lose access to your account.
            </p>
          </motion.div>
        </motion.div>

        {/* Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="space-y-4"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full max-w-md mx-auto h-14 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex items-center justify-center gap-2 rounded-xl transition-all duration-300 shadow-lg"
            onClick={() => router.push('/app')}
          >
            Start Messaging
          </motion.button>
        </motion.div>

        {/* Terms Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="text-sm text-gray-400 text-center"
        >
          By creating an account, you agree to Subworld&apos;s{' '}
          <a href="#" className="text-blue-400 hover:underline">Terms of Service</a> and{' '}
          <a href="#" className="text-blue-400 hover:underline">Privacy Policy</a>
        </motion.p>
      </div>
    </motion.main>
  )
}


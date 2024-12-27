'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { sha256 } from 'js-sha256'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ArrowLeft, Shield } from 'lucide-react'

export default function ImportAccount() {
  const router = useRouter()
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleImport = () => {
    if (privateKey.length !== 64) {
      setError('Invalid private key. Please enter a valid 64-character hexadecimal string.')
      return
    }

    const publicKey = sha256(privateKey).slice(0, 40)
    
    // Here you would typically save the keys securely and authenticate the user
    // For demo purposes, we're just navigating to the app
    router.push('/app')
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-4 md:p-8"
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

        {/* Import Form */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-8 bg-gray-800/50 p-8 rounded-2xl backdrop-blur-sm"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
            Import Your Account
          </h1>
          
          <div className="space-y-6">
            <div>
              <label htmlFor="privateKey" className="block text-sm font-medium text-gray-300 mb-2">
                Enter your Private Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  id="privateKey"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  placeholder="Enter your 64-character private key"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-sm"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleImport}
              className="w-full h-14 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex items-center justify-center gap-2 rounded-xl transition-all duration-300 shadow-lg"
            >
              Start Messaging
            </motion.button>
          </div>
        </motion.div>

        {/* Security Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="bg-gray-800/30 p-6 rounded-xl text-sm border border-gray-700/50 backdrop-blur-sm"
        >
          <div className="flex items-center space-x-2 mb-3">
            <Shield className="w-5 h-5 text-green-500" />
            <strong className="text-green-500">Security Notice:</strong>
          </div>
          <p className="text-gray-300">
            Ensure you're on the correct Subworld website before entering your private key. 
            We will never ask for your private key outside of this import process.
          </p>
        </motion.div>

        {/* Terms Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-sm text-gray-400 text-center"
        >
          By importing your account, you agree to Subworld's{' '}
          <a href="#" className="text-blue-400 hover:underline">Terms of Service</a> and{' '}
          <a href="#" className="text-blue-400 hover:underline">Privacy Policy</a>
        </motion.p>
      </div>
    </motion.main>
  )
}


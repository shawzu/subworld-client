'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Copy, Check, ArrowLeft, Shield, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import LocalKeyStorageManager from '../../../utils/LocalKeyStorageManager'

export default function CreateAccount() {
  const router = useRouter()
  const [privateKey, setPrivateKey] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [privateKeyDisplay, setPrivateKeyDisplay] = useState('')
  const [publicKeyDisplay, setPublicKeyDisplay] = useState('')
  const [showFullPrivateKey, setShowFullPrivateKey] = useState(false)
  const [copiedPrivate, setCopiedPrivate] = useState(false)
  const [copiedPublic, setCopiedPublic] = useState(false)
  const [isGenerating, setIsGenerating] = useState(true)
  const [keyPair, setKeyPair] = useState(null) // Store the key pair temporarily

  useEffect(() => {
    const generateKeys = async () => {
      try {
        setIsGenerating(true);
        
        // Generate key pair with shorter display versions
        const generatedKeyPair = await LocalKeyStorageManager.generateKeyPair(1024);
        
        // Store in state but don't save to storage yet
        setKeyPair(generatedKeyPair);

        // Update state for display
        setPrivateKey(generatedKeyPair.privateKey);
        setPublicKey(generatedKeyPair.publicKey);
        setPrivateKeyDisplay(generatedKeyPair.privateKeyDisplay);
        setPublicKeyDisplay(generatedKeyPair.publicKeyDisplay);
      } catch (error) {
        console.error('Key generation failed:', error);
      } finally {
        setIsGenerating(false);
      }
    };

    // Check if keys already exist
    const existingKeys = LocalKeyStorageManager.getKeyPair();
    if (existingKeys) {
      // If keys exist, redirect to app
      router.push('/app');
    } else {
      // Otherwise generate new keys
      generateKeys();
    }
  }, [router])

  const handleStartMessaging = () => {
    // Save keys to local storage only when clicking Start Messaging
    if (keyPair) {
      LocalKeyStorageManager.saveKeyPair(keyPair);
      router.push('/app');
    }
  }

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
          <h1 className="text-3xl md:text-4xl font-bold text-center text-white">
            Your New Account
          </h1>
          
          {isGenerating ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              <p className="ml-3 text-blue-400">Generating secure keys...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2 flex items-center">
                  
                  Private Key
                </h2>
                <div className="relative">
                  <p className="bg-gray-700/50 p-4 rounded-lg break-all text-sm">
                    {showFullPrivateKey ? privateKey : privateKeyDisplay}
                  </p>
                  <div className="absolute top-2 right-2 flex space-x-2">
                    <button
                      onClick={() => setShowFullPrivateKey(!showFullPrivateKey)}
                      className="text-gray-400 hover:text-white"
                      aria-label={showFullPrivateKey ? "Hide full private key" : "Show full private key"}
                    >
                      {showFullPrivateKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(privateKey, true)}
                      className="text-gray-400 hover:text-white"
                      aria-label="Copy private key"
                    >
                      {copiedPrivate ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
              
              <div>
                <h2 className="text-xl font-semibold mb-2">Your Username</h2>
                <div className="relative">
                  <p className="bg-gray-700/50 p-4 rounded-lg break-all text-sm">
                    {publicKeyDisplay}
                  </p>
                  <button
                    onClick={() => copyToClipboard(publicKeyDisplay, false)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    aria-label="Copy username"
                  >
                    {copiedPublic ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

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
            className="w-full max-w-md mx-auto h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl shadow-lg transition-colors duration-300"
            onClick={handleStartMessaging}
            disabled={isGenerating}
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
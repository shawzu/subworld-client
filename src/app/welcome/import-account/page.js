'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ArrowLeft, Shield, Loader } from 'lucide-react'
import LocalKeyStorageManager from '../../../utils/LocalKeyStorageManager'
import { WelcomeGuard } from '@/app/components/WelcomeGuard'

export default function ImportAccount() {
  const router = useRouter()
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleImport = async () => {
    if (!privateKey.trim()) {
      setError('Please enter your private key')
      return
    }

    try {
      setIsProcessing(true)
      setError('')

      // Use the enhanced method to properly import the private key and derive the public key
      const keyPair = await LocalKeyStorageManager.importPrivateKey(privateKey);
      
      // Save to local storage
      LocalKeyStorageManager.saveKeyPair(keyPair);
      
      // Navigate to the app
      router.push('/app');
    } catch (error) {
      console.error('Import failed:', error);
      setError('Invalid key format. Please make sure you copied the entire private key correctly.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#0E0F14] text-white flex flex-col items-center justify-center p-4 md:p-8"
    >
      <WelcomeGuard/>
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
          <h1 className="text-3xl md:text-4xl font-bold text-center text-white ">
            Import Your Account
          </h1>
          
          <div className="space-y-6">
            <div>
              <label htmlFor="privateKey" className="block text-sm font-medium text-gray-300 mb-2">
                Enter your Private Key
              </label>
              <div className="relative">
                <textarea
                  id="privateKey"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10 min-h-[100px]"
                  placeholder="Paste your private key here"
                  style={{ fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Paste the complete private key that was provided when you created your account.
              </p>
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
              disabled={isProcessing}
              className="w-full h-14 text-lg bg-[#3c5ac6] hover:from-blue-600 hover:to-purple-700 text-white flex items-center justify-center gap-2 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-70"
            >
              {isProcessing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                "Start Messaging"
              )}
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
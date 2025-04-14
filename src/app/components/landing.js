'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, X, Share } from 'lucide-react'

export default function Landing() {
  const router = useRouter()
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowInstallPrompt(true), 1000)

    // Check if the device is running iOS
    const checkIsIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase()
      return /iphone|ipad|ipod/.test(userAgent)
    }
    setIsIOS(checkIsIOS())

    return () => clearTimeout(timer)
  }, [])
  
  const headingVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.3,
        duration: 0.5,
      },
    }),
  }

  // IMPROVED navigation handler with multiple fallbacks
  const handleStartMessaging = () => {
    console.log('Start messaging button clicked, navigating to /welcome')
    
    // Try all available navigation methods
    try {
      // First attempt: Use Next.js router
      router.push('/welcome')
      
      // Second attempt after a brief delay if needed
      setTimeout(() => {
        // Check if we've successfully navigated
        if (window.location.pathname !== '/welcome') {
          console.log('Router navigation may have failed, using direct URL change')
          window.location.href = '/welcome'
        }
      }, 100)
    } catch (err) {
      console.error('Router navigation failed:', err)
      // Fallback to direct navigation
      window.location.href = '/welcome'
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#0E0F14] text-white flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden"
    >
      <div className="w-full max-w-4xl mx-auto space-y-16 relative z-10">
        {/* Logo and Text Content */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="space-y-12 text-center"
        >
          <Image
            src="/Planet-logo-blue.png"
            alt="Logo"
            width={200}
            height={200}
            className="mx-auto drop-shadow-2xl"
          />

          <div className="space-y-4">
            {['Decentralized.', 'Self-hostable.', 'Encrypted.'].map((text, i) => (
              <motion.h1
                key={text}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={headingVariants}
                className="text-4xl md:text-6xl font-bold text-white"
              >
                {text}
              </motion.h1>
            ))}
          </div>
        </motion.div>

        {/* CTA Button and Learn More */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="space-y-6"
        >
          {/* IMPROVED: Multiple button versions to ensure it works everywhere */}
          <div className="relative w-full max-w-md mx-auto">
            {/* Version 1: Standard button for most browsers */}
            <motion.button
              onClick={handleStartMessaging}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl shadow-lg transition-colors duration-300 cursor-pointer"
            >
              Start Messaging
              <ArrowRight className="w-5 h-5" />
            </motion.button>
            
            {/* Version 2: Direct link for iOS PWA fallback (positioned absolutely on top) */}
            <a 
              href="/welcome"
              className="absolute inset-0 opacity-0"
              aria-hidden="true"
            />
          </div>

          <motion.p
            whileHover={{ scale: 1.05 }}
            className="text-sm text-gray-400 text-center cursor-pointer hover:text-gray-200 transition-colors duration-300"
          >
            Learn more about Subworld
          </motion.p>
        </motion.div>
      </div>

      {/* Install Prompt */}
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: showInstallPrompt ? 1 : 0, y: showInstallPrompt ? 0 : 100 }}
        transition={{ duration: 0.5 }}
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 m-4"
      >
        <div className="rounded-2xl border border-gray-700 bg-gray-900/90 p-6 shadow-lg backdrop-blur">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold text-white">Install the app for easier access!</h2>
            <button onClick={() => setShowInstallPrompt(false)} className="text-gray-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <ol className="space-y-3 text-gray-300 text-sm mb-6">
            {isIOS ? (
              <>
                <li className="flex items-center gap-2">
                  1. Tap the <Share className="h-5 w-5" /> Share button
                </li>
                <li>2. Scroll down and tap "Add to Home Screen"</li>
                <li>3. Tap "Add" in the top right corner</li>
              </>
            ) : (
              <>
                <li className="flex items-center gap-2">
                  1. Tap the menu icon{" "}
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>{" "}
                  in your browser
                </li>
                <li>2. Tap "Add to Home screen"</li>
                <li>3. Tap "Add" to confirm</li>
              </>
            )}
            <li className="flex items-center gap-2">4. Look for the Subworld icon on your home screen</li>
          </ol>
          <button
            onClick={() => setShowInstallPrompt(false)}
            className="w-full bg-[#3c5ac6] hover:bg-[#3c5ac6]/90 text-white py-3 rounded-xl transition-colors duration-300 shadow-md"
          >
            Got it!
          </button>
        </div>
      </motion.div>
    </motion.main>
  )
}
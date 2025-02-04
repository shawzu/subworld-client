'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export default function Welcome() {
  const router = useRouter()

  return (
    <motion.main 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#0E0F14] text-white flex flex-col items-center justify-center p-4 md:p-8"
    >
      <div className="w-full max-w-4xl mx-auto space-y-16">
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
            width={200}
            height={200}
            className="mx-auto drop-shadow-2xl"
          />
          
        </motion.div>

        {/* Buttons */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-6"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full max-w-md mx-auto h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl shadow-lg transition-colors duration-300"
            onClick={() => router.push('/welcome/create-account')}
          >
            Create an Account
            <ArrowRight className="w-5 h-5" />
          </motion.button>

          <div className="flex items-center justify-center space-x-4">
            <div className="flex-grow h-px bg-gray-600"></div>
            <div className="text-gray-400 font-medium">OR</div>
            <div className="flex-grow h-px bg-gray-600"></div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full max-w-md mx-auto h-14 text-lg bg-[#3c5ac6] hover:bg-[#3c5ac6]/90 text-white flex items-center justify-center gap-2 rounded-2xl shadow-lg transition-colors duration-300"
            onClick={() => router.push('/welcome/import-account')}
          >
            Import an Account
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center text-gray-400 mt-12"
        >
          <p><a className='cursor-pointer hover:text-gray-200 transition-colors duration-300'>Learn more about Subworld </a></p>
        </motion.footer>
      </div>
    </motion.main>
  )
}


'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, UserCheck } from 'lucide-react'

export default function NewConversationModal({ isOpen, onClose, onSubmit }) {
  const [recipientKey, setRecipientKey] = useState('')
  const [alias, setAlias] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validate the recipient key
    if (!recipientKey.trim()) {
      setError('Recipient public key is required')
      return
    }
    
    // Check if the key follows the expected format (adjust validation as needed)
    if (!recipientKey.includes('-')) {
      setError('Invalid public key format')
      return
    }
    
    // Submit the form
    onSubmit({
      recipientKey: recipientKey.trim(),
      alias: alias.trim() || null, // Use null if no alias is provided
      initialMessage: message.trim() || null
    })
    
    // Reset form
    setRecipientKey('')
    setAlias('')
    setMessage('')
    setError('')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-md mx-3 rounded-2xl bg-gray-800 border border-gray-700 shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">New Conversation</h2>
              <button 
                onClick={onClose}
                className="p-1 rounded-full hover:bg-gray-700 transition-colors"
              >
                <X size={20} className="text-gray-400 hover:text-white" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4">
              <div className="space-y-4">
                {/* Recipient Public Key Input */}
                <div>
                  <label htmlFor="recipientKey" className="block text-sm font-medium text-gray-300 mb-1">
                    Recipient Public Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="recipientKey"
                    type="text"
                    placeholder="e.g. abcd-1234-efgh-5678"
                    value={recipientKey}
                    onChange={(e) => setRecipientKey(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                {/* Alias Input */}
                <div>
                  <label htmlFor="alias" className="block text-sm font-medium text-gray-300 mb-1">
                    Alias (Optional)
                  </label>
                  <div className="relative">
                    <input
                      id="alias"
                      type="text"
                      placeholder="e.g. Claire"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <UserCheck size={18} className="absolute left-3 top-2.5 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Give this contact a nickname for easier identification
                  </p>
                </div>
                
                {/* Initial Message Input */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">
                    First Message (Optional)
                  </label>
                  <textarea
                    id="message"
                    placeholder="Type your first message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
                
                {/* Error Message */}
                {error && (
                  <p className="text-red-500 text-sm">{error}</p>
                )}
                
                {/* Submit Button */}
                <div className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Send size={18} className="mr-2" />
                    Start Conversation
                  </motion.button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
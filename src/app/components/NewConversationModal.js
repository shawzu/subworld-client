'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, UserCheck, Users, Plus, Check, Search, ArrowLeft, Edit } from 'lucide-react'
import contactStore from '../../utils/ContactStore'

export default function NewConversationModal({ isOpen, onClose, onSubmit, onCreateGroup }) {
  // Mode can be 'message' or 'group'
  const [mode, setMode] = useState('message')
  
  // Direct message states
  const [recipientKey, setRecipientKey] = useState('')
  const [alias, setAlias] = useState('')
  const [message, setMessage] = useState('')
  
  // Group creation states
  const [groupName, setGroupName] = useState('')
  const [description, setDescription] = useState('')
  const [searchKey, setSearchKey] = useState('')
  const [selectedContacts, setSelectedContacts] = useState([])
  const [step, setStep] = useState(1) // 1: Group Info, 2: Add Members
  
  // Common states
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset the form when modal closes
  const handleClose = () => {
    // Reset direct message fields
    setRecipientKey('')
    setAlias('')
    setMessage('')
    
    // Reset group fields
    setGroupName('')
    setDescription('')
    setSearchKey('')
    setSelectedContacts([])
    setStep(1)
    
    // Reset common fields
    setError('')
    setMode('message')
    
    onClose()
  }

  // Direct message submission
  const handleSubmitDirectMessage = (e) => {
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
    
    setIsSubmitting(true)
    
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
    setIsSubmitting(false)
  }

  // Move to next step in group creation
  const handleNextStepGroup = (e) => {
    e.preventDefault()
    
    if (!groupName.trim()) {
      setError('Group name is required')
      return
    }
    
    setError('')
    setStep(2)
  }

  // Contact selection handling for group
  const toggleContactSelection = (contact) => {
    if (selectedContacts.includes(contact.publicKey)) {
      setSelectedContacts(selectedContacts.filter(key => key !== contact.publicKey))
    } else {
      setSelectedContacts([...selectedContacts, contact.publicKey])
    }
  }

  // Final group creation submission
  const handleSubmitGroup = async (e) => {
    e.preventDefault()
    
    if (!groupName.trim()) {
      setError('Group name is required')
      return
    }
    
    if (selectedContacts.length === 0) {
      setError('Please select at least one contact for the group')
      return
    }
    
    try {
      setIsSubmitting(true)
      
      // Call the provided onCreateGroup handler
      await onCreateGroup({
        name: groupName.trim(),
        description: description.trim(),
        members: selectedContacts
      })
      
      // Reset and close
      handleClose()
    } catch (error) {
      setError('Failed to create group. Please try again.')
      console.error('Create group error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get contacts from contact store
  const getContacts = () => {
    if (!contactStore) return []
    
    const contacts = contactStore.getAllContacts()
    
    // Filter by search term if any
    if (searchKey.trim()) {
      return contacts.filter(c => 
        c.alias?.toLowerCase().includes(searchKey.toLowerCase()) || 
        c.publicKey.toLowerCase().includes(searchKey.toLowerCase())
      )
    }
    
    return contacts
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-md rounded-2xl bg-gray-800 border border-gray-700 shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white flex items-center">
                {mode === 'message' ? (
                  <>
                    <UserCheck size={20} className="mr-2 text-blue-400" />
                    New Conversation
                  </>
                ) : (
                  <>
                    <Users size={20} className="mr-2 text-blue-400" />
                    {step === 1 ? 'Create New Group' : 'Add Group Members'}
                  </>
                )}
              </h2>
              <button 
                onClick={handleClose}
                className="p-1 rounded-full hover:bg-gray-700 transition-colors"
              >
                <X size={20} className="text-gray-400 hover:text-white" />
              </button>
            </div>
            
            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-2 p-4 pb-0">
              <button
                className={`py-2 px-4 rounded-lg flex items-center justify-center ${
                  mode === 'message' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                onClick={() => {
                  setMode('message')
                  setError('')
                }}
              >
                <UserCheck size={18} className="mr-2" />
                Direct Message
              </button>
              <button
                className={`py-2 px-4 rounded-lg flex items-center justify-center ${
                  mode === 'group' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                onClick={() => {
                  setMode('group')
                  setError('')
                  setStep(1) // Reset to first step when switching to group
                }}
              >
                <Users size={18} className="mr-2" />
                Group Chat
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}
              
              {/* Direct Message Form */}
              {mode === 'message' && (
                <form onSubmit={handleSubmitDirectMessage} className="space-y-4">
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
                  
                  <div className="pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-colors disabled:bg-blue-800 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <Send size={18} className="mr-2" />
                          Start Conversation
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              )}
              
              {/* Group Creation Form - Step 1: Group Info */}
              {mode === 'group' && step === 1 && (
                <form onSubmit={handleNextStepGroup} className="space-y-4">
                  <div>
                    <label htmlFor="groupName" className="block text-sm font-medium text-gray-300 mb-1">
                      Group Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="groupName"
                        type="text"
                        placeholder="e.g. Team Alpha"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <Edit size={18} className="absolute left-3 top-2.5 text-gray-400" />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      id="description"
                      placeholder="What's this group about?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-colors"
                    >
                      Next: Add Members
                    </motion.button>
                  </div>
                </form>
              )}
              
              {/* Group Creation Form - Step 2: Add Members */}
              {mode === 'group' && step === 2 && (
                <form onSubmit={handleSubmitGroup} className="space-y-4">
                  <div className="mb-4">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search contacts..."
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  {/* Selected Contacts */}
                  {selectedContacts.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Selected ({selectedContacts.length})
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {selectedContacts.map(contactKey => {
                          const contact = contactStore?.getContact(contactKey)
                          return (
                            <div 
                              key={contactKey} 
                              className="px-3 py-1 bg-blue-500/30 text-blue-300 rounded-full text-sm flex items-center"
                            >
                              {contact?.alias || contactKey.substring(0, 12) + '...'}
                              <button 
                                type="button"
                                onClick={() => toggleContactSelection({ publicKey: contactKey })}
                                className="ml-2 hover:text-white"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* Contacts List */}
                  <div className="max-h-60 overflow-y-auto">
                    <div className="space-y-2">
                      {getContacts().length === 0 ? (
                        <div className="text-center text-gray-500 p-4">
                          No contacts found
                        </div>
                      ) : (
                        getContacts().map(contact => (
                          <div 
                            key={contact.publicKey}
                            onClick={() => toggleContactSelection(contact)}
                            className={`p-3 rounded-lg flex items-center justify-between cursor-pointer ${
                              selectedContacts.includes(contact.publicKey) 
                                ? 'bg-blue-600/20 border border-blue-500/50' 
                                : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center mr-3">
                                {contact.alias ? contact.alias[0].toUpperCase() : contact.publicKey[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium">{contact.alias || contact.publicKey.substring(0, 12) + '...'}</div>
                                <div className="text-xs text-gray-400 truncate max-w-[200px]">{contact.publicKey}</div>
                              </div>
                            </div>
                            
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              selectedContacts.includes(contact.publicKey) 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-600'
                            }`}>
                              {selectedContacts.includes(contact.publicKey) && (
                                <Check size={14} />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      <ArrowLeft size={16} className="inline mr-2" />
                      Back
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={isSubmitting || selectedContacts.length === 0}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-colors disabled:bg-blue-800 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        <>
                          <Users size={18} className="mr-2" />
                          Create Group
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
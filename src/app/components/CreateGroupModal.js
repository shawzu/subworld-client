'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, Plus, Check, Search } from 'lucide-react'
import contactStore from '../../utils/ContactStore'

export default function CreateGroupModal({ isOpen, onClose, onSubmit }) {
  const [groupName, setGroupName] = useState('')
  const [description, setDescription] = useState('')
  const [searchKey, setSearchKey] = useState('')
  const [selectedContacts, setSelectedContacts] = useState([])
  const [step, setStep] = useState(1) // 1: Group Info, 2: Add Members
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  // Reset the form when modal closes
  const handleClose = () => {
    setGroupName('')
    setDescription('')
    setSearchKey('')
    setSelectedContacts([])
    setStep(1)
    setError('')
    onClose()
  }

  // First step form submission
  const handleNextStep = (e) => {
    e.preventDefault()
    
    if (!groupName.trim()) {
      setError('Group name is required')
      return
    }
    
    setError('')
    setStep(2)
  }

  // Contact selection handling
  const toggleContactSelection = (contact) => {
    if (selectedContacts.includes(contact.publicKey)) {
      setSelectedContacts(selectedContacts.filter(key => key !== contact.publicKey))
    } else {
      setSelectedContacts([...selectedContacts, contact.publicKey])
    }
  }

  // Final form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!groupName.trim()) {
      setError('Group name is required')
      return
    }
    
    try {
      setCreating(true)
      
      await onSubmit({
        name: groupName.trim(),
        description: description.trim(),
        members: selectedContacts
      })
      
      handleClose()
    } catch (error) {
      setError('Failed to create group. Please try again.')
      console.error('Create group error:', error)
    } finally {
      setCreating(false)
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
                <Users size={20} className="mr-2 text-blue-400" />
                {step === 1 ? 'Create New Group' : 'Add Group Members'}
              </h2>
              <button 
                onClick={handleClose}
                className="p-1 rounded-full hover:bg-gray-700 transition-colors"
              >
                <X size={20} className="text-gray-400 hover:text-white" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}
              
              {step === 1 ? (
                // Step 1: Group Info
                <form onSubmit={handleNextStep} className="space-y-4">
                  <div>
                    <label htmlFor="groupName" className="block text-sm font-medium text-gray-300 mb-1">
                      Group Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="groupName"
                      type="text"
                      placeholder="e.g. Team Alpha"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
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
              ) : (
                // Step 2: Add Members
                <form onSubmit={handleSubmit} className="space-y-4">
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
                      Back
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={creating}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-colors disabled:bg-blue-800 disabled:cursor-not-allowed"
                    >
                      {creating ? (
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
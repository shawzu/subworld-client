'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import {
  Menu, X, Send, MessageSquare, Users, User, Settings,
  Plus, ArrowLeft, Search, Upload, QrCode, Key, Trash2, Clock,
  RefreshCw, AlertCircle
} from 'lucide-react'
import ReactQRCode from 'react-qr-code'
import { motion } from 'framer-motion'
import { KeyGuard } from '../components/KeyGuard'
import NewConversationModal from '../components/NewConversationModal'
import subworldNetwork from '../../utils/SubworldNetworkService'
import contactStore from '../../utils/ContactStore'
import conversationManager from '../../utils/ConversationManager'
import LocalKeyStorageManager from '../../utils/LocalKeyStorageManager'

export default function App() {
  const messagesEndRef = useRef(null)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('messages')
  const [showConversationList, setShowConversationList] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [currentMessages, setCurrentMessages] = useState([])
  const [publicKey, setPublicKey] = useState('')
  const [autoDeletionTime, setAutoDeletionTime] = useState(24) // in hours
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [showNewConversationModal, setShowNewConversationModal] = useState(false)
  const [conversations, setConversations] = useState([])
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Scroll to bottom of message list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Initialize app data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsLoading(true);

        // Get user's key pair
        const keyPair = LocalKeyStorageManager.getKeyPair();
        if (!keyPair) {
          setErrorMessage('No keys found. Please create or import an account.');
          setIsLoading(false);
          return;
        }

        // Set public key for display
        setPublicKey(keyPair.publicKeyDisplay);

        // Check if services exist
        if (typeof subworldNetwork === 'undefined' || !subworldNetwork) {
          console.error('SubworldNetworkService is undefined');
          setErrorMessage('Network services not available. Loading basic functionality.');

          // Load just the conversations without network sync
          const mockConversations = []; // Use your existing mock data here if available
          setConversations(mockConversations);
          setIsLoading(false);
          return;
        }

        // Initialize network service
        await subworldNetwork.initialize();

        // Initialize other services (with checks)
        if (conversationManager) {
          await conversationManager.initialize(keyPair.publicKeyDisplay);
          loadConversations();
          await fetchNewMessages();
        } else {
          setConversations([]); // Empty fallback
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing app:', error);
        setErrorMessage('Failed to initialize app. Please try again later.');
        setIsLoading(false);
      }
    };

    initializeApp()

    // Clean up on unmount
    return () => {
      conversationManager.cleanup()
    }
  }, [])

  // Load conversations from the conversation manager
  const loadConversations = () => {
    const conversationPreviews = conversationManager.getConversationPreviews()
    setConversations(conversationPreviews)
  }

  // Fetch new messages from the network
  const fetchNewMessages = async () => {
    try {
      setRefreshing(true)
      const newMessageCount = await conversationManager.fetchNewMessages()

      // Update conversation list
      loadConversations()

      // Update current conversation messages if needed
      if (selectedConversation) {
        const conversation = conversationManager.getConversation(selectedConversation)
        if (conversation) {
          setCurrentMessages(conversation.messages)
        }
      }

      // Flag if there are new messages
      if (newMessageCount > 0) {
        setHasNewMessages(true)
        setTimeout(() => setHasNewMessages(false), 3000)
      }

      setRefreshing(false)
    } catch (error) {
      console.error('Error fetching messages:', error)
      setRefreshing(false)
    }
  }

  // Handle screen resizing
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setShowConversationList(true)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Update current messages when selected conversation changes
  useEffect(() => {
    if (selectedConversation) {
      const conversation = conversationManager.getConversation(selectedConversation)
      if (conversation) {
        setCurrentMessages(conversation.messages.sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        ))
        conversationManager.markConversationAsRead(selectedConversation)
        loadConversations() // Refresh conversation list to update unread counts
      } else {
        setCurrentMessages([])
      }
    } else {
      setCurrentMessages([])
    }
  }, [selectedConversation])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [currentMessages])

  // Send a message
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!message.trim() || !selectedConversation) return

    try {
      // Send the message using conversation manager
      await conversationManager.sendMessage(selectedConversation, message.trim())

      // Reload conversation data
      const conversation = conversationManager.getConversation(selectedConversation)
      if (conversation) {
        setCurrentMessages(conversation.messages.sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        ))
      }

      // Refresh the conversation list
      loadConversations()

      // Clear the input
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message. Please try again.')
    }
  }

  // Select a conversation
  const handleConversationClick = (contactPublicKey) => {
    setSelectedConversation(contactPublicKey)
    setActiveTab('messages')
    if (isMobile) {
      setShowConversationList(false)
    }
  }

  // Go back to conversation list (mobile)
  const handleBackToList = () => {
    setShowConversationList(true)
  }

  // Change active tab
  const handleTabClick = (tab) => {
    setActiveTab(tab)
    if (tab !== 'messages') {
      setSelectedConversation(null)
    }
    if (isMobile) {
      setShowConversationList(tab === 'messages')
    }
  }

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Handle file upload logic here
      console.log('File uploaded:', file.name)
      // For future implementation: encrypt and send file
      alert('File sharing will be implemented in a future update.')
    }
  }

  // Handle creating a new conversation
  const handleNewConversation = () => {
    setShowNewConversationModal(true)
  }

  // Handle submitting the new conversation form
  const handleNewConversationSubmit = async (data) => {
    try {
      // Create a new conversation
      conversationManager.createOrUpdateConversation(data.recipientKey, data.alias)

      // Save contact info
      contactStore.saveContact(data.recipientKey, data.alias)

      // Close the modal
      setShowNewConversationModal(false)

      // Switch to the new conversation
      setSelectedConversation(data.recipientKey)

      // Send initial message if provided
      if (data.initialMessage) {
        await conversationManager.sendMessage(data.recipientKey, data.initialMessage)

        // Reload conversation data
        const conversation = conversationManager.getConversation(data.recipientKey)
        if (conversation) {
          setCurrentMessages(conversation.messages.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          ))
        }
      }

      // Refresh the conversation list
      loadConversations()

      // Switch to mobile view if needed
      if (isMobile) {
        setShowConversationList(false)
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
      alert('Failed to create conversation. Please try again.')
    }
  }

  // Get the name to display for a contact
  const getContactName = (publicKeyStr) => {
    const contact = contactStore.getContact(publicKeyStr)
    return contact?.alias || publicKeyStr
  }

  // Format timestamp for display
  const formatMessageTime = (timestamp) => {
    const messageDate = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      // Today - show time
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      // Yesterday
      return 'Yesterday'
    } else if (diffDays < 7) {
      // Within a week - show day name
      return messageDate.toLocaleDateString([], { weekday: 'long' })
    } else {
      // Older - show date
      return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <KeyGuard>
      <div className="h-screen bg-[#0E0F14] text-white flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar (conversations list) */}
        <div className={`w-full md:w-1/4 border-r border-gray-700 flex flex-col h-full md:h-full overflow-hidden ${(!showConversationList || activeTab !== 'messages') && 'hidden md:flex'}`}>
          <div className="p-6 flex items-center justify-between border-b border-gray-800">
            <Image src="/Planet-logo-blue.png" alt="Logo" width={50} height={50} />
            <div className="hidden md:flex space-x-4">
              <button onClick={() => handleTabClick('profile')} className="hover:text-gray-300">
                <User size={20} />
              </button>
              <button onClick={() => handleTabClick('settings')} className="hover:text-gray-300">
                <Settings size={20} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={handleNewConversation}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition duration-300"
            >
              <Plus size={20} className="mr-2" />
              New Conversation
            </button>

            <button
              onClick={fetchNewMessages}
              className={`p-2 rounded-full hover:bg-gray-800 transition-colors ${refreshing ? 'animate-spin text-blue-400' : ''}`}
              disabled={refreshing}
            >
              <RefreshCw size={20} />
            </button>
          </div>

          {/* New Messages Notification */}
          {hasNewMessages && (
            <div className="mx-6 mb-4 px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg flex items-center animate-pulse">
              <AlertCircle size={16} className="mr-2" />
              New messages received
            </div>
          )}

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <p className="ml-3 text-gray-400">Loading conversations...</p>
            </div>
          ) : errorMessage ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-red-500 text-center px-6">
                <AlertCircle size={24} className="mx-auto mb-2" />
                {errorMessage}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
              {conversations.length === 0 ? (
                <div className="text-center text-gray-500 p-6">
                  <p className="mb-2">No conversations yet</p>
                  <p className="text-sm">Start a new conversation to begin messaging</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <motion.div
                    key={conv.contactPublicKey}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleConversationClick(conv.contactPublicKey)}
                    className={`p-5 hover:bg-gray-800 rounded-lg mx-4 my-3 cursor-pointer transition duration-300 ${selectedConversation === conv.contactPublicKey ? 'bg-gray-800' : ''}`}
                  >
                    <div className="flex items-center">
                      <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center mr-4 flex-shrink-0">
                        {conv.contactName[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-lg truncate flex items-center">
                          {conv.contactName}
                          {conv.unreadCount > 0 && (
                            <span className="ml-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400 flex justify-between mt-1">
                          <span className="truncate mr-2 flex-1">{conv.lastMessage}</span>
                          <span className="whitespace-nowrap flex-shrink-0">
                            {formatMessageTime(conv.lastMessageTime)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className={`flex-1 flex flex-col md:h-full h-[calc(100%-56px)] relative ${showConversationList && activeTab === 'messages' && 'hidden md:flex'}`}>
          <div className="flex-1 overflow-y-auto p-6 pb-28 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
            {activeTab === 'messages' && selectedConversation && (
              <>
                <div className="sticky top-0 bg-gradient-to-b from-gray-900 to-gray-800 p-4 flex items-center justify-between rounded-lg mb-6 border border-gray-600 shadow-lg backdrop-blur-sm">
                  <button
                    onClick={handleBackToList}
                    className="mr-4 md:hidden text-gray-300 hover:text-white transition-colors duration-200"
                  >
                    <ArrowLeft size={24} />
                  </button>
                  <div className="flex-grow flex items-center justify-center">
                    <User size={20} className="mr-2 text-blue-400" />
                    <div className="font-semibold text-lg text-white tracking-wide">
                      {getContactName(selectedConversation)}
                    </div>
                  </div>
                  <div className="w-8 md:hidden" /> {/* Spacer for alignment */}
                </div>

                <div>
                  {currentMessages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-12">
                      <p className="mb-2">No messages yet</p>
                      <p className="text-sm">Send a message to start the conversation</p>
                    </div>
                  ) : (
                    currentMessages.map((msg) => (
                      <div key={msg.id} className={`mb-6 ${msg.sender === publicKey ? 'text-right' : ''}`}>
                        <div className={`inline-block p-3 px-5 rounded-2xl ${msg.sender === publicKey ? 'bg-blue-600' : 'bg-gray-800'}`}>
                          {msg.content}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">{formatMessageTime(msg.timestamp)}</div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="absolute bottom-0 left-0 right-0 p-6 md:mb-0 mb-16">
                  <div className="flex items-center bg-gray-800 rounded-lg overflow-hidden">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="flex-1 bg-transparent text-white px-5 py-4 focus:outline-none"
                      placeholder="Type a message..."
                    />
                    <label htmlFor="file-upload" className="px-5 py-4 hover:bg-gray-700 cursor-pointer transition duration-300">
                      <Upload size={20} />
                      <input
                        id="file-upload"
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 flex items-center justify-center transition duration-300"
                      disabled={!message.trim()}
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-md mx-auto">
                  <div className="flex items-center justify-center mb-8">
                    <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center mr-4 text-3xl font-bold">
                      {publicKey && publicKey[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Your Profile</h2>
                      <p className="text-gray-400">End-to-end encrypted</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 backdrop-blur-sm shadow-lg">
                      <h3 className="text-lg font-semibold mb-4 text-blue-400 flex items-center">
                        <Key size={18} className="mr-2" />
                        Public Key
                      </h3>
                      <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                        <p className="text-sm break-all font-mono">{publicKey}</p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicKey)
                          alert('Public key copied to clipboard!')
                        }}
                        className="mt-3 w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy to Clipboard
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 backdrop-blur-sm shadow-lg">
                      <h3 className="text-lg font-semibold mb-4 text-blue-400 flex items-center">
                        <QrCode size={18} className="mr-2" />
                        QR Code
                      </h3>
                      <div className="bg-white p-6 rounded-lg flex items-center justify-center">
                        <ReactQRCode
                          value={publicKey}
                          size={200}
                          bgColor="#FFFFFF"
                          fgColor="#000000"
                          level="H"
                        />
                      </div>
                      <p className="mt-3 text-sm text-center text-gray-400">
                        Share this QR code to let others add you to their contacts
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
{activeTab === 'settings' && (
  <div className="flex-1 p-6 overflow-y-auto">
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">Settings</h2>
      
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 backdrop-blur-sm shadow-lg">
          <h3 className="text-lg font-semibold mb-4 text-blue-400">Security</h3>
          
          <div className="space-y-4">
            <button 
              className="w-full flex items-center justify-between p-4 bg-gray-900 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-700"
              onClick={() => {
                // Copy private key to clipboard
                const keyPair = LocalKeyStorageManager.getKeyPair()
                navigator.clipboard.writeText(keyPair.privateKey)
                alert('Private key copied to clipboard. Store it securely!')
              }}
            >
              <div className="flex items-center">
                <Key size={18} className="text-blue-400 mr-3" />
                <span>Export Private Key</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
            
            <button 
              className="w-full flex items-center justify-between p-4 bg-gray-900 hover:bg-red-900/40 text-white rounded-lg transition-colors border border-gray-700"
              onClick={() => {
                if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                  LocalKeyStorageManager.deleteKeyPair()
                  window.location.href = '/'
                }
              }}
            >
              <div className="flex items-center">
                <Trash2 size={18} className="text-red-400 mr-3" />
                <span>Delete Account</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 backdrop-blur-sm shadow-lg">
          <h3 className="text-lg font-semibold mb-4 text-blue-400 flex items-center">
            <Clock size={18} className="mr-2" />
            Message Retention
          </h3>
          
          <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Auto-delete messages after
            </label>
            <div className="flex items-center">
              <input
                type="range"
                min="1"
                max="168"
                value={autoDeletionTime}
                onChange={(e) => setAutoDeletionTime(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mr-3"
              />
              <div className="flex items-center bg-gray-700 px-3 py-1 rounded-lg">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={autoDeletionTime}
                  onChange={(e) => setAutoDeletionTime(parseInt(e.target.value))}
                  className="w-16 bg-transparent text-white text-center focus:outline-none"
                />
                <span className="text-gray-400 ml-1">hours</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {autoDeletionTime < 24 
                ? `Messages will be deleted after ${autoDeletionTime} hour${autoDeletionTime === 1 ? '' : 's'}`
                : `Messages will be deleted after ${Math.floor(autoDeletionTime / 24)} day${Math.floor(autoDeletionTime / 24) === 1 ? '' : 's'} and ${autoDeletionTime % 24} hour${autoDeletionTime % 24 === 1 ? '' : 's'}`
              }
            </p>
          </div>
        </div>
        
        <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-6 backdrop-blur-sm shadow-lg">
          <h3 className="text-lg font-semibold mb-4 text-blue-400">App Information</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Version</span>
              <span className="text-white">1.0.0</span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Built with</span>
              <span className="text-white">Next.js & Subworld</span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Encryption</span>
              <span className="text-white">End-to-End</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
          </div>
        </div>

        {/* Bottom Navigation */}
        <motion.nav
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around items-center h-16 px-4 bg-[#0E0F14] border-t border-gray-700"
        >
          <button
            onClick={() => handleTabClick('messages')}
            className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'messages' ? 'text-white' : 'text-gray-500'}`}
          >
            <MessageSquare size={20} />
            <span className="text-xs mt-1">Messages</span>
          </button>

          <button
            onClick={() => handleTabClick('profile')}
            className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'profile' ? 'text-white' : 'text-gray-500'}`}
          >
            <User size={20} />
            <span className="text-xs mt-1">Profile</span>
          </button>
          <button
            onClick={() => handleTabClick('settings')}
            className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'settings' ? 'text-white' : 'text-gray-500'}`}
          >
            <Settings size={20} />
            <span className="text-xs mt-1">Settings</span>
          </button>
        </motion.nav>

        {/* New Conversation Modal */}
        <NewConversationModal
          isOpen={showNewConversationModal}
          onClose={() => setShowNewConversationModal(false)}
          onSubmit={handleNewConversationSubmit}
        />
      </div>
    </KeyGuard>
  )
}
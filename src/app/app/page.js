'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Menu, X, Send, MessageSquare, Users, User, Settings, Plus, ArrowLeft, Search } from 'lucide-react'
import { Upload, QrCode, Key, Trash2, Clock } from 'lucide-react'
import ReactQRCode from 'react-qr-code';
import { motion } from 'framer-motion'

const mockConversations = [
  {
    id: 1, name: 'Alice', lastMessage: 'Hey, how are you?', timestamp: '10:30 AM', messages: [
      { id: 1, sender: 'Alice', content: 'Hey, how are you?', timestamp: '10:30 AM' },
      { id: 2, sender: 'You', content: "I'm good, thanks! How about you?", timestamp: '10:31 AM' },
      { id: 3, sender: 'Alice', content: 'Doing great! Any plans for the weekend?', timestamp: '10:32 AM' },
    ]
  },
  {
    id: 2, name: 'Bob', lastMessage: 'Did you see the news?', timestamp: 'Yesterday', messages: [
      { id: 1, sender: 'Bob', content: 'Did you see the news?', timestamp: 'Yesterday' },
      { id: 2, sender: 'You', content: 'Not yet, what happened?', timestamp: 'Yesterday' },
    ]
  },
  {
    id: 3, name: 'Charlie', lastMessage: "Let's meet up soon!", timestamp: 'Monday', messages: [
      { id: 1, sender: 'Charlie', content: "Let's meet up soon!", timestamp: 'Monday' },
      { id: 2, sender: 'You', content: 'Sure, when works for you?', timestamp: 'Monday' },
    ]
  },
]

export default function App() {
  const messagesEndRef = useRef(null)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('messages')
  const [showConversationList, setShowConversationList] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [currentMessages, setCurrentMessages] = useState([])
  const [publicKey, setPublicKey] = useState('abcdef1234567890')
  const [contacts, setContacts] = useState([
    { id: 1, name: 'Alice', publicKey: 'alicepublickey123' },
    { id: 2, name: 'Bob', publicKey: 'bobpublickey456' },
    { id: 3, name: 'Charlie', publicKey: 'charliepublickey789' },
  ])
  const [autoDeletionTime, setAutoDeletionTime] = useState(24) // in hours

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    const messages = mockConversations.find(c => c.id === selectedConversation)?.messages || []
    setCurrentMessages(messages)
  }, [selectedConversation])

  useEffect(() => {
    scrollToBottom()
  }, [selectedConversation, currentMessages])

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

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!message.trim()) return

    const newMessage = {
      id: Date.now(),
      sender: 'You',
      content: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const updatedConversations = mockConversations.map(conv => {
      if (conv.id === selectedConversation) {
        const updatedMessages = [...conv.messages, newMessage]
        setCurrentMessages(updatedMessages)
        return {
          ...conv,
          messages: updatedMessages,
          lastMessage: message
        }
      }
      return conv
    })

    mockConversations.splice(0, mockConversations.length, ...updatedConversations)
    setMessage('')
  }

  const handleConversationClick = (convId) => {
    setSelectedConversation(convId)
    setActiveTab('messages')
    if (isMobile) {
      setShowConversationList(false)
    }
  }

  const getCurrentMessages = () => {
    const conversation = mockConversations.find(c => c.id === selectedConversation)
    return conversation?.messages || []
  }

  const handleBackToList = () => {
    setShowConversationList(true)
  }

  const handleTabClick = (tab) => {
    setActiveTab(tab)
    if (tab !== 'messages') {
      setSelectedConversation(null)
    }
    if (isMobile) {
      setShowConversationList(tab === 'messages')
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Handle file upload logic here
      console.log('File uploaded:', file.name)
    }
  }

  return (
    <div className="h-screen bg-[#0E0F14]  text-white flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar (messages list) */}
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

        <button onClick={() => { }} className="mx-6 my-6 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition duration-300">
          <Plus size={20} className="mr-2" />
          Start a New Conversation
        </button>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
          {mockConversations.map((conv) => (
            <motion.div
              key={conv.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleConversationClick(conv.id)}
              className={`p-5 hover:bg-gray-800 rounded-lg mx-4 my-3 cursor-pointer transition duration-300 ${selectedConversation === conv.id ? 'bg-gray-800' : ''}`}
            >
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center mr-4 flex-shrink-0">
                  {conv.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg truncate">{conv.name}</div>
                  <div className="text-sm text-gray-400 flex justify-between mt-1">
                    <span className="truncate mr-2 flex-1">{conv.lastMessage}</span>
                    <span className="whitespace-nowrap flex-shrink-0">{conv.timestamp}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
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
                    {mockConversations.find((c) => c.id === selectedConversation)?.name}
                  </div>
                </div>
                <div className="w-8 md:hidden" /> {/* Spacer for alignment */}
              </div>

              <div>
                {currentMessages.map((msg) => (
                  <div key={msg.id} className={`mb-6 ${msg.sender === 'You' ? 'text-right' : ''}`}>
                    <div className={`inline-block p-3 px-5 rounded-2xl ${msg.sender === 'You' ? 'bg-blue-600' : 'bg-gray-800'}`}>
                      {msg.content}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">{msg.timestamp}</div>
                  </div>
                ))}
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
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 flex items-center justify-center transition duration-300">
                    <Send size={20} />
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div
              className="flex-1 p-6 overflow-y-auto flex flex-col items-center w-full"
            >
              <div className="w-full max-w-md mt-0 ">
                <h2 className="text-3xl font-bold mb-8 text-center">Profile</h2>
                <div className="rounded-2xl border border-gray-700 bg-gray-900/90 p-6 shadow-lg backdrop-blur">

                  <div className="mb-6">
                    <label className="block text-sm font-medium mb-2">Public Key</label>
                    <div className="bg-gray-700 p-4 rounded">
                      <p className="text-sm break-all">{publicKey}</p>
                    </div>
                  </div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4">QR Code</h3>
                    <div className="flex justify-center">
                      <ReactQRCode value={publicKey} size={200} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="flex-1 p-4 overflow-y-auto flex flex-col items-center w-full">
              <div className="w-full max-w-md mt-0 md:mt-4">
                <h2 className="text-3xl font-bold mb-6 text-center">Contacts</h2>
                <div className="mb-6">
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {contacts.map((contact) => (
                  <div key={contact.id} className="mb-4 p-4 rounded-2xl border border-gray-700 bg-gray-900/90 p-6 shadow-lg backdrop-blur">
                    <h3 className="text-lg font-semibold">{contact.name}</h3>
                    <p className="text-sm text-gray-400 break-all">{contact.publicKey}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (

            <div className="p-4 flex justify-center items-start min-h-full">
              <div className="w-full max-w-md">
                <h2 className="text-3xl font-bold mb-6 text-center">Settings</h2>
                <div className="rounded-2xl border border-gray-700 bg-gray-900/90 p-6 shadow-lg backdrop-blur">
                  <div className="mb-6">
                    <button className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded ">
                      <Key size={20} className="mr-2" />
                      Export Private Key
                    </button>
                  </div>
                  <div className="mb-6">
                    <button className="w-full flex items-center justify-center bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded ">
                      <Trash2 size={20} className="mr-2" />
                      Delete Account
                    </button>
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium mb-2">Auto-delete messages after</label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        value={autoDeletionTime}
                        onChange={(e) => setAutoDeletionTime(parseInt(e.target.value))}
                        className="w-20 bg-gray-700 text-white rounded px-3 py-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-300"
                      />
                      <span>hours</span>
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
        className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around items-center h-16   px-4"
      >
        <button
          onClick={() => handleTabClick('messages')}
          className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'messages' ? 'text-white' : 'text-gray-500'}`}
        >
          <MessageSquare size={20} />
          <span className="text-xs mt-1">Messages</span>
        </button>
        <button
          onClick={() => handleTabClick('contacts')}
          className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'contacts' ? 'text-white' : 'text-gray-500'}`}
        >
          <Users size={20} />
          <span className="text-xs mt-1">Contacts</span>
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
    </div>
  )
}


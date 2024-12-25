'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Menu, X, Send, MessageSquare, Users, User, Settings, Plus, ArrowLeft, Search } from 'lucide-react'

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

  return (
    <div className="h-screen bg-black text-white flex flex-col md:flex-row">
      <div className={`w-full md:w-1/4 border-r border-gray-800 flex flex-col h-[calc(100%-56px)] md:h-full ${(!showConversationList || activeTab !== 'messages') && 'hidden md:flex'}`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-800">
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

        <div className="p-4">

        </div>

        <button onClick={() => { }} className="mx-4 mb-4 p-2 bg-white text-black rounded-lg flex items-center justify-center">
          <Plus size={20} className="mr-2" />
          Start a New Conversation
        </button>

        <div className="flex-1 overflow-y-auto">
          {mockConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleConversationClick(conv.id)}
              className={`p-4 hover:bg-gray-900 cursor-pointer ${selectedConversation === conv.id ? 'bg-gray-800' : ''}`}
            >
              <div className="font-semibold">{conv.name}</div>
              <div className="text-sm text-gray-400 flex justify-between">
                <span className="truncate mr-2">{conv.lastMessage}</span>
                <span className="flex-shrink-0">{conv.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`flex-1 flex flex-col md:h-full h-[calc(100%-56px)] relative ${showConversationList && activeTab === 'messages' && 'hidden md:flex'}`}>
        {activeTab === 'messages' && selectedConversation ? (
          <>
            <div className="bg-gray-900 p-4 flex items-center">
              <button onClick={handleBackToList} className="mr-4 md:hidden">
                <ArrowLeft size={24} />
              </button>
              <div className="font-semibold">
                {mockConversations.find(c => c.id === selectedConversation)?.name}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-24">
              {currentMessages.map((msg) => (
                <div key={msg.id} className={`mb-4 ${msg.sender === 'You' ? 'text-right' : ''}`}>
                  <div className={`inline-block p-2 px-4 rounded-2xl ${msg.sender === 'You' ? 'bg-blue-600' : 'bg-gray-800'}`}>
                    {msg.content}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{msg.timestamp}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="absolute bottom-0 left-0 right-0 p-4 md:mb-0 mb-14 bg-black">
              <div className="flex">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1 bg-gray-800 text-white rounded-l-lg px-4 py-2 focus:outline-none"
                  placeholder="Type a message..."
                />
                <button type="submit" className="bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-r-lg flex items-center justify-center">
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 p-4 text-center">
            {activeTab === 'messages' ? 'Select a conversation to start chatting' : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} content goes here`}
          </div>
        )}
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around items-center h-14 mb-2">
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
      </nav>
    </div>
  )
}
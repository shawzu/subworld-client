'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Menu, X, Send, MessageSquare, Users, User, Settings, Plus, ArrowLeft, Search } from 'lucide-react'

// Mock data for conversations
const mockConversations = [
  { id: 1, name: 'Alice', lastMessage: 'Hey, how are you?', timestamp: '10:30 AM' },
  { id: 2, name: 'Bob', lastMessage: 'Did you see the news?', timestamp: 'Yesterday' },
  { id: 3, name: 'Charlie', lastMessage: 'Let\'s meet up soon!', timestamp: 'Monday' },
]

// Mock data for messages
const mockMessages = [
  { id: 1, sender: 'Alice', content: 'Hey, how are you?', timestamp: '10:30 AM' },
  { id: 2, sender: 'You', content: 'I\'m good, thanks! How about you?', timestamp: '10:31 AM' },
  { id: 3, sender: 'Alice', content: 'Doing great! Any plans for the weekend?', timestamp: '10:32 AM' },
]

export default function App() {
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('messages')
  const [showConversationList, setShowConversationList] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const handleSendMessage = (e) => {
    e.preventDefault()
    // Here you would typically send the message to your backend
    console.log('Sending message:', message)
    setMessage('')
  }

  const startNewConversation = () => {
    // Logic to start a new conversation
    console.log('Starting a new conversation')
  }

  const handleConversationClick = (convId) => {
    setSelectedConversation(convId)
    if (window.innerWidth < 768) { // mobile view
      setShowConversationList(false)
    }
  }

  const handleBackToList = () => {
    setShowConversationList(true)
    setSelectedConversation(null)
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className={`w-full md:w-1/4 border-r border-gray-800 flex flex-col h-[calc(100%-56px)] md:h-full ${!showConversationList && 'hidden md:flex'}`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-800">
          <Image 
            src="/Planet-logo-blue.png" 
            alt="Logo" 
            width={50} 
            height={50} 
          />
          {/* Web/PC Navigation */}
          <div className="hidden md:flex space-x-4">
            <button onClick={() => setActiveTab('profile')} className="hover:text-gray-300">
              <User size={20} />
            </button>
            <button onClick={() => setActiveTab('settings')} className="hover:text-gray-300">
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-4">
          
        </div>

        {/* New Conversation Button */}
        <button
          onClick={startNewConversation}
          className="mx-4 mb-4 p-2 bg-white text-black rounded-lg flex items-center justify-center"
        >
          <Plus size={20} className="mr-2" />
          Start a New Conversation
        </button>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {mockConversations.map((conv) => (
            <div 
              key={conv.id} 
              className={`p-4 hover:bg-gray-900 cursor-pointer ${selectedConversation === conv.id ? 'bg-gray-800' : ''}`}
              onClick={() => handleConversationClick(conv.id)}
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

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col md:h-full h-[calc(100%-56px)] relative ${showConversationList && 'hidden md:flex'}`}>
        {activeTab === 'messages' && selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-gray-900 p-4 flex items-center">
              <button onClick={handleBackToList} className="mr-4 md:hidden">
                <ArrowLeft size={24} />
              </button>
              <div className="font-semibold">
                {mockConversations.find(c => c.id === selectedConversation)?.name}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 pb-24">
              {mockMessages.map((msg) => (
                <div key={msg.id} className={`mb-4 ${msg.sender === 'You' ? 'text-right' : ''}`}>
                  <div className={`inline-block p-2 rounded-lg ${msg.sender === 'You' ? 'bg-blue-600' : 'bg-gray-800'}`}>
                    {msg.content}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{msg.timestamp}</div>
                </div>
              ))}
            </div>

            {/* Message Input Form - Fixed at bottom for both mobile and desktop */}
            <form onSubmit={handleSendMessage} className="absolute bottom-0 left-0 right-0 p-4 bg-gray-900 md:mb-0 mb-14">
              <div className="flex">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1 bg-gray-800 text-white rounded-l-lg px-4 py-2 focus:outline-none"
                  placeholder="Type a message..."
                />
                <button
                  type="submit"
                  className="bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-r-lg flex items-center justify-center"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 p-4 text-center">
            {activeTab === 'messages' ? (
              'Select a conversation to start chatting'
            ) : (
              `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} content goes here`
            )}
          </div>
        )}
      </div>

      {/* Mobile Bottom Navbar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0  flex justify-around items-center h-14 mb-2">
        <button
          onClick={() => {
            setActiveTab('messages')
            setShowConversationList(true)
          }}
          className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'messages' ? 'text-white' : 'text-gray-500'}`}
        >
          <MessageSquare size={20} />
          <span className="text-xs mt-1">Messages</span>
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'contacts' ? 'text-white' : 'text-gray-500'}`}
        >
          <Users size={20} />
          <span className="text-xs mt-1">Contacts</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'profile' ? 'text-white' : 'text-gray-500'}`}
        >
          <User size={20} />
          <span className="text-xs mt-1">Profile</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center w-1/4 h-full ${activeTab === 'settings' ? 'text-white' : 'text-gray-500'}`}
        >
          <Settings size={20} />
          <span className="text-xs mt-1">Settings</span>
        </button>
      </nav>
    </div>
  )
}
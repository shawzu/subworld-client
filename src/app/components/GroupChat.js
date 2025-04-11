'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Send, ArrowLeft, Settings, UserPlus, FileText, Upload } from 'lucide-react'
import contactStore from '../../utils/ContactStore'
import conversationManager from '../../utils/ConversationManager'
import FileMessage from './FileMessage'

export default function GroupChat({ 
  group, 
  onBack, 
  formatMessageTime, 
  currentUserKey,
  onOpenGroupDetails
}) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  // Scroll to bottom of message list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Load messages when group changes
  useEffect(() => {
    if (!group || !conversationManager) return

    const loadMessages = async () => {
      setIsLoading(true)
      try {
        // Get existing messages
        const existingMessages = conversationManager.getGroupMessages(group.id)
        setMessages(existingMessages)

        // Fetch new messages from the network
        await conversationManager.fetchGroupMessages(group.id)
        
        // Update with fresh messages
        const updatedMessages = conversationManager.getGroupMessages(group.id)
        setMessages(updatedMessages)
      } catch (error) {
        console.error('Error loading group messages:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMessages()
  }, [group])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Get contact name for a user
  const getContactName = (publicKeyStr) => {
    if (!contactStore || publicKeyStr === currentUserKey) return publicKeyStr === currentUserKey ? 'You' : publicKeyStr

    const contact = contactStore.getContact(publicKeyStr)
    return contact?.alias || publicKeyStr
  }

  // Send a message
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!message.trim() || !group || !conversationManager) return

    try {
      setSending(true)
      const currentMessage = message.trim()
      setMessage('') // Clear input immediately

      // Send the message
      await conversationManager.sendGroupMessage(group.id, currentMessage)

      // Refresh messages
      const updatedMessages = conversationManager.getGroupMessages(group.id)
      setMessages(updatedMessages)
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Group Header */}
      <div className="sticky top-0 bg-gradient-to-b from-gray-900 to-gray-800 p-4 flex items-center justify-between rounded-lg mb-6 border border-gray-600 shadow-lg backdrop-blur-sm">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-4 text-gray-300 hover:text-white transition-colors duration-200"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-lg text-white tracking-wide">
              {group.name}
            </div>
            <div className="text-sm text-gray-400">
              {group.members?.length || 0} members
            </div>
          </div>
        </div>
        <button
          onClick={onOpenGroupDetails}
          className="p-2 rounded-full hover:bg-gray-700"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <p className="ml-3 text-gray-400">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-12">
            <p className="mb-2">No messages yet</p>
            <p className="text-sm">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`${msg.sender === currentUserKey ? 'text-right' : ''}`}>
              {msg.isFile ? (
                <FileMessage
                  message={msg}
                  formatMessageTime={formatMessageTime}
                  currentUserKey={currentUserKey}
                />
              ) : (
                <>
                  {msg.sender !== currentUserKey && (
                    <div className="text-xs text-gray-500 mb-1">
                      {getContactName(msg.sender)}
                    </div>
                  )}
                  <div className={`inline-block p-3 px-5 rounded-2xl ${
                    msg.sender === currentUserKey ? 'bg-blue-600' : 'bg-gray-800'
                  }`}>
                    {msg.content}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">{formatMessageTime(msg.timestamp)}</div>
                </>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="p-4 bg-gray-800/80 border-t border-gray-700">
        <div className="flex items-center bg-gray-700 rounded-lg overflow-hidden">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
            className="flex-1 bg-transparent text-white px-5 py-4 focus:outline-none"
            placeholder="Type a message..."
          />
          <label htmlFor="group-file-upload" className="px-5 py-4 hover:bg-gray-600 cursor-pointer transition duration-300">
            <Upload size={20} />
            <input
              id="group-file-upload"
              type="file"
              className="hidden"
            />
          </label>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 flex items-center justify-center transition duration-300 disabled:bg-blue-800 disabled:cursor-not-allowed"
            disabled={!message.trim() || sending}
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
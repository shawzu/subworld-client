'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Send, ArrowLeft, Settings } from 'lucide-react'
import contactStore from '../../utils/ContactStore'
import conversationManager from '../../utils/ConversationManager'
import { Upload } from 'lucide-react'

export default function GroupChat({
    group,
    onBack,
    formatMessageTime,
    currentUserKey,
    onOpenGroupDetails
}) {
    const messagesEndRef = useRef(null)
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [memberCount, setMemberCount] = useState(group?.members?.length || 0)

    // Scroll to bottom of message list
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    const loadGroupData = async () => {
      if (!group || !group.id) {
        setMessages([]);
        setIsLoading(false);
        return;
      }
    
      setIsLoading(true);
      try {
        // Initialize with empty array
        let existingMessages = [];
    
        // Try to get existing messages
        if (conversationManager) {
          try {
            const groupMsgs = conversationManager.getGroupMessages(group.id);
            if (Array.isArray(groupMsgs)) {
              existingMessages = groupMsgs;
            }
          } catch (err) {
            console.warn('Could not load existing group messages:', err);
          }
        }
    
        // Filter out duplicate messages
        const uniqueMessages = [];
        const seenIds = new Set();
    
        // Filter out duplicate messages by ID
        existingMessages.forEach(msg => {
          // Ensure each message has an ID
          const msgId = msg.id || `gen-${Date.now()}-${Math.random()}`;
          
          // If we haven't seen this ID before, add it
          if (!seenIds.has(msgId)) {
            msg.id = msgId; // Ensure ID is set
            seenIds.add(msgId);
            uniqueMessages.push(msg);
          }
        });
    
        // Set the filtered messages
        setMessages(uniqueMessages);
    
        // Try to fetch new messages
        if (conversationManager) {
          try {
            await conversationManager.fetchGroupMessages(group.id);
    
            // Update with fresh messages and filter duplicates again
            const freshMsgs = conversationManager.getGroupMessages(group.id);
            if (Array.isArray(freshMsgs)) {
              // Clear the previous sets for a fresh filtering
              const uniqueFreshMessages = [];
              const seenFreshIds = new Set();
    
              // Filter out duplicate messages by ID
              freshMsgs.forEach(msg => {
                // Ensure each message has an ID
                const msgId = msg.id || `gen-${Date.now()}-${Math.random()}`;
                
                // If we haven't seen this ID before, add it
                if (!seenFreshIds.has(msgId)) {
                  msg.id = msgId; // Ensure ID is set
                  seenFreshIds.add(msgId);
                  uniqueFreshMessages.push(msg);
                }
              });
    
              setMessages(uniqueFreshMessages);
            }
          } catch (fetchErr) {
            console.warn('Error fetching group messages:', fetchErr);
            // Keep using existing filtered messages
          }
        }
    
        // Mark the group as read when opened
        if (conversationManager && conversationManager.markGroupAsRead) {
          conversationManager.markGroupAsRead(group.id);
        }
        
        // Update member count
        setMemberCount(group.members?.length || 0);
        
      } catch (error) {
        console.error('Error in group message loading flow:', error);
        // Ensure we have at least an empty array
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Load messages and set up refresh listeners when group changes
    useEffect(() => {
      loadGroupData();
      
      // Set up event listener for group updates
      const handleGroupUpdated = (event) => {
        if (event.detail && event.detail.groupId === group?.id) {
          console.log('Group update detected:', event.detail);
          loadGroupData();
        } else if (event.type === 'conversationsUpdated') {
          // General conversation update - check if our group is affected
          setTimeout(() => loadGroupData(), 500);
        }
      };
      
      // Listen for both specific group updates and general conversation updates
      window.addEventListener('groupUpdated', handleGroupUpdated);
      window.addEventListener('conversationsUpdated', handleGroupUpdated);
      
      return () => {
        window.removeEventListener('groupUpdated', handleGroupUpdated);
        window.removeEventListener('conversationsUpdated', handleGroupUpdated);
      };
    }, [group]);

    // Refresh group data at regular intervals
    useEffect(() => {
      if (!group?.id) return;
      
      const refreshInterval = setInterval(() => {
        // Only refresh if we have a conversationManager and not currently loading
        if (conversationManager && !isLoading) {
          conversationManager.refreshGroup(group.id)
            .then(updatedGroup => {
              if (updatedGroup && updatedGroup.members?.length !== memberCount) {
                setMemberCount(updatedGroup.members?.length || 0);
              }
            })
            .catch(err => console.warn('Error refreshing group:', err));
        }
      }, 10000); // Check every 10 seconds
      
      return () => clearInterval(refreshInterval);
    }, [group, memberCount, isLoading]);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Get contact name for a user
    const getContactName = (publicKeyStr) => {
        if (!contactStore || publicKeyStr === currentUserKey) return publicKeyStr === currentUserKey ? 'You' : publicKeyStr

        const contact = contactStore.getContact(publicKeyStr)
        return contact?.alias || publicKeyStr
    }

    // Send a message
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim() || !group || !group.id || !conversationManager) return;

        try {
            setSending(true);
            const currentMessage = message.trim();
            setMessage(''); // Clear input immediately

            // Send the message
            await conversationManager.sendGroupMessage(group.id, currentMessage);

            // Refresh messages
            try {
                const updatedMessages = conversationManager.getGroupMessages(group.id);
                if (Array.isArray(updatedMessages)) {
                    setMessages(updatedMessages);
                }
            } catch (refreshErr) {
                console.warn('Error refreshing messages after send:', refreshErr);
                // Add the sent message locally as fallback
                const newMessage = {
                    id: `local-${Date.now()}`,
                    sender: currentUserKey,
                    content: currentMessage,
                    timestamp: new Date().toISOString()
                };
                setMessages(prev => [...(Array.isArray(prev) ? prev : []), newMessage]);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message. Please try again.');
        } finally {
            setSending(false);
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
                            {group?.name || 'Group Chat'}
                        </div>
                        <div className="text-sm text-gray-400">
                            {memberCount || 0} members
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
                ) : !Array.isArray(messages) || messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-12">
                        <p className="mb-2">No messages yet</p>
                        <p className="text-sm">Send a message to start the conversation</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={`${msg.id || `msg-${Date.now()}-${Math.random()}`}`}
                            className={`${msg.sender === currentUserKey ? 'text-right' : ''}`}
                        >
                            {msg.sender !== currentUserKey && (
                                <div className="text-xs text-gray-500 mb-1">
                                    {getContactName(msg.sender)}
                                </div>
                            )}
                            <div className={`inline-block p-3 px-5 rounded-2xl ${msg.sender === currentUserKey ? 'bg-blue-600' : 'bg-gray-800'}`}>
                                {msg.content}
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                {formatMessageTime ? formatMessageTime(msg.timestamp) : new Date(msg.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="absolute bottom-0 left-0 right-0 p-6 md:mb-0 mb-16">
                <div className="flex items-center bg-gray-800 rounded-lg overflow-hidden">
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="flex-1 bg-transparent text-white px-5 py-4 focus:outline-none"
                        placeholder="Type a message..."
                        disabled={sending}
                    />
                    <label htmlFor="group-file-upload" className="px-5 py-4 hover:bg-gray-700 cursor-pointer transition duration-300">
                        <Upload size={20} />
                        <input
                            id="group-file-upload"
                            type="file"
                            className="hidden"
                        // Add file handling when ready
                        />
                    </label>
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 flex items-center justify-center transition duration-300"
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
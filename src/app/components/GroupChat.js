'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Send, ArrowLeft, Settings, X } from 'lucide-react'
import { Upload } from 'lucide-react'
import contactStore from '../../utils/ContactStore'
import conversationManager from '../../utils/ConversationManager'
import GroupCallButton from './GroupCallButton'
import GroupFileMessage from './GroupFileMessage'
import { uploadGroupFile } from './GroupFileHandler'

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
    
    // File upload state
    const [selectedFile, setSelectedFile] = useState(null)
    const [showFilePreview, setShowFilePreview] = useState(false)
    const [uploadingFile, setUploadingFile] = useState(false)

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
        if (!group || !group.id) {
          setMessages([]);
          setIsLoading(false);
          return;
        }
      
        setIsLoading(true);
        const loadData = async () => {
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
        
        loadData();
      
        // Set up event listener for group updates
        const handleGroupUpdated = (event) => {
          if (event.detail && event.detail.groupId === group?.id) {
            console.log('Group update detected:', event.detail);
            loadData();
          } else if (event.type === 'conversationsUpdated') {
            // General conversation update - check if our group is affected
            setTimeout(() => loadData(), 500);
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

        const contact = contactStore.getContact(publicKeyStr);
        return contact?.alias || publicKeyStr;
    }

    // Process message to identify file messages
    const processMessage = (msg) => {
        // Check if this might be a file message
        if (typeof msg.content === 'string') {
            try {
                const parsed = JSON.parse(msg.content);
                if (parsed && parsed.messageType === 'file') {
                    // This is a file message - add the file data
                    return {
                        ...msg,
                        isFile: true,
                        fileData: {
                            fileID: parsed.fileID,
                            fileName: parsed.fileName,
                            fileType: parsed.fileType,
                            fileSize: parsed.fileSize
                        }
                    };
                }
            } catch (e) {
                // Not a file message, just a regular message
            }
        }
        
        // Return the original message
        return msg;
    };

    // Handle initiating a group call
    const handleInitiateGroupCall = (groupId, groupName, members) => {
        console.log('Initiating group call for:', groupId, groupName, members);
        
        if (typeof window === 'undefined' || !window.voiceService) {
            console.error('Voice service not available');
            alert('Voice service not available. Please try again later.');
            return;
        }
        
        try {
            // Ensure the voice service is initialized
            if (!window.voiceService.initialized) {
                console.log('Voice service not yet initialized, initializing now...');
                window.voiceService.initialize().then(() => {
                    // After initialization, start the group call
                    window.voiceService.initiateGroupCall(groupId, groupName, members)
                        .catch(error => {
                            console.error('Failed to initiate group call:', error);
                            alert('Could not start the group call. Please try again.');
                        });
                });
            } else {
                // Voice service is ready, start the group call
                window.voiceService.initiateGroupCall(groupId, groupName, members)
                    .catch(error => {
                        console.error('Failed to initiate group call:', error);
                        alert('Could not start the group call. Please try again.');
                    });
            }
        } catch (error) {
            console.error('Error in handleInitiateGroupCall:', error);
            alert('An error occurred while trying to start the group call. Please try again.');
        }
    };

    // Handle file selection
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check file size (limit to 10MB)
            if (file.size > 10 * 1024 * 1024) {
                alert('File is too large. Please select a file under 10MB.');
                return;
            }

            setSelectedFile(file);
            setShowFilePreview(true);
        }
    };

    // Handle file upload
    const handleSendFile = async () => {
        if (!selectedFile || !group?.id || !currentUserKey) return;

        try {
            setUploadingFile(true);

            // Upload the file through the handler
            await uploadGroupFile(
                group.id,
                selectedFile,
                currentUserKey
            );

            // Close the preview and reset state
            setSelectedFile(null);
            setShowFilePreview(false);

            // Reload the latest messages
            setTimeout(() => {
                loadGroupData();
            }, 1000);
        } catch (error) {
            console.error('Failed to upload file:', error);
            alert('Failed to upload file. Please try again.');
        } finally {
            setUploadingFile(false);
        }
    };

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
                <div className="flex items-center space-x-2">
                    {/* Add the group call button */}
                    <GroupCallButton 
                        group={group}
                        onInitiateGroupCall={handleInitiateGroupCall}
                    />
                    
                    <button
                        onClick={onOpenGroupDetails}
                        className="p-2 rounded-full hover:bg-gray-700"
                    >
                        <Settings size={20} />
                    </button>
                </div>
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
                    messages.map((msg) => {
                        // Process the message to check if it's a file
                        const processedMsg = processMessage(msg);
                        
                        // Add sender name for display
                        processedMsg.senderName = getContactName(processedMsg.sender);
                        
                        // If this is a file message, render the file component
                        if (processedMsg.isFile) {
                            return (
                                <GroupFileMessage
                                    key={processedMsg.id || `msg-${Date.now()}-${Math.random()}`}
                                    message={processedMsg}
                                    formatMessageTime={formatMessageTime}
                                    currentUserKey={currentUserKey}
                                    groupId={group.id}
                                />
                            );
                        }
                        
                        // Otherwise render a standard text message
                        return (
                            <div
                                key={processedMsg.id || `msg-${Date.now()}-${Math.random()}`}
                                className={`${processedMsg.sender === currentUserKey ? 'text-right' : ''}`}
                            >
                                {processedMsg.sender !== currentUserKey && (
                                    <div className="text-xs text-gray-500 mb-1">
                                        {processedMsg.senderName}
                                    </div>
                                )}
                                <div className={`inline-block p-3 px-5 rounded-2xl ${processedMsg.sender === currentUserKey ? 'bg-blue-600' : 'bg-gray-800'}`}>
                                    {processedMsg.content}
                                </div>
                                <div className="text-xs text-gray-500 mt-2">
                                    {formatMessageTime ? formatMessageTime(processedMsg.timestamp) : new Date(processedMsg.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* File Upload Preview Modal */}
            {showFilePreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">Send File to Group</h2>
                            <button
                                onClick={() => {
                                    setShowFilePreview(false);
                                    setSelectedFile(null);
                                }}
                                className="text-gray-400 hover:text-white"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="mb-4 p-4 bg-gray-700 rounded-lg">
                            <div className="flex items-center">
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3">
                                    <Upload size={20} className="text-white" />
                                </div>
                                <div>
                                    <div className="font-medium">{selectedFile.name}</div>
                                    <div className="text-sm text-gray-400">
                                        {selectedFile.type || 'Unknown type'} • {
                                            selectedFile.size < 1024 ? selectedFile.size + ' bytes' :
                                                selectedFile.size < 1024 * 1024 ? (selectedFile.size / 1024).toFixed(1) + ' KB' :
                                                    (selectedFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => {
                                    setShowFilePreview(false);
                                    setSelectedFile(null);
                                }}
                                className="px-4 py-2 bg-gray-700 text-white rounded-lg mr-2"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSendFile}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center"
                                disabled={uploadingFile}
                            >
                                {uploadingFile ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send size={16} className="mr-2" />
                                        Send File
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            onChange={handleFileSelect}
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
'use client'

import { useState, useEffect } from 'react'
import { X, Users, UserMinus, UserPlus, Settings, LogOut, Trash2, Phone } from 'lucide-react'
import contactStore from '../../utils/ContactStore'
import conversationManager from '../../utils/ConversationManager'

export default function GroupDetails({ group, onClose, currentUserKey }) {
  const [members, setMembers] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newMemberKey, setNewMemberKey] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [initiatingCall, setInitiatingCall] = useState(false)

  useEffect(() => {
    if (!group) return

    const checkStatus = () => {
      // Check if current user is an admin
      setIsAdmin(group.admins?.includes(currentUserKey) || false)

      // Set members list
      if (group.members) {
        setMembers(group.members)
      }

      setLoading(false)
    }

    checkStatus()
  }, [group, currentUserKey])

  // Get contact name for a member
  const getMemberName = (publicKeyStr) => {
    if (!contactStore) return publicKeyStr === currentUserKey ? 'You' : publicKeyStr

    if (publicKeyStr === currentUserKey) return 'You'

    const contact = contactStore.getContact(publicKeyStr)
    return contact?.alias || publicKeyStr
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!newMemberKey.trim() || !conversationManager) return;

    try {
      setAddingMember(true);

      // Call the function to add a member to the group
      if (typeof conversationManager.addGroupMember === 'function') {
        await conversationManager.addGroupMember(group.id, newMemberKey.trim());
      } else {
        await conversationManager.addMemberToGroup(group.id, newMemberKey.trim());
      }

      // Immediately refresh the group data
      const updatedGroup = await conversationManager.refreshGroup(group.id);

      // Update the members list in the current component state
      if (updatedGroup && updatedGroup.members) {
        setMembers(updatedGroup.members);
      }

      // Clear input
      setNewMemberKey('');

    } catch (error) {
      console.error('Failed to add member:', error);
      alert('Failed to add member. Please check the key and try again.');
    } finally {
      setAddingMember(false);
    }
  }

  // Leave the group
  const handleLeaveGroup = async () => {
    if (!conversationManager) return

    try {
      setLoading(true)
      await conversationManager.leaveGroup(group.id)
      onClose(true) // Pass true to indicate group left
    } catch (error) {
      console.error('Failed to leave group:', error)
      alert('Failed to leave group. Please try again.')
      setLoading(false)
    }
  }

  async function handleRemoveMember(memberId) {
    if (memberId === currentUserKey) {
      alert("You cannot remove yourself from the group. Use 'Leave Group' instead.");
      return;
    }
    
    if (confirm(`Are you sure you want to remove this member from the group?`)) {
      try {
        setLoading(true);
        
        // Call the conversation manager method
        await conversationManager.removeGroupMember(group.id, memberId);
        
        // Optimistically update the UI without waiting for a refresh
        setMembers(members.filter(id => id !== memberId));
        
        // Show success message
        alert('Member removed successfully');
      } catch (error) {
        console.error('Failed to remove member:', error);
        alert(`Failed to remove member: ${error.message || 'Unknown error'}`);
        
        // Try to refresh the group anyway
        try {
          const updatedGroup = await conversationManager.refreshGroup(group.id);
          if (updatedGroup && updatedGroup.members) {
            setMembers(updatedGroup.members);
          }
        } catch (refreshError) {
          console.error('Also failed to refresh group:', refreshError);
        }
      } finally {
        setLoading(false);
      }
    }
  }

  // Start a group call
  const handleStartGroupCall = async () => {
    if (initiatingCall) return;

    setInitiatingCall(true);

    try {
      if (typeof window === 'undefined' || !window.voiceService) {
        throw new Error('Voice service not available');
      }

      // Ensure service is initialized
      if (!window.voiceService.initialized) {
        await window.voiceService.initialize();
      }

      // Start the group call
      await window.voiceService.initiateGroupCall(
        group.id,
        group.name || 'Group Call',
        group.members || []
      );

      // Close the details panel
      onClose(false);
    } catch (error) {
      console.error('Failed to start group call:', error);
      alert('Could not start the group call. Please try again.');
    } finally {
      setInitiatingCall(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full max-w-lg max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Group Details</h2>
        <button
          onClick={() => onClose(false)}
          className="p-1 rounded-full hover:bg-gray-700"
        >
          <X size={22} />
        </button>
      </div>

      {/* Content */}
      <div className="p-5 overflow-y-auto flex-1">
        <div className="space-y-6">
          {/* Group Info */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-3">
              <Users size={36} />
            </div>
            <h3 className="text-xl font-bold">{group.name}</h3>
            {group.description && (
              <p className="text-gray-400 mt-2">{group.description}</p>
            )}
            <p className="text-sm text-gray-500 mt-3">Created {new Date(group.created).toLocaleDateString()}</p>

            {/* Group Call Button */}
            <button
              onClick={handleStartGroupCall}
              disabled={initiatingCall}
              className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center mx-auto transition-colors disabled:bg-green-800 disabled:cursor-not-allowed"
            >
              {initiatingCall ? (
                <>
                  <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                  Starting Call...
                </>
              ) : (
                <>
                  <Phone size={16} className="mr-2" />
                  Start Group Call
                </>
              )}
            </button>
          </div>

          {/* Members Section */}
          <div>
            <h4 className="text-md font-medium mb-3 flex items-center">
              <Users size={18} className="mr-2" />
              Members ({members.length})
            </h4>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {members.map(memberId => (
                <div key={memberId} className="p-3 bg-gray-700 rounded-lg flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center mr-3">
                      {getMemberName(memberId)[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">
                        {getMemberName(memberId)}
                        {group.admins?.includes(memberId) && (
                          <span className="ml-2 text-xs bg-blue-600 px-2 py-0.5 rounded">Admin</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 truncate max-w-[180px]">{memberId}</div>
                    </div>
                  </div>

                  {/* Admin controls */}
                  {isAdmin && memberId !== currentUserKey && (
                    <button
                      onClick={() => handleRemoveMember(memberId)}
                      className="p-1 rounded hover:bg-red-600/20 text-red-400"
                      title="Remove member"
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add Member Form (for admins) */}
          {isAdmin && (
            <div className="mt-6 pt-4 border-t border-gray-700">
              <h4 className="text-md font-medium mb-3">Add New Member</h4>
              <form onSubmit={handleAddMember} className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Enter member's public key"
                  value={newMemberKey}
                  onChange={(e) => setNewMemberKey(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newMemberKey.trim() || addingMember}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:bg-blue-800 disabled:cursor-not-allowed flex items-center"
                >
                  {addingMember ? (
                    <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                  ) : (
                    <UserPlus size={16} className="mr-1" />
                  )}
                  Add
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-gray-800 border-t border-gray-700">
        {confirmLeave ? (
          <div className="text-center">
            <p className="mb-3 text-red-400">Are you sure you want to leave this group?</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveGroup}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded flex items-center justify-center"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <LogOut size={16} className="mr-1" />
                    Leave
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLeave(true)}
            className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded flex items-center justify-center"
          >
            <LogOut size={16} className="mr-1" />
            Leave Group
          </button>
        )}
      </div>
    </div>
  );
}
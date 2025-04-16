import subworldNetwork from '../../utils/SubworldNetworkService';
import conversationManager from '../../utils/ConversationManager';

/**
 * Upload a file to a group
 * @param {string} groupId - The ID of the group
 * @param {File} file - The file to upload
 * @param {string} senderPublicKey - The current user's public key
 * @returns {Promise<Object>} - The result of the upload operation
 */
export const uploadGroupFile = async (groupId, file, senderPublicKey) => {
  try {
    console.log(`Starting group file upload for ${file.name} to group ${groupId}`);
    
    // Verify file size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File is too large. Maximum size is 10MB.');
    }
    
    // Step 1: Upload the file through the network service
    console.log('Uploading file to network...');
    
    // Create FormData for the multipart upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('group_id', groupId);
    formData.append('sender_id', senderPublicKey);
    formData.append('file_name', file.name);
    formData.append('file_type', file.type || 'application/octet-stream');
    
    // Generate a unique content ID
    const contentId = `groupfile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    formData.append('content_id', contentId);
    
    // Get the current node from the network service
    const node = subworldNetwork.getCurrentNode();
    if (!node) {
      throw new Error('No network node selected');
    }
    
    const nodeId = node.id || 'bootstrap2';
    const proxyUrl = `https://proxy.inhouses.xyz/api/${nodeId}/groups/files/upload`;
    
    console.log(`Uploading to: ${proxyUrl}`);
    
    // Make the upload request
    const response = await fetch(proxyUrl, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Failed to upload file: ${response.status}`);
    }
    
    const uploadResult = await response.json();
    console.log('Upload response:', uploadResult);
    
    if (!uploadResult.id) {
      throw new Error('Invalid response from server');
    }
    
    // Step 2: Create a message to notify group members about the file
    const fileMetadata = {
      messageType: 'file',
      fileID: uploadResult.id || contentId,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      isGroupFile: true
    };
    
    // Send a message to the group with the file metadata
    await conversationManager.sendGroupMessage(
      groupId,
      JSON.stringify(fileMetadata)
    );
    
    console.log('File upload complete and notification sent to group');
    
    return {
      success: true,
      fileId: uploadResult.id || contentId,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size
    };
  } catch (error) {
    console.error('Error in uploadGroupFile:', error);
    throw error;
  }
};

/**
 * Download a file from a group
 * @param {string} groupId - The ID of the group
 * @param {string} fileId - The ID of the file
 * @param {string} fileName - The name to save the file as
 * @param {string} userPublicKey - The current user's public key
 * @returns {Promise<Blob>} - The downloaded file as a Blob
 */
export const downloadGroupFile = async (groupId, fileId, fileName, userPublicKey) => {
  try {
    console.log(`Starting group file download for file ${fileId} from group ${groupId}`);
    
    // Get the current node from the network service
    const node = subworldNetwork.getCurrentNode();
    if (!node) {
      throw new Error('No network node selected');
    }
    
    const nodeId = node.id || 'bootstrap2';
    
    // First get the file metadata
    const metadataUrl = `https://proxy.inhouses.xyz/api/${nodeId}/groups/files/get?user_id=${encodeURIComponent(userPublicKey)}&group_id=${encodeURIComponent(groupId)}&file_id=${encodeURIComponent(fileId)}`;
    
    console.log('Fetching file metadata:', metadataUrl);
    
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('Failed to get file metadata:', errorText);
      throw new Error(`Failed to get file metadata: ${metadataResponse.status}`);
    }
    
    const metadata = await metadataResponse.json();
    console.log('File metadata:', metadata);
    
    // Now download the actual file
    const fileUrl = `${metadataUrl}&chunk=0`;
    console.log('Downloading file from:', fileUrl);
    
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      console.error('Failed to download file:', errorText);
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }
    
    // Get the file content as a blob
    const fileBlob = await fileResponse.blob();
    
    // Create a download link and trigger it
    const url = URL.createObjectURL(fileBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download.file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log('File download complete');
    
    return fileBlob;
  } catch (error) {
    console.error('Error in downloadGroupFile:', error);
    throw error;
  }
};

export default {
  uploadGroupFile,
  downloadGroupFile
};
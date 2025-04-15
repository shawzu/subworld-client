'use client'

import { useState } from 'react'
import { Download, File, Image as ImageIcon } from 'lucide-react'
import { downloadGroupFile } from './GroupFileHandler'

export default function GroupFileMessage({ 
  message, 
  formatMessageTime, 
  currentUserKey,
  groupId
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const isSentByCurrentUser = message.sender === currentUserKey;

  // Try to parse file metadata from the message content
  const getFileMetadata = () => {
    try {
      // Check if we already have parsed file data
      if (message.fileData) {
        return message.fileData;
      }
      
      // Otherwise, try to parse the content
      const parsed = JSON.parse(message.content);
      if (parsed && parsed.messageType === 'file') {
        return {
          fileID: parsed.fileID,
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          fileSize: parsed.fileSize
        };
      }
    } catch (e) {
      // Not a file message or invalid JSON
      return null;
    }
    return null;
  };

  const fileMetadata = getFileMetadata();
  
  // If this isn't a file message, return null
  if (!fileMetadata) {
    return null;
  }

  const isImage = fileMetadata.fileType && fileMetadata.fileType.startsWith('image/');

  const getFileIcon = () => {
    if (isImage) {
      return <ImageIcon size={32} className="text-blue-300 flex-shrink-0" />;
    }
    return <File size={32} className="text-gray-300 flex-shrink-0" />;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setDownloadProgress(10); // Start progress

      // Update progress as we go
      setDownloadProgress(30);
      
      // Download the file
      await downloadGroupFile(
        groupId,
        fileMetadata.fileID,
        fileMetadata.fileName,
        currentUserKey
      );
      
      setDownloadProgress(100);
      
      // Reset progress after a delay
      setTimeout(() => {
        setDownloadProgress(0);
        setDownloading(false);
      }, 1500);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file. Please try again.');
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (!bytes) return '';

    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  // Helper to get file type display
  const getFileTypeDisplay = () => {
    const type = fileMetadata.fileType || '';

    if (type.startsWith('image/')) return 'Image';
    if (type.startsWith('video/')) return 'Video';
    if (type.startsWith('audio/')) return 'Audio';
    if (type.startsWith('text/')) return 'Text';
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('word') || type.includes('document')) return 'Document';
    if (type.includes('excel') || type.includes('spreadsheet')) return 'Spreadsheet';

    return 'File';
  };

  return (
    <div className={`group-file-message ${isSentByCurrentUser ? 'text-right' : ''}`}>
      {!isSentByCurrentUser && (
        <div className="text-xs text-gray-500 mb-1">
          {message.senderName || message.sender}
        </div>
      )}
      
      <div
        className={`inline-block overflow-hidden rounded-2xl ${isSentByCurrentUser ? 'bg-blue-600' : 'bg-gray-800'}`}
      >
        <div className="p-4">
          <div className="flex items-center space-x-3">
            {getFileIcon()}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate max-w-[200px] text-left">
                {fileMetadata.fileName}
              </div>
              <div className="text-xs text-gray-400/80 text-left">
                {getFileTypeDisplay()} • {formatFileSize(fileMetadata.fileSize)}
              </div>
            </div>
          </div>

          {downloadProgress > 0 && downloadProgress < 100 && (
            <div className="mt-3 w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress}%` }}
              ></div>
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-3 w-full py-2 px-3 flex items-center justify-center rounded-lg bg-blue-500/30 hover:bg-blue-500/50 transition-colors disabled:opacity-50 disabled:hover:bg-blue-500/30"
          >
            {downloading ? (
              <span className="flex items-center">
                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                Downloading...
              </span>
            ) : (
              <span className="flex items-center">
                <Download size={16} className="mr-2" />
                Download {isImage ? 'Image' : 'File'}
              </span>
            )}
          </button>
        </div>
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        {formatMessageTime(message.timestamp)}
      </div>
    </div>
  );
}
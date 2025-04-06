'use client'

import { useState } from 'react'

export default function ImageMessage({ message, formatMessageTime, currentUserKey }) {
  const [expanded, setExpanded] = useState(false);
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  const isSentByCurrentUser = message.sender === currentUserKey;
  
  return (
    <div className={`image-message mb-6 ${isSentByCurrentUser ? 'text-right' : ''}`}>
      <div 
        className={`inline-block overflow-hidden rounded-2xl ${isSentByCurrentUser ? 'bg-blue-600' : 'bg-gray-800'}`}
      >
        {message.imageData ? (
          <div className="relative">
            <img
              src={message.imageData}
              alt={message.imageCaption || "Image"}
              className={`object-contain ${expanded ? 'max-h-[70vh] max-w-[80vw]' : 'max-h-48 max-w-48'}`}
              style={{ cursor: 'pointer' }}
              onClick={toggleExpanded}
            />
            {message.imageCaption && (
              <div className="px-3 py-2 text-sm text-left">
                {message.imageCaption}
              </div>
            )}
            {message.originalSize && (
              <div className="text-xs text-gray-500/60 p-1 absolute bottom-0 right-0">
                {(message.originalSize / 1024).toFixed(0)} KB
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 w-48 bg-gray-700 p-3">
            <div className="text-sm text-gray-400">Image unavailable</div>
            {message.imageCaption && (
              <div className="mt-2 text-xs text-gray-500">
                Caption: {message.imageCaption}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-2">
        {formatMessageTime(message.timestamp)}
      </div>
    </div>
  );
}
'use client'

import { useState, useEffect } from 'react'
import subworldNetwork from '../../utils/SubworldNetworkService'

export default function ImageMessage({ message, formatMessageTime, currentUserKey }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [dataFormat, setDataFormat] = useState(null) // For debugging
  const [rawData, setRawData] = useState(null) // For emergency recovery

  // Function to try data recovery methods
  const recoverImage = async (blob) => {
    try {
      // Try to read as text
      const text = await blob.text();
      setRawData(text.substring(0, 100)); // Save first 100 chars for debugging
      
      // Option 1: Try base64 decoding if it looks like base64
      if (/^[A-Za-z0-9+/=]+$/.test(text.trim())) {
        try {
          console.log('Trying base64 recovery...');
          // Decode base64
          const binaryStr = atob(text.trim());
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          
          const recoveredBlob = new Blob([bytes], { type: 'image/jpeg' });
          const recoveredUrl = URL.createObjectURL(recoveredBlob);
          
          // Test the recovered image
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              console.log('Recovery succeeded with base64!');
              resolve(recoveredUrl);
            };
            img.onerror = () => {
              URL.revokeObjectURL(recoveredUrl);
              reject(new Error('Base64 recovery failed'));
            };
            img.src = recoveredUrl;
          });
        } catch (e) {
          console.error('Base64 recovery failed:', e);
        }
      }
      
      // Option 2: Try to treat as data URL
      if (text.startsWith('data:image/')) {
        console.log('Trying data URL recovery...');
        // It's already a data URL, use directly
        return text;
      }
      
      throw new Error('Recovery attempts failed');
    } catch (e) {
      console.error('All recovery attempts failed:', e);
      throw e;
    }
  };

  useEffect(() => {
    async function loadImage() {
      try {
        setIsLoading(true)
        setError(null)
        
        console.log('Loading image:', message.id, 'attempt:', retryCount + 1)
        
        // The user who receives the message needs to use the correct ID for fetching
        const photoUserID = message.sender === currentUserKey ? 
          message.recipient : // You sent it to them
          currentUserKey;     // They sent it to you
          
        const photoID = message.imageUrl || message.id
        
        console.log(`Fetching image with userID=${photoUserID}, photoID=${photoID}`)
        
        // Get image from network service
        const imageBlob = await subworldNetwork.getImage(
          photoUserID,
          photoID,
          0 // Default chunk
        )
        
        if (!imageBlob || imageBlob.size === 0) {
          throw new Error('Empty image data received')
        }
        
        console.log('Image blob received:', imageBlob.type, imageBlob.size, 'bytes')
        setDataFormat(imageBlob.type) // For debugging
        
        // Create a safe image URL from the blob
        let url = URL.createObjectURL(imageBlob)
        
        // Test the image by preloading it
        try {
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
          });
          
          // If we get here, image loaded successfully
          console.log('Image preloaded successfully');
          setImageUrl(url);
          setIsLoading(false);
        } catch (preloadError) {
          console.error('Image preload failed, trying recovery:', preloadError);
          
          // Revoke the failed URL
          URL.revokeObjectURL(url);
          
          // Try recovery methods
          try {
            url = await recoverImage(imageBlob);
            console.log('Recovered image URL:', url);
            setImageUrl(url);
            setIsLoading(false);
          } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
            setError('Image format not recognized');
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error('Error loading image:', err)
        setError('Failed to load image: ' + (err.message || 'Unknown error'))
        setIsLoading(false)
        
        // If we have retries left, try again after a delay
        if (retryCount < 3) {
          const timer = setTimeout(() => {
            setRetryCount(prev => prev + 1)
          }, 2000) // Retry after 2 seconds
          
          return () => clearTimeout(timer)
        }
      }
    }
    
    if (message.isImage) {
      loadImage()
    }
    
    // Clean up URL objects on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [message.isImage, message.imageUrl, message.id, message.recipient, message.sender, currentUserKey, retryCount])

  const toggleExpanded = () => {
    setExpanded(!expanded)
  }
  
  const handleRetry = () => {
    setRetryCount(0) // Reset retry count to trigger a new attempt
  }

  const isSentByCurrentUser = message.sender === currentUserKey

  // Create a debug info display
  const debugInfo = `Format: ${dataFormat || 'unknown'} | ID: ${message.id?.slice(0,8)}`;

  return (
    <div className={`image-message ${isSentByCurrentUser ? 'text-right' : ''}`}>
      <div 
        className={`inline-block overflow-hidden rounded-2xl ${isSentByCurrentUser ? 'bg-blue-600' : 'bg-gray-800'}`}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 w-48 bg-gray-700 animate-pulse">
            <div className="text-sm text-gray-400 mb-2">Loading image...</div>
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 w-48 bg-red-900/30 text-red-400 text-sm p-3">
            <div className="mb-2">{error}</div>
            <div className="text-xs text-red-500/60 mb-2 max-w-full overflow-hidden">{debugInfo}</div>
            <button 
              onClick={handleRetry}
              className="px-3 py-1 bg-red-800 hover:bg-red-700 rounded-full text-xs text-white"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="relative">
            <img
              src={imageUrl}
              alt={message.imageCaption || "Image"}
              className={`object-contain ${expanded ? 'max-h-[70vh] max-w-[80vw]' : 'max-h-48 max-w-48'}`}
              style={{ cursor: 'pointer' }}
              onClick={toggleExpanded}
              onError={(e) => {
                console.error('Image failed to display:', e)
                setError('Image format not supported by browser')
                setImageUrl(null)
              }}
            />
            {message.imageCaption && (
              <div className="px-3 py-2 text-sm text-left">
                {message.imageCaption}
              </div>
            )}
            <div className="text-xs text-gray-500/60 p-1 absolute bottom-0 right-0">
              {debugInfo}
            </div>
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-2">
        {formatMessageTime(message.timestamp)}
      </div>
    </div>
  )
}
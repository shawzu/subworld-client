'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Activity, AlertCircle } from 'lucide-react'

export default function NetworkDetector({ onNetworkChange }) {
  const [networkType, setNetworkType] = useState('unknown');
  const [isOnline, setIsOnline] = useState(true);
  const [networkQuality, setNetworkQuality] = useState('good'); // 'good', 'poor', 'unknown'
  
  useEffect(() => {
    // Function to update network status
    const updateNetworkStatus = () => {
      // Check if browser is online
      setIsOnline(navigator.onLine);
      
      // Try to get connection type if API is available
      if (navigator.connection) {
        const conn = navigator.connection;
        setNetworkType(conn.type || (conn.effectiveType || 'unknown'));
        
        // Estimate network quality
        if (conn.effectiveType === '2g' || conn.saveData) {
          setNetworkQuality('poor');
        } else if (conn.effectiveType === '3g') {
          setNetworkQuality('moderate');
        } else if (conn.effectiveType === '4g' || conn.effectiveType === '5g') {
          setNetworkQuality('good');
        }
      } else {
        setNetworkType('unknown');
        setNetworkQuality('unknown');
      }
    };
    
    // Initial check
    updateNetworkStatus();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      setIsOnline(true);
      updateNetworkStatus();
    });
    
    window.addEventListener('offline', () => {
      setIsOnline(false);
      updateNetworkStatus();
    });
    
    // Listen for connection changes if API available
    if (navigator.connection) {
      navigator.connection.addEventListener('change', updateNetworkStatus);
    }
    
    // Notify parent component of network changes
    if (onNetworkChange) {
      onNetworkChange({
        isOnline,
        networkType,
        networkQuality
      });
    }
    
    // Cleanup
    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
      
      if (navigator.connection) {
        navigator.connection.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, [isOnline, networkType, networkQuality, onNetworkChange]);
  
  // Determine if network is likely to support WebRTC calls
  const canSupportWebRTC = () => {
    if (!isOnline) return false;
    
    // Mobile data sometimes has issues with WebRTC
    if (networkType === 'cellular' && networkQuality === 'poor') {
      return false;
    }
    
    return true;
  };
  
  return (
    <div className="network-detector">
      {/* Network status indicator */}
      <div className="flex items-center space-x-2 py-1 px-2 rounded-lg bg-gray-800">
        {isOnline ? (
          <Wifi size={16} className={networkQuality === 'poor' ? 'text-yellow-400' : 'text-green-400'} />
        ) : (
          <WifiOff size={16} className="text-red-400" />
        )}
        
        <span className="text-xs">
          {networkType === 'cellular' && 'Mobile Data'}
          {networkType === 'wifi' && 'WiFi'}
          {networkType === 'unknown' && isOnline && 'Connected'}
          {!isOnline && 'Offline'}
        </span>
        
        {networkType === 'cellular' && networkQuality === 'poor' && (
          <span className="flex items-center text-yellow-400 text-xs">
            <AlertCircle size={12} className="mr-1" />
            Calls may be unstable
          </span>
        )}
      </div>
      
      {/* Warning for poor connections */}
      {!canSupportWebRTC() && (
        <div className="mt-2 text-xs text-yellow-500 flex items-center">
          <AlertCircle size={12} className="mr-1" />
          Your current connection may not support calls
        </div>
      )}
    </div>
  );
}
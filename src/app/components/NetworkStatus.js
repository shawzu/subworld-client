'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function NetworkStatus({ selectedNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [checking, setChecking] = useState(false)

  // Check connection status periodically
  useEffect(() => {
    // Don't attempt checks if no node is selected
    if (!selectedNode || !selectedNode.address) {
      setIsConnected(false);
      return;
    }

    const checkConnection = async () => {
      // Skip if already performing a check
      if (checking) return;
      
      try {
        setChecking(true);
        
        // Use AbortController for proper timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${selectedNode.address}/health`, {
          method: 'GET',
          signal: controller.signal
        }).catch(() => null); // Convert fetch errors to null response
        
        clearTimeout(timeoutId);
        
        // Update connection status based on response
        setIsConnected(response && response.ok);
      } catch (error) {
        // Silently handle errors
        setIsConnected(false);
      } finally {
        setChecking(false);
      }
    };

    // Initial check
    checkConnection();

    // Set up periodic checking (every 30 seconds)
    const intervalId = setInterval(checkConnection, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedNode]);

  // Just a simple indicator, non-clickable
  return (
    <div className="flex items-center">
      {isConnected ? (
        <Wifi size={16} className="text-green-400" />
      ) : (
        <WifiOff size={16} className="text-red-400" />
      )}
    </div>
  );
}
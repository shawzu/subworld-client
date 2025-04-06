'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Server } from 'lucide-react'
import subworldNetwork from '../../utils/SubworldNetworkService'

export default function NetworkStatus({ selectedNode }) {
  const [isConnected, setIsConnected] = useState(true) // Assume connected by default
  const [nodeInfo, setNodeInfo] = useState(null)
  const [lastCheck, setLastCheck] = useState(0)

  useEffect(() => {
    if (!selectedNode || !selectedNode.address) {
      setIsConnected(false);
      return;
    }

    const checkConnection = async () => {
      // Rate limiting - only check every X seconds
      const now = Date.now();
      if (now - lastCheck < 10000) { // 10 seconds
        return;
      }

      setLastCheck(now);

      try {
        // Get the actual connection status instead of just reading the property
        if (subworldNetwork && typeof subworldNetwork.checkNodeHealth === 'function') {
          const health = await subworldNetwork.checkNodeHealth(selectedNode.address);
          setIsConnected(health.isOnline);
        } else {
          // Fallback to property if method not available
          setIsConnected(selectedNode.isOnline !== false);
        }

        // Only try to get node info once per session and only if we're connected
        if (!nodeInfo && isConnected) {
          try {
            const info = await subworldNetwork.getNodeInfo();
            if (info) {
              setNodeInfo(info);
            }
          } catch (nodeInfoError) {
            // Just log the error, don't update connection status for node info failures
            console.warn('Failed to get node info:', nodeInfoError.message);
          }
        }
      } catch (error) {
        // Handle connection check errors
        console.warn('Network status check failed:', error.message);
        setIsConnected(false);
      }
    };
    // Initial check
    checkConnection();

    // Set up interval for periodic checks
    const intervalId = setInterval(checkConnection, 10000); // Check every 10 seconds

    return () => {
      clearInterval(intervalId); // Clean up the interval on unmount
    };
  }, [selectedNode]);

  return (
    <div className="flex items-center relative group">
      {isConnected ? (
        <Wifi size={16} className="text-green-400" />
      ) : (
        <WifiOff size={16} className="text-red-400" />
      )}

      {/* Hover tooltip with node info */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-gray-800 rounded-md p-2 text-xs shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
        <div className="flex items-center space-x-1 mb-1 text-gray-300">
          <Server size={12} />
          <span>{selectedNode?.name || 'Unknown Node'}</span>
        </div>
        <div className="text-gray-400 truncate">{selectedNode?.address}</div>
        {selectedNode?.latency && (
          <div className={`mt-1 ${selectedNode.latency < 100 ? 'text-green-400' : selectedNode.latency < 300 ? 'text-yellow-400' : 'text-red-400'}`}>
            Latency: {selectedNode.latency}ms
          </div>
        )}
        {nodeInfo && (
          <div className="mt-1 text-gray-400">
            Type: {nodeInfo.node_type}
          </div>
        )}
      </div>
    </div>
  );
}
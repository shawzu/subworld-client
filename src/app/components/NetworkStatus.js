'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Server } from 'lucide-react'
import subworldNetwork from '../../utils/SubworldNetworkService'

export default function NetworkStatus({ selectedNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [nodeInfo, setNodeInfo] = useState(null)
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
          
          // Use the API address with the /health endpoint
          const apiAddress = selectedNode.apiAddress || 
                            (selectedNode.address.includes(':8080') ? 
                              selectedNode.address.replace(':8080', ':8081') : 
                              selectedNode.address);
                              
          const healthEndpoint = `${apiAddress}/health`;
          
          // Check node health with a timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(healthEndpoint, {
            method: 'GET',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const healthData = await response.json();
            setIsConnected(healthData.status === 'ok');
            
            // If connected, try to get additional node info
            const info = await subworldNetwork.getNodeInfo();
            if (info) {
              setNodeInfo(info);
            }
          } else {
            setIsConnected(false);
          }
        } catch (error) {
          // Silently handle errors
          console.log('Health check failed:', error.message);
          setIsConnected(false);
        } finally {
          setChecking(false);
        }
      };
  
      // Initial check
      checkConnection();
  
      // Set up periodic checking (every 30 seconds instead of 10)
      const intervalId = setInterval(checkConnection, 30000);
  
      return () => {
        clearInterval(intervalId);
      };
    }, [selectedNode, checking]);

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
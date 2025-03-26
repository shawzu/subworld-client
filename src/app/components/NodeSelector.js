'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, RefreshCw, Server } from 'lucide-react'

export default function NodeSelector({ onNodeSelect, currentNode }) {
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [bootstrapServer, setBootstrapServer] = useState('https://bootstrap.subworld.network')

  // Fetch available nodes from bootstrap server
  const fetchNodes = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Add default/fallback nodes
      const defaultNodes = [
        { 
          id: 'local', 
          name: 'Local Node', 
          address: 'http://localhost:8001', 
          isOnline: false,
          description: 'Your local node (if running)'
        },
        { 
          id: 'main1', 
          name: 'Subworld Main 1', 
          address: 'https://node1.subworld.network', 
          isOnline: false,
          description: 'Primary node'
        },
        { 
          id: 'main2', 
          name: 'Subworld Main 2', 
          address: 'https://node2.subworld.network', 
          isOnline: false,
          description: 'Secondary node'
        }
      ]
      
      // Try to fetch from bootstrap server (with timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      let fetchedNodes = [];
      try {
        // This inner try-catch will handle the fetch error without affecting the outer try-catch
        const response = await fetch(`${bootstrapServer}/peers`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        if (response.ok) {
          const data = await response.json();
          fetchedNodes = data.peers || [];
        }
      } catch (fetchError) {
        // Silently fail the fetch and use default nodes
        console.log('Using default nodes, network fetch failed');
      } finally {
        clearTimeout(timeoutId);
      }
      
      // Combine default nodes with any fetched nodes
      let allNodes = [...defaultNodes];
      if (fetchedNodes.length > 0) {
        // Add fetched nodes that don't exist in defaults
        fetchedNodes.forEach(node => {
          if (!allNodes.find(n => n.address === node.address)) {
            allNodes.push(node);
          }
        });
      }
      
      // Check health of each node
      const nodesWithStatus = await Promise.all(
        allNodes.map(async (node) => {
          try {
            // Health check with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            let isOnline = false;
            let latency = 999;
            
            try {
              const startTime = Date.now();
              const healthResponse = await fetch(`${node.address}/health`, {
                method: 'GET',
                signal: controller.signal
              });
              
              isOnline = healthResponse.ok;
              latency = isOnline ? Date.now() - startTime : 999;
            } catch (healthError) {
              // Silently fail health check
            } finally {
              clearTimeout(timeoutId);
            }
            
            return {
              ...node,
              isOnline,
              latency
            };
          } catch (nodeError) {
            // Ensure we return a valid node even if any part fails
            return {
              ...node,
              isOnline: false,
              latency: 999
            };
          }
        })
      );
      
      // Sort nodes: online first, then by latency
      const sortedNodes = nodesWithStatus.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return a.latency - b.latency;
      });
      
      setNodes(sortedNodes);
      setLoading(false);
    } catch (error) {
      // Fallback to default nodes on any error
      setError('Using default nodes');
      setLoading(false);
      
      setNodes([
        { 
          id: 'local', 
          name: 'Local Node', 
          address: 'http://localhost:8001', 
          isOnline: false,
          description: 'Your local node (if running)'
        },
        { 
          id: 'main1', 
          name: 'Subworld Main 1', 
          address: 'https://node1.subworld.network', 
          isOnline: false,
          description: 'Primary node'
        },
        { 
          id: 'main2', 
          name: 'Subworld Main 2', 
          address: 'https://node2.subworld.network', 
          isOnline: false,
          description: 'Secondary node'
        }
      ]);
    }
  }

  // Fetch nodes on component mount
  useEffect(() => {
    fetchNodes();
    
    // Set up periodic refresh every 60 seconds
    const intervalId = setInterval(fetchNodes, 60000);
    
    return () => clearInterval(intervalId);
  }, [bootstrapServer]);

  // Handle node selection
  const handleNodeSelect = (node) => {
    onNodeSelect(node);
  }

  // Set custom bootstrap server
  const handleSetCustomBootstrap = (e) => {
    e.preventDefault();
    const customUrl = prompt('Enter custom bootstrap server URL:', bootstrapServer);
    
    if (customUrl && customUrl !== bootstrapServer) {
      setBootstrapServer(customUrl);
      // This will trigger the useEffect and refetch nodes
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm text-gray-300">Network nodes</h4>
        <button 
          onClick={fetchNodes} 
          disabled={loading}
          className={`p-1 rounded hover:bg-gray-700 ${loading ? 'animate-spin text-blue-400' : 'text-gray-400'}`}
          title="Refresh node list"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      
      {error && (
        <div className="p-3 bg-gray-900/80 text-yellow-400 text-xs rounded-lg flex items-center gap-2 border border-gray-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      
      {loading && nodes.length === 0 ? (
        <div className="p-4 text-center text-gray-400 text-sm">
          <div className="animate-spin mx-auto mb-2 w-5 h-5 border-2 border-t-blue-500 border-r-blue-500 border-b-transparent border-l-transparent rounded-full"></div>
          Loading available nodes...
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {nodes.map((node) => (
            <button
              key={node.id || node.address}
              className={`w-full p-3 text-left hover:bg-gray-700 flex items-start gap-3 rounded-lg transition-colors ${currentNode?.address === node.address ? 'bg-gray-700 border border-gray-600' : 'bg-gray-800 border border-transparent'}`}
              onClick={() => handleNodeSelect(node)}
            >
              <div className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${node.isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center text-sm">
                  {node.name || node.address.split('//')[1]}
                  {currentNode?.address === node.address && (
                    <CheckCircle size={14} className="ml-2 text-blue-400" />
                  )}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {node.address}
                </div>
                {node.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {node.description}
                  </div>
                )}
                {node.isOnline && (
                  <div className="text-xs text-gray-500 mt-1">
                    Latency: {node.latency}ms
                  </div>
                )}
              </div>
            </button>
          ))}
          
          {nodes.length === 0 && !loading && (
            <div className="p-4 text-center text-gray-400 text-sm">
              No nodes available
            </div>
          )}
        </div>
      )}
      
      <button 
        onClick={handleSetCustomBootstrap}
        className="w-full p-2 text-xs text-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
      >
        Set custom bootstrap server
      </button>
    </div>
  )
}
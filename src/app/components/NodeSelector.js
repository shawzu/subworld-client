'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react'
import subworldNetwork from '../../utils/SubworldNetworkService'

export default function NodeSelector({ onNodeSelect, currentNode }) {
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch available nodes from network
  const fetchNodes = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Get nodes from network service
      const networkNodes = await subworldNetwork.fetchAvailableNodes();
      
      // Check health of each node
      const nodesWithStatus = await Promise.all(
        networkNodes.map(async (node) => {
          try {
            // Skip health check if node already has status
            if (node.isOnline !== undefined && node.latency !== undefined) {
              return node;
            }
            
            // Check node health
            const healthCheck = await subworldNetwork.checkNodeHealth(node.address);
            
            return {
              ...node,
              isOnline: healthCheck.isOnline,
              latency: healthCheck.latency
            };
          } catch (nodeError) {
            // Ensure we return a valid node even if health check fails
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
        // Current node always first
        if (currentNode && a.address === currentNode.address) return -1;
        if (currentNode && b.address === currentNode.address) return 1;
        
        // Then sort by online status
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        
        // Then sort by latency
        return a.latency - b.latency;
      });
      
      setNodes(sortedNodes);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setError('Failed to fetch nodes. Using default options.');
      setLoading(false);
      
      // Fallback to default network nodes if fetch fails
      setNodes([
        { 
          id: 'bootstrap1', 
          name: 'Bootstrap Node', 
          address: 'http://93.4.27.35:8080', // P2P port
          apiAddress: 'http://93.4.27.35:8081', // API port
          isOnline: false,
          isBootstrap: true,
          description: 'Primary bootstrap node'
        },
        { 
          id: 'node1', 
          name: 'Network Node', 
          address: 'http://37.170.71.188:8080', // P2P port
          apiAddress: 'http://37.170.71.188:8081', // API port
          isOnline: false,
          description: 'Regular node'
        },
        ...(currentNode && !currentNode.address.includes('localhost') ? [{
          id: 'current',
          name: currentNode.name || 'Current Node',
          address: currentNode.address,
          apiAddress: currentNode.apiAddress || currentNode.address.replace(':8080', ':8081'),
          isOnline: currentNode.isOnline,
          latency: currentNode.latency
        }] : [])
      ]);
    }
  }

  // Fetch nodes on component mount
  useEffect(() => {
    fetchNodes();
    
    // Set up periodic refresh every 2 minutes
    const intervalId = setInterval(fetchNodes, 120000);
    
    return () => clearInterval(intervalId);
  }, [currentNode]);

  // Handle node selection
  const handleNodeSelect = async (node) => {
    try {
      // Update node with current status
      const updatedNode = await subworldNetwork.setCurrentNode(node);
      onNodeSelect(updatedNode);
    } catch (error) {
      console.error('Error selecting node:', error);
      // Still update UI even if there's an error
      onNodeSelect(node);
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
                  {node.name || node.address.split('//')[1] || 'Unknown Node'}
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
                  <div className="text-xs text-gray-500 mt-1 flex items-center">
                    <Wifi size={10} className="mr-1 text-green-400" />
                    Latency: {node.latency}ms
                  </div>
                )}
                {node.isBootstrap && (
                  <div className="text-xs text-blue-400 mt-1">
                    Bootstrap Node
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
    </div>
  )
}
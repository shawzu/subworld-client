'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react'
import subworldNetwork from '../../utils/SubworldNetworkService'

export default function NodeSelector({ onNodeSelect, currentNode }) {
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(0)
  const [fetchCooldown, setFetchCooldown] = useState(false)

  // Fetch available nodes from network with rate limiting
  const fetchNodes = async () => {
    // Rate limiting to prevent excessive API calls
    const now = Date.now();
    if (now - lastFetch < 30000) { // 30 second cooldown
      if (!fetchCooldown) {
        setFetchCooldown(true);
        setTimeout(() => setFetchCooldown(false), 30000 - (now - lastFetch));
      }
      return;
    }
    
    setLastFetch(now);
    
    try {
      setLoading(true);
      setError(null);
      
      // Get nodes from network service
      const networkNodes = await subworldNetwork.fetchAvailableNodes();
      
      // Sort nodes: current node first, then online nodes, then by name
      const sortedNodes = networkNodes.sort((a, b) => {
        // Current node always first
        if (currentNode && a.address === currentNode.address) return -1;
        if (currentNode && b.address === currentNode.address) return 1;
        
        // Then sort by name
        return a.name.localeCompare(b.name);
      });
      
      setNodes(sortedNodes);
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setError('Failed to fetch nodes. Using default options.');
      
      // Fallback to default network nodes if fetch fails
      setNodes([
        { 
          id: 'bootstrap1', 
          name: 'Bootstrap Node', 
          address: 'http://93.4.27.35:8080', // P2P port
          apiAddress: 'http://93.4.27.35:8081', // API port
          isOnline: true,
          isBootstrap: true,
          description: 'Primary bootstrap node (93.4.27.35)'
        },
        ...(currentNode && !currentNode.address.includes('localhost') ? [{
          id: 'current',
          name: currentNode.name || 'Current Node',
          address: currentNode.address,
          apiAddress: currentNode.apiAddress || currentNode.address.replace(':8080', ':8081'),
          isOnline: true,
          latency: 100
        }] : [])
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Fetch nodes on component mount - only once
  useEffect(() => {
    fetchNodes();
    
    // No interval - only fetch on explicit refresh
    return () => {};
  }, [currentNode]);

  // Handle node selection
  const handleNodeSelect = (node) => {
    try {
      // Update the UI immediately - don't wait for health check
      onNodeSelect(node);
      
      // Update the node in the network service (async)
      subworldNetwork.setCurrentNode(node).catch(error => {
        console.error('Error selecting node:', error);
      });
    } catch (error) {
      console.error('Error selecting node:', error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm text-gray-300">Network nodes</h4>
        <button 
          onClick={fetchNodes} 
          disabled={loading || fetchCooldown}
          className={`p-1 rounded hover:bg-gray-700 ${loading ? 'animate-spin text-blue-400' : fetchCooldown ? 'text-gray-600' : 'text-gray-400'}`}
          title={fetchCooldown ? "Please wait before refreshing again" : "Refresh node list"}
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
              disabled={loading}
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
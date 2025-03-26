'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LocalKeyStorageManager from '../../utils/LocalKeyStorageManager'

// This component checks for keys and redirects if not found
export function KeyGuard({ children }) {
  const router = useRouter()

  useEffect(() => {
    // Check if keys exist
    const keyPair = LocalKeyStorageManager.getKeyPair()
    
    // If no keys are found, redirect to home page
    if (!keyPair) {
      router.push('/')
    }
  }, [router])

  return children
}
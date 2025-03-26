'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LocalKeyStorageManager from '../../utils/LocalKeyStorageManager'

// This component checks for keys and redirects to app if found
export function WelcomeGuard({ children }) {
  const router = useRouter()

  useEffect(() => {
    // Check if keys exist
    const keyPair = LocalKeyStorageManager.getKeyPair()
    
    // If keys are found, redirect to app
    if (keyPair) {
      router.push('/app')
    }
  }, [router])

  return children
}
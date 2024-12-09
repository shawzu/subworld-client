'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Landing from './components/landing'

export default function Home() {
  const [username, setUsername] = useState('')
  const router = useRouter()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (username.trim()) {
      localStorage.setItem('username', username.trim())
      router.push('/app')
    }
  }

  return (
    <>
    <Landing />
    </>
  )
}
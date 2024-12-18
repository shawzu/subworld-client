'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function Welcome() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto space-y-12">
        {/* Logo */}
        <div className="text-center">
          <Image 
            src="/Planet-logo-blue.png" 
            alt="Logo" 
            width={200} 
            height={200} 
            className="mx-auto"
          />
        </div>

        {/* Buttons */}
        <div className="space-y-4">
          <button
            className="w-full max-w-md mx-auto h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl"
            onClick={() => router.push('/welcome/create-account')}
          >
            Create an Account
          </button>

          <div className="text-center text-gray-500">OR</div>

          <button
            className="w-full max-w-md mx-auto h-14 text-lg bg-[#3c5ac6] hover:bg-[#3c5ac6]/90 text-white flex items-center justify-center gap-2 rounded-2xl"
            onClick={() => router.push('/welcome/import-account')}
          >
            Import an Account
          </button>
        </div>

     
      </div>
    </main>
  )
}
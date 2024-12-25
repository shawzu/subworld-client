'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'


export default function Landing() {

  const router = useRouter()
  const [showInstallPrompt, setShowInstallPrompt] = useState(true)


  return (
    <main className="min-h-screen  text-white flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto space-y-12">



        {/* Text Content */}
        <div className="space-y-8 text-center">
          <Image
            src="/Planet-logo-blue.png"
            alt="Logo"
            width={200}
            height={200}
            className="mx-auto"
          />

          <div className="space-y-2">
            <h1 className="text-3xl md:text-5xl font-bold text-[#F4F4F4] animate-fade-in">
              Decentralized.
            </h1>
            <h1 className="text-3xl md:text-5xl  font-bold  text-[#F4F4F4] animate-fade-in delay-100">
              Self-hostable.
            </h1>
            <h1 className="text-3xl md:text-5xl  font-bold text-[#F4F4F4] animate-fade-in delay-200">
              Encrypted.
            </h1>
          </div>
        </div>

        {/* CTA Button */}
        <div className="space-y-4">
          <button
            className="w-full max-w-md mx-auto h-14 text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 rounded-2xl"
            onClick={() => router.push('/welcome')}
          >

            Start Messaging
          </button>

          {/* Terms Text */}
          <p className="text-sm text-gray-500 text-center ">
            Learn more about Subworld

          </p>
        </div>
      </div>


      {showInstallPrompt && (
        <div className="md:hidden fixed z-50 mt-24 flex h-auto flex-col rounded-[20px] border border-[#3B3B3B]/30 bg-[#0F0F0F]/90 p-6 pb-[calc(3rem+env(safe-area-inset-bottom))] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.25)] backdrop-blur focus-visible:outline-none justify-start gap-8 text-left">
          <h2 className="text-xl font-normal text-white">
            Install the app for easier access!
          </h2>
          <ol className="space-y-2 text-gray-300 text-sm">
            <li className="flex items-center gap-2">
              1. Tap on the <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg> button in the browser menu
            </li>
            <li>2. Scroll down and select add to homescreen</li>
            <li className="flex items-center gap-2">
              3. Look for the Subworld icon on your homescreen
            </li>
          </ol>
          <button
            onClick={() => setShowInstallPrompt(false)}
            className="w-full bg-[#3c5ac6] hover:bg-[#3c5ac6]/90 text-white py-3 rounded-2xl transition-colors"
          >
            Done
          </button>
        </div>
      )}


    </main>
  )
}
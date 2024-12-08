import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col h-screen items-center justify-center">
      <h1 className="text-5xl font-bold mb-4">Subworld</h1>
      <Link href="/home" className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
        Get Started
      </Link>
    </div>
  )
}
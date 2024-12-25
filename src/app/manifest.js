export default function manifest() {
  return {
    name: 'Subworld',
    short_name: 'Subworld',
    description: 'A decentralized messaging app',
    start_url: '/',
    display: 'standalone',
    background_color: '#1f2937', 
    theme_color: 'rgb(17, 24, 39)', 
    icons: [
      {
        src: '/Logo-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/Logo-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
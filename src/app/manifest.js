

import { MetadataRoute } from 'next'

export default function manifest(){
  return {
    name: "Subworld",
    short_name: "Subworld",
    description: "A secure, end-to-end encrypted messaging application",
    start_url: "/",
    display: "standalone",
    background_color: "#0E0F14",
    theme_color: "0E0F14",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ],
    categories: ["social", "communication", "peer-to-peer"],
    lang: "en-US",
    dir: "ltr"
  }
}



import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport = {
  maximumScale: 1,
  userScalable: false
}

export const metadata = {
  title: "Subworld",
  description: "A decentralized messaging app",
  icon: "Logo-512x512.png", // Add the path to your icon image
  keywords: "decentralized, messaging, app, pwa",
  charset: "UTF-8",
  viewport: "width=device-width, initial-scale=1.0"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet={metadata.charset} />
        <meta name="viewport" content={metadata.viewport} />
        <meta name="description" content={metadata.description} />
        <meta name="keywords" content={metadata.keywords} />
        <meta name="author" content={metadata.author} />
        <link rel="icon" href={metadata.icon} />
        <title>{metadata.title}</title>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

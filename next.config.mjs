/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const diceServerUrl = process.env.DICE_SERVER_URL || 'http://localhost:5001'
    
    return [
      // Proxy dice game API routes to Express server
      {
        source: '/api/dice/:path*',
        destination: `${diceServerUrl}/api/dice/:path*`,
      },
      // Proxy chat API routes to Express server
      {
        source: '/api/chat/:path*',
        destination: `${diceServerUrl}/api/chat/:path*`,
      },
    ]
  },
}

export default nextConfig

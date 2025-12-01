/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  webpack: (config, { isServer }) => {
    // Handle external dependencies that might have compiled code
    if (isServer) {
      config.externals = config.externals || []
      // Don't externalize these - let webpack bundle them
      // But ensure they're handled correctly
    }
    return config
  },
  // Ensure these packages are properly bundled
  transpilePackages: [],
}

module.exports = nextConfig


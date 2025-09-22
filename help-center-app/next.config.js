/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Configure webpack to handle react-native-web
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Transform all direct `react-native` imports to `react-native-web`
      'react-native$': 'react-native-web',
    };
    return config;
  },
  // Handle images from Expo/RN
  images: {
    disableStaticImages: true,
  },
};

module.exports = nextConfig;

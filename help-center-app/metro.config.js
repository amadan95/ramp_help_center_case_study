// Ensure Metro resolves expo-router for static export on Vercel
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('metro-config').ConfigT} */
module.exports = (async () => {
	const config = await getDefaultConfig(__dirname);
	config.resolver = config.resolver || {};
	config.resolver.extraNodeModules = {
		...(config.resolver.extraNodeModules || {}),
		// Alias expo-router SSR entry to a local no-op stub so export doesn't require expo-router
		'expo-router/node/render.js': path.join(__dirname, 'stubs/expo-router-render.js')
	};
	return config;
})();

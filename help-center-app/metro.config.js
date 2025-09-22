// Ensure Metro resolves expo-router for static export on Vercel
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('metro-config').ConfigT} */
module.exports = (async () => {
	const config = await getDefaultConfig(__dirname);
	config.resolver = config.resolver || {};
	config.resolver.extraNodeModules = {
		...(config.resolver.extraNodeModules || {}),
		'expo-router/node/render.js': require.resolve('expo-router/build/render')
	};
	return config;
})();

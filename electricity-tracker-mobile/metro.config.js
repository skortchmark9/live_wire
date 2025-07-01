const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../');

const config = getDefaultConfig(projectRoot);

// Add all shared packages and workspace folders
config.watchFolders = [
  path.resolve(workspaceRoot, 'packages/shared/src'),
  path.resolve(workspaceRoot, 'packages/shared'),
  path.resolve(workspaceRoot, 'electricity-tracker'),
  path.resolve(workspaceRoot, 'node_modules')
];

// Point to source files directly for hot reload
config.resolver.alias = {
  '@electricity-tracker/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
};

// Force Metro to resolve TypeScript files from source
config.resolver.sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json'];

// Debug logging
console.log('Metro config - workspaceRoot:', workspaceRoot);
console.log('Metro config - shared src path:', path.resolve(workspaceRoot, 'packages/shared/src'));

// Optional: Fix Metro resolution for monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

module.exports = withNativeWind(config, { input: './global.css' });


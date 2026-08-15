// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. 显式 projectRoot（Expo 57 monorepo 自动检测可能误判为 workspace root）
config.projectRoot = projectRoot;
// 2. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 3. Let Metro resolve modules from the project first, then the workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;

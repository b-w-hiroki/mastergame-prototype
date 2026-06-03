// Expo Metro 設定。
// @supabase/supabase-js が optional に参照する `@opentelemetry/api` は未インストールのため、
// Metro のバンドル解決を空モジュールにフォールバックさせる（実行時は try/catch で無効化される）。
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const EMPTY = require.resolve('./shim/empty.js');
const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@opentelemetry/api') {
    return { type: 'sourceFile', filePath: EMPTY };
  }
  const next = baseResolveRequest || context.resolveRequest;
  return next(context, moduleName, platform);
};

module.exports = config;

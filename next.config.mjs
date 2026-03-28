/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WASM用の設定 (背景透過ライブラリ対応用)
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
  turbopack: {} // 起動クラッシュ防止用
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native Node.js modules (ffmpeg, ffprobe) server-side only.
  // These packages contain binary files (.exe, README.md) that cannot be
  // bundled for the browser — they must only run in API routes.
  serverExternalPackages: [
    'fluent-ffmpeg',
    'ffmpeg-static',
    '@ffprobe-installer/ffprobe',
    '@ffprobe-installer/win32-x64',
  ],

  // Turbopack: suppress "Unknown module type" errors for README.md and
  // binary assets inside the ffmpeg/ffprobe installer packages.
  // serverExternalPackages above prevents these from being bundled, but
  // Turbopack may still attempt to resolve them during module graph traversal.
  turbopack: {
    ignoreIssue: [
      {
        // Matches any file inside @ffprobe-installer sub-packages
        path: '**/node_modules/@ffprobe-installer/**',
      },
      {
        // Matches README.md files inside ffmpeg-static
        path: '**/node_modules/ffmpeg-static/**',
      },
      {
        // Matches any binary/non-JS asset inside fluent-ffmpeg
        path: '**/node_modules/fluent-ffmpeg/**',
      },
    ],
  },
};

export default nextConfig;

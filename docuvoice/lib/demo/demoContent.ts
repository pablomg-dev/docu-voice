import type { Section } from '@/types'

/**
 * Hardcoded Next.js documentation excerpt used for Demo Mode.
 * These sections are pre-classified and map to pre-generated audio in /public/demo/.
 */
export const DEMO_SECTIONS: Array<Section & { startTimestamp: number; endTimestamp: number }> = [
  {
    index: 0,
    title: 'Introduction to Next.js',
    type: 'introduction',
    text: 'Next.js is a React framework for building full-stack web applications. You use React components to build user interfaces, and Next.js for additional features and optimizations. Under the hood, Next.js also abstracts and automatically configures tooling needed for React, like bundling, compiling, and more.',
    startTimestamp: 0,
    endTimestamp: 8000,
  },
  {
    index: 1,
    title: 'Getting Started',
    type: 'steps',
    text: 'To create a new Next.js app, run: npx create-next-app@latest. On installation, you will see prompts to configure your project. After the prompts, create-next-app will create a folder with your project name and install the required dependencies.',
    startTimestamp: 8500,
    endTimestamp: 16000,
  },
  {
    index: 2,
    title: 'Installation',
    type: 'code',
    text: 'npx create-next-app@latest my-app --typescript --tailwind --eslint. cd my-app. npm run dev',
    startTimestamp: 16500,
    endTimestamp: 22000,
  },
  {
    index: 3,
    title: 'Important Note',
    type: 'warning',
    text: 'Warning: Next.js requires Node.js 18.18 or later. Please ensure your Node.js version is up to date before proceeding with installation.',
    startTimestamp: 22500,
    endTimestamp: 28000,
  },
  {
    index: 4,
    title: 'App Router',
    type: 'introduction',
    text: 'Next.js uses a file-system based router where folders are used to define routes. Each folder represents a route segment that maps to a URL segment. The App Router supports layouts, nested routing, loading states, error handling, and more.',
    startTimestamp: 28500,
    endTimestamp: 36000,
  },
  {
    index: 5,
    title: 'Key Features',
    type: 'steps',
    text: 'Next.js provides: Server Components for improved performance. Client Components for interactivity. File-based routing with the App Router. Built-in CSS and Tailwind CSS support. API Routes for backend functionality. Image optimization with the Image component. Font optimization with next/font.',
    startTimestamp: 36500,
    endTimestamp: 44000,
  },
]

export const DEMO_TITLE = 'Next.js Documentation'
export const DEMO_SESSION_ID = 'demo-session'

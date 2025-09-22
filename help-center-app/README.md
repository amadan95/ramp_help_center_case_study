# Ramp Help Center App (Next.js Version)

This project is a Next.js version of the Ramp Help Center application, optimized for deployment on Vercel.

## Features

- Content categorization and filtering
- Advanced search capabilities
- User feedback metrics and sentiment analysis
- Multiple view modes: Human experience, Operator console, and AI retrieval
- Responsive design

## Getting Started

### Prerequisites

- Node.js 14.x or later

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:3000

## Building for Production

```bash
npm run build
```

## Deployment

This application is configured for deployment on Vercel. Simply connect your repository to Vercel, and it will automatically deploy when changes are pushed.

## Project Structure

- `/pages` - Next.js pages
- `/public` - Static assets
- `/src`
  - `/components` - React components
  - `/hooks` - Custom React hooks
  - `/utils` - Utility functions
  - `/theme.next.js` - Theme configuration
- `/styles` - CSS modules

## Key Components

- `ArticleCard` - Displays article information in a card format
- `FilterSection` - Provides filtering options for content
- `DefinitionTooltip` - Shows definitions when hovering over specialized terms

## Additional Notes

This application uses Next.js and React to provide a modern web experience. It's optimized for performance and SEO, making it ideal for a help center application.

import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'pdfkit'],
  outputFileTracingIncludes: { '/api/runs/*/download': ['./assets/fonts/*.ttf'], '/api/example/download': ['./assets/fonts/*.ttf'] },
};
export default config;

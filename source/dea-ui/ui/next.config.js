/** @type {import('next').NextConfig} */

const STAGE = process.env.NEXT_PUBLIC_STAGE ?? 'devsample';
const USING_CUSTOM_DOMAIN = process.env.NEXT_PUBLIC_IS_USING_CUSTOM_DOMAIN?.trim().toLowerCase() === 'true';
const basePath = USING_CUSTOM_DOMAIN ? `/ui` : `/${STAGE}/ui`;

const nextConfig = {
  images: { unoptimized: true },
  basePath,
  output: 'export',
  transpilePackages: ['@cloudscape-design/components', '@cloudscape-design/component-toolkit'],
  eslint: {
    // ESLint is run as a separate lint step; skip it during next build to avoid
    // eslint-plugin-import@2.x incompatibility with ESLint 10.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

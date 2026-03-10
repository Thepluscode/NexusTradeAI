import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'NexusTradeAI';
const DEFAULT_DESCRIPTION = 'AI-powered automated trading dashboard for stocks, forex, and crypto. Real-time monitoring, automated strategies, and advanced analytics.';
const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://nexus-dashboard-production-e6e6.up.railway.app';

interface SEOProps {
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
}

export default function SEO({ title, description = DEFAULT_DESCRIPTION, path = '/', noindex = false }: SEOProps) {
  const fullTitle = title === 'Overview' ? `${SITE_NAME} — AI Trading Dashboard` : `${title} | ${SITE_NAME}`;
  const canonicalUrl = `${BASE_URL}${path}`;
  const robotsContent = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta name="robots" content={robotsContent} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={`${BASE_URL}/og-image.svg`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${BASE_URL}/og-image.svg`} />
    </Helmet>
  );
}

export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /merci/
Disallow: /builder-preview/
Disallow: /contact.php
Disallow: /elements.php

Sitemap: https://loyna.fr/sitemap-index.xml
`;
  return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}

// /merci/ n'est pas bloquée : elle porte « noindex », que les moteurs doivent pouvoir lire.
export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /builder-preview/
Disallow: /espace-commercial/
Disallow: /contact.php
Disallow: /elements.php

Sitemap: https://loyna.fr/sitemap-index.xml
`;
  return new Response(body, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}

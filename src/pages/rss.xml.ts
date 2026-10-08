import rss from '@astrojs/rss';
import type {APIContext} from 'astro';
import {getArticles} from '../lib/builder';

export async function GET(context: APIContext) {
  const articles = await getArticles();
  return rss({
    title: 'Blog LOYNA — fidéliser ses clients',
    description: 'Guides pratiques pour les commerçants : carte de fidélité digitale, Apple Wallet, Google Wallet, relance des clients.',
    site: context.site!,
    items: articles.map((a) => ({title: a.title, description: a.metaDescription, pubDate: new Date(a.date), link: `/blog/${a.slug}/`})),
    customData: '<language>fr-fr</language>',
  });
}

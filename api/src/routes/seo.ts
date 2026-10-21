import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db.js'
import { env } from '../lib/env.js'
import { getSettings } from '../lib/settings.js'

// robots.txt and sitemap.xml for search engines. Served at the site root through nginx.

const POLICIES = ['shipping', 'refunds', 'privacy', 'terms', 'research-use']

export async function seoRoutes(app: FastifyInstance) {
  app.get('/robots.txt', { logLevel: 'silent' }, async (_req, reply) => {
    reply.header('content-type', 'text/plain; charset=utf-8').header('cache-control', 'public, max-age=3600')
    return [
      'User-agent: *',
      'Allow: /',
      // Private or per-customer pages: nothing useful for search results.
      'Disallow: /admin',
      'Disallow: /account',
      'Disallow: /checkout',
      'Disallow: /order/',
      'Disallow: /partners/dashboard',
      'Disallow: /reset-password',
      'Disallow: /api/',
      'Disallow: /mail',
      'Disallow: /webmail',
      '',
      `Sitemap: ${env.publicUrl}/sitemap.xml`,
      '',
    ].join('\n')
  })

  app.get('/sitemap.xml', { logLevel: 'silent' }, async (_req, reply) => {
    const s = await getSettings()
    const products = await db.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      select: { slug: true, updatedAt: true },
    })
    const latest = products.reduce((a, p) => (p.updatedAt > a ? p.updatedAt : a), new Date(0))
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const pages: { path: string; priority: string; lastmod?: string }[] = [
      { path: '/', priority: '1.0', lastmod: day(latest) },
      { path: '/shop', priority: '0.9', lastmod: day(latest) },
      { path: '/coa-library', priority: '0.8' },
      ...(s.bulk?.enabled !== false ? [{ path: '/bulk', priority: '0.6' }] : []),
      ...(s.box?.enabled !== false ? [{ path: '/build-a-box', priority: '0.6' }] : []),
      { path: '/partners', priority: '0.5' },
      { path: '/points', priority: '0.4' },
      { path: '/about', priority: '0.5' },
      { path: '/faq', priority: '0.5' },
      { path: '/bmi-calculator', priority: '0.6' },
      { path: '/contact', priority: '0.4' },
      ...POLICIES.map((p) => ({ path: `/policies/${p}`, priority: '0.2' })),
      ...products.map((p) => ({ path: `/shop/${p.slug}`, priority: '0.8', lastmod: day(p.updatedAt) })),
    ]
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${env.publicUrl}${p.path}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}<priority>${p.priority}</priority></url>`).join('\n')}
</urlset>
`
    reply.header('content-type', 'application/xml; charset=utf-8').header('cache-control', 'public, max-age=3600')
    return xml
  })
}

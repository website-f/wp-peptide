import { useEffect } from 'react'
import { useLocation } from 'react-router'

// Per-page title, description, canonical link, social preview and optional structured data.
// index.html carries the site-wide defaults (and the Organization / WebSite data).

const SITE = 'KYVO Labs'
export const DEFAULT_DESCRIPTION =
  'Research peptides with a certificate of analysis for every batch: HPLC-verified purity, batch numbers and full lab reports. Shipped across Malaysia. For laboratory research use only.'

function meta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (content === null) return el?.remove()
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function link(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function jsonLd(data: object | null) {
  document.head.querySelector('script[data-page-ld]')?.remove()
  if (!data) return
  const el = document.createElement('script')
  el.type = 'application/ld+json'
  el.dataset.pageLd = ''
  el.text = JSON.stringify(data)
  document.head.appendChild(el)
}

export type Seo = {
  /** Page title without the site name (it is appended). Omit on the home page. */
  title?: string
  description?: string
  /** Absolute or site-relative image for link previews. */
  image?: string
  /** Keep private or thin pages (account, checkout, not found) out of search results. */
  noindex?: boolean
  /** Structured data for this page only (e.g. a Product). */
  data?: object | null
}

export function useSeo(seo: Seo) {
  const { pathname } = useLocation()
  const key = JSON.stringify(seo)
  useEffect(() => {
    const origin = window.location.origin
    const title = seo.title ? `${seo.title} | ${SITE}` : `${SITE} | Research Peptides with a Certificate for Every Batch`
    const description = seo.description ?? DEFAULT_DESCRIPTION
    const image = seo.image ? (seo.image.startsWith('http') ? seo.image : origin + seo.image) : `${origin}/og.jpg`
    const url = origin + (pathname === '/' ? '/' : pathname.replace(/\/$/, ''))
    document.title = title
    meta('name', 'description', description)
    meta('name', 'robots', seo.noindex ? 'noindex, nofollow' : null)
    link('canonical', url)
    meta('property', 'og:title', title)
    meta('property', 'og:description', description)
    meta('property', 'og:url', url)
    meta('property', 'og:image', image)
    meta('name', 'twitter:title', title)
    meta('name', 'twitter:description', description)
    meta('name', 'twitter:image', image)
    jsonLd(seo.data ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pathname])
}

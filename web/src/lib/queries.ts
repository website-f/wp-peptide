import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { useCart } from './cart'
import { configureCurrency } from './format'
import { getRefCode } from './referral'
import type { Category, Coa, Me, ProductCard, ProductDetail, Quote, Settings } from './types'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const s = await api.get<Settings>('/api/settings')
      configureCurrency(s.currency)
      return s
    },
    staleTime: 5 * 60_000,
  })
}

/** Optional programs switched on in Admin > Settings. Defaults to off while settings load. */
export function useFeatures() {
  const { data } = useSettings()
  return { membership: data?.features?.membership ?? false, loaded: Boolean(data) }
}

/** Which buying programs the admin has switched on (Admin > Settings). */
export function usePrograms() {
  const { data } = useSettings()
  return {
    loaded: Boolean(data),
    tiers: Boolean(data?.tierPricing?.enabled && data.tiers.length > 0),
    bulk: data?.bulk?.enabled ?? true,
    box: data?.box?.enabled ?? true,
  }
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/api/auth/me'), staleTime: 60_000 })
}

export function useRefreshMe() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['me'] })
}

export function useProducts(params: { q?: string; category?: string; sort?: string; featured?: boolean; box?: boolean } = {}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () =>
      api.get<ProductCard[]>('/api/products', {
        q: params.q,
        category: params.category,
        sort: params.sort,
        featured: params.featured ? 1 : undefined,
        box: params.box ? 1 : undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.get<{ product: ProductDetail; related: ProductCard[] }>(`/api/products/${slug}`),
    enabled: Boolean(slug),
    staleTime: 60_000,
  })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories'), staleTime: 5 * 60_000 })
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Server-priced cart. The API is the single source of truth for tiers, codes, points and shipping. */
export function useCartQuote(redeemPoints = 0) {
  const items = useCart((s) => s.items)
  const couponCode = useCart((s) => s.couponCode)
  const payload = useMemo(
    () => ({
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      couponCode: couponCode || null,
      refCode: getRefCode(),
      redeemPoints,
    }),
    [items, couponCode, redeemPoints],
  )
  const debounced = useDebounced(payload)
  return useQuery({
    queryKey: ['quote', debounced],
    queryFn: () => api.post<Quote>('/api/cart/quote', { ...debounced, mode: 'standard' }),
    enabled: debounced.items.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useCoas(q?: string) {
  return useQuery({
    queryKey: ['coas', q ?? ''],
    queryFn: () => api.get<Coa[]>('/api/coas', { q }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminCategory, AdminProduct, DashboardData, SettingsResponse } from './types'

/** Work-queue counts for the sidebar badges. Shares the cache with the 30-day dashboard. */
export function useAdminQueue() {
  return useQuery({
    queryKey: ['admin', 'dashboard', 30],
    queryFn: () => api.get<DashboardData>('/api/admin/dashboard', { days: 30 }),
    select: (d) => d.queue,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

export function useAdminCategories() {
  return useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<AdminCategory[]>('/api/admin/categories'), staleTime: 60_000 })
}

export function useAdminProducts() {
  return useQuery({ queryKey: ['admin', 'products'], queryFn: () => api.get<AdminProduct[]>('/api/admin/products'), staleTime: 60_000 })
}

/** Store settings as the admin panel sees them (unlicensed add-ons are stripped by the server). */
export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/api/admin/settings'),
    staleTime: 30_000,
  })
}

/**
 * Which paid add-ons this installation is licensed for. The single place the panel decides
 * whether anything about membership may appear. Defaults to hidden while loading.
 *
 * - `membership`: the add-on is licensed, so its settings may be shown.
 * - `membershipOn`: licensed and switched on, so tiers mean something on customers and orders.
 */
export function useLicensed() {
  const { data } = useAdminSettings()
  const membership = data?.licensed?.membership === true
  return {
    membership,
    membershipOn: membership && data?.settings.features?.membership === true,
    loaded: Boolean(data),
  }
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminCategory, DashboardData } from './types'

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

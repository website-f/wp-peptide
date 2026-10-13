import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface CartItem {
  variantId: string
  productId: string
  slug: string
  name: string
  variantLabel: string
  image: string | null
  unitPriceCents: number
  quantity: number
}

interface CartState {
  items: CartItem[]
  couponCode: string
  open: boolean
  add: (item: Omit<CartItem, 'quantity'>, qty?: number) => void
  setQty: (variantId: string, qty: number) => void
  remove: (variantId: string) => void
  clear: () => void
  setCoupon: (code: string) => void
  setOpen: (open: boolean) => void
}

// Storage can throw (private mode, blocked site data); fall back to memory.
const safeStorage = createJSONStorage(() => {
  try {
    const k = '__kyvo_probe'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
  }
})

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      couponCode: '',
      open: false,
      add: (item, qty = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.variantId === item.variantId)
          const items = existing
            ? s.items.map((i) => (i.variantId === item.variantId ? { ...i, quantity: Math.min(999, i.quantity + qty) } : i))
            : [...s.items, { ...item, quantity: qty }]
          return { items, open: true }
        }),
      setQty: (variantId, qty) =>
        set((s) => ({
          items: qty <= 0 ? s.items.filter((i) => i.variantId !== variantId) : s.items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(999, qty) } : i)),
        })),
      remove: (variantId) => set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) })),
      clear: () => set({ items: [], couponCode: '' }),
      setCoupon: (couponCode) => set({ couponCode }),
      setOpen: (open) => set({ open }),
    }),
    {
      name: 'kyvo-cart',
      storage: safeStorage,
      partialize: (s) => ({ items: s.items, couponCode: s.couponCode }),
    },
  ),
)

export const cartCount = (items: CartItem[]) => items.reduce((a, i) => a + i.quantity, 0)

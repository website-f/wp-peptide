import { lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { StoreLayout } from '@/components/layout/StoreLayout'

const p = <T extends { default: React.ComponentType }>(f: () => Promise<T>) => lazy(f)

// Storefront
const Home = p(() => import('@/pages/Home'))
const Shop = p(() => import('@/pages/Shop'))
const ProductPage = p(() => import('@/pages/ProductPage'))
const Checkout = p(() => import('@/pages/Checkout'))
const OrderPage = p(() => import('@/pages/OrderPage'))
const BuildBox = p(() => import('@/pages/BuildBox'))
const Bulk = p(() => import('@/pages/Bulk'))
const CoaLibrary = p(() => import('@/pages/CoaLibrary'))
const Membership = p(() => import('@/pages/Membership'))
const Points = p(() => import('@/pages/Points'))
const Contact = p(() => import('@/pages/Contact'))
const About = p(() => import('@/pages/About'))
const Faq = p(() => import('@/pages/Faq'))
const NotFound = p(() => import('@/pages/NotFound'))

// Customer + partner
const Partners = p(() => import('@/pages/Partners'))
const PartnerDashboard = p(() => import('@/pages/PartnerDashboard'))
const Login = p(() => import('@/pages/auth/Login'))
const Register = p(() => import('@/pages/auth/Register'))
const Account = p(() => import('@/pages/Account'))
const Policy = p(() => import('@/pages/Policy'))

// Admin (separate chunk; never loaded by shoppers)
const AdminLayout = p(() => import('@/admin/AdminLayout'))
const AdminDashboard = p(() => import('@/admin/pages/Dashboard'))
const AdminOrders = p(() => import('@/admin/pages/Orders'))
const AdminOrderDetail = p(() => import('@/admin/pages/OrderDetail'))
const AdminProducts = p(() => import('@/admin/pages/Products'))
const AdminProductEdit = p(() => import('@/admin/pages/ProductEdit'))
const AdminCoas = p(() => import('@/admin/pages/Coas'))
const AdminCustomers = p(() => import('@/admin/pages/Customers'))
const AdminCustomerDetail = p(() => import('@/admin/pages/CustomerDetail'))
const AdminPartners = p(() => import('@/admin/pages/Partners'))
const AdminPartnerDetail = p(() => import('@/admin/pages/PartnerDetail'))
const AdminFinance = p(() => import('@/admin/pages/Finance'))
const AdminSubscriptions = p(() => import('@/admin/pages/Subscriptions'))
const AdminCoupons = p(() => import('@/admin/pages/Coupons'))
const AdminInbox = p(() => import('@/admin/pages/Inbox'))
const AdminSettings = p(() => import('@/admin/pages/Settings'))

const router = createBrowserRouter([
  {
    element: <StoreLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/shop', element: <Shop /> },
      { path: '/shop/:slug', element: <ProductPage /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/order/:number', element: <OrderPage /> },
      { path: '/build-a-box', element: <BuildBox /> },
      { path: '/bulk', element: <Bulk /> },
      { path: '/coa-library', element: <CoaLibrary /> },
      { path: '/membership', element: <Membership /> },
      { path: '/points', element: <Points /> },
      { path: '/contact', element: <Contact /> },
      { path: '/about', element: <About /> },
      { path: '/faq', element: <Faq /> },
      { path: '/partners', element: <Partners /> },
      { path: '/partners/dashboard', element: <PartnerDashboard /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/account', element: <Account /> },
      { path: '/account/:tab', element: <Account /> },
      { path: '/policies/:slug', element: <Policy /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'orders', element: <AdminOrders /> },
      { path: 'orders/:id', element: <AdminOrderDetail /> },
      { path: 'products', element: <AdminProducts /> },
      { path: 'products/new', element: <AdminProductEdit /> },
      { path: 'products/:id', element: <AdminProductEdit /> },
      { path: 'coas', element: <AdminCoas /> },
      { path: 'customers', element: <AdminCustomers /> },
      { path: 'customers/:id', element: <AdminCustomerDetail /> },
      { path: 'partners', element: <AdminPartners /> },
      { path: 'partners/:id', element: <AdminPartnerDetail /> },
      { path: 'finance', element: <AdminFinance /> },
      { path: 'subscriptions', element: <AdminSubscriptions /> },
      { path: 'coupons', element: <AdminCoupons /> },
      { path: 'inbox', element: <AdminInbox /> },
      { path: 'settings', element: <AdminSettings /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

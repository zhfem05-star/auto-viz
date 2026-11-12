import type { RouteObject } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SectionPage } from '@/pages/SectionPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'projects/:projectId/:section', element: <SectionPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

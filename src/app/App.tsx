import { RouterProvider } from 'react-router'
import { ToastProvider } from '@/ui/Toast'
import { DataProvider } from './DataProvider'
import { appRouter } from './router'
import { UpdatePrompt } from './UpdatePrompt'

export function App() {
  return (
    <DataProvider>
      <ToastProvider>
        <RouterProvider router={appRouter()} />
        <UpdatePrompt />
      </ToastProvider>
    </DataProvider>
  )
}

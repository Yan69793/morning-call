import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { Footer } from './components/layout/Footer'
import { Dashboard } from './pages/Dashboard'
import { Strategy } from './pages/Strategy'
import { Operator } from './pages/Operator'
import { History } from './pages/History'
import { Signals } from './pages/Signals'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-bg dark:bg-dark-bg">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-4">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/strategy" element={<Strategy />} />
              <Route path="/operator" element={<Operator />} />
              <Route path="/history" element={<History />} />
              <Route path="/signals" element={<Signals />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </div>
    </BrowserRouter>
  )
}

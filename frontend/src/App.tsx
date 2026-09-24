import { Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Problem from './pages/Problem'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/problem/:id" element={<Problem />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}

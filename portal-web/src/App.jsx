import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Pago from './pages/Pago';

// Layout simple
const MainLayout = ({ children }) => (
  <div className="min-h-screen font-sans">
    {children}
  </div>
);

// Placeholder para el panel administrativo (Desktop y Móvil)
const AdminPanel = () => {
    return (
        <div className="flex bg-slate-50 min-h-screen">
            <aside className="w-64 bg-slate-100 border-r border-slate-200 text-slate-700 hidden md:flex flex-col p-6 sticky top-0 h-screen transition-all duration-500">
                <h2 className="text-2xl font-black mb-12 tracking-tighter text-primary">VYJ ADMIN</h2>
                <nav className="flex flex-col gap-4">
                    <button className="flex items-center gap-3 px-4 py-2 bg-primary/10 text-primary font-bold rounded-xl">📊 Dashboard</button>
                    <button className="flex items-center gap-3 px-4 py-2 hover:bg-slate-200 rounded-xl transition-colors">👥 Clientes</button>
                    <button className="flex items-center gap-3 px-4 py-2 hover:bg-slate-200 rounded-xl transition-colors">💰 Préstamos</button>
                    <button className="flex items-center gap-3 px-4 py-2 hover:bg-slate-200 rounded-xl transition-colors">⚙️ Configuración</button>
                </nav>
            </aside>
            <main className="flex-1 p-6 md:p-12 overflow-y-auto w-full">
                <header className="flex justify-between items-center mb-12 flex-wrap gap-4">
                    <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Buenas tardes, Virgilio</h1>
                    <button className="btn-primary btn px-6">Nuevo Préstamo</button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="card">
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-wide">Capital en Calle</span>
                        <div className="text-3xl font-display font-black mt-2 text-primary">$18.5M</div>
                    </div>
                    <div className="card">
                         <span className="text-sm font-bold text-slate-400 uppercase tracking-wide">Réditos Pendientes</span>
                         <div className="text-3xl font-display font-black mt-2 text-amber-500">$1.2M</div>
                    </div>
                    <div className="card">
                         <span className="text-sm font-bold text-slate-400 uppercase tracking-wide">Mora Crítica</span>
                         <div className="text-3xl font-display font-black mt-2 text-rose-500">$450K</div>
                    </div>
                </div>
            </main>
        </div>
    )
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Ruta para el portal de pagos de clientes (MOBILE FIRST) */}
        <Route path="/pago/:idPrestamo" element={<Pago />} />
        
        {/* Ruta administrativa (Dashboard) */}
        <Route path="/admin/*" element={<AdminPanel />} />
        
        {/* Redirección por defecto */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Router>
  )
}

export default App

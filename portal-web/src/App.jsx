import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Pago from './pages/Pago.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function App() {
  return (
    <Router>
      <Routes>
        {/* Ruta pública para clientes: Pago y Escaneo IA */}
        <Route path="/pago/:idPrestamo" element={<Pago />} />
        
        {/* Ruta administrativa: Dashboard, Métricas e IA Approve Motor */}
        <Route path="/admin" element={<AdminDashboard />} />
        
        {/* Redirección automática al Dashboard al entrar a la raíz */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        
        {/* Fallback para rutas no encontradas */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

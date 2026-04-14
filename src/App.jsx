import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Pago from "./pages/Pago";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/lista" />} />
        <Route path="/lista" element={<Admin />} />
        <Route path="/pago/:idPrestamo" element={<Pago />} />
        <Route path="/estado/:idPrestamo" element={<Pago publicMode={true} />} />
      </Routes>
    </BrowserRouter>
  );
}

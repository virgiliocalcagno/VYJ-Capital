import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  Search, 
  TrendingUp, 
  ArrowUpRight, 
  Building2, 
  Filter,
  DollarSign,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  Loader2
} from 'lucide-react';

const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

export default function Admin() {
  const [prestamos, setPrestamos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPrestamos = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "prestamos"));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPrestamos(data);
      } catch (err) {
        console.error("Error fetching loans:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrestamos();
  }, []);

  const filtered = prestamos.filter(p => 
    p.nombre_cliente?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCapitalColocado = prestamos.reduce((acc, p) => acc + (p.capital_actual || p.monto_principal || 0), 0);
  const totalInteresesPendientes = prestamos.reduce((acc, p) => acc + (p.interes_pendiente || 0), 0);

  if (loading) return <div className="min-h-screen bg-[#0b1120] flex items-center justify-center text-blue-400"><Loader2 className="animate-spin" size={48} /></div>;

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 selection:bg-blue-500/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                <Building2 className="text-blue-400" size={24} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight outfit gradient-text">VYJ CAPITAL | PANEL</h1>
            </div>
            <p className="text-slate-400 font-medium">Gestión de Cartera de Préstamos</p>
          </motion.div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Buscar cliente..." 
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500/40 outline-none transition-all placeholder:text-slate-600 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass p-6 rounded-2xl relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Capital Colocado</span>
              <div className="p-2 bg-blue-500/10 rounded-lg"><TrendingUp className="text-blue-400" size={16} /></div>
            </div>
            <div className="text-2xl font-bold outfit">{formatCurrency(totalCapitalColocado)}</div>
            <div className="text-[10px] text-blue-400 mt-1 flex items-center gap-1 font-bold">ACTIVO EN CARTERA <ArrowUpRight size={10} /></div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rotate-45 translate-x-10 -translate-y-10" />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass p-6 rounded-2xl">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Réditos por Cobrar</span>
              <div className="p-2 bg-emerald-500/10 rounded-lg"><DollarSign className="text-emerald-400" size={16} /></div>
            </div>
            <div className="text-2xl font-bold outfit">{formatCurrency(totalInteresesPendientes)}</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 font-bold">TOTAL PENDIENTE <ArrowUpRight size={10} /></div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass p-6 rounded-2xl">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Préstamos</span>
              <div className="p-2 bg-indigo-500/10 rounded-lg"><Users className="text-indigo-400" size={16} /></div>
            </div>
            <div className="text-2xl font-bold outfit">{prestamos.length}</div>
            <div className="text-[10px] text-indigo-400 mt-1 font-bold">CLIENTES ACTIVOS</div>
          </motion.div>
        </section>

        <section>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl overflow-hidden border-t-blue-500/20">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
              <h2 className="font-bold flex items-center gap-2"><Briefcase size={18} className="text-blue-400" /> Listado de Clientes</h2>
              <button className="text-xs text-slate-500 flex items-center gap-1 hover:text-blue-400 transition-colors uppercase font-bold tracking-widest"><Filter size={14} /> Filtros</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-slate-500 uppercase text-[10px] tracking-widest border-b border-slate-800 bg-slate-900/10">
                    <th className="px-6 py-4">Cliente / ID</th>
                    <th className="px-6 py-4">Capital Actual</th>
                    <th className="px-6 py-4">Gasto / Réditos</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filtered.map((p, idx) => (
                    <tr 
                      key={p.id} 
                      onClick={() => navigate(`/pago/${p.id}`)}
                      className="group hover:bg-white/[0.02] transition-all cursor-pointer border-l-2 border-transparent hover:border-blue-500"
                    >
                      <td className="px-6 py-5">
                        <div className="font-bold text-slate-200 uppercase tracking-tight group-hover:text-blue-400 transition-colors">{p.nombre_cliente}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{p.id.slice(0, 10).toUpperCase()}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="font-semibold">{formatCurrency(p.capital_actual || p.monto_principal)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">ORIGINAL: {formatCurrency(p.monto_principal)}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="font-semibold text-amber-400/90">{formatCurrency((p.interes_pendiente || 0) + (p.mora_acumulada || 0))}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">TASA: {p.tasa_interes}%</div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest ${p.estado === 'MORA' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {p.estado || 'ACTIVO'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                           <button className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-blue-600/20 hover:text-blue-400 transition-all">
                            <ChevronRight size={18} />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-500 font-medium">No se encontraron clientes con ese nombre.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-slate-900/30 border-t border-slate-800 text-center">
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                <ShieldCheck size={12} className="text-slate-600" /> Sistema Seguro VYJ Capital Cloud
              </p>
            </div>
          </motion.div>
        </section>

      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { motion } from 'framer-motion';
import { 
  Building2, 
  CreditCard, 
  Clock, 
  ShieldCheck, 
  Loader2, 
  Smartphone,
  AlertTriangle,
  Receipt,
  LayoutDashboard
} from 'lucide-react';

const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

export default function Pago() {
  const { idPrestamo } = useParams();
  const [prestamo, setPrestamo] = useState(null);
  const [transaccionesFinales, setTransaccionesFinales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, "prestamos", idPrestamo);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const pData = docSnap.data();
          setPrestamo(pData);
          
          const qSnap = await getDocs(collection(db, "transactions"));
          const allTrans = qSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(t => t.loan_id === idPrestamo || t.cliente_id === pData.cliente_id)
            .sort((a, b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

          let currentReditos = 0;
          let currentCapital = pData.monto_principal || 0;
          
          const history = allTrans.map(t => {
            const nota = (t.nota || t.descripcion || "").toUpperCase();
            const isPago = t.tipo_pago === 'pago_recibido' || t.pago > 0 || nota.includes('PAGO') || nota.includes('ABONO');
            const monto = t.monto_total || t.monto || t.pago || t.cargo || 0;
            
            if (!isPago) {
              if (t.tipo_pago === 'cargo_capital' || nota.includes('CAPITAL')) {
                currentCapital += monto;
              } else {
                currentReditos += monto; 
              }
            } else {
              if (currentReditos >= monto) {
                currentReditos -= monto;
              } else {
                const rest = monto - currentReditos;
                currentReditos = 0;
                currentCapital -= rest;
              }
            }

            return {
              ...t,
              cargoVal: !isPago ? monto : 0,
              pagoVal: isPago ? monto : 0,
              balReditos: currentReditos,
              balCapital: currentCapital,
              isPago: isPago,
              fechaFormatted: t.fecha?.toDate?.()?.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) || 'S/F'
            };
          });

          setTransaccionesFinales(history);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [idPrestamo]);

  if (loading) return <div className="min-h-screen bg-[#0b1120] flex items-center justify-center text-blue-400 font-black outfit uppercase tracking-widest"><Loader2 className="animate-spin mr-3" /> Cargando...</div>;
  if (!prestamo) return <div className="min-h-screen bg-[#0b1120] flex items-center justify-center text-white outfit uppercase font-bold text-center p-10">Préstamo no encontrado</div>;

  // LÓGICA DE CÁLCULO (RE-VERIFICADA)
  const capitalBalance = prestamo.capital_actual || prestamo.monto_principal || 0;
  const saldoReditosDB = prestamo.interes_pendiente || 0;
  const tasaRaw = prestamo.tasa_mensual || (prestamo.tasa_interes ? prestamo.tasa_interes/100 : 0.12);
  const tasaCalculo = tasaRaw < 1 ? tasaRaw : tasaRaw / 100;
  const montoCuota = capitalBalance * tasaCalculo;

  let morasAcumuladas = 0;
  transaccionesFinales.forEach(t => {
    const d = (t.nota || t.descripcion || "").toUpperCase();
    if (d.includes("MORA") || d.includes("AJUSTE")) morasAcumuladas += (t.cargoVal || 0);
  });

  let atrasosArrastrados = 0;
  let totalInteres = 0;

  // REPARACIÓN CRÍTICA: Cambiado saldoInteresDB por saldoReditosDB
  if (saldoReditosDB >= montoCuota) {
    totalInteres = saldoReditosDB;
    atrasosArrastrados = saldoReditosDB - montoCuota - morasAcumuladas;
  } else {
    atrasosArrastrados = saldoReditosDB;
    totalInteres = saldoReditosDB + montoCuota;
  }

  const totalSaldado = capitalBalance + totalInteres;
  const proximaFecha = prestamo.proximo_pago?.toDate?.()?.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }) || 'Corte';

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 font-sans selection:bg-blue-600/30">
      <div className="max-w-6xl mx-auto px-4 md:px-10 py-6 md:py-12">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-center md:items-end gap-6 border-b border-slate-800 pb-8 mb-10 md:mb-14">
          <div className="text-center md:text-left">
            <div className="flex items-center gap-3 justify-center md:justify-start mb-6">
              <div className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-900/30 ring-4 ring-blue-600/10">
                <Building2 className="text-white" size={32} />
              </div>
              <h1 className="text-3xl font-black outfit tracking-tighter text-white uppercase leading-none">VYJ CAPITAL</h1>
            </div>
            <span className="text-slate-600 text-[9px] font-black uppercase tracking-widest block mb-2">TITULAR DEL CRÉDITO</span>
            <h2 className="text-2xl md:text-3xl font-black text-white outfit uppercase tracking-tight">{prestamo.nombre_cliente}</h2>
          </div>
          
          <div className="bg-slate-900/60 p-5 rounded-3xl border border-slate-800 flex gap-8 md:gap-12 backdrop-blur-sm">
             <div className="text-center md:text-left">
                <span className="text-[9px] text-slate-600 font-black block uppercase mb-1">Status Cuenta</span>
                <span className="text-sm font-black text-emerald-400">ACTIVO</span>
             </div>
             <div className="text-center md:text-left">
                <span className="text-[9px] text-slate-600 font-black block uppercase mb-1">Referencia</span>
                <span className="text-sm font-black text-blue-500">#{idPrestamo.slice(0,6).toUpperCase()}</span>
             </div>
          </div>
        </header>

        {/* DASHBOARD */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-12">
          
          <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/50 flex flex-col justify-between hover:bg-slate-900 transition-colors">
            <span className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <CreditCard size={14} className="text-blue-500" /> Capital Pendiente
            </span>
            <div className="text-4xl font-black outfit text-white tracking-tighter">{formatCurrency(capitalBalance)}</div>
            <p className="text-[9px] text-slate-700 font-black mt-6 tracking-widest uppercase italic">Saldo Principal Base</p>
          </div>

          <div className="bg-[#111827] p-8 rounded-[2rem] border-2 border-slate-800 shadow-3xl relative overflow-hidden ring-4 ring-rose-500/5">
            <span className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
               <AlertTriangle size={14} className="text-amber-500" /> Cargos de Interés
            </span>
            <div className="space-y-4">
               <div className="flex justify-between text-rose-500">
                  <span className="text-[10px] font-black uppercase italic">Atrasos & Moras:</span>
                  <span className="text-xl font-black italic">{formatCurrency(atrasosArrastrados + morasAcumuladas)}</span>
               </div>
               <div className="flex justify-between text-slate-400">
                  <span className="text-[10px] font-black uppercase">Cuota {proximaFecha}:</span>
                  <span className="text-xl font-bold">{formatCurrency(cuotaDelMes)}</span>
               </div>
               <div className="pt-5 border-t border-white/5 flex flex-col items-center">
                  <div className="text-4xl md:text-5xl font-black text-amber-500 outfit tracking-tighter drop-shadow-xl">{formatCurrency(totalInteres)}</div>
                  <span className="text-[10px] text-amber-500/50 font-black tracking-[0.3em] mt-1">TOTAL INTERESES</span>
               </div>
            </div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 blur-3xl opacity-20" />
          </div>

          <div className="bg-blue-600 p-8 rounded-[2rem] shadow-[0_40px_100px_rgba(37,99,235,0.4)] border border-blue-400/30 flex flex-col justify-between md:col-span-2 lg:col-span-1 border-t-blue-400 group overflow-hidden">
            <span className="text-blue-100/60 text-[9px] font-black uppercase tracking-widest mb-6 block">LIQUIDACIÓN MÍNIMA</span>
            <div className="text-5xl font-black text-white outfit tracking-tighter mb-4 group-hover:scale-105 transition-transform origin-left">{formatCurrency(totalSaldado)}</div>
            <div className="flex justify-between items-center mt-6">
              <ShieldCheck size={24} className="text-white/40" />
              <div className="text-right">
                 <p className="text-[9px] text-white/70 font-black tracking-widest leading-tight">SISTEMA VYJ CAPITAL</p>
                 <p className="text-[8px] text-white/40 font-bold tracking-widest">VERSIÓN 5.2 PRO</p>
              </div>
            </div>
          </div>
        </section>

        {/* TABLA DUAL */}
        <section className="mb-24">
          <div className="bg-slate-900/20 rounded-[2.5rem] border border-slate-800/60 overflow-hidden shadow-3xl backdrop-blur-lg">
            <div className="p-8 bg-slate-900/60 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.4em] flex items-center gap-3">
                   <Clock size={16} className="text-blue-500" /> Movimientos Históricos
                </h3>
                <LayoutDashboard size={18} className="text-slate-700 hidden md:block" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#111827]/80 text-slate-600 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                  <tr>
                    <th className="px-8 py-7">Fecha</th>
                    <th className="px-8 py-7">Concepto</th>
                    <th className="px-8 py-7 text-right hidden md:table-cell">Monto Recibido</th>
                    <th className="px-8 py-7 text-right whitespace-nowrap">Balance Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/10 text-xs font-bold">
                  {transaccionesFinales.map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-blue-600/[0.04] transition-all group border-l-4 border-transparent hover:border-blue-600">
                      <td className="px-8 py-8 text-slate-500 font-mono text-[13px] italic">{t.fechaFormatted}</td>
                      <td className="px-8 py-8">
                        <div className="flex flex-col">
                          <span className="text-slate-200 uppercase text-[12px] group-hover:text-blue-400 transition-colors tracking-tight">{t.nota || t.descripcion || (t.isPago ? 'PAGO RECIBIDO' : 'CARGO INTERÉS')}</span>
                          {t.isPago && <span className="md:hidden text-emerald-500 mt-2 font-black text-[11px] bg-emerald-500/5 px-2 py-1 rounded inline-block w-fit">RECIBIMOS: {formatCurrency(t.pagoVal)}</span>}
                        </div>
                      </td>
                      <td className="px-8 py-8 text-right hidden md:table-cell">
                        {t.isPago ? (
                          <span className="text-emerald-500 font-black text-[15px]">{formatCurrency(t.pagoVal)}</span>
                        ) : (
                          <span className="text-slate-800">--</span>
                        )}
                      </td>
                      <td className="px-8 py-8 text-right font-black text-white whitespace-nowrap text-lg tracking-tighter font-mono">
                        {formatCurrency(t.balCapital + t.balReditos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-10 bg-black/20 text-center">
               <span className="text-[10px] text-slate-800 font-bold uppercase tracking-[1em]">VYJ Capital Private Equity</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

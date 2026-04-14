import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOCR } from '../services/useOCR';
import {
  Search, TrendingUp, DollarSign,
  ChevronRight, Loader2, Plus, X, Camera,
  MessageCircle, ExternalLink, Calendar, Clock, CheckCircle,
  Wallet, BarChart3, ShieldAlert
} from 'lucide-react';

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt = (val) => 'RD$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val) || 0);

/** Calcula la fecha del próximo vencimiento dado el día del mes */
function proximoVencimiento(diaPago) {
  const hoy = new Date();
  const dia = parseInt(diaPago) || 1;
  let fecha = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (fecha < hoySinHora) {
    fecha = new Date(hoy.getFullYear(), hoy.getMonth() + 1, dia);
  }
  return fecha;
}

/** Días hasta el vencimiento (negativo = ya venció) */
function diasHasta(diaPago) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const prox = proximoVencimiento(diaPago); prox.setHours(0, 0, 0, 0);
  return Math.round((prox - hoy) / 86400000);
}

function urgencyColor(dias) {
  if (dias < 0) return { 
    label: `VENCIDO (${Math.abs(dias)}d)`, 
    badge: 'bg-red-600 text-white', 
    cls: 'border-red-600/50 bg-red-600/10 text-red-500',
    text: 'text-red-500' 
  };
  if (dias < 2) return { 
    label: 'VENCE HOY', 
    badge: 'bg-red-500 text-white', 
    cls: 'border-red-500/50 bg-red-500/5 text-red-500', 
    text: 'text-red-500' 
  };
  if (dias <= 5) return { 
    label: `VENCE EN ${dias} DÍAS`, 
    badge: 'bg-yellow-500 text-slate-900', 
    cls: 'border-yellow-500/50 bg-yellow-500/5 text-yellow-500', 
    text: 'text-yellow-500' 
  };
  return { 
    label: `VENCE EN ${dias} DÍAS`, 
    badge: 'bg-emerald-500 text-white', 
    cls: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-500', 
    text: 'text-emerald-500' 
  };
}

function generarMensajeWA(p) {
  const redito = (Number(p.capital_actual) || 0) * (Number(p.tasa_mensual) < 1 ? Number(p.tasa_mensual) : Number(p.tasa_mensual) / 100);
  const mora = Number(p.mora_acumulada) || 0;
  const reditosAt = Number(p.interes_pendiente) || 0;
  const total = redito + mora + reditosAt;
  const dia = p.dia_pago || '?';
  const link = `${window.location.origin}/estado/${p.id}`;
  
  return encodeURIComponent(
    `Hola ${p.nombre_cliente},\n\n` +
    `Le recordamos que su pago mensual vence el día *${dia}*.\n\n` +
    `${p.fiador_nombre ? `Fiador: ${p.fiador_nombre}\n\n` : ''}` +
    `📊 *Resumen VYJ Capital:*\n` +
    `• Rédito del mes: ${fmt(redito)}\n` +
    `${reditosAt > 0 ? `• Réditos atrasados: ${fmt(reditosAt)}\n` : ''}` +
    `${mora > 0 ? `• Mora: ${fmt(mora)}\n` : ''}` +
    `• *Total a pagar: ${fmt(total)}*\n\n` +
    `${link}\n\n` +
    `_VYJ Capital – Control Financiero_`
  );
}

// ─── Campo de formulario reutilizable ─────────────────────────────────────────
function FormField({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-[#0f172a] border border-slate-700 rounded-xl py-2.5 px-3.5 text-sm focus:ring-2 focus:ring-blue-500/40 outline-none transition-all text-slate-200 placeholder:text-slate-600";

// ═══════════════════════════════════════════════════════════════════════════════
export default function Admin() {
  const [prestamos, setPrestamos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [vistaAdmin, setVistaAdmin] = useState('dashboard'); // 'dashboard' | 'cartera'

  const navigate = useNavigate();
  const { scanReceipt: scanId, loading: ocrLoading } = useOCR();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    nombre: '', cedula: '', telefono: '', direccion: '',
    fecha_nacimiento: '', garantia_descripcion: '', garantia_valor: '',
    monto: '', tasa: '12', dia_pago: '1', metodo: 'REDITO_PURO',
    referidor_nombre: '', comision_porcentaje: '', nota: '',
  });
  const fd = (k) => (e) => setFormData(prev => ({ ...prev, [k]: e.target.value }));

  const fetchPrestamos = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'prestamos'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPrestamos(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPrestamos(); }, []);

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const montoNum = parseFloat(formData.monto);
      const tasaNum = parseFloat(formData.tasa) / 100;
      const diaPago = parseInt(formData.dia_pago) || 1;

      const loanData = {
        nombre_cliente: formData.nombre.toUpperCase(),
        cedula_cliente: formData.cedula,
        telefono: formData.telefono || null,
        direccion: formData.direccion || null,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        monto_principal: montoNum,
        capital_actual: montoNum,
        tasa_mensual: tasaNum,
        interes_pendiente: 0,
        mora_acumulada: 0,
        estado: 'ACTIVO',
        metodo: formData.metodo,
        dia_pago: diaPago,
        proximo_pago: proximoVencimiento(diaPago),
        fecha_inicio: serverTimestamp(),
        nota_inicial: formData.nota || null,
        garantia_descripcion: formData.garantia_descripcion || null,
        garantia_valor: formData.garantia_valor ? parseFloat(formData.garantia_valor) : null,
        referidor_nombre: formData.referidor_nombre || null,
        comision_porcentaje: formData.comision_porcentaje ? parseFloat(formData.comision_porcentaje) : null,
      };

      const docRef = await addDoc(collection(db, 'prestamos'), loanData);
      await addDoc(collection(db, 'transactions'), {
        loan_id: docRef.id,
        tipo: 'desembolso',
        monto_total: montoNum,
        nota: 'DESEMBOLSO INICIAL',
        fecha: serverTimestamp(),
      });

      setShowModal(false);
      setFormData({ nombre: '', cedula: '', telefono: '', direccion: '', fecha_nacimiento: '', garantia_descripcion: '', garantia_valor: '', monto: '', tasa: '12', dia_pago: '1', metodo: 'REDITO_PURO', referidor_nombre: '', comision_porcentaje: '', nota: '' });
      fetchPrestamos();
    } catch (err) {
      console.error(err);
      alert('Error al crear préstamo: ' + err.message);
    } finally { setCreating(false); }
  };
  const migrarDaneisi = async () => {
    if (!confirm('¿Deseas crear el cliente DANEISI con su historial de pagos?')) return;
    setLoading(true);
    try {
      const loanData = {
        nombre_cliente: "DANEISI",
        cedula_cliente: "001-0000000-0",
        telefono: "+1 (809) 762-4362",
        monto_principal: 45000,
        capital_actual: 45000,
        tasa_mensual: 0.20,
        interes_pendiente: 13000,
        mora_acumulada: 0,
        estado: "ACTIVO",
        metodo: "REDITO_PURO",
        dia_pago: 15,
        fecha_inicio: serverTimestamp(),
        nota_inicial: "Migración automática de historial de pagos.",
      };

      const docRef = await addDoc(collection(db, "prestamos"), loanData);
      const payments = [
        { fecha: new Date(2025, 11, 19), monto: 9000, nota: "Noviembre Completo (1ra y 2da quincena)." },
        { fecha: new Date(2026, 0, 5), monto: 5000, nota: "Diciembre Completo (2da quincena) + $500 de abono a Enero." },
        { fecha: new Date(2026, 2, 6), monto: 18000, nota: "Enero y Febrero Completos (4 quincenas de $4,500)." }
      ];

      for (const p of payments) {
        await addDoc(collection(db, "transactions"), {
          loan_id: docRef.id,
          tipo: 'pago_interes',
          monto_total: p.monto,
          nota: p.nota,
          fecha: p.fecha,
          metodo_pago: 'efectivo'
        });
      }
      alert('Cliente Daneisi creado con éxito.');
      fetchPrestamos();
    } catch (err) {
      console.error(err);
      alert('Error en migración: ' + err.message);
    } finally { setLoading(false); }
  };

  const handleIdCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = await scanId(file);
    if (res) setFormData(prev => ({
      ...prev,
      nombre: res.nombre || prev.nombre,
      cedula: res.cedula || prev.cedula,
      fecha_nacimiento: res.fecha_nacimiento || prev.fecha_nacimiento,
      direccion: res.direccion || prev.direccion,
    }));
  };

  // ── Cálculos de dashboard ──────────────────────────────────────────────────
  const activos = prestamos.filter(p => p.estado !== 'SALDADO');
  const totalCapital = activos.reduce((s, p) => s + (Number(p.capital_actual) || 0), 0);
  const totalReditos = activos.reduce((s, p) => s + (Number(p.interes_pendiente) || 0), 0);
  const totalMora = activos.reduce((s, p) => s + (Number(p.mora_acumulada) || 0), 0);
  const totalReditosProx = activos.reduce((s, p) => {
    const tasa = Number(p.tasa_mensual) < 1 ? Number(p.tasa_mensual) : Number(p.tasa_mensual) / 100;
    return s + (Number(p.capital_actual) || 0) * tasa;
  }, 0);

  // Agenda: préstamos activos con dia_pago, ordenados por urgencia
  const agenda = activos
    .filter(p => p.dia_pago)
    .map(p => ({ ...p, _dias: diasHasta(p.dia_pago) }))
    .filter(p => p._dias <= 10)
    .sort((a, b) => a._dias - b._dias);

  const filtered = prestamos
    .filter(p => p.nombre_cliente?.toLowerCase().includes(searchTerm.toLowerCase()))
    .map(p => ({ ...p, _dias: p.dia_pago ? diasHasta(p.dia_pago) : 999 }))
    .sort((a, b) => a._dias - b._dias);

  if (loading) return (
    <div className="min-h-screen bg-[#070d1a] flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070d1a] text-slate-200 font-sans">

      {/* ── TOPBAR ── */}
      <div className="border-b border-slate-800 bg-[#0a1221] px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-sm text-white">V</div>
          <div>
            <span className="font-black text-white tracking-tight">VYJ CAPITAL</span>
            <span className="text-slate-500 text-xs ml-2 font-bold">Sistema de Préstamos</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-800/60 rounded-xl p-1 gap-1">
            {[['dashboard', 'Dashboard'], ['cartera', 'Cartera']].map(([key, label]) => (
              <button key={key} onClick={() => setVistaAdmin(key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${vistaAdmin === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={migrarDaneisi}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all border border-slate-700">
            <Plus size={14} /> Migrar Daneisi
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all">
            <Plus size={14} /> Nuevo Préstamo
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* DASHBOARD                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {vistaAdmin === 'dashboard' && (
          <div className="space-y-8">

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI icon={<Wallet size={20} className="text-blue-400" />} label="Capital en Mercado" value={fmt(totalCapital)} sub="Saldo insoluto activo" color="blue" />
              <KPI icon={<TrendingUp size={20} className="text-emerald-400" />} label="Réditos Próximos" value={fmt(totalReditosProx)} sub="Este ciclo de cobro" color="emerald" />
              <KPI icon={<DollarSign size={20} className="text-yellow-400" />} label="Réditos Atrasados" value={fmt(totalReditos)} sub="Pendientes de cobro" color="yellow" />
              <KPI icon={<ShieldAlert size={20} className="text-red-400" />} label="Mora Total" value={fmt(totalMora)} sub={`${activos.filter(p => p.estado === 'MORA').length} clientes en mora`} color="red" />
            </div>

            {/* Agenda de Cobros Unificada */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Calendar size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="font-black text-white text-sm uppercase tracking-wider">Cronograma de Cobros</h2>
                    <p className="text-xs text-slate-500 font-bold">Todos los clientes por orden de vencimiento</p>
                  </div>
                </div>
              </div>
              {agenda.length === 0 ? (
                <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-8 text-center">
                  <CheckCircle size={32} className="text-emerald-500 mx-auto mb-3" />
                  <p className="font-black text-slate-300 text-sm uppercase">Sin clientes activos en agenda</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agenda.map(p => {
                    const tasa = Number(p.tasa_mensual) < 1 ? Number(p.tasa_mensual) : Number(p.tasa_mensual) / 100;
                    const reditoMes = (Number(p.capital_actual) || 0) * tasa;
                    const reditosAt = Number(p.interes_pendiente) || 0;
                    const mora = Number(p.mora_acumulada) || 0;
                    const totalCobrar = reditoMes + reditosAt + mora;
                    
                    const tel = p.telefono?.replace(/\D/g, '');
                    const waMsg = generarMensajeWA(p);
                    const waUrl = tel ? `https://wa.me/1${tel}?text=${waMsg}` : null;

                    // Lógica de semáforo solicitada:
                    // Rojo: vence hoy (0) o mañana (1)
                    // Amarillo: 2 a 5 días
                    // Verde: 6 a 10 días
                    const cfg = p._dias < 2 
                      ? { label: 'VENCE HOY', cls: 'border-red-500/50 bg-red-500/10 text-red-500', badge: 'bg-red-500 text-white' } 
                      : p._dias <= 5 
                        ? { label: `VENCE EN ${p._dias} DÍAS`, cls: 'border-yellow-500/50 bg-yellow-500/5 text-yellow-500', badge: 'bg-yellow-500 text-slate-900' }
                        : { label: `VENCE EN ${p._dias} DÍAS`, cls: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-500', badge: 'bg-emerald-500 text-white' };

                    return (
                      <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className={`border rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 transition-all hover:bg-slate-800/20 ${cfg.cls}`}>

                        {/* Info cliente */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Cada día {p.dia_pago}</span>
                          </div>
                          <p className="font-black text-white text-base uppercase tracking-tight leading-none mb-1">{p.nombre_cliente}</p>
                          <p className="text-[10px] text-slate-500 font-mono mb-1">Préstamo #{p.id.slice(0, 8).toUpperCase()}</p>
                          {p.fiador_nombre && (
                            <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest opacity-80">Fiador: {p.fiador_nombre}</p>
                          )}
                        </div>

                        {/* Montos */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 shrink-0 md:border-l md:border-slate-800 md:pl-6">
                          <div><p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Rédito Mes</p><p className="font-black text-white text-sm font-mono">{fmt(reditoMes)}</p></div>
                          {reditosAt > 0 && (<div><p className="text-[9px] font-black uppercase text-yellow-500 tracking-wider">Atrasados</p><p className="font-black text-yellow-400 text-sm font-mono">{fmt(reditosAt)}</p></div>)}
                          {mora > 0 && (<div><p className="text-[9px] font-black uppercase text-red-400 tracking-wider">Mora</p><p className="font-black text-red-400 text-sm font-mono">{fmt(mora)}</p></div>)}
                          <div className={reditosAt > 0 || mora > 0 ? "lg:border-l lg:border-slate-700 lg:pl-6" : ""}>
                            <p className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Total Hoy</p>
                            <p className="font-black text-xl text-white font-mono">{fmt(totalCobrar)}</p>
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex gap-2 shrink-0 md:border-l md:border-slate-800 md:pl-6">
                          {waUrl && (
                            <a href={waUrl} target="_blank" rel="noreferrer"
                              className="flex items-center justify-center p-2.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 rounded-xl transition-all">
                              <MessageCircle size={18} />
                            </a>
                          )}
                          <button onClick={() => navigate(`/pago/${p.id}`)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                            Cobrar
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>


            {/* Resumen cartera */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-6">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-2">
                <BarChart3 size={12} /> Resumen de Cartera
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div><p className="text-2xl font-black text-white">{activos.length}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Activos</p></div>
                <div><p className="text-2xl font-black text-red-400">{activos.filter(p => p.estado === 'MORA').length}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">En Mora</p></div>
                <div><p className="text-2xl font-black text-emerald-400">{activos.filter(p => p.estado === 'ACTIVO').length}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Al Día</p></div>
                <div><p className="text-2xl font-black text-slate-400">{prestamos.filter(p => p.estado === 'SALDADO').length}</p><p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Saldados</p></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* CARTERA                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {vistaAdmin === 'cartera' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input type="text" placeholder="Buscar cliente..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 transition-all placeholder:text-slate-600 text-slate-200" />
              </div>
              <span className="text-xs text-slate-500 font-bold">{prestamos.length} préstamos</span>
            </div>

            <div className="bg-slate-800/20 border border-slate-700/40 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 bg-slate-800/40">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</th>
                    <th className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Capital</th>
                    <th className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Rédito Mes</th>
                    <th className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Atrasados + Mora</th>
                    <th className="px-6 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Próx. Cobro</th>
                    <th className="px-6 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filtered.map(p => {
                    const tasa = Number(p.tasa_mensual) < 1 ? Number(p.tasa_mensual) : Number(p.tasa_mensual) / 100;
                    const reditoMes = (Number(p.capital_actual) || 0) * tasa;
                    const atrasados = (Number(p.interes_pendiente) || 0) + (Number(p.mora_acumulada) || 0);
                    const dias = p.dia_pago ? diasHasta(p.dia_pago) : null;
                    return (
                      <tr key={p.id} onClick={() => navigate(`/pago/${p.id}`)}
                        className="cursor-pointer hover:bg-slate-700/20 transition-all group">
                        <td className="px-6 py-4">
                          <p className="font-black text-white uppercase text-sm group-hover:text-blue-400 transition-colors leading-none mb-1">{p.nombre_cliente}</p>
                          <p className="text-[10px] text-slate-500 font-mono mb-1">Préstamo #{p.id.slice(0, 8).toUpperCase()}</p>
                          {p.fiador_nombre && (
                            <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest opacity-80">Fiador: {p.fiador_nombre}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-200">{fmt(p.capital_actual || p.monto_principal)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">{fmt(reditoMes)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-red-400">{atrasados > 0 ? fmt(atrasados) : <span className="text-slate-600">—</span>}</td>
                        <td className="px-6 py-4 text-center">
                          {dias !== null ? (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${urgencyColor(dias).badge}`}>
                              {dias < 0 ? `Vencido ${Math.abs(dias)}d` : dias === 0 ? 'HOY' : `Día ${p.dia_pago} (${dias}d)`}
                            </span>
                          ) : <span className="text-slate-600 text-[10px]">Sin fecha</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase border ${p.estado === 'MORA' ? 'bg-red-500/10 text-red-400 border-red-500/20' : p.estado === 'SALDADO' ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                            {p.estado || 'ACTIVO'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-400 transition-colors inline-block" />
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan="7" className="px-6 py-10 text-center text-slate-500 text-sm">No se encontraron resultados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: NUEVO PRÉSTAMO                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="bg-[#0d1626] border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

              <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/30 shrink-0">
                <h2 className="font-black text-white uppercase tracking-tight text-sm">Nuevo Préstamo</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors p-1.5 hover:bg-slate-700 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateLoan} className="p-6 overflow-y-auto space-y-6">

                {/* Bloque: Cliente */}
                <div>
                  <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-4 border-b border-slate-700 pb-2">Datos del Cliente</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <FormField label="Nombre Completo">
                        <input type="text" required placeholder="JUAN PÉREZ" value={formData.nombre} onChange={fd('nombre')} className={`${inputCls} uppercase`} />
                      </FormField>
                    </div>
                    <FormField label="Cédula / ID">
                      <input type="text" required placeholder="001-0000000-0" value={formData.cedula} onChange={fd('cedula')} className={inputCls} />
                    </FormField>
                    <FormField label="Teléfono / WhatsApp">
                      <input type="tel" placeholder="809-000-0000" value={formData.telefono} onChange={fd('telefono')} className={inputCls} />
                    </FormField>
                    <div className="col-span-2">
                      <FormField label="Dirección">
                        <input type="text" placeholder="Calle, Sector, Ciudad" value={formData.direccion} onChange={fd('direccion')} className={inputCls} />
                      </FormField>
                    </div>
                  </div>

                  {/* OCR */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="mt-3 w-full bg-slate-800/50 hover:bg-slate-800 border border-dashed border-slate-600 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-blue-400 transition-all text-xs font-black uppercase">
                    {ocrLoading ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
                    Escanear Cédula con IA
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleIdCapture} className="hidden" accept="image/*" />
                </div>

                {/* Bloque: Préstamo */}
                <div>
                  <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-4 border-b border-slate-700 pb-2">Condiciones del Préstamo</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <FormField label="Monto del Préstamo (RD$)">
                        <input type="number" required placeholder="50,000.00" value={formData.monto} onChange={fd('monto')} className={`${inputCls} text-lg font-black`} />
                      </FormField>
                    </div>
                    <FormField label="Tasa Mensual (%)">
                      <input type="number" required step="0.5" value={formData.tasa} onChange={fd('tasa')} className={inputCls} />
                    </FormField>
                    <FormField label="Día de Pago del Mes">
                      <input type="number" min="1" max="28" required placeholder="14" value={formData.dia_pago} onChange={fd('dia_pago')} className={inputCls} />
                    </FormField>
                    <div className="col-span-2">
                      <FormField label="Tipo de Amortización">
                        <select value={formData.metodo} onChange={fd('metodo')} className={inputCls}>
                          <option value="REDITO_PURO">Rédito Puro (solo interés, capital al final)</option>
                          <option value="ABONO_CAPITAL">Interés + Abono a Capital</option>
                        </select>
                      </FormField>
                    </div>
                  </div>
                </div>

                {/* Bloque: Garantía */}
                <div>
                  <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-4 border-b border-slate-700 pb-2">Garantía</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <FormField label="Descripción de la Garantía">
                        <input type="text" placeholder="Ej: Honda Civic 2018, Placa A12345..." value={formData.garantia_descripcion} onChange={fd('garantia_descripcion')} className={inputCls} />
                      </FormField>
                    </div>
                    <FormField label="Valor Estimado (RD$)">
                      <input type="number" placeholder="0.00" value={formData.garantia_valor} onChange={fd('garantia_valor')} className={inputCls} />
                    </FormField>
                    <FormField label="Referidor / Comisionista">
                      <input type="text" placeholder="Nombre del referidor" value={formData.referidor_nombre} onChange={fd('referidor_nombre')} className={inputCls} />
                    </FormField>
                    <FormField label="% Comisión sobre Réditos">
                      <input type="number" min="0" max="100" step="0.5" placeholder="0" value={formData.comision_porcentaje} onChange={fd('comision_porcentaje')} className={inputCls} />
                    </FormField>
                    <div className="col-span-2">
                      <FormField label="Notas Especiales">
                        <textarea rows={2} placeholder="Condiciones especiales, acuerdos, etc." value={formData.nota} onChange={fd('nota')} className={`${inputCls} resize-none`} />
                      </FormField>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={creating}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all">
                  {creating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                  {creating ? 'Creando Préstamo...' : 'Crear y Desembolsar'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ icon, label, value, sub, color }) {
  const colors = {
    blue: 'bg-blue-500/10 border-blue-500/20',
    emerald: 'bg-emerald-500/10 border-emerald-500/20',
    yellow: 'bg-yellow-500/10 border-yellow-500/20',
    red: 'bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={`border rounded-2xl p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-black text-white font-mono">{value}</p>
      <p className="text-[10px] text-slate-500 font-bold mt-1">{sub}</p>
    </div>
  );
}


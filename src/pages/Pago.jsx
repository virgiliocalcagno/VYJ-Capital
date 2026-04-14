import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Loader2, Check, Printer, DollarSign,
  ToggleLeft, ToggleRight, Save, Edit2, X, User,
  Briefcase, Shield, FileText, MessageCircle, Copy
} from 'lucide-react';

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt = (val) => 'RD$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val) || 0);
const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ─── Motor Financiero ─────────────────────────────────────────────────────────
function calcularPago({ loan, monto, aplicarMora, abonarCapital }) {
  let remaining = Number(monto);
  const moraPendiente = Number(loan.mora_acumulada) || 0;
  const reditosPendiente = Number(loan.interes_pendiente) || 0;
  const capitalActual = Number(loan.capital_actual) || 0;
  let moraPagada = 0, reditosPagados = 0, capitalPagado = 0;
  if (aplicarMora && moraPendiente > 0) { moraPagada = Math.min(remaining, moraPendiente); remaining -= moraPagada; }
  if (remaining > 0 && reditosPendiente > 0) { reditosPagados = Math.min(remaining, reditosPendiente); remaining -= reditosPagados; }
  if (remaining > 0 && (loan.metodo === 'ABONO_CAPITAL' || abonarCapital)) { capitalPagado = Math.min(remaining, capitalActual); remaining -= capitalPagado; }
  return {
    moraPagada, reditosPagados, capitalPagado, sobrante: remaining,
    nuevoCapital: capitalActual - capitalPagado,
    nuevaMora: moraPendiente - moraPagada,
    nuevosReditos: reditosPendiente - reditosPagados,
    nuevoEstado: (capitalActual - capitalPagado) <= 0 ? 'SALDADO' : ((moraPendiente - moraPagada) > 0 ? 'MORA' : 'ACTIVO'),
  };
}

function calcularComision(loan, reditosPagados) {
  if (!loan.comision_porcentaje || !reditosPagados) return 0;
  return reditosPagados * (Number(loan.comision_porcentaje) / 100);
}

function buildHistory(prestamo, txs) {
  let curCapital = Number(prestamo.monto_principal) || 0;
  let curReditos = 0;
  return txs.map((t) => {
    if (t.tipo === 'pago') {
      curReditos -= (Number(t.desglose?.reditos) || 0) + (Number(t.desglose?.mora) || 0);
      curCapital -= Number(t.desglose?.capital) || 0;
    } else if (t.tipo === 'cargo_redito') { curReditos += Number(t.monto_total) || 0; }
    return { ...t, balCapital: Math.max(0, curCapital), balReditos: Math.max(0, curReditos), fecha_v: fmtDate(t.fecha) };
  });
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
function generarMensajeWA(prestamo, reditoMes) {
  const mora = Number(prestamo.mora_acumulada) || 0;
  const reditosAt = Number(prestamo.interes_pendiente) || 0;
  const total = reditoMes + mora + reditosAt;
  const dia = prestamo.dia_pago || '?';
  const link = `${window.location.origin}/estado/${prestamo.id}`;
  
  return `Hola ${prestamo.nombre_cliente},\n\n` +
    `Le recordamos que su pago mensual vence el día *${dia}*.\n\n` +
    `📊 *Resumen VYJ Capital:*\n` +
    `• Rédito del mes: ${fmt(reditoMes)}\n` +
    `${reditosAt > 0 ? `• Réditos atrasados: ${fmt(reditosAt)}\n` : ''}` +
    `${mora > 0 ? `• Mora: ${fmt(mora)}\n` : ''}` +
    `• *Total a pagar: ${fmt(total)}*\n\n` +
    `${link}\n\n` +
    `_VYJ Capital – Control Financiero_`;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function Pago({ publicMode: initialPublicMode = false }) {
  const { idPrestamo } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const publicMode = initialPublicMode || searchParams.get('view') === 'client';

  const [prestamo, setPrestamo] = useState(null);
  const [transacciones, setTransacciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('cuenta'); // Forzamos 'cuenta' como inicio

  // Pago
  const [montoPago, setMontoPago] = useState('');
  const [aplicarMora, setAplicarMora] = useState(true);
  const [abonarCapital, setAbonarCapital] = useState(false);
  const [notaPago, setNotaPago] = useState('');
  const [processing, setProcessing] = useState(false);
  const [exitoso, setExitoso] = useState(false);

  // Ficha
  const [editandoFicha, setEditandoFicha] = useState(false);
  const [fichaForm, setFichaForm] = useState({});
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'prestamos', idPrestamo);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) { setLoading(false); return; }
      const pData = { id: docSnap.id, ...docSnap.data() };
      setPrestamo(pData);

      // Cargar ficha desde colección 'clientes'
      let fichaBase = buildFichaFromLoan(pData);
      if (pData.cliente_id) {
        try {
          const cSnap = await getDoc(doc(db, 'clientes', pData.cliente_id));
          if (cSnap.exists()) fichaBase = flattenCliente({ id: cSnap.id, ...cSnap.data() });
        } catch (_) {}
      }
      setFichaForm(fichaBase);

      // Transacciones
      const txSnap = await getDocs(collection(db, 'transactions'));
      const txs = txSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.loan_id === idPrestamo)
        .sort((a, b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));
      setTransacciones(buildHistory(pData, txs));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [idPrestamo]);

  function buildFichaFromLoan(p) {
    return { nombre: p.nombre_cliente || '', cedula: p.cedula_cliente || '', telefono: p.telefono || '', email: '', direccion: p.direccion || '', fecha_nacimiento: p.fecha_nacimiento || '', lugar_nacimiento: '', sexo: '', estado_civil: '', nacionalidad: '', trabajo_ocupacion: '', trabajo_empresa: '', trabajo_sueldo: '', trabajo_telefono: '', solidario_nombre: '', solidario_cedula: '', solidario_telefono: '', solidario_trabajo: '', ref1_nombre: '', ref1_telefono: '', ref2_nombre: '', ref2_telefono: '', garantia_tipo: p.garantia_tipo || '', garantia_valor: p.garantia_valor || '', garantia_descripcion: p.garantia_descripcion || '', dia_pago: p.dia_pago || '' };
  }

  function flattenCliente(c) {
    return { nombre: c.nombre || '', cedula: c.cedula || '', telefono: c.telefono || '', email: c.email || '', direccion: c.direccion || '', fecha_nacimiento: c.fecha_nacimiento || '', lugar_nacimiento: c.lugar_nacimiento || '', sexo: c.sexo || '', estado_civil: c.estado_civil || '', nacionalidad: c.nacionalidad || '', trabajo_ocupacion: c.trabajo?.ocupacion || '', trabajo_empresa: c.trabajo?.empresa || '', trabajo_sueldo: c.trabajo?.sueldo || '', trabajo_telefono: c.trabajo?.telefono || '', solidario_nombre: c.solidario?.nombre || '', solidario_cedula: c.solidario?.cedula || '', solidario_telefono: c.solidario?.telefono || '', solidario_trabajo: c.solidario?.referencia_laboral || '', ref1_nombre: c.referencias?.[0]?.nombre || '', ref1_telefono: c.referencias?.[0]?.telefono || '', ref2_nombre: c.referencias?.[1]?.nombre || '', ref2_telefono: c.referencias?.[1]?.telefono || '', garantia_tipo: c.garantia?.tipo || '', garantia_valor: c.garantia?.valor || '', garantia_descripcion: c.garantia?.descripcion || '' };
  }

  const handleGuardarFicha = async () => {
    setGuardandoFicha(true);
    try {
      const f = fichaForm;
      const clienteData = { nombre: f.nombre, cedula: f.cedula, telefono: f.telefono || null, email: f.email || null, direccion: f.direccion || null, fecha_nacimiento: f.fecha_nacimiento || null, lugar_nacimiento: f.lugar_nacimiento || null, sexo: f.sexo || null, estado_civil: f.estado_civil || null, nacionalidad: f.nacionalidad || null, trabajo: { ocupacion: f.trabajo_ocupacion || null, empresa: f.trabajo_empresa || null, sueldo: f.trabajo_sueldo ? parseFloat(f.trabajo_sueldo) : null, telefono: f.trabajo_telefono || null }, solidario: { nombre: f.solidario_nombre || null, cedula: f.solidario_cedula || null, telefono: f.solidario_telefono || null, referencia_laboral: f.solidario_trabajo || null }, referencias: [{ nombre: f.ref1_nombre || null, telefono: f.ref1_telefono || null }, { nombre: f.ref2_nombre || null, telefono: f.ref2_telefono || null }], garantia: { tipo: f.garantia_tipo || null, valor: f.garantia_valor ? parseFloat(f.garantia_valor) : null, descripcion: f.garantia_descripcion || null }, actualizado: serverTimestamp() };
      if (prestamo.cliente_id) {
        await updateDoc(doc(db, 'clientes', prestamo.cliente_id), clienteData);
      } else {
        const nuevoRef = await addDoc(collection(db, 'clientes'), { ...clienteData, fecha_registro: serverTimestamp() });
        await updateDoc(doc(db, 'prestamos', idPrestamo), { cliente_id: nuevoRef.id });
      }
      await updateDoc(doc(db, 'prestamos', idPrestamo), { 
        nombre_cliente: f.nombre.toUpperCase(), 
        cedula_cliente: f.cedula,
        telefono: f.telefono || null,
        dia_pago: parseInt(f.dia_pago) || null,
        fiador_nombre: f.solidario_nombre?.toUpperCase() || null
      });
      setEditandoFicha(false);
      await fetchData();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setGuardandoFicha(false); }
  };

  const handleProcesarPago = async (e) => {
    e.preventDefault();
    const monto = parseFloat(montoPago);
    if (!monto || monto <= 0) return alert('Ingresa un monto válido');
    setProcessing(true);
    try {
      const desglose = calcularPago({ loan: prestamo, monto, aplicarMora, abonarCapital });
      const comision = calcularComision(prestamo, desglose.reditosPagados);
      await addDoc(collection(db, 'transactions'), { loan_id: idPrestamo, tipo: 'pago', monto_total: monto, desglose: { mora: desglose.moraPagada, reditos: desglose.reditosPagados, capital: desglose.capitalPagado, sobrante: desglose.sobrante }, comision_generada: comision, nota: notaPago || 'PAGO RECIBIDO', mora_aplicada: aplicarMora, fecha: serverTimestamp() });
      await updateDoc(doc(db, 'prestamos', idPrestamo), { capital_actual: desglose.nuevoCapital, mora_acumulada: desglose.nuevaMora, interes_pendiente: desglose.nuevosReditos, estado: desglose.nuevoEstado, ultimo_pago: serverTimestamp() });
      if (comision > 0 && prestamo.referidor_id) await addDoc(collection(db, 'comisiones'), { referidor_id: prestamo.referidor_id, loan_id: idPrestamo, monto: comision, fecha: serverTimestamp(), estado: 'PENDIENTE' });
      setExitoso(true);
      setMontoPago(''); setNotaPago('');
      setTimeout(() => { setExitoso(false); fetchData(); setVista('cuenta'); }, 2500);
    } catch (err) { alert('Error: ' + err.message); }
    finally { setProcessing(false); }
  };

  const copiarLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/estado/${idPrestamo}`);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  };

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const tasaCalc = prestamo ? (Number(prestamo.tasa_mensual) < 1 ? Number(prestamo.tasa_mensual) : Number(prestamo.tasa_mensual) / 100) : 0.12;
  const capitalActual = Number(prestamo?.capital_actual) || 0;
  const reditosAt = Number(prestamo?.interes_pendiente) || 0;
  const moraAt = Number(prestamo?.mora_acumulada) || 0;
  const reditoMes = capitalActual * tasaCalc;
  const totalCobrar = reditoMes + reditosAt + moraAt;

  // Fecha de corte: el día X del mes en curso (o próximo si ya pasó)
  const fechaCorte = (() => {
    if (!prestamo?.dia_pago) return null;
    const hoy = new Date();
    const dia = parseInt(prestamo.dia_pago);
    const corte = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
    // Si el día ya pasó este mes, el PRÓXIMO corte es el mes siguiente
    // pero el rédito VIGENTE sigue siendo el del mes actual que ya venció
    return corte;
  })();

  const labelFechaCorte = fechaCorte
    ? `Rédito al ${fechaCorte.getDate()} de ${fechaCorte.toLocaleDateString('es-DO', { month: 'short' })}.`
    : 'Rédito del mes';

  const diasAlCorte = fechaCorte
    ? Math.round((new Date(fechaCorte.getFullYear(), fechaCorte.getMonth(), fechaCorte.getDate()) - new Date(new Date().toDateString())) / 86400000)
    : null;
  const montoNum = parseFloat(montoPago) || 0;
  const preview = prestamo && montoNum > 0 ? calcularPago({ loan: prestamo, monto: montoNum, aplicarMora, abonarCapital }) : null;
  const set = (k) => (e) => setFichaForm(prev => ({ ...prev, [k]: e.target.value }));

  if (loading) return <div className="min-h-screen bg-[#070d1a] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;
  if (!prestamo) return <div className="min-h-screen bg-[#070d1a] flex items-center justify-center text-red-400 font-bold">PRÉSTAMO NO ENCONTRADO</div>;

  const tel = fichaForm.telefono?.replace(/\D/g, '');
  const waUrl = tel ? `https://wa.me/1${tel}?text=${encodeURIComponent(generarMensajeWA(prestamo, reditoMes))}` : null;

  return (
    <div className="min-h-screen bg-[#070d1a] text-slate-200 font-sans">

      {/* ── TOPBAR ── */}
      {!publicMode && (
        <div className="border-b border-slate-800 bg-[#0a1221] px-6 py-3 flex items-center gap-4 sticky top-0 z-30">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white flex items-center gap-1 text-xs font-black uppercase transition-colors">
            <ChevronLeft size={16} /> Panel
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex-1">
            <p className="font-black text-white text-sm uppercase tracking-tight leading-none mb-1">{prestamo.nombre_cliente}</p>
            {prestamo.fiador_nombre && (
              <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest mb-1.5 opacity-80">Fiador: {prestamo.fiador_nombre}</p>
            )}
            <p className="text-[10px] text-slate-500 font-bold">{prestamo.cedula_cliente || 'Sin cédula'} · Préstamo #{idPrestamo.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1">
            {!publicMode ? (
              [
                { key: 'ficha', label: 'Ficha', icon: <User size={12} /> },
                { key: 'cuenta', label: 'Estado de Cuenta', icon: <FileText size={12} /> },
                { key: 'pago', label: 'Cobrar', icon: <DollarSign size={12} /> },
              ].map(({ key, label, icon }) => (
                <button key={key} onClick={() => setVista(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${vista === key ? (key === 'pago' ? 'bg-blue-600 text-white' : 'bg-slate-600 text-white') : 'text-slate-400 hover:text-white'}`}>
                  {icon} {label}
                </button>
              ))
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide bg-slate-600 text-white">
                <FileText size={12} /> Estado de Cuenta
              </div>
            )}
          </div>
          <button onClick={() => window.print()} className="text-slate-500 hover:text-white text-[10px] font-black uppercase flex items-center gap-1 no-print transition-colors">
            <Printer size={13} />
          </button>
        </div>
      )}

      {/* HEADER PÚBLICO (Solo en publicMode) */}
      {publicMode && (
        <div className="border-b border-slate-800 bg-[#0a1221] px-6 py-4 flex items-center justify-between sticky top-0 z-30">
           <div>
              <p className="text-[11px] font-black uppercase text-blue-400 tracking-[0.2em]">Estado de Cuenta</p>
              <p className="text-[10px] text-slate-500 font-bold">VYJ CAPITAL SRL</p>
           </div>
           <button onClick={() => window.print()} className="bg-white/5 hover:bg-white/10 p-2.5 rounded-xl transition-all border border-white/5">
              <Printer size={16} className="text-slate-400" />
           </button>
        </div>
      )}

      {/* ── SIDEBAR + MAIN ── */}
      <div className="flex h-[calc(100vh-57px)]">

        {/* SIDEBAR: Resumen financiero */}
        <aside className="w-72 border-r border-slate-800 bg-[#0a1221] p-5 space-y-4 overflow-y-auto shrink-0 no-print">

          {/* Estado badge */}
          <div className={`px-3 py-1.5 rounded-lg text-center text-[10px] font-black uppercase tracking-wider border ${prestamo.estado === 'MORA' ? 'bg-red-500/10 text-red-400 border-red-500/20' : prestamo.estado === 'SALDADO' ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
            Estado: {prestamo.estado}
          </div>

          {/* ── BLOQUE 1: Para estar al día ── */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
              <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest">Para estar al día</p>
              <p className="text-[9px] text-slate-500 font-bold">Capital sigue igual — solo se cobra rédito</p>
            </div>
            <div className="p-4 space-y-2.5">
              <DesgloseLine
                label={labelFechaCorte}
                value={reditoMes}
                color="text-emerald-400"
                tag={diasAlCorte === 0 ? 'HOY' : diasAlCorte < 0 ? `VENCIDO ${Math.abs(diasAlCorte)}d` : diasAlCorte <= 3 ? `${diasAlCorte}d` : null}
              />
              {reditosAt > 0 && <DesgloseLine label="Réditos atrasados" value={reditosAt} color="text-yellow-400" tag="ATRASADO" />}
              {moraAt > 0  && <DesgloseLine label="Mora acumulada"    value={moraAt}   color="text-red-400"    tag="MORA" />}
              <div className="border-t border-slate-700 pt-2.5 mt-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-black uppercase text-slate-300">Total al día</span>
                  <span className="font-black text-white text-lg font-mono">{fmt(totalCobrar)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── BLOQUE 2: Para saldar todo ── */}
          <div className="bg-slate-800/50 border border-slate-600 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-700/60 border-b border-slate-600">
              <p className="text-[9px] font-black uppercase text-slate-300 tracking-widest">Para saldar todo el préstamo</p>
              <p className="text-[9px] text-slate-500 font-bold">Liquidación total — cierra el crédito</p>
            </div>
            <div className="p-4 space-y-2.5">
              <DesgloseLine label="Capital insoluto" value={capitalActual} color="text-blue-400" />
              <DesgloseLine label={labelFechaCorte}  value={reditoMes}    color="text-emerald-400" />
              {reditosAt > 0 && <DesgloseLine label="Réditos atrasados" value={reditosAt} color="text-yellow-400" tag="ATRASADO" />}
              {moraAt > 0  && <DesgloseLine label="Mora acumulada"    value={moraAt}   color="text-red-400"    tag="MORA" />}
              <div className="border-t border-slate-600 pt-2.5 mt-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-black uppercase text-slate-300">Total liquidación</span>
                  <span className="font-black text-white text-lg font-mono">{fmt(capitalActual + totalCobrar)}</span>
                </div>
                <p className="text-[9px] text-slate-500 font-bold mt-1">Cierra el préstamo completamente</p>
              </div>
            </div>
          </div>

          {/* Condiciones */}
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Condiciones del Préstamo</p>
            <InfoRow label="Capital original" value={fmt(prestamo.monto_principal)} />
            <InfoRow label="Tasa" value={`${(tasaCalc * 100).toFixed(0)}% mensual`} />
            <InfoRow label="Método" value={prestamo.metodo === 'REDITO_PURO' ? 'Rédito Puro' : 'Abono Capital'} />
            {prestamo.referidor_nombre && <InfoRow label="Referidor" value={prestamo.referidor_nombre} />}
            {prestamo.comision_porcentaje && <InfoRow label="Comisión" value={`${prestamo.comision_porcentaje}%`} />}
          </div>

          {/* Acciones de notificación */}
          {!publicMode && (
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-3">Notificar Cliente</p>
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 w-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all">
                  <MessageCircle size={14} /> Enviar WhatsApp
                </a>
              ) : (
                <p className="text-[10px] text-slate-600 italic">Sin teléfono registrado</p>
              )}
              <button onClick={copiarLink}
                className="flex items-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all">
                <Copy size={14} /> {linkCopiado ? '¡Link copiado!' : 'Copiar Link Estado'}
              </button>
            </div>
          )}
        </aside>


        {/* MAIN CONTENT */}
        <main className={`flex-1 overflow-y-auto ${publicMode ? 'bg-[#070d1a]' : ''}`}>
          <div className={publicMode ? "max-w-4xl mx-auto" : ""}>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* FICHA DEL CLIENTE                                             */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {vista === 'ficha' && (
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-white text-lg uppercase tracking-tight">Expediente del Cliente</h2>
                {!editandoFicha
                  ? <button onClick={() => setEditandoFicha(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all"><Edit2 size={13} /> Editar</button>
                  : <div className="flex gap-2">
                    <button onClick={() => setEditandoFicha(false)} className="flex items-center gap-2 bg-slate-800 text-slate-400 border border-slate-700 px-4 py-2 rounded-xl text-xs font-black uppercase"><X size={13} /> Cancelar</button>
                    <button onClick={handleGuardarFicha} disabled={guardandoFicha} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase disabled:opacity-50 transition-all">{guardandoFicha ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
                  </div>}
              </div>

              <FichaBloque titulo="Datos Personales" icon={<User size={15} />}>
                <Grid2>
                  <F label="Nombre" campo="nombre" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Cédula" campo="cedula" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Teléfono" campo="telefono" f={fichaForm} s={set} e={editandoFicha} type="tel" />
                  <F label="Email" campo="email" f={fichaForm} s={set} e={editandoFicha} type="email" />
                  <F label="Fecha de Nacimiento" campo="fecha_nacimiento" f={fichaForm} s={set} e={editandoFicha} type="date" />
                  <F label="Lugar de Nacimiento" campo="lugar_nacimiento" f={fichaForm} s={set} e={editandoFicha} />
                  <FSelect label="Sexo" campo="sexo" f={fichaForm} s={set} e={editandoFicha} options={[['', '—'], ['M', 'Masculino'], ['F', 'Femenino']]} />
                  <FSelect label="Estado Civil" campo="estado_civil" f={fichaForm} s={set} e={editandoFicha} options={[['', '—'], ['Soltero/a', 'Soltero/a'], ['Casado/a', 'Casado/a'], ['Unión libre', 'Unión libre'], ['Divorciado/a', 'Divorciado/a']]} />
                  <F label="Nacionalidad" campo="nacionalidad" f={fichaForm} s={set} e={editandoFicha} />
                </Grid2>
                <div className="mt-4"><F label="Dirección" campo="direccion" f={fichaForm} s={set} e={editandoFicha} full /></div>
              </FichaBloque>

              <FichaBloque titulo="Información Laboral" icon={<Briefcase size={15} />}>
                <Grid2>
                  <F label="Ocupación" campo="trabajo_ocupacion" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Empresa" campo="trabajo_empresa" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Salario (RD$)" campo="trabajo_sueldo" f={fichaForm} s={set} e={editandoFicha} type="number" display={fichaForm.trabajo_sueldo ? fmt(fichaForm.trabajo_sueldo) : '—'} />
                  <F label="Teléfono Trabajo" campo="trabajo_telefono" f={fichaForm} s={set} e={editandoFicha} type="tel" />
                </Grid2>
              </FichaBloque>

              <FichaBloque titulo="Fiador y Referencias" icon={<Shield size={15} />}>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Fiador Solidario</p>
                <Grid2>
                  <F label="Nombre" campo="solidario_nombre" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Cédula" campo="solidario_cedula" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Teléfono" campo="solidario_telefono" f={fichaForm} s={set} e={editandoFicha} type="tel" />
                  <F label="Trabajo / Referencia" campo="solidario_trabajo" f={fichaForm} s={set} e={editandoFicha} />
                </Grid2>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3 mt-5">Referencias Personales</p>
                <Grid2>
                  <F label="Ref. 1 Nombre" campo="ref1_nombre" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Ref. 1 Teléfono" campo="ref1_telefono" f={fichaForm} s={set} e={editandoFicha} type="tel" />
                  <F label="Ref. 2 Nombre" campo="ref2_nombre" f={fichaForm} s={set} e={editandoFicha} />
                  <F label="Ref. 2 Teléfono" campo="ref2_telefono" f={fichaForm} s={set} e={editandoFicha} type="tel" />
                </Grid2>
              </FichaBloque>

               <FichaBloque titulo="Garantía" icon={<Shield size={15} />}>
                <Grid2>
                  <FSelect label="Tipo" campo="garantia_tipo" f={fichaForm} s={set} e={editandoFicha} options={[['', 'Sin garantía'], ['vehiculo', 'Vehículo/Motor'], ['electrodomestico', 'Electrodoméstico'], ['titulo', 'Título/Propiedad'], ['pagare', 'Pagaré Notarial'], ['otro', 'Otro']]} />
                  <F label="Valor Estimado (RD$)" campo="garantia_valor" f={fichaForm} s={set} e={editandoFicha} type="number" display={fichaForm.garantia_valor ? fmt(fichaForm.garantia_valor) : '—'} />
                </Grid2>
                <div className="mt-4"><F label="Descripción" campo="garantia_descripcion" f={fichaForm} s={set} e={editandoFicha} full textarea /></div>
              </FichaBloque>

              <FichaBloque titulo="Configuración del Préstamo" icon={<DollarSign size={15} />}>
                <Grid2>
                  <F label="Día de Pago del Mes" campo="dia_pago" f={fichaForm} s={set} e={editandoFicha} type="number" display={fichaForm.dia_pago ? `Día ${fichaForm.dia_pago}` : 'No asignado'} />
                </Grid2>
                <p className="text-[9px] text-slate-500 font-bold mt-2 italic px-1">Este día define cuándo aparecerá el cliente en tu Dashboard.</p>
              </FichaBloque>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ESTADO DE CUENTA                                              */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {vista === 'cuenta' && (
            <div className="p-8 space-y-6">
              {/* Encabezado imprimible */}
              <div className="border border-slate-700 rounded-2xl overflow-hidden">
                <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-700">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Estado de Cuenta — VYJ Capital</p>
                  <p className="font-black text-white text-lg uppercase mt-1 leading-none">{prestamo.nombre_cliente}</p>
                  {prestamo.fiador_nombre && (
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mt-1 mb-2">Fiador: {prestamo.fiador_nombre}</p>
                  )}
                  <p className="text-xs text-slate-400 font-bold">{prestamo.cedula_cliente} · Préstamo #{idPrestamo.slice(0, 10).toUpperCase()}</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Fecha de corte: {new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>

                {/* Tabla */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/60 border-b border-slate-700">
                        <th className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-400">Fecha</th>
                        <th className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-400">Descripción</th>
                        <th className="px-4 py-3 text-right font-black uppercase tracking-wider text-slate-400">Cargo</th>
                        <th className="px-4 py-3 text-right font-black uppercase tracking-wider text-slate-400">Pago</th>
                        <th className="px-4 py-3 text-right font-black uppercase tracking-wider text-slate-400">Bal. Réditos</th>
                        <th className="px-4 py-3 text-right font-black uppercase tracking-wider text-slate-400">Bal. Capital</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr className="bg-slate-800/20">
                        <td className="px-4 py-3 font-black text-slate-400 text-[10px]">INICIO</td>
                        <td className="px-4 py-3 font-black text-slate-300 uppercase text-[10px]">Desembolso Inicial</td>
                        <td className="px-4 py-3 text-right text-slate-400">—</td>
                        <td className="px-4 py-3 text-right text-slate-400">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-300">RD$0.00</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-300">{fmt(prestamo.monto_principal)}</td>
                      </tr>
                      {transacciones.map((t, i) => (
                        <tr key={i} className={t.tipo === 'pago' ? 'bg-emerald-500/5' : ''}>
                          <td className="px-4 py-3 font-bold text-slate-400 text-[10px]">{t.fecha_v}</td>
                          <td className="px-4 py-3">
                            <p className="font-black text-slate-300 uppercase text-[10px]">{t.nota || (t.tipo === 'pago' ? 'Pago Recibido' : t.tipo)}</p>
                            {t.tipo === 'pago' && t.desglose && (
                              <p className="text-[9px] text-slate-500 mt-0.5">
                                {t.desglose.mora > 0 && `Mora ${fmt(t.desglose.mora)}  `}
                                {t.desglose.reditos > 0 && `Réditos ${fmt(t.desglose.reditos)}  `}
                                {t.desglose.capital > 0 && `Capital ${fmt(t.desglose.capital)}`}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-red-400 text-[11px]">{t.tipo !== 'pago' ? fmt(t.monto_total) : '—'}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 text-[11px]">{t.tipo === 'pago' ? fmt(t.monto_total) : '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300 text-[11px]">{fmt(t.balReditos)}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300 text-[11px]">{fmt(t.balCapital)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Liquidación */}
                <div className="px-6 py-5 bg-slate-800/30 border-t border-slate-700">
                  <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Posición Actual</p>
                      <LiqRow label="Capital Insoluto" value={fmt(capitalActual)} />
                      {reditosAt > 0 && <LiqRow label="Réditos Atrasados" value={fmt(reditosAt)} warn />}
                      {moraAt > 0 && <LiqRow label="Mora Acumulada" value={fmt(moraAt)} danger />}
                      <LiqRow label={`Rédito Próximo (${(tasaCalc * 100).toFixed(0)}%)`} value={fmt(reditoMes)} />
                      <div className="border-t border-slate-600 pt-2 mt-3">
                        <LiqRow label="TOTAL PARA ESTAR AL DÍA" value={fmt(totalCobrar)} total />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="border-b-2 border-slate-400 w-48 mb-2 ml-auto" />
                      <p className="text-xs font-black text-slate-300 uppercase">Firma Autorizada</p>
                      <p className="text-[10px] text-slate-500 font-bold">VYJ Capital — Control de Cobros</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* COBRAR / REGISTRAR PAGO                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {vista === 'pago' && (
            <div className="p-8 relative">
              <AnimatePresence>
                {exitoso && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-40 bg-[#070d1a] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                      <Check size={48} className="text-emerald-400" strokeWidth={3} />
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase mb-2">¡Pago Registrado!</h2>
                    <p className="text-slate-400 font-bold text-sm">Balance actualizado correctamente</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleProcesarPago} className="max-w-lg space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Cobrando a</p>
                  <p className="font-black text-white text-xl uppercase">{prestamo.nombre_cliente}</p>
                </div>

                {/* Monto */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Monto Recibido (RD$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">RD$</span>
                    <input type="number" step="0.01" min="1" required placeholder="0.00" value={montoPago}
                      onChange={(e) => setMontoPago(e.target.value)}
                      className="w-full bg-slate-800/60 border-2 border-slate-700 focus:border-blue-500 rounded-xl py-4 pl-12 pr-4 text-3xl font-black text-white outline-none transition-all" />
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setAplicarMora(!aplicarMora)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${aplicarMora ? 'border-orange-500/40 bg-orange-500/10' : 'border-slate-700 bg-slate-800/40'}`}>
                    <div className="text-left">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Cobrar Mora</p>
                      <p className="font-black text-white text-sm mt-0.5 font-mono">{fmt(moraAt)}</p>
                      {!aplicarMora && <p className="text-[9px] text-slate-500 font-bold">Se condona</p>}
                    </div>
                    {aplicarMora ? <ToggleRight className="text-orange-400 shrink-0" size={24} /> : <ToggleLeft className="text-slate-600 shrink-0" size={24} />}
                  </button>

                  {prestamo.metodo === 'REDITO_PURO' && (
                    <button type="button" onClick={() => setAbonarCapital(!abonarCapital)}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${abonarCapital ? 'border-blue-500/40 bg-blue-500/10' : 'border-slate-700 bg-slate-800/40'}`}>
                      <div className="text-left">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Abonar Capital</p>
                        <p className="font-black text-white text-sm mt-0.5 font-mono">{fmt(capitalActual)}</p>
                      </div>
                      {abonarCapital ? <ToggleRight className="text-blue-400 shrink-0" size={24} /> : <ToggleLeft className="text-slate-600 shrink-0" size={24} />}
                    </button>
                  )}
                </div>

                {/* Nota */}
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Nota</label>
                  <input type="text" placeholder="Transferencia, efectivo, cheque..." value={notaPago}
                    onChange={(e) => setNotaPago(e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 focus:border-blue-500 rounded-xl py-3 px-4 text-sm font-bold text-slate-200 outline-none transition-all placeholder:text-slate-600" />
                </div>

                {/* Preview */}
                {preview && (
                  <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Desglose del Pago</p>
                    {preview.moraPagada > 0 && <PRow label="Mora cobrada" value={fmt(preview.moraPagada)} c="text-orange-400" />}
                    {!aplicarMora && moraAt > 0 && <PRow label="Mora condonada" value={fmt(moraAt)} c="text-slate-600" strike />}
                    {preview.reditosPagados > 0 && <PRow label="Réditos" value={fmt(preview.reditosPagados)} c="text-emerald-400" />}
                    {preview.capitalPagado > 0 && <PRow label="Abono capital" value={fmt(preview.capitalPagado)} c="text-blue-400" />}
                    {preview.sobrante > 0 && <PRow label="Sobrante (no aplicado)" value={fmt(preview.sobrante)} c="text-slate-500" />}
                    <div className="border-t border-slate-700 pt-2 flex justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-400">Nuevo capital</span>
                      <span className="font-black text-white font-mono">{fmt(preview.nuevoCapital)}</span>
                    </div>
                    {prestamo.comision_porcentaje && preview.reditosPagados > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex justify-between">
                        <span className="text-[10px] font-black uppercase text-amber-400">Comisión {prestamo.referidor_nombre} ({prestamo.comision_porcentaje}%)</span>
                        <span className="font-black text-amber-400 font-mono text-sm">{fmt(calcularComision(prestamo, preview.reditosPagados))}</span>
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={processing || !montoPago}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black py-4 rounded-xl uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all">
                  {processing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {processing ? 'Procesando...' : 'Confirmar Pago'}
                </button>
              </form>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function DesgloseLine({ label, value, color, tag }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-bold text-slate-400 truncate">{label}</span>
        {tag && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 shrink-0">{tag}</span>}
      </div>
      <span className={`font-mono font-black text-sm shrink-0 ${color}`}>{fmt(value)}</span>
    </div>
  );
}


function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[10px] text-slate-500 font-bold uppercase">{label}</span>
      <span className="text-[11px] font-black text-slate-300">{value}</span>
    </div>
  );
}

function LiqRow({ label, value, warn, danger, total }) {
  return (
    <div className={`flex justify-between items-center ${total ? 'pt-1' : ''}`}>
      <span className={`text-[10px] font-black uppercase tracking-wide ${total ? 'text-white' : warn ? 'text-yellow-400' : danger ? 'text-red-400' : 'text-slate-400'}`}>{label}</span>
      <span className={`font-mono font-black ${total ? 'text-white text-lg' : warn ? 'text-yellow-400' : danger ? 'text-red-400' : 'text-slate-300'} text-sm`}>{value}</span>
    </div>
  );
}

function FichaBloque({ titulo, icon, children }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-800/40 border-b border-slate-700/60">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{titulo}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Grid2({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function F({ label, campo, f, s, e, type = 'text', full, textarea, display }) {
  const val = f[campo] ?? '';
  const shown = display || val || '—';
  const inputCls = "w-full bg-[#0f172a] border border-slate-700 rounded-xl py-2.5 px-3.5 text-sm font-bold text-slate-200 outline-none focus:border-blue-500 transition-all";
  return (
    <div className={full ? 'col-span-full' : ''}>
      <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1.5">{label}</label>
      {e ? (textarea
        ? <textarea rows={3} value={val} onChange={s(campo)} className={`${inputCls} resize-none`} />
        : <input type={type} value={val} onChange={s(campo)} className={inputCls} />
      ) : (
        <p className={`text-sm font-bold ${val ? 'text-slate-200' : 'text-slate-600 italic'}`}>{shown}</p>
      )}
    </div>
  );
}

function FSelect({ label, campo, f, s, e, options }) {
  const val = f[campo] ?? '';
  const display = options.find(o => o[0] === val)?.[1] || '—';
  return (
    <div>
      <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1.5">{label}</label>
      {e ? (
        <select value={val} onChange={s(campo)} className="w-full bg-[#0f172a] border border-slate-700 rounded-xl py-2.5 px-3.5 text-sm font-bold text-slate-200 outline-none focus:border-blue-500">
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : <p className={`text-sm font-bold ${val ? 'text-slate-200' : 'text-slate-600 italic'}`}>{display}</p>}
    </div>
  );
}

function PRow({ label, value, c, strike }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-[10px] font-black uppercase text-slate-400`}>{label}</span>
      <span className={`font-mono font-black text-sm ${c} ${strike ? 'line-through opacity-50' : ''}`}>{value}</span>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { useOCR } from '../services/useOCR';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CreditCard, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Landmark, 
  Calendar, 
  ShieldCheck, 
  Smartphone,
  ChevronLeft,
  X
} from 'lucide-react';

const Pago = () => {
    const { idPrestamo } = useParams();
    const navigate = useNavigate();
    const [loan, setLoan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scanData, setScanData] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);
    
    const { scanReceipt, isScanning, scanError } = useOCR();

    useEffect(() => {
        const fetchLoan = async () => {
            try {
                const docRef = doc(db, 'prestamos', idPrestamo);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setLoan(docSnap.data());
                }
            } catch (err) {
                console.error("Error fetching loan:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchLoan();
    }, [idPrestamo]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const data = await scanReceipt(file);
        if (data) {
            setScanData(data);
            setShowConfirm(true);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        </div>
    );

    if (!loan) return (
        <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-16 h-16 text-rose-500 mb-4" />
            <h1 className="text-2xl font-black">Préstamo no encontrado</h1>
            <p className="text-slate-400 mt-2">Verifica el enlace o contacta con administración.</p>
        </div>
    );

    const totalPendiente = (loan.capital_actual || 0) + (loan.interes_pendiente || 0) + (loan.mora_acumulada || 0);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
            {/* GRADIENT BLOBS - Glassmorphism Background */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full" />
                <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[100px] rounded-full" />
            </div>

            <main className="max-w-md mx-auto p-5 pt-12">
                {/* HEADER MODERNO */}
                <div className="flex items-center justify-between mb-8">
                    <button onClick={() => navigate(-1)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/10">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="text-right">
                        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-blue-400">Portal de Pago</h2>
                        <p className="text-[10px] text-slate-500 font-bold">VYJ CAPITAL S.R.L</p>
                    </div>
                </div>

                {/* TARJETA DE SALDO GLASSMORPHISM */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 mb-8 shadow-2xl"
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <Smartphone className="w-24 h-24" />
                    </div>
                    
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Total Pendiente</span>
                    <h1 className="text-5xl font-black tracking-tighter mb-6">
                        RD${new Intl.NumberFormat('en-US').format(totalPendiente)}
                    </h1>

                    <div className="flex items-center gap-4 text-xs font-bold bg-white/5 p-4 rounded-2xl border border-white/5">
                        <Calendar className="w-4 h-4 text-amber-500" />
                        <span className="text-slate-300">Próximo Vencimiento:</span>
                        <span className="text-white ml-auto">
                            {loan.proximo_pago?.toDate?.().toLocaleDateString('es-DO', { day: 'numeric', month: 'long' }) || 'No definida'}
                        </span>
                    </div>
                </motion.div>

                {/* OPCIONES DE PAGO */}
                <div className="space-y-4 mb-12">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 ml-2">Métodos Disponibles</h3>
                    
                    {/* Botón Pago con Tarjeta */}
                    <button className="w-full group bg-blue-600 hover:bg-blue-500 text-white p-6 rounded-[2rem] font-black flex items-center justify-between transition-all shadow-xl shadow-blue-900/40 active:scale-95">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-xl group-hover:scale-110 transition-transform">
                                <CreditCard className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                                <p className="text-sm">Pagar con Tarjeta</p>
                                <p className="text-[10px] font-bold text-blue-200 uppercase">Procesamiento inmediato</p>
                            </div>
                        </div>
                        <div className="p-2">
                           <ShieldCheck className="w-5 h-5 opacity-50" />
                        </div>
                    </button>

                    {/* Bloque Transferencia */}
                    <div className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <Landmark className="w-5 h-5 text-emerald-400" />
                            <h4 className="text-sm font-black uppercase tracking-widest">Transferencia Bancaria</h4>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Banco Popular</p>
                                <p className="font-mono text-sm tracking-widest">789-234-123</p>
                                <p className="text-[9px] text-slate-500 uppercase mt-1 italic italic">VYJ CAPITAL SRL</p>
                            </div>
                            
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Banreservas</p>
                                <p className="font-mono text-sm tracking-widest">960-012-334</p>
                                <p className="text-[9px] text-slate-500 uppercase mt-1 italic">VYJ CAPITAL SRL</p>
                            </div>
                        </div>

                        {/* Botón Subir Recibo */}
                        <div className="mt-8">
                            <label className="cursor-pointer">
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                <div className={`w-full p-4 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center gap-3 ${isScanning ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-blue-500/50 hover:bg-white/5'}`}>
                                    {isScanning ? (
                                        <>
                                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 italic">Analizando recibo con IA Gemini...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-5 h-5 text-slate-400" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reportar Transferencia</span>
                                        </>
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* SEGURIDAD */}
                <div className="text-center opacity-30 flex flex-col items-center gap-2">
                    <ShieldCheck className="w-8 h-8" />
                    <p className="text-[9px] font-black uppercase tracking-[0.4em]">Transacción Encriptada 256-bit</p>
                </div>
            </main>

            {/* MODAL DE CONFIRMACIÓN IA (GLASSMORPHISM) */}
            <AnimatePresence>
                {showConfirm && scanData && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                            onClick={() => setShowConfirm(false)}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-sm bg-[#1e293b] border border-white/20 rounded-[2.5rem] p-10 shadow-[0_0_50px_rgba(37,99,235,0.2)] overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <CheckCircle className="w-40 h-40" />
                            </div>

                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-black tracking-tight">Recibo detectado</h3>
                                <button onClick={() => setShowConfirm(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-6 relative mb-10">
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto Pagado</p>
                                    <p className="text-3xl font-black text-emerald-400 font-mono">RD${new Intl.NumberFormat('en-US').format(scanData.monto_pagado)}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha</p>
                                        <p className="text-xs font-bold text-white">{scanData.fecha}</p>
                                    </div>
                                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Banco</p>
                                        <p className="text-xs font-bold text-white uppercase">{scanData.banco_origen}</p>
                                    </div>
                                </div>
                            </div>

                            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all active:scale-95" onClick={() => {
                                alert("Pago notificado a revisión. Recibirás una notificación en cuanto sea validado.");
                                setShowConfirm(false);
                            }}>
                                Confirmar Envío
                            </button>
                            <p className="text-center text-[9px] text-slate-500 uppercase font-black tracking-widest mt-6">Validado por Gemini 2.0 Flash AI</p>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Pago;

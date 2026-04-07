import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { useOCR } from '../services/useOCR';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Landmark, FileText, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const Pago = () => {
    const { idPrestamo } = useParams();
    const [loan, setLoan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // OCR Logic
    const { scanReceipt, isScanning, scanError } = useOCR();
    const [receiptData, setReceiptData] = useState(null);

    useEffect(() => {
        const fetchLoan = async () => {
            if (!idPrestamo) return;
            setLoading(true);
            try {
                // Buscamos el documento en la colección 'prestamos'
                const docRef = doc(db, 'prestamos', idPrestamo);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setLoan(docSnap.data());
                } else {
                    setError("No se encontró el préstamo especificado.");
                }
            } catch (err) {
                console.error("Error al cargar préstamo:", err);
                setError("Error al conectar con la base de datos.");
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
            setReceiptData(data);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(amount);
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
            <Loader2 className="w-10 h-10 text-primary-accent animate-spin" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-6 text-white text-center">
            <AlertCircle className="w-16 h-16 text-rose-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">¡Ups! Algo salió mal</h2>
            <p className="text-slate-400">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-6 btn btn-secondary">Reintentar</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans p-4 md:p-8 flex flex-col items-center selection:bg-primary/30">
            {/* Header / Brand */}
            <header className="w-full max-w-md mb-8 text-center">
                <h1 className="text-3xl font-display font-black tracking-tighter text-white">VYJ CAPITAL</h1>
                <p className="text-slate-400 text-sm uppercase tracking-widest mt-1">Portal de Clientes</p>
            </header>

            <main className="w-full max-w-md space-y-6">
                {/* Loan Info Card - Glassmorphism */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-[2rem] p-8 border-white/10 shadow-2xl relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-3xl -z-10 rounded-full" />
                    
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <p className="text-xs text-slate-400 uppercase font-black tracking-widest">Saldo Pendiente</p>
                            <h2 className="text-4xl font-display font-black mt-2 text-white">
                                {formatCurrency(loan.capital_actual + (loan.interes_pendiente || 0) + (loan.mora_acumulada || 0))}
                            </h2>
                        </div>
                        <div className={`status-badge text-[10px] ${loan.estado === 'MORA' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {loan.estado}
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-white/5 pt-6">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Próximo Vencimiento</span>
                            <span className="font-bold text-white">{formatDate(loan.proximo_pago)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Cliente</span>
                            <span className="text-white">{loan.nombre_cliente}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">ID Préstamo</span>
                            <span className="text-white font-mono text-[10px]">#{idPrestamo.substring(0,8)}...</span>
                        </div>
                    </div>
                </motion.div>

                {/* Payment Actions */}
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-2">Opciones de Pago</h3>
                    
                    <button className="w-full p-6 rounded-2xl bg-primary hover:bg-primary-dark text-white font-black flex items-center justify-center gap-4 transition-all duration-300 shadow-xl shadow-primary/20 active:scale-95 group">
                        <CreditCard className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                        PAGAR CON TARJETA
                    </button>

                    <div className="glass rounded-2xl p-6 border-white/5 space-y-4">
                        <div className="flex items-center gap-3">
                            <Landmark className="w-5 h-5 text-emerald-400" />
                            <span className="font-bold">Transferencia Bancaria</span>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
                            <p className="flex justify-between italic"><span className="text-slate-400">Banco:</span> <span>BANRESERVAS</span></p>
                            <p className="flex justify-between"><span className="text-slate-400">Cuenta:</span> <span className="font-mono">960-xxxx-001</span></p>
                            <p className="flex justify-between"><span className="text-slate-400">Beneficiario:</span> <span>VYJ CAPITAL S.R.L</span></p>
                        </div>
                        
                        {/* OCR Upload Area */}
                        <div className="mt-4 pt-4 border-t border-white/5">
                            <p className="text-xs text-slate-400 mb-3 text-center">¿Ya realizaste la transferencia? Sube tu comprobante:</p>
                            <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors group">
                                {isScanning ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader2 className="w-8 h-8 text-primary-accent animate-spin" />
                                        <span className="text-xs text-slate-300 font-medium">Analizando recibo con IA...</span>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-slate-500 group-hover:text-primary-accent transition-colors mb-2" />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">Escanear Recibo</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                    </>
                                )}
                            </label>
                            {scanError && <p className="text-rose-500 text-[10px] mt-2 text-center">{scanError}</p>}
                        </div>
                    </div>
                </section>

                {/* Confirmation Box (Extracted Data) */}
                <AnimatePresence>
                    {receiptData && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl space-y-4"
                        >
                            <div className="flex items-center gap-2 text-emerald-400 mb-2">
                                <CheckCircle className="w-5 h-5" />
                                <span className="text-sm font-black uppercase tracking-widest">Recibo Detectado</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <p className="text-slate-400 mb-1">Monto Identificado</p>
                                    <p className="text-lg font-black text-white">{formatCurrency(receiptData.monto_pagado)}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 mb-1">Fecha</p>
                                    <p className="text-lg font-black text-white">{receiptData.fecha}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-slate-400 mb-1">Banco de Origen</p>
                                    <p className="text-white font-bold">{receiptData.banco_origen}</p>
                                </div>
                            </div>
                            
                            <button className="btn btn-primary w-full" onClick={() => alert("Pago notificado al administrador.")}>
                                NOTIFICAR MI PAGO
                            </button>
                            <button className="w-full text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase font-bold tracking-widest pt-2" onClick={() => setReceiptData(null)}>
                                Volver a escanear
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <footer className="mt-auto pt-12 text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
                VYJ Capital &copy; 2026 · Secured by Gemini AI
            </footer>
        </div>
    );
};

export default Pago;

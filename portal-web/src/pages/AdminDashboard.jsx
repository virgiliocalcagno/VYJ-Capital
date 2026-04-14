import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase-config';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, Wallet, CreditCard, ShieldCheck, Search, Users, 
  ArrowUpRight, ArrowDownRight, Clock, MapPin, Briefcase, 
  ChevronRight, MoreVertical, FileText, Download, Printer,
  Eye, Filter, Plus, Calendar, TrendingUp, AlertCircle
} from 'lucide-react';

const AdminDashboard = () => {
    // State Management
    const [view, setView] = useState('overview'); // overview, clients, client-detail
    const [selectedClient, setSelectedClient] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Financial State
    const [metrics, setMetrics] = useState({
        totalCapital: 0,
        pendingInterests: 0,
        activeLoans: 0,
        moraVolume: 0,
        collectionEfficiency: 92
    });
    const [clients, setClientes] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);

    // Data Engine
    useEffect(() => {
        const unsubClients = onSnapshot(collection(db, "clientes"), (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            setClientes(list);
            setIsLoading(false);
        });

        const unsubLoans = onSnapshot(collection(db, "prestamos"), (snap) => {
            let cap = 0, red = 0, mor = 0, count = 0;
            snap.forEach(d => {
                const lp = d.data();
                cap += Number(lp.capital_actual || lp.monto_principal) || 0;
                red += Number(lp.interes_pendiente) || 0;
                mor += Number(lp.mora_acumulada) || 0;
                if(lp.estado !== 'LIQUIDADO') count++;
            });
            setMetrics(prev => ({ 
                ...prev, 
                totalCapital: cap, 
                pendingInterests: red, 
                moraVolume: mor, 
                activeLoans: count 
            }));
        });

        // Simulación de actividad reciente (En un sistema pro vendría de una subcolección)
        setRecentActivity([
            { id: 1, type: 'payment', user: 'Francisca C.', amount: 15400, date: 'Hace 2 min', status: 'Verificado' },
            { id: 2, type: 'loan', user: 'Arony B.', amount: 50000, date: 'Hace 1 hora', status: 'Aprobado' },
            { id: 3, type: 'mora', user: 'Juan P.', amount: 2500, date: 'Hace 4 horas', status: 'Crítico' }
        ]);

        return () => { unsubClients(); unsubLoans(); };
    }, []);

    const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

    return (
        <div className="flex h-screen bg-[#F8FAFC] overflow-hidden text-[#1E293B]">
            {/* SIDEBAR NAVIGATION - FIXED & ELEGANT */}
            <aside className="w-64 bg-white border-r border-[#E2E8F0] flex flex-col h-full z-50">
                <div className="p-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0F172A] rounded-xl flex items-center justify-center text-white shadow-lg">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h1 className="font-black text-lg tracking-tighter leading-none">VYJ <span className="text-blue-600">CAPITAL</span></h1>
                            <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-1">SYSTEMS v4.0</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1">
                    <NavItem icon={<TrendingUp size={18}/>} label="Mercado & Flujo" active={view === 'overview'} onClick={() => setView('overview')} />
                    <NavItem icon={<Users size={18}/>} label="Cartera de Clientes" active={view === 'clients' || view === 'client-detail'} onClick={() => setView('clients')} />
                    <NavItem icon={<Calendar size={18}/>} label="Agenda de Cobros" />
                    <NavItem icon={<FileText size={18}/>} label="Informes Avanzados" />
                </nav>

                <div className="p-4 mt-auto">
                    <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-500/20 blur-2xl" />
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Operador</p>
                        <p className="text-sm font-black italic">V. Calcagno</p>
                        <button className="mt-4 w-full bg-white/10 hover:bg-white/20 py-2 rounded-xl text-[10px] font-black uppercase transition-all">Desconectar</button>
                    </div>
                </div>
            </aside>

            {/* MAIN WORKSPACE */}
            <main className="flex-1 overflow-y-auto relative custom-scrollbar">
                {/* TOP BAR */}
                <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-10 py-6 flex items-center justify-between z-40">
                    <div className="flex-1 max-w-xl relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                        <input 
                            type="text" placeholder="Búsqueda global de expedientes (Nombre, ID, Préstamo...)" 
                            className="w-full bg-slate-50 border-none rounded-xl py-3 pl-12 pr-4 text-sm font-bold placeholder:text-slate-400 outline-none focus:ring-2 ring-blue-500/10 transition-all"
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Servidor</span>
                            <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sincronizado
                            </span>
                        </div>
                    </div>
                </header>

                <div className="p-10 max-w-[1400px] mx-auto">
                    <AnimatePresence mode="wait">
                        {view === 'overview' && (
                            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key="overview" className="space-y-10">
                                {/* SYSTEM KPI's */}
                                <div className="grid grid-cols-4 gap-6">
                                    <MetricCard label="Capital en Mercado" value={formatCurrency(metrics.totalCapital)} trend="+2.4%" icon={<Wallet className="text-blue-600"/>} />
                                    <MetricCard label="Réditos por Cobrar" value={formatCurrency(metrics.pendingInterests)} trend="+12.1%" icon={<ArrowUpRight className="text-emerald-500"/>} />
                                    <MetricCard label="Índice de Mora" value={formatCurrency(metrics.moraVolume)} trend="-1.2%" icon={<AlertCircle className="text-rose-500"/>} down />
                                    <MetricCard label="Préstamos Activos" value={metrics.activeLoans} trend="Global" icon={<CreditCard className="text-indigo-600"/>} />
                                </div>

                                <div className="grid grid-cols-3 gap-10">
                                    {/* ACTIVITY FEED */}
                                    <div className="col-span-2 bg-white rounded-[2rem] border border-slate-200 p-10 shadow-sm">
                                        <div className="flex justify-between items-center mb-10">
                                            <div>
                                                <h3 className="text-lg font-black tracking-tight italic uppercase">Flujo Reciente de Caja</h3>
                                                <p className="text-xs text-slate-400 font-bold mt-1">Monitoreo de transacciones en vivo</p>
                                            </div>
                                            <button className="text-xs font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest">Ver Todo</button>
                                        </div>
                                        <div className="space-y-4">
                                            {recentActivity.map(act => (
                                                <div key={act.id} className="flex items-center justify-between p-5 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group">
                                                    <div className="flex items-center gap-5">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${act.type === 'payment' ? 'bg-emerald-50 text-emerald-600' : act.type === 'loan' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}>
                                                            {act.type === 'payment' ? <ArrowDownRight size={20}/> : <ArrowUpRight size={20}/>}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black uppercase italic tracking-tight">{act.user}</p>
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{act.date} • {act.status}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-black font-mono tracking-tighter italic">{formatCurrency(act.amount)}</p>
                                                        <MoreVertical size={16} className="text-slate-300 ml-auto mt-1 cursor-pointer hover:text-slate-900" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* STATUS BREAKDOWN */}
                                    <div className="bg-[#0F172A] rounded-[2rem] p-10 text-white relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/10 blur-3xl" />
                                        <h3 className="text-lg font-black tracking-tight italic uppercase mb-8">Estado de Salud</h3>
                                        <div className="space-y-8">
                                            <ProgressItem label="Eficiencia de Cobro" value={92} color="bg-emerald-500" />
                                            <ProgressItem label="Retención de Capital" value={85} color="bg-blue-500" />
                                            <ProgressItem label="Crecimiento Mensual" value={14} color="bg-indigo-500" />
                                        </div>
                                        <div className="mt-12 bg-white/5 p-6 rounded-2xl border border-white/10">
                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2 italic">Alerta de Riesgo</p>
                                            <p className="text-xs font-bold leading-relaxed">Se detectó un incremento del 2.1% en la mora del sector automotriz. Revisar garantías.</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {view === 'clients' && (
                            <motion.div initial={{opacity:0}} animate={{opacity:1}} key="clients" className="space-y-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="text-4xl font-black italic uppercase tracking-tighter">Cartera de Inversión</h2>
                                        <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">{clients.length} Expedientes Auditados</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <button className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-xs uppercase italic tracking-widest flex items-center gap-3 shadow-xl"><Download size={16}/> Exportar SIRE</button>
                                        <button className="bg-blue-600 text-white px-8 py-4 rounded-xl font-black text-xs uppercase italic tracking-widest flex items-center gap-3 shadow-2xl shadow-blue-600/20"><Plus size={16}/> Nuevo Expediente</button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                                    {clients.map(c => (
                                        <div 
                                            key={c.id} 
                                            onClick={() => {setSelectedClient(c); setView('client-detail');}}
                                            className="bg-white border border-slate-200 p-8 rounded-[2.5rem] hover:ring-2 ring-blue-500/10 transition-all cursor-pointer group shadow-sm relative"
                                        >
                                            <div className="flex items-center justify-between mb-8">
                                                <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center font-black text-xl italic group-hover:bg-blue-600 group-hover:text-white transition-all">{c.nombre?.charAt(0)}</div>
                                                <div className="text-right">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest italic ${c.estado === 'MORA' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {c.estado || 'Activo'}
                                                    </span>
                                                    <p className="text-[10px] text-slate-400 font-bold mt-2 font-mono">ID: {c.cedula?.substr(0,8)}...</p>
                                                </div>
                                            </div>
                                            <h4 className="text-xl font-black uppercase italic tracking-tighter mb-6 group-hover:text-blue-600 transition-colors">{c.nombre}</h4>
                                            
                                            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 leading-none">Riesgo IA</span>
                                                    <span className="text-xs font-black italic text-emerald-500">Bajo (3.2%)</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 leading-none">Próx. Cobro</span>
                                                    <span className="text-xs font-black italic text-slate-900 italic">22 Abr</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {view === 'client-detail' && selectedClient && (
                            <motion.div initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} key="detail" className="space-y-12 pb-20">
                                {/* DETAIL HEADER */}
                                <div className="bg-[#0F172A] rounded-[3rem] p-12 text-white relative overflow-hidden shadow-2xl">
                                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[100px] -z-0" />
                                    <div className="relative z-10 flex flex-col lg:flex-row items-center gap-12">
                                        <div className="w-40 h-40 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-[3rem] flex items-center justify-center text-6xl font-black italic shadow-2xl">
                                            {selectedClient.nombre?.charAt(0)}
                                        </div>
                                        <div className="flex-1 text-center lg:text-left">
                                            <div className="flex flex-col lg:flex-row items-center gap-6 mb-6">
                                                <h2 className="text-5xl lg:text-7xl font-black italic uppercase tracking-tighter leading-none">{selectedClient.nombre}</h2>
                                                <span className="px-6 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl text-xs font-black uppercase italic tracking-[0.2em]">Platinum Client</span>
                                            </div>
                                            <div className="flex flex-wrap justify-center lg:justify-start gap-10 text-sm font-bold text-slate-400 uppercase italic">
                                                <span className="flex items-center gap-2"><FileText size={18} className="text-blue-500"/> ID: {selectedClient.cedula}</span>
                                                <span className="flex items-center gap-2"><MapPin size={18} className="text-blue-500"/> {selectedClient.direccion || 'Sin Ubicación'}</span>
                                                <span className="flex items-center gap-2"><Phone size={18} className="text-blue-500"/> {selectedClient.telefono}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-4 min-w-[240px]">
                                            <button className="bg-white text-slate-900 py-4 rounded-xl font-black text-xs uppercase italic tracking-widest shadow-xl">Imprimir Expediente</button>
                                            <button onClick={() => setView('clients')} className="bg-white/10 hover:bg-white/20 py-4 rounded-xl font-black text-xs uppercase italic tracking-widest transition-all">← Volver</button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-10">
                                    <div className="col-span-2 space-y-10">
                                        {/* LOAN SERVICING CONSOLE */}
                                        <section>
                                            <div className="flex justify-between items-center mb-8 px-4">
                                                <h3 className="text-lg font-black uppercase italic tracking-tight">Consola de Préstamos</h3>
                                                <button className="bg-blue-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase italic tracking-widest">+ Extender Crédito</button>
                                            </div>
                                            <div className="space-y-6">
                                                {/* En un sistema real iteraríamos prestamos asociados */}
                                                <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl group-hover:bg-emerald-500/10 transition-all" />
                                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-8">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-4">
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 bg-slate-50 rounded-lg">ID: #V30RE</span>
                                                                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-3 py-1 bg-blue-50 rounded-lg italic">Método: VYJ UNIFICADO</span>
                                                            </div>
                                                            <h4 className="text-6xl font-black font-mono italic tracking-tighter">RD$ 333,050.00</h4>
                                                            <p className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest italic leading-none">Capital Principal en Mercado</p>
                                                        </div>
                                                        <div className="flex gap-4">
                                                            <button className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase italic tracking-widest shadow-xl flex items-center gap-3"><DollarSign size={18}/> Registrar Cobro</button>
                                                            <button className="p-5 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all text-slate-600"><Printer size={20}/></button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-10 py-10 border-t border-slate-50">
                                                        <DetailedMetric label="Réditos a la Fecha" value="RD$ 100,237.83" color="text-emerald-600" />
                                                        <DetailedMetric label="Interés por Mora" value="RD$ 0.00" color="text-slate-400" />
                                                        <DetailedMetric label="Tasa Aplicada" value="12% Mensual" color="text-blue-600" />
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* FICHA TÉCNICA DE INGENIERÍA */}
                                        <section className="bg-white border border-slate-200 rounded-[3rem] p-12 shadow-sm">
                                            <div className="flex items-center gap-4 mb-12">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400"><FileText size={20}/></div>
                                                <h3 className="text-xl font-black uppercase italic tracking-tighter">Ficha Técnica Avanzada</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-20 gap-y-12">
                                                <FichaGroup title="Bio Data">
                                                    <FichaField label="Cédula / Pasaporte" value={selectedClient.cedula} />
                                                    <FichaField label="Nacimiento" value={selectedClient.fecha_nacimiento} />
                                                    <FichaField label="Estado Civil" value={selectedClient.estado_civil} />
                                                    <FichaField label="Nacionalidad" value={selectedClient.nacionalidad || 'Dominicana'} />
                                                </FichaGroup>
                                                <FichaGroup title="Financial Source">
                                                    <FichaField label="Empresa Pagadora" value={selectedClient.trabajo?.empresa} />
                                                    <FichaField label="Puesto / Cargo" value={selectedClient.trabajo?.ocupacion} />
                                                    <FichaField label="Sueldo Neto" value={selectedClient.trabajo?.sueldo ? formatCurrency(selectedClient.trabajo.sueldo) : 'No Declarado'} />
                                                    <FichaField label="Phone Business" value={selectedClient.trabajo?.telefono} />
                                                </FichaGroup>
                                                <FichaGroup title="Collaterals & Garante">
                                                    <FichaField label="Fiador Solidario" value={selectedClient.solidario?.nombre} />
                                                    <FichaField label="Phone Fiador" value={selectedClient.solidario?.telefono} />
                                                    <FichaField label="Tipo Garantía" value={selectedClient.garantia?.tipo} />
                                                </FichaGroup>
                                                <FichaGroup title="Digital Footprint">
                                                    <div className="space-y-4">
                                                        <button className="w-full bg-slate-50 hover:bg-slate-100 py-3 rounded-xl flex items-center justify-between px-4 border border-slate-200 transition-all">
                                                            <span className="text-[10px] font-black uppercase text-slate-400 italic">Face Match ID</span>
                                                            <span className="text-[10px] font-black text-emerald-500 uppercase italic">Verificado</span>
                                                        </button>
                                                        <button className="w-full bg-slate-50 hover:bg-slate-100 py-3 rounded-xl flex items-center justify-between px-4 border border-slate-200 transition-all">
                                                            <span className="text-[10px] font-black uppercase text-slate-400 italic">WhatsMyName Audit</span>
                                                            <span className="text-[10px] font-black text-blue-600 uppercase italic">Ver Perfiles</span>
                                                        </button>
                                                    </div>
                                                </FichaGroup>
                                            </div>
                                        </section>
                                    </div>

                                    {/* RIGHT SIDEBAR: AUDIT & DOCS */}
                                    <div className="space-y-10">
                                        <div className="bg-[#0F172A] rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-3xl" />
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-8 italic">Audit Intelligence</h4>
                                            <div className="space-y-6">
                                                <AuditIcon label="KYC Verificado" date="Hace 5 min" status="success" />
                                                <AuditIcon label="Social Tracking" date="Cargando..." status="loading" />
                                                <AuditIcon label="Geolocalización" date="Puntual" status="success" />
                                            </div>
                                            <button className="mt-10 w-full bg-blue-600 py-4 rounded-2xl font-black text-xs uppercase italic tracking-widest shadow-xl">Ejecutar Escaneo</button>
                                        </div>

                                        <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-sm">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 italic">Document Warehouse</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <DocThumb label="Cédula Frontal" />
                                                <DocThumb label="Cédula Reverso" />
                                                <DocThumb label="Paginaré" />
                                                <div className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-2 text-slate-300 hover:text-blue-600 hover:border-blue-500/50 transition-all cursor-pointer">
                                                    <Plus size={20}/>
                                                    <span className="text-[9px] font-black uppercase">Añadir</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

// UI COMPONENTS - ENGINEERING FOCUS
const NavItem = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-black text-xs uppercase italic tracking-tighter transition-all group ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 font-bold'}`}>
        <div className="flex items-center gap-4">
            {icon}
            {label}
        </div>
        {active && <ChevronRight size={14}/>}
    </button>
);

const MetricCard = ({ label, value, trend, icon, down }) => (
    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
        <div className="flex justify-between items-center mb-6">
            <div className="p-3 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform">{icon}</div>
            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${down ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>{trend}</span>
        </div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 italic">{label}</p>
        <p className="text-3xl font-black font-mono italic tracking-tighter leading-none">{value}</p>
    </div>
);

const ProgressItem = ({ label, value, color }) => (
    <div>
        <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black uppercase italic tracking-tight">{label}</span>
            <span className="text-[10px] font-black font-mono">{value}%</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div initial={{width:0}} animate={{width:`${value}%`}} className={`h-full ${color}`} />
        </div>
    </div>
);

const DetailedMetric = ({ label, value, color }) => (
    <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 italic leading-none">{label}</p>
        <p className={`text-2xl font-black font-mono italic tracking-tighter ${color}`}>{value}</p>
    </div>
);

const FichaGroup = ({ title, children }) => (
    <div className="space-y-6 text-left">
        <h5 className="text-[10px] font-black uppercase text-blue-600 tracking-[0.3em] border-b border-blue-50 pb-2 italic">{title}</h5>
        <div className="space-y-6">{children}</div>
    </div>
);

const FichaField = ({ label, value }) => (
    <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 leading-none italic">{label}</p>
        <p className="text-sm font-black uppercase italic text-slate-900 leading-none">{value || 'No Definido'}</p>
    </div>
);

const AuditIcon = ({ label, date, status }) => (
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${status === 'success' ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`} />
            <div>
                <p className="text-[10px] font-black uppercase italic tracking-tight">{label}</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase">{date}</p>
            </div>
        </div>
        <Eye size={14} className="text-slate-500 cursor-pointer" />
    </div>
);

const DocThumb = ({ label }) => (
    <div className="aspect-square bg-slate-50 rounded-3xl border border-slate-100 flex flex-col items-center justify-center p-4 text-center group cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm mb-3 group-hover:text-blue-600"><FileText size={20}/></div>
        <span className="text-[8px] font-black uppercase text-slate-400 group-hover:text-blue-600">{label}</span>
    </div>
);

export default AdminDashboard;

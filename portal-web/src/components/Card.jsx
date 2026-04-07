/** Componente de Tarjeta Premium con Efecto de Desvanecimiento */
const Card = ({ title, value, type = 'default' }) => {
    const colorClass = type === 'danger' ? 'text-rose-500' : type === 'warning' ? 'text-amber-500' : 'text-blue-600';
    
    return (
        <div className="bg-white/80 backdrop-blur-lg border border-slate-100 p-8 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">{title}</h4>
            <div className={`text-4xl font-display font-black mt-2 ${colorClass}`}>
                {value}
            </div>
        </div>
    )
}

export default Card;

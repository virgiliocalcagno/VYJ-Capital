import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAQI11AzX5yhmP0trc1RcUQOfPxdIqPObk",
  authDomain: "vyj-capital.firebaseapp.com",
  projectId: "vyj-capital",
  storageBucket: "vyj-capital.firebasestorage.app",
  messagingSenderId: "980348234124",
  appId: "1:980348234124:web:c78c003490d533b9a04ea9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createDaneisi() {
  console.log("Iniciando creación de cliente Daneisi...");
  
  try {
    const loanData = {
      nombre_cliente: "DANEISI",
      cedula_cliente: "001-0000000-0", // Genérico, usuario puede actualizar
      telefono: "+1 (809) 762-4362",
      monto_principal: 45000,
      capital_actual: 45000,
      tasa_mensual: 0.20,
      interes_pendiente: 13000,
      mora_acumulada: 0,
      estado: "ACTIVO",
      metodo: "REDITO_PURO",
      dia_pago: 15,
      fecha_inicio: new Date(2025, 10, 1), // Noviembre 2025
      nota_inicial: "Migración de historial de pagos manual.",
    };

    const docRef = await addDoc(collection(db, "prestamos"), loanData);
    console.log("Préstamo creado con ID:", docRef.id);

    // Historial de pagos
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
      console.log(`Pago de ${p.monto} registrado.`);
    }

    console.log("Migración completada con éxito.");
    process.exit(0);
  } catch (err) {
    console.error("Error en migración:", err);
    process.exit(1);
  }
}

createDaneisi();

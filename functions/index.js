const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { differenceInDays, addMonths, addDays, format } = require("date-fns");
const PDFDocument = require("pdfkit");

admin.initializeApp();
const db = admin.firestore();

// --- 1. Motor de Mora (Scheduled) ---
// Ejecuta cada medianoche para revisar préstamos vencidos
exports.motorMora = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
    const today = new Date();
    const snapshot = await db.collection("prestamos")
        .where("estado", "in", ["ACTIVO", "MORA"])
        .get();

    const batch = db.batch();
    let updatesCount = 0;

    snapshot.docs.forEach(doc => {
        const loan = doc.data();
        if (!loan.proximo_pago) return;

        const paymentDate = loan.proximo_pago.toDate();

        if (today > paymentDate) {
            // Regla: 1% de mora sobre el saldo insoluto si se pasa de la fecha
            // O una cuota fija si se prefiere. Se usa 100 pesos/día para el demo.
            const dailyMora = 100;
            const newMora = (loan.mora_acumulada || 0) + dailyMora;

            const loanRef = db.collection("prestamos").doc(doc.id);
            batch.update(loanRef, {
                mora_acumulada: newMora,
                estado: "MORA",
                mora_editable: true // Permitir al admin ajustar
            });
            updatesCount++;
        }
    });

    if (updatesCount > 0) {
        await batch.commit();
        console.log(`Updated mora for ${updatesCount} loans.`);
    }
    return null;
});

// --- 2. Cálculo de Rédito (Scheduled) ---
// Genera el interés mensual para préstamos de 'Rédito Puro'
exports.calcularReditoMensual = functions.pubsub.schedule("0 0 1 * *").onRun(async (context) => {
    const snapshot = await db.collection("prestamos")
        .where("metodo", "==", "REDITO_PURO")
        .where("estado", "in", ["ACTIVO", "MORA"])
        .get();

    const batch = db.batch();

    snapshot.docs.forEach(doc => {
        const loan = doc.data();
        const interesMensual = loan.capital_actual * (loan.tasa_mensual || 0);

        const loanRef = db.collection("prestamos").doc(doc.id);
        batch.update(loanRef, {
            interes_pendiente: (loan.interes_pendiente || 0) + interesMensual,
            proximo_pago: addMonths(loan.proximo_pago.toDate(), 1)
        });
    });

    await batch.commit();
    return null;
});

// --- 3. Procesar Pago con Lógica Financiera ---
exports.procesarPago = functions.https.onCall(async (data, context) => {
    const { loanId, amount, aplicarExcedenteCapital } = data;
    const loanRef = db.collection("prestamos").doc(loanId);

    return db.runTransaction(async (t) => {
        const loanDoc = await t.get(loanRef);
        if (!loanDoc.exists) throw new functions.https.HttpsError("not-found", "Préstamo no encontrado");

        const loan = loanDoc.data();
        let remaining = amount;

        // 1. Mora
        const moraPending = loan.mora_acumulada || 0;
        const moraPaid = remaining >= moraPending ? moraPending : remaining;
        remaining -= moraPaid;

        // 2. Interés
        const interestPending = loan.interes_pendiente || 0;
        const interestPaid = remaining >= interestPending ? interestPending : remaining;
        remaining -= interestPaid;

        // 3. Capital (Abono)
        let capitalPaid = 0;
        if (remaining > 0) {
            // Preguntar si aplicar excedente (manejado por el flag 'aplicarExcedenteCapital')
            if (loan.metodo === 'REDITO_PURO') {
                if (aplicarExcedenteCapital) {
                    capitalPaid = remaining;
                } else {
                    // Queda como saldo a favor o error de proceso? 
                    // Por simplicidad, si no aplica a capital, no se procesa el excedente
                }
            } else {
                // En ABONO_CAPITAL, el excedente siempre reduce capital
                capitalPaid = remaining;
            }
        }

        const newCapital = loan.capital_actual - capitalPaid;
        const newMora = loan.mora_acumulada - moraPaid;
        const newInterest = loan.interes_pendiente - interestPaid;

        // Actualizar Préstamo
        t.update(loanRef, {
            capital_actual: newCapital,
            mora_acumulada: newMora,
            interes_pendiente: newInterest,
            estado: newCapital <= 0 ? 'SALDADO' : (newMora > 0 ? 'MORA' : 'ACTIVO'),
            ultimo_pago: admin.firestore.FieldValue.serverTimestamp()
        });

        // Registrar Transacción
        const transRef = db.collection("transacciones").doc();
        t.set(transRef, {
            prestamo_id: loanId,
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            monto_total: amount,
            desglose: { mora: moraPaid, interes: interestPaid, capital: capitalPaid },
            nuevo_saldo: newCapital
        });

        return { success: true, nuevo_saldo: newCapital };
    });
});

// --- 4. Generar Estado de Cuenta PDF ---
exports.generarEstadoCuenta = functions.https.onRequest(async (req, res) => {
    const { loanId } = req.query;
    if (!loanId) return res.status(400).send("Falta loanId");

    try {
        const loanDoc = await db.collection("prestamos").doc(loanId).get();
        if (!loanDoc.exists) return res.status(404).send("Préstamo no encontrado");
        const loan = loanDoc.data();

        const doc = new PDFDocument();
        res.setHeader("Content-Type", "application/pdf");
        doc.pipe(res);

        doc.fontSize(22).text("VYJ Capital - Estado de Cuenta", { align: "center" });
        doc.moveDown();
        doc.fontSize(12).text(`Cliente: ${loan.nombre_cliente}`);
        doc.text(`ID Préstamo: ${loanId}`);
        doc.text(`Método: ${loan.metodo}`);
        doc.moveDown();
        doc.fontSize(14).text("Resumen Financiero:", { underline: true });
        doc.fontSize(12).text(`Capital Pendiente: $${loan.capital_actual.toFixed(2)}`);
        doc.text(`Interés Pendiente: $${(loan.interes_pendiente || 0).toFixed(2)}`);
        doc.text(`Mora Acumulada: $${(loan.mora_acumulada || 0).toFixed(2)}`);
        doc.moveDown();
        doc.text(`Total a Pagar Hoy: $${(loan.capital_actual + (loan.interes_pendiente || 0) + (loan.mora_acumulada || 0)).toFixed(2)}`);

        doc.end();
    } catch (e) {
        res.status(500).send("Error al generar PDF");
    }
});

// --- 5. Telegram Notifications ---
exports.notificarCobrosDia = functions.pubsub.schedule("0 8 * * *").onRun(async (context) => {
    const today = new Date();
    const snapshot = await db.collection("prestamos")
        .where("proximo_pago", "<=", addDays(today, 1))
        .where("estado", "in", ["ACTIVO", "MORA"])
        .get();

    let message = `🚀 *VYJ Capital - Alertas de Cobro (${format(today, 'dd/MM')})*\n\n`;

    if (snapshot.empty) {
        message += "No hay cobros pendientes para hoy. 🎉";
    } else {
        snapshot.forEach(doc => {
            const data = doc.data();
            message += `👤 *${data.nombre_cliente}*\n💰 Saldo: $${data.capital_actual.toFixed(2)}\n📅 Vence: ${format(data.proximo_pago.toDate(), 'dd/MM')}\n\n`;
        });
    }

    const token = functions.config().telegram?.token;
    const chatId = functions.config().telegram?.chat_id;

    if (token && chatId) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
    }

    return null;
});

// --- 6. Referidores: Comisiones ---
async function procesarComisionReferidor(loanId, interestPaid) {
    const loanDoc = await db.collection("prestamos").doc(loanId).get();
    const loan = loanDoc.data();

    if (loan.referidor_id) {
        const refDoc = await db.collection("referidores").doc(loan.referidor_id).get();
        if (refDoc.exists) {
            const ref = refDoc.data();
            let comision = 0;

            if (ref.comision_tipo === 'PORCENTAJE') {
                comision = interestPaid * ref.comision_valor;
            } else if (ref.comision_tipo === 'PAGO_UNICO' && !loan.comision_pagada) {
                comision = ref.comision_valor;
                await db.collection("prestamos").doc(loanId).update({ comision_pagada: true });
            }

            if (comision > 0) {
                await db.collection("comisiones_referidores").add({
                    referidor_id: loan.referidor_id,
                    prestamo_id: loanId,
                    monto: comision,
                    fecha: admin.firestore.FieldValue.serverTimestamp(),
                    estado: 'PENDIENTE'
                });
            }
        }
    }
}

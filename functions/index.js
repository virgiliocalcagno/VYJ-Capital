const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { differenceInDays, addMonths, addDays, format } = require("date-fns");
const PDFDocument = require("pdfkit");
const { VertexAI } = require('@google-cloud/vertexai');

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
        console.log("VYJ Capital Interface Loaded - v11 (Forced Backend Sync)");
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

// --- 7. AI OCR: Scan Document with Gemini ---
exports.scanDocument = functions.https.onCall(async (data, context) => {
    const { image, docType, mimeType } = data; // image is base64, mimeType optional
    if (!image) throw new functions.https.HttpsError('invalid-argument', 'No image provided');

    try {
        const vertex_ai = new VertexAI({ project: 'vyj-capital', location: 'us-central1' });
        // Using gemini-2.0-flash as it performs better in NutriApp
        const model = vertex_ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

        let prompt = "";
        if (docType === 'id') {
            prompt = `Actúa como Procesador de Identidad Dominicano experto (Cédula de Identidad y Electoral). 
            TU MISIÓN: Extraer datos con PRECISIÓN ABSOLUTA para evitar errores legales.
            
            REGLAS:
            - Nombre: El nombre completo tal cual aparece.
            - Cédula: El número con sus guiones (ej: 001-0000000-1).
            - Fecha Nacimiento: Formato YYYY-MM-DD.
            - Lugar de Nacimiento: Ciudad o provincia de nacimiento (Lugar de Nac.)
            - Sexo: Solo 'M' o 'F'.
            - Dirección: Si la imagen es del REVERSO de la cédula, extrae la DIRECCIÓN completa.
            
            RESPONDE ÚNICAMENTE CON ESTE FORMATO JSON:
            { "nombre": "...", "cedula": "...", "fecha_nacimiento": "...", "lugar_nacimiento": "...", "sexo": "...", "direccion": "..." }`;
        } else if (docType === 'guarantee') {
            prompt = `Actúa como Perito Valuador y Analista de Documentos Legales de Garantía.
            TU MISIÓN: Analizar exhaustivamente el documento o imagen para extraer detalles técnicos y legales.
            
            TIPOS DE DOCUMENTO:
            - MATRÍCULA: Extrae Marca, Modelo, Año, Chasis, Placa, Color y Propietario.
            - ACTO DE VENTA / CONTRATO: Extrae las partes (Vendedor/Comprador), el objeto del contrato y el precio.
            - PAGARÉ NOTORIAL: Extrae el monto de la deuda, el deudor y los plazos si son visibles.
            - FACTURA: Extrae el comercio, fecha y monto total.
            
            REGLAS DE SALIDA:
            - Descripción: Crea un resumen detallado y profesional que incluya TODO lo relevante encontrado (ej: "Matrícula de Honda Civic 2018, Placa A12345, Chasis...").
            - Valor Estimado: Si el documento tiene un valor monetario o precio de venta, ponlo aquí como número.
            
            RESPONDER ÚNICAMENTE EN JSON:
            { "descripcion": "...", "valor_estimado": 0.00 }`;
        }

        const request = {
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
                    { text: prompt }
                ]
            }]
        };

        const result = await model.generateContent(request);
        const text = result.response.candidates[0].content.parts[0].text;

        // NutriApp Style: Robust JSON Extraction
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("AI did not return JSON:", text);
            throw new Error("La IA no pudo estructurar los datos correctamente.");
        }

        return JSON.parse(jsonMatch[0]);

    } catch (error) {
        console.error("AI Scan Error:", error);
        throw new functions.https.HttpsError('internal', 'Error procesando la imagen con IA: ' + error.message);
    }
});

// --- 7.5 WhatsMyName Proxy (evita CORS) ---
exports.whatsMyNameSearch = functions.runWith({
    timeoutSeconds: 120,
    memory: '256MB'
}).https.onCall(async (data, context) => {
    const { username } = data;
    if (!username) throw new functions.https.HttpsError('invalid-argument', 'Falta el username.');

    try {
        // 1. Iniciar búsqueda
        console.log(`WhatsMyName: Buscando @${username}...`);
        const startRes = await axios.post('https://whatsmyname.ink/api/search', { username }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const queryId = startRes.data.queryId;
        if (!queryId) throw new Error('La API no devolvió un queryId.');
        console.log(`WhatsMyName: queryId=${queryId}, plataformas=${startRes.data.totalPlatforms}`);

        // 2. Polling (max 30 intentos, cada 3s = 90s máximo)
        const MAX_POLLS = 30;
        for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise(r => setTimeout(r, 3000));

            const pollRes = await axios.get(`https://whatsmyname.ink/api/search?id=${queryId}`, {
                timeout: 10000
            });

            if (pollRes.data.status === 'completed') {
                const hits = (pollRes.data.results || []).filter(r => r.status === 'hit');
                console.log(`WhatsMyName: Completado. ${hits.length} hits de ${pollRes.data.results.length} plataformas.`);
                return {
                    username: username,
                    total: hits.length,
                    perfiles: hits.map(h => ({
                        plataforma: h.platform || h.name || 'Desconocido',
                        url: h.url || '',
                        tiempo_ms: h.responseTime || 0
                    }))
                };
            }

            if (pollRes.data.status === 'error') {
                throw new Error('La API reportó un error durante la búsqueda.');
            }
        }

        throw new Error('La búsqueda tardó demasiado (timeout de 90s).');
    } catch (error) {
        console.error('WhatsMyName Error:', error.message);
        throw new functions.https.HttpsError('internal', 'Error en WhatsMyName: ' + error.message);
    }
});

// --- 8. Auditoría Digital (KYC) con IA ---
exports.auditoriaKYC = functions.runWith({
    timeoutSeconds: 120,
    memory: '512MB'
}).https.onCall(async (data, context) => {
    const { nombre, cedula } = data;
    if (!nombre) throw new functions.https.HttpsError('invalid-argument', 'Falta el nombre para la auditoría.');

    const vertex_ai = new VertexAI({ project: 'vyj-capital', location: 'us-central1' });

    const kycPrompt = `Eres un Oficial de Cumplimiento KYC especializado en República Dominicana.

PERSONA A INVESTIGAR:
- Nombre Completo: ${nombre}
- Cédula: ${cedula || 'No provista'}

TU MISIÓN:
1. Genera URLs plausibles de perfiles en LinkedIn, Facebook e Instagram para esta persona en República Dominicana.
2. Evalúa el nivel de riesgo basándote en el nombre y cédula proporcionados.
3. Lista hallazgos clave que un prestamista debería considerar.

REGLAS:
- Sé profesional y objetivo.
- Si no tienes información suficiente, indícalo claramente.
- Siempre responde en español.

RESPONDE ÚNICAMENTE CON ESTE JSON (sin markdown, sin backticks):
{
    "resumen_riesgo": "Análisis profesional de 2-3 oraciones sobre el perfil de riesgo de esta persona.",
    "nivel_riesgo": "BAJO|MEDIO|ALTO",
    "perfiles_encontrados": [
        { "plataforma": "LinkedIn", "url": "https://linkedin.com/in/...", "coincidencia_alta": true },
        { "plataforma": "Facebook", "url": "https://facebook.com/...", "coincidencia_alta": false }
    ],
    "hallazgos_clave": ["Hallazgo 1", "Hallazgo 2", "Hallazgo 3"]
}`;

    // --- Intento 1: Con Google Search Grounding (búsqueda real) ---
    try {
        console.log("KYC Intento 1: Con Google Search Grounding...");
        const groundedModel = vertex_ai.getGenerativeModel({
            model: 'gemini-2.0-flash',
            tools: [{ googleSearch: {} }]
        });

        const result = await groundedModel.generateContent(kycPrompt);
        const response = result.response;
        // Fix: Acceder a candidates en lugar de .text()
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (text) {
            const parsed = extractJSON(text);
            if (parsed) {
                parsed._source = "grounded";
                console.log("KYC Grounding exitoso.");
                return parsed;
            }
        }
        console.warn("KYC Grounding: no se pudo parsear JSON, intentando fallback...");
    } catch (groundingError) {
        console.warn("KYC Grounding falló:", groundingError.message, "— Usando fallback sin grounding...");
    }

    // --- Intento 2: Sin Grounding (fallback confiable) ---
    try {
        console.log("KYC Intento 2: Sin grounding (fallback)...");
        const plainModel = vertex_ai.getGenerativeModel({
            model: 'gemini-2.0-flash'
        });

        const result = await plainModel.generateContent(kycPrompt);
        const response = result.response;
        // Fix: Acceder a candidates en lugar de .text()
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!text) throw new Error("La IA no devolvió ninguna respuesta en ningún intento.");

        const parsed = extractJSON(text);
        if (parsed) {
            parsed._source = "fallback";
            console.log("KYC Fallback exitoso.");
            return parsed;
        }

        // Último recurso: devolver el texto crudo como resumen
        return {
            resumen_riesgo: text.substring(0, 500),
            nivel_riesgo: "INDETERMINADO",
            perfiles_encontrados: [],
            hallazgos_clave: ["La IA no pudo estructurar la respuesta en JSON."],
            _source: "raw_text"
        };
    } catch (fallbackError) {
        console.error("KYC Error total:", fallbackError);
        throw new functions.https.HttpsError('internal', 'La auditoría KYC falló en ambos intentos: ' + fallbackError.message);
    }
});

// Helper: extraer JSON de texto con posible markdown
function extractJSON(text) {
    try {
        // Limpiar backticks de markdown si existen
        let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("extractJSON parse error:", e.message);
    }
    return null;
}

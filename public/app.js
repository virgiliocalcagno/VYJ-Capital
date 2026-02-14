const db = firebase.firestore();
const functions = firebase.functions();

document.addEventListener('DOMContentLoaded', async () => {
    console.log("VYJ Capital Interface Loaded - v4 (Expediente Digital Fixes)");

    // --- 0. Router Logic (Very Basic) ---
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('id');
    const pageMode = params.get('mode'); // 'new'

    // If on Client Profile Page
    // If on Client Profile Page
    if (window.location.pathname.includes('client.html')) {
        if (clientId) {
            loadClientProfile(clientId);
        } else if (pageMode === 'new') {
            // Show New Client Form
            document.getElementById('profileHeader').style.display = 'none';
            document.getElementById('loansContainer').style.display = 'none';
            document.getElementById('newClientFormSection').style.display = 'block';

            // Handle Create Client Submit
            document.getElementById('createClientForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button');
                btn.disabled = true;
                btn.innerText = "Guardando Expediente...";

                try {
                    const newClient = {
                        // Personal Information
                        nombre: document.getElementById('regName').value,
                        cedula: document.getElementById('regId').value,
                        fecha_nacimiento: document.getElementById('regDob').value || '',
                        sexo: document.getElementById('regGender').value,
                        estado_civil: document.getElementById('regCivil').value,
                        telefono: document.getElementById('regPhone').value,
                        email: document.getElementById('regEmail').value || '',
                        direccion: document.getElementById('regAddress').value,
                        fecha_registro: firebase.firestore.FieldValue.serverTimestamp(),

                        // Work Information
                        trabajo: {
                            ocupacion: document.getElementById('regJob').value || '',
                            empresa: document.getElementById('regCompany').value || '',
                            sueldo: parseFloat(document.getElementById('regSalary').value) || 0,
                            telefono: document.getElementById('regWorkPhone').value || ''
                        },

                        // Solidario / References
                        solidario: {
                            nombre: document.getElementById('regSolidarioName')?.value || '',
                            cedula: document.getElementById('regSolidarioId')?.value || '',
                            telefono: document.getElementById('regSolidarioPhone')?.value || '',
                            referencia_laboral: document.getElementById('regSolidarioJob')?.value || ''
                        },
                        referencias: [
                            { nombre: document.getElementById('ref1Name').value || '', telefono: document.getElementById('ref1Phone').value || '' },
                            { nombre: document.getElementById('ref2Name').value || '', telefono: document.getElementById('ref2Phone').value || '' }
                        ],
                        // Warranty Information
                        garantia: {
                            tipo: document.getElementById('regGuaranteeType').value,
                            valor_estimado: parseFloat(document.getElementById('regGuaranteeValue').value) || 0,
                            descripcion: document.getElementById('regGuaranteeDesc').value || ''
                        },
                        folder_virtual: ''
                    };

                    const docRef = await db.collection('clientes').add(newClient);

                    // --- Initial Loan Logic ---
                    if (document.getElementById('enableInitialLoan').checked) {
                        const amount = parseFloat(document.getElementById('initLoanAmount').value);
                        const rate = parseFloat(document.getElementById('initLoanRate').value);

                        if (amount > 0) {
                            const frequency = document.getElementById('initLoanFrequency').value;
                            const loanData = {
                                cliente_id: docRef.id,
                                nombre_cliente: newClient.nombre,
                                monto_principal: amount,
                                tasa_mensual: (document.getElementById('initLoanRatePeriod').value === 'anual') ? (rate / 1200) : (rate / 100),
                                metodo: document.getElementById('initLoanAmortization').value,
                                frecuencia_pago: frequency,
                                plazo_meses: 0, // Default for now
                                garantia: {
                                    tipo: 'Declarado en Registro',
                                    descripcion: document.getElementById('initLoanGuarantee').value || 'Sin descripción',
                                    fotos: []
                                },
                                fiador_nombre: newClient.solidario.nombre || 'N/A',
                                fecha_creacion: firebase.firestore.FieldValue.serverTimestamp(),
                                estado: 'ACTIVO',
                                capital_actual: amount,
                                mora_acumulada: 0,
                                interes_pendiente: 0,
                                proximo_pago: calculateNextPaymentDate(frequency)
                            };
                            await db.collection('prestamos').add(loanData);
                        }
                    }

                    alert("✅ Expediente y Préstamo (si aplica) registrados correctamente");
                    window.location.href = `client.html?id=${docRef.id}`;
                } catch (err) {
                    console.error(err);
                    alert("Error: " + err.message);
                    btn.disabled = false;
                    btn.innerText = "💾 Guardar Expediente";
                }
            });


        } else {
            alert("No se especificó cliente.");
            window.location.href = 'index.html';
        }
    }

    // --- 1. Load Dashboard Metrics (Realtime) ---
    // Listen to all active loans to calculate totals
    db.collection('prestamos').where('estado', 'in', ['ACTIVO', 'MORA'])
        .onSnapshot(snapshot => {
            let totalCapital = 0;
            let totalInteres = 0;
            let totalMora = 0;
            let moraList = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                totalCapital += (data.capital_actual || 0);
                // Rough estimate for interest if not stored explicitly
                totalInteres += (data.interes_pendiente || 0);
                totalMora += (data.mora_acumulada || 0);

                if (data.estado === 'MORA') {
                    moraList.push({ id: doc.id, ...data });
                }
            });

            // Update UI Cards
            if (document.getElementById('totalCapital')) {
                document.getElementById('totalCapital').innerText = formatCurrency(totalCapital);
                document.getElementById('totalInterest').innerText = formatCurrency(totalInteres);
                document.getElementById('totalMora').innerText = formatCurrency(totalMora);
            }

            // Update Mora Table (if on dashboard)
            updateMoraTable(moraList);
        });

    // --- 2. New Loan Form Handler ---
    const loanForm = document.getElementById('loanForm');
    if (loanForm) {
        loanForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = loanForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerText = "Procesando...";

            try {
                // 1. Validate Context
                const params = new URLSearchParams(window.location.search);
                const currentClientId = params.get('id');
                const currentClientName = document.getElementById('clientName').innerText;

                if (!currentClientId) throw new Error("Error: No se ha seleccionado un cliente.");

                // 2. Gather Data
                const monto = parseFloat(document.getElementById('loanAmount').value);
                const tasa = parseFloat(document.getElementById('loanRate').value);
                const metodo = document.getElementById('loanAmortization').value;
                const frecuencia = document.getElementById('loanFrequency').value;
                const plazo = parseInt(document.getElementById('loanTerm').value) || 0;
                const garantiaDesc = document.getElementById('loanGuarantee').value;
                const fiadorNombre = document.getElementById('loanGuarantor').value;

                if (!monto || monto <= 0) throw new Error("El monto debe ser mayor a 0.");

                const loanData = {
                    cliente_id: currentClientId,
                    nombre_cliente: currentClientName,
                    monto_principal: monto,
                    tasa_mensual: (document.getElementById('loanRatePeriod').value === 'anual') ? (tasa / 1200) : (tasa / 100),
                    metodo: metodo,
                    frecuencia_pago: frecuencia,
                    plazo_meses: plazo,
                    garantia: {
                        tipo: 'No especificado',
                        descripcion: garantiaDesc,
                        fotos: []
                    },
                    fiador_nombre: fiadorNombre,

                    // Financial State
                    fecha_creacion: firebase.firestore.FieldValue.serverTimestamp(),
                    estado: 'ACTIVO',
                    capital_actual: monto,
                    mora_acumulada: 0,
                    interes_pendiente: 0,
                    proximo_pago: calculateNextPaymentDate(frecuencia),
                    mora_editable: true
                };

                await db.collection('prestamos').add(loanData);
                alert("✅ Préstamo Guardado. El cliente ahora tiene un crédito activo.");
                document.getElementById('newLoanModal').style.display = 'none';
                loanForm.reset();

                // Refresh profile
                loadClientProfile(currentClientId);

            } catch (error) {
                console.error("Error creating loan:", error);
                alert("❌ " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Crear Préstamo";
            }
        };
    }

    // --- 3. Payment Form Handler ---
    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        paymentForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = paymentForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerText = "Procesando...";

            try {
                const loanId = document.getElementById('paymentModal').dataset.loanId;
                if (!loanId) throw new Error("No loan selected");

                const amount = parseFloat(document.getElementById('paymentAmount').value);
                const paymentType = document.getElementById('paymentType').value;

                if (!amount || amount <= 0) throw new Error("Monto inválido");

                const loanRef = db.collection('prestamos').doc(loanId);

                await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(loanRef);
                    if (!doc.exists) throw "Loan does not exist!";

                    const data = doc.data();
                    let remaining = amount;
                    let paymentBreakdown = { mora: 0, interes: 0, capital: 0 };

                    // 1. Pay Mora (Always First)
                    const moraPending = data.mora_acumulada || 0;
                    if (moraPending > 0) {
                        const payMora = Math.min(remaining, moraPending);
                        paymentBreakdown.mora = payMora;
                        remaining -= payMora;
                    }

                    // 2. Pay Interest
                    const interestPending = data.interes_pendiente || 0;
                    if (remaining > 0 && interestPending > 0) {
                        if (paymentType === 'abono_capital_directo') {
                            // Skip interest? Usually not allowed, but if requested...
                            // Better logic: Interest is mandatory unless specific 'Principal Only' payment allowed by policy.
                            // Assuming 'Smart' logic: Interest is next priority.
                        }
                        const payInterest = Math.min(remaining, interestPending);
                        paymentBreakdown.interes = payInterest;
                        remaining -= payInterest;
                    }

                    // 3. Capital (Whatever is left)
                    if (remaining > 0) {
                        if (paymentType === 'solo_interes') {
                            // Do not pay capital, maybe store as positive balance? 
                            // For now, let's assume 'solo_interes' just caps payment at interest+mora in UI, 
                            // but if they pay more, it goes to capital.
                            paymentBreakdown.capital = remaining;
                        } else {
                            paymentBreakdown.capital = remaining;
                        }
                    }

                    const newCapital = (data.capital_actual || 0) - paymentBreakdown.capital;

                    // Update Loan
                    transaction.update(loanRef, {
                        mora_acumulada: moraPending - paymentBreakdown.mora,
                        interes_pendiente: interestPending - paymentBreakdown.interes,
                        capital_actual: newCapital,
                        estado: newCapital <= 1 ? 'SALDADO' : 'ACTIVO', // Tolerance for float errors
                        ultimo_pago: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Record Transaction
                    const transRef = db.collection('transactions').doc();
                    transaction.set(transRef, {
                        loan_id: loanId,
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        monto_total: amount,
                        desglose: paymentBreakdown,
                        nuevo_saldo: newCapital,
                        tipo_pago: paymentType
                    });
                });

                alert(`✅ Pago Procesado.\n\nMora: ${formatCurrency(amount - (amount - (data.mora_acumulada || 0)) < 0 ? amount : data.mora_acumulada)}\nInterés: ...\nCapital: ...\n\n(Ver Recibo para detalle)`);
                document.getElementById('paymentModal').style.display = 'none';

                // Refresh
                const params = new URLSearchParams(window.location.search);
                if (params.get('id')) loadClientProfile(params.get('id'));

            } catch (error) {
                console.error("Payment Error:", error);
                alert("❌ Error procesando pago: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Procesar Pago";
            }
        };
    }
});

// Helper: Calculate Next Payment Date
function calculateNextPaymentDate(frequency) {
    const today = new Date();
    let nextDate = new Date(today);

    if (frequency === 'mensual') nextDate.setMonth(today.getMonth() + 1);
    else if (frequency === 'quincenal') nextDate.setDate(today.getDate() + 15);
    else if (frequency === 'semanal') nextDate.setDate(today.getDate() + 7);
    else nextDate.setMonth(today.getMonth() + 1);

    return firebase.firestore.Timestamp.fromDate(nextDate);
}

// Helper: Format Currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(amount);
}

// Helper: Update Mora Table
function updateMoraTable(list) {
    const tbody = document.querySelector('#moraTable tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">🎉 No hay mora crítica hoy.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(item => `
        <tr>
            <td>${item.nombre_cliente || 'N/A'}</td>
            <td>${item.id}</td>
            <td><span class="status-badge status-mora">Vencido</span></td>
            <td>${formatCurrency(item.mora_acumulada || 0)}</td>
            <td><button class="btn btn-primary" style="font-size:0.8rem">Ver</button></td>
        </tr>
    `).join('');
}

// --- Dynamic Functions ---

async function loadClientProfile(id) {
    const db = firebase.firestore();

    // 1. Get Client Data
    try {
        const clientDoc = await db.collection('clientes').doc(id).get();
        if (!clientDoc.exists) {
            document.getElementById('clientName').innerText = "Cliente No Encontrado";
            return;
        }
        const client = clientDoc.data();

        // Populate UI
        document.getElementById('clientName').innerText = client.nombre;
        document.getElementById('clientIdDisplay').innerText = `ID: ${client.cedula}`;
        document.getElementById('clientAddress').innerText = `📍 ${client.direccion || 'Sin dirección'}`;
        document.getElementById('clientPhone').innerText = `📞 ${client.telefono || 'Sin teléfono'}`;

        // Populate Ficha Técnica
        const personal = document.getElementById('fichaPersonal');
        const laboral = document.getElementById('fichaLaboral');
        const refs = document.getElementById('fichaReferencias');

        if (personal) {
            personal.innerHTML = `
                <p><strong>Nacimiento:</strong> ${client.fecha_nacimiento || 'N/A'}</p>
                <p><strong>Sexo:</strong> ${client.sexo || 'N/A'}</p>
                <p><strong>Estado Civil:</strong> ${client.estado_civil || 'N/A'}</p>
                <p><strong>Email:</strong> ${client.email || 'N/A'}</p>
            `;
        }
        if (laboral) {
            const trab = client.trabajo || {};
            laboral.innerHTML = `
                <p><strong>Ocupación:</strong> ${trab.ocupacion || 'N/A'}</p>
                <p><strong>Empresa:</strong> ${trab.empresa || 'N/A'}</p>
                <p><strong>Sueldo:</strong> ${trab.sueldo ? formatCurrency(trab.sueldo) : 'N/A'}</p>
                <p><strong>Tel. Trabajo:</strong> ${trab.telefono || 'N/A'}</p>
            `;
        }
        if (refs) {
            const sol = client.solidario || {};
            const r = client.referencias || [{}, {}];
            refs.innerHTML = `
                <div>
                    <p style="margin-bottom:0.5rem;"><strong>Fiador Solidario:</strong></p>
                    <small>${sol.nombre || 'N/A'} - ${sol.cedula || ''}</small><br>
                    <small>📞 ${sol.telefono || ''}</small><br>
                    <small>💼 ${sol.referencia_laboral || ''}</small>
                </div>
                <div>
                    <p style="margin-bottom:0.5rem;"><strong>Referencias Personales:</strong></p>
                    <small>1. ${r[0]?.nombre || 'N/A'} (${r[0]?.telefono || ''})</small><br>
                    <small>2. ${r[1]?.nombre || 'N/A'} (${r[1]?.telefono || ''})</small>
                </div>
            `;
        }


        // 2. Get Loans
        const loansSnapshot = await db.collection('prestamos')
            .where('cliente_id', '==', id) // Updated link field
            .get();

        // 3. Get Documents
        loadClientDocuments(id);


        const loansContainer = document.getElementById('loansContainer');
        loansContainer.innerHTML = '';

        if (loansSnapshot.empty) {
            loansContainer.innerHTML = '<p>Este cliente no tiene préstamos activos.</p>';
        } else {
            loansSnapshot.forEach(doc => {
                const loan = doc.data();
                renderLoanCard(doc.id, loan, loansContainer);
            });
        }

    } catch (e) {
        console.error("Error loading profile:", e);
        alert("Error cargando perfil: " + e.message);
    }
}

function renderLoanCard(loanId, loan, container) {
    const isMora = loan.estado === 'MORA';
    const borderColor = isMora ? 'var(--danger-color)' : 'var(--success-color)';
    const moraText = isMora ? `MORA: ${formatCurrency(loan.mora_acumulada)}` : 'Al día';

    const html = `
    <div class="card" style="border-left: 5px solid ${borderColor}; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: flex-start;">
            <div>
                <h3 style="margin: 0;">Préstamo #${loanId.substr(0, 5)}</h3>
                <small class="text-secondary">Vence: ${loan.proximo_pago ? new Date(loan.proximo_pago.seconds * 1000).toLocaleDateString() : 'N/A'}</small>
            </div>
            <span class="status-badge ${isMora ? 'status-mora' : 'status-active'}">${moraText}</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; background: #f9fafb; padding: 1rem; border-radius: 8px;">
            <div>
                <small style="color: var(--text-secondary);">Capital Pendiente</small>
                <div style="font-weight: 700; font-size: 1.1rem;">${formatCurrency(loan.capital_actual)}</div>
            </div>
            <div>
                <small style="color: var(--text-secondary);">Interés Pendiente</small>
                <div style="font-weight: 700;">${formatCurrency(loan.interes_pendiente || 0)}</div>
            </div>
            <div>
                <small style="color: var(--danger-color);">Mora Acumulada</small>
                <div style="font-weight: 700; color: var(--danger-color);">${formatCurrency(loan.mora_acumulada || 0)}</div>
            </div>
        </div>

        <!-- Ficha Data (Guarantor) -->
        <div style="margin-bottom: 1.5rem;">
            <details>
                <summary style="cursor: pointer; color: var(--primary-color); font-weight: 500;">Ver Datos de Ficha</summary>
                <div style="margin-top: 1rem; font-size: 0.9rem;">
                    <p><strong>🚗 Garantía:</strong> ${loan.garantia_desc || 'No registrada'}</p>
                    <p><strong>👤 Fiador:</strong> ${loan.fiador_nombre || 'No registrado'}</p>
                </div>
            </details>
        </div>

        <!-- Individual Actions -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="openPaymentModal('${loanId}', ${loan.capital_actual}, ${loan.interes_pendiente || 0}, ${loan.mora_acumulada || 0})">💰 Registrar Cobro</button>
            <button class="btn" style="border: 1px solid var(--text-secondary); color: var(--text-secondary);">📄 Tabla</button>
        </div>
    </div>
    `;
    container.innerHTML += html;
}

// Make global for inline onclick
window.openPaymentModal = function (id, capital, interest, mora) {
    const modal = document.getElementById('paymentModal');
    modal.style.display = 'flex';

    // Store Loan ID
    modal.dataset.loanId = id;

    // Populate UI
    document.getElementById('displayInterestPending').innerText = formatCurrency(interest);
    document.getElementById('displayMoraPending').innerText = formatCurrency(mora);
    document.getElementById('displayTotalDue').innerText = formatCurrency(interest + mora);

    // Reset Form
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentType').value = 'inteligente';
};

window.toggleAmortizationFields = function (type) {
    console.log("Selected amortization:", type);
    // Future: Show/Hide fields based on type
    // e.g. if (type === 'REDITO_PURO') hide 'term' input
};

window.searchClient = async function () {
    const term = document.getElementById('searchInput').value;
    if (!term) return;

    // Simple search by ID_cedula (exact) for now
    const db = firebase.firestore();
    try {
        const snapshot = await db.collection('clientes').where('cedula', '==', term).get();
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            window.location.href = `client.html?id=${doc.id}`;
        } else {
            alert("No se encontró cliente con esa cédula.");
        }
    } catch (e) {
        console.error(e);
        alert("Error buscando");
    }
}

// --- Document & OCR Logic ---
let currentScanType = null;
let currentClientIdForUpload = null;

window.triggerUpload = function () {
    currentClientIdForUpload = new URLSearchParams(window.location.search).get('id');
    if (!currentClientIdForUpload) {
        alert("Error: No hay cliente seleccionado.");
        return;
    }
    const input = document.getElementById('docUploadInput');
    if (input) input.click();
    else console.error("Error: Input de carga no encontrado.");
};

window.triggerScan = function (type) {
    currentScanType = type;
    const input = document.getElementById('docUploadInput');
    if (input) input.click();
    else console.error("Error: Input de escaneo no encontrado.");
};

const docUploadInput = document.getElementById('docUploadInput');
if (docUploadInput) {
    docUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (currentScanType) {
            const type = currentScanType; // Save type before reset
            currentScanType = null;
            const uploadResult = await processOCR(file, type);

            // Auto-save scanned file to digital folder
            const clientId = new URLSearchParams(window.location.search).get('id');
            if (clientId && uploadResult) {
                await uploadDocument(file, clientId, `Scan_${type}`);
            }
        } else {
            const clientId = currentClientIdForUpload || new URLSearchParams(window.location.search).get('id');
            if (clientId) {
                await uploadDocument(file, clientId);
                currentClientIdForUpload = null;
            } else {
                alert("Error: No hay cliente seleccionado.");
            }
        }
        e.target.value = ''; // Reset input
    });
}

async function uploadDocument(file, clientId, customName = null) {
    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadPercent');

    progressContainer.style.display = 'block';
    progressText.innerText = '0%';
    progressBar.style.width = '0%';

    try {
        const storageRef = firebase.storage().ref();
        const fileName = customName ? `${customName}_${Date.now()}.${file.name.split('.').pop()}` : `${Date.now()}_${file.name}`;
        const fileRef = storageRef.child(`clientes/${clientId}/${fileName}`);
        const uploadTask = fileRef.put(file);

        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    progressBar.style.width = progress + '%';
                    progressText.innerText = Math.round(progress) + '%';
                },
                (error) => {
                    console.error("Upload error:", error);
                    alert("Error subiendo archivo: " + error.message);
                    progressContainer.style.display = 'none';
                    reject(error);
                },
                async () => {
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    await db.collection('clientes').doc(clientId).collection('documentos').add({
                        nombre: customName ? `${customName} (${file.name})` : file.name,
                        url: downloadURL,
                        tipo: file.type,
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        path: fileRef.fullPath
                    });
                    progressContainer.style.display = 'none';
                    if (!customName) alert("✅ Documento subido correctamente");
                    resolve(downloadURL);
                }
            );
        });
    } catch (error) {
        console.error("Upload error:", error);
        alert("Error al iniciar subida.");
        progressContainer.style.display = 'none';
    }
}

async function processOCR(file, type) {
    const scanBtn = document.querySelector(`button[onclick="triggerScan('${type}')"]`);
    const originalText = scanBtn ? scanBtn.innerHTML : "Scan";
    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = "<span>⌛</span> <small>Analizando...</small>";
    }

    try {
        const base64 = await toBase64(file);
        const scanDocument = firebase.functions().httpsCallable('scanDocument');
        const result = await scanDocument({
            image: base64.split(',')[1],
            docType: type
        });

        const data = result.data;
        if (type === 'id') {
            if (data.nombre) document.getElementById('regName').value = data.nombre;
            if (data.cedula) document.getElementById('regId').value = data.cedula;
            if (data.fecha_nacimiento) document.getElementById('regDob').value = data.fecha_nacimiento;
            if (data.sexo) document.getElementById('regGender').value = data.sexo;
            alert("✅ Información del ID extraída");
        } else if (type === 'guarantee') {
            if (data.descripcion) document.getElementById('regGuaranteeDesc').value = data.descripcion;
            if (data.valor_estimado) document.getElementById('regGuaranteeValue').value = data.valor_estimado;
            alert("✅ Garantía analizada");
        }
        return true; // Return success for auto-upload
    } catch (error) {
        console.error("OCR Error:", error);
        alert("❌ Error de IA: " + error.message);
        return false; // Return failure
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = originalText;
        }
    }
}

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Helper: Load Documents (Realtime)
function loadClientDocuments(clientId) {
    const grid = document.getElementById('documentsGrid');

    db.collection('clientes').doc(clientId).collection('documentos')
        .orderBy('fecha', 'desc')
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No hay documentos.</p>';
                return;
            }

            grid.innerHTML = snapshot.docs.map(doc => {
                const data = doc.data();
                const docId = doc.id;
                const icon = data.tipo.includes('pdf') ? '📄' : (data.tipo.includes('image') ? '🖼️' : '📁');
                const preview = data.tipo.includes('image') ?
                    `<img src="${data.url}" alt="${data.nombre}">` :
                    `<span>${icon}</span>`;

                return `
                <div class="evidence-item">
                    <div class="evidence-preview" onclick="window.open('${data.url}', '_blank')">
                        ${preview}
                    </div>
                    <div class="evidence-meta">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <span class="evidence-name" title="${data.nombre}">${data.nombre}</span>
                            <button onclick="deleteDocument('${clientId}', '${docId}', '${data.path || ''}')" 
                                style="background:none; border:none; cursor:pointer; color:var(--danger-color); font-size:1rem; padding:0;">🗑️</button>
                        </div>
                        <span class="evidence-date">${data.fecha ? new Date(data.fecha.seconds * 1000).toLocaleDateString() : 'Reciente'}</span>
                    </div>
                </div>
                `;
            }).join('');
        });
}

async function deleteDocument(clientId, docId, path) {
    if (!confirm("¿Estás seguro de eliminar este documento?")) return;

    try {
        // 1. Delete from Firestore
        await db.collection('clientes').doc(clientId).collection('documentos').doc(docId).delete();

        // 2. Delete from Storage if path exists
        if (path) {
            const fileRef = firebase.storage().ref().child(path);
            await fileRef.delete();
        }

        alert("✅ Documento eliminado correctamente.");
    } catch (error) {
        console.error("Error deleting document:", error);
        alert("❌ Error al eliminar: " + error.message);
    }
}

// --- Seed Data Helper (For Demo Purposes) ---
window.seedDatabase = async function () {
    const db = firebase.firestore();
    const btn = document.getElementById('seedBtn');
    if (btn) btn.innerText = "Creando datos...";

    try {
        // 1. Create Client
        const clientRef = await db.collection('clientes').add({
            nombre: "Juan Pérez",
            cedula: "001-0000001-1",
            direccion: "Calle Sol #45, Santiago",
            telefono: "(809) 555-0101",
            fecha_registro: firebase.firestore.FieldValue.serverTimestamp(),
            solidario: { nombre: "Maria Lopez", cedula: "001-0000000-2", telefono: "809-111-2233", referencia_laboral: "Cajero" }
        });

        // 2. Create Loan for Client
        await db.collection('prestamos').add({
            cliente_id: clientRef.id,
            nombre_cliente: "Juan Pérez", // Denormalized for easier search/display
            monto_principal: 10000,
            capital_actual: 8000,
            tasa_mensual: 0.1,
            metodo: "REDITO_PURO",
            mora_acumulada: 200,
            estado: "MORA",
            plazo_meses: 6,
            fecha_inicio: firebase.firestore.FieldValue.serverTimestamp(),
            proximo_pago: firebase.firestore.FieldValue.serverTimestamp(),
            garantia: { tipo: "Vehiculo", descripcion: "Motor Honda C50", fotos: [] },
            fiador_nombre: "Pedro Martinez"
        });

        alert("✅ Datos de Prueba Creados.\n\nIntenta buscar la cédula: 001-0000001-1");
        location.reload();

    } catch (e) {
        console.error(e);
        alert("Error creando datos: " + e.message);
    }
};


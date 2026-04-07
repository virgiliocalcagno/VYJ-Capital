const db = firebase.firestore();
const functions = firebase.functions();

// --- OCR ID Scanning Logic (Global Scope) ---
window.triggerIDScan = function (side) {
    const inputId = side === 'front' ? 'idFrontInput' : 'idBackInput';
    document.getElementById(inputId).click();
};

window.handleIDFile = async function (input, side) {
    const file = input.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('ocrStatus');
    const statusText = document.getElementById('ocrStatusText');
    const statusPercent = document.getElementById('ocrStatusPercent');
    const progressBar = document.getElementById('ocrProgressBar');
    const statusMessage = document.getElementById('ocrMessage');

    statusDiv.style.display = 'block';
    statusMessage.style.display = 'none';
    statusText.innerText = `Consultando Inteligencia Artificial (NutriApp Engine)...`;
    statusPercent.innerText = 'IA';
    progressBar.style.width = '60%';

    try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });
        const base64 = await base64Promise;

        const scanDocument = firebase.functions().httpsCallable('scanDocument');
        const result = await scanDocument({
            image: base64,
            docType: 'id',
            mimeType: file.type
        });

        const data = result.data;
        console.log("IA result:", data);

        if (data.cedula) document.getElementById('regId').value = data.cedula;
        if (data.nombre) document.getElementById('regName').value = data.nombre.toUpperCase();
        if (data.fecha_nacimiento) document.getElementById('regDob').value = data.fecha_nacimiento;
        if (data.sexo) document.getElementById('regGender').value = data.sexo;
        if (data.direccion && side === 'back') document.getElementById('regAddress').value = data.direccion;
        if (data.lugar_nacimiento) document.getElementById('regBirthPlace').value = data.lugar_nacimiento;

        statusText.innerText = `✅ IA: Procesado correctamente.`;
        statusMessage.style.display = 'block';
        statusMessage.innerText = "¡Listo! Gemini AI ha completado el formulario.";
        progressBar.style.width = '100%';

    } catch (error) {
        console.error("AI Error:", error);
        statusText.innerText = "❌ Fallo en Gemini AI.";
        statusMessage.style.display = 'block';
        statusMessage.innerText = "Error procesando con IA: " + error.message;
        progressBar.style.width = '0%';
    } finally {
        setTimeout(() => { if (statusDiv.style.display !== 'none') statusDiv.style.display = 'none'; }, 6000);
    }
};

function parseOCRResult(text, side) { return true; }

document.addEventListener('DOMContentLoaded', async () => {
    console.log("VYJ Capital Interface Loaded - v12.0 (Gemini AI Implementation)");

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
                        lugar_nacimiento: document.getElementById('regBirthPlace').value || '',
                        sexo: document.getElementById('regGender').value,
                        estado_civil: document.getElementById('regCivil').value,
                        telefono: document.getElementById('regPhone').value,
                        email: document.getElementById('regEmail').value || '',
                        direccion: document.getElementById('regAddress').value,
                        nacionalidad: document.getElementById('regNationality').value || '',
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

                    let docIdToUse;
                    if (clientId) {
                        // UPDATE Existing
                        await db.collection('clientes').doc(clientId).update(newClient);
                        docIdToUse = clientId;
                        alert("✅ Expediente actualizado correctamente");
                    } else {
                        // CREATE New
                        const docRef = await db.collection('clientes').add(newClient);
                        docIdToUse = docRef.id;

                        // --- Initial Loan Logic (Only for NEW clients) ---
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
                        window.location.href = `client.html?id=${docIdToUse}`;
                    }
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
                const paymentOrigin = document.getElementById('paymentOrigin').value;

                if (!amount || amount <= 0) throw new Error("Monto inválido");

                const loanRef = db.collection('prestamos').doc(loanId);

                await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(loanRef);
                    if (!doc.exists) throw "Préstamo no existe";

                    const data = doc.data();
                    let remaining = amount;
                    let paymentBreakdown = { mora: 0, interes: 0, capital: 0 };

                    if (paymentType === 'inteligente') {
                        // 1. Pay Mora
                        const moraPending = data.mora_acumulada || 0;
                        if (moraPending > 0) {
                            const payMora = Math.min(remaining, moraPending);
                            paymentBreakdown.mora = payMora;
                            remaining -= payMora;
                        }

                        // 2. Pay Interest
                        const interestPending = data.interes_pendiente || 0;
                        if (remaining > 0 && interestPending > 0) {
                            const payInterest = Math.min(remaining, interestPending);
                            paymentBreakdown.interes = payInterest;
                            remaining -= payInterest;
                        }

                        // 3. Capital (Whatever is left)
                        if (remaining > 0) {
                            paymentBreakdown.capital = remaining;
                        }
                    } else if (paymentType === 'solo_interes') {
                        paymentBreakdown.interes = amount;
                    } else if (paymentType === 'abono_capital_directo') {
                        paymentBreakdown.capital = amount;
                    }

                    const oldCapital = data.capital_actual || 0;
                    const newCapital = oldCapital - paymentBreakdown.capital;
                    const newInterest = (data.interes_pendiente || 0) - paymentBreakdown.interes;
                    const newMora = (data.mora_acumulada || 0) - paymentBreakdown.mora;

                    transaction.update(loanRef, {
                        mora_acumulada: Math.max(0, newMora),
                        interes_pendiente: Math.max(0, newInterest),
                        capital_actual: Math.max(0, newCapital),
                        estado: newCapital <= 5 ? 'SALDADO' : (newMora > 0 ? 'MORA' : 'ACTIVO'),
                        ultimo_pago: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Record Transaction
                    const transRef = db.collection('transactions').doc();
                    transaction.set(transRef, {
                        loan_id: loanId,
                        cliente_id: data.cliente_id,
                        nombre_cliente: data.nombre_cliente,
                        fecha: firebase.firestore.FieldValue.serverTimestamp(),
                        monto_total: amount,
                        desglose: paymentBreakdown,
                        nuevo_saldo: Math.max(0, newCapital),
                        tipo_pago: paymentType,
                        origen: paymentOrigin
                    });
                });

                alert(`✅ Pago Procesado con éxito.`);
                document.getElementById('paymentModal').style.display = 'none';
                loadClientProfile(new URLSearchParams(window.location.search).get('id'));

            } catch (error) {
                console.error("Payment Error:", error);
                alert("❌ Error: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Procesar Pago & Generar Recibo";
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
                <div class="flex-column gap-1">
                    <p><strong class="text-secondary">Nacimiento:</strong> ${client.fecha_nacimiento || 'N/A'} (${client.lugar_nacimiento || 'N/A'})</p>
                    <p><strong class="text-secondary">Sexo:</strong> ${client.sexo || 'N/A'}</p>
                    <p><strong class="text-secondary">Estado Civil:</strong> ${client.estado_civil || 'N/A'}</p>
                    <p><strong class="text-secondary">Email:</strong> ${client.email || 'N/A'}</p>
                </div>
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
                </div>
            `;
        }

        // Show Edit Button
        const editBtn = document.getElementById('editProfileBtn');
        if (editBtn) editBtn.style.display = 'block';

        // Global function to enable edit mode
        window.enableEditMode = function () {
            // Hide profile view segments
            const viewHeader = document.getElementById('profileHeader');
            const viewLoans = document.getElementById('loansContainer');
            const viewTabs = document.getElementById('clientTabsContainer');

            if (viewHeader) viewHeader.style.display = 'none';
            if (viewLoans) viewLoans.style.display = 'none';
            if (viewTabs) viewTabs.style.display = 'none';

            // Show Form
            const formSection = document.getElementById('newClientFormSection');
            if (formSection) {
                formSection.style.display = 'block';
                const headerSpan = formSection.querySelector('h2 span');
                if (headerSpan) headerSpan.innerText = '✏️';
                formSection.querySelector('h2').innerHTML = '<span>✏️</span> Editar Expediente del Cliente';
                formSection.querySelector('button[type="submit"]').innerText = '💾 Actualizar Expediente';
            }

            // Populate Form
            document.getElementById('regName').value = client.nombre || '';
            document.getElementById('regId').value = client.cedula || '';
            document.getElementById('regNationality').value = client.nacionalidad || '';
            document.getElementById('regDob').value = client.fecha_nacimiento || '';
            document.getElementById('regBirthPlace').value = client.lugar_nacimiento || '';
            document.getElementById('regGender').value = client.sexo || '';
            document.getElementById('regCivil').value = client.estado_civil || '';
            document.getElementById('regPhone').value = client.telefono || '';
            document.getElementById('regEmail').value = client.email || '';
            document.getElementById('regAddress').value = client.direccion || '';

            if (client.trabajo) {
                document.getElementById('regJob').value = client.trabajo.ocupacion || '';
                document.getElementById('regCompany').value = client.trabajo.empresa || '';
                document.getElementById('regSalary').value = client.trabajo.sueldo || '';
                document.getElementById('regWorkPhone').value = client.trabajo.telefono || '';
            }

            if (client.solidario) {
                document.getElementById('regSolidarioName').value = client.solidario.nombre || '';
                document.getElementById('regSolidarioId').value = client.solidario.cedula || '';
                document.getElementById('regSolidarioPhone').value = client.solidario.telefono || '';
                document.getElementById('regSolidarioJob').value = client.solidario.referencia_laboral || '';
            }

            if (client.referencias) {
                document.getElementById('ref1Name').value = client.referencias[0]?.nombre || '';
                document.getElementById('ref1Phone').value = client.referencias[0]?.telefono || '';
                document.getElementById('ref2Name').value = client.referencias[1]?.nombre || '';
                document.getElementById('ref2Phone').value = client.referencias[1]?.telefono || '';
            }

            if (client.garantia) {
                document.getElementById('regGuaranteeType').value = client.garantia.tipo || '';
                document.getElementById('regGuaranteeValue').value = client.garantia.valor_estimado || '';
                document.getElementById('regGuaranteeDesc').value = client.garantia.descripcion || '';
            }

            // Hide initial loan section for existing clients
            const initLoanSec = document.getElementById('initialLoanSection');
            if (initLoanSec) initLoanSec.style.display = 'none';
        };


        // 2. Get Loans
        const loansSnapshot = await db.collection('prestamos')
            .where('cliente_id', '==', id) // Updated link field
            .get();

        // 3. Get Documents
        loadClientDocuments(id);

        // 4. Auto-llenar campo de WhatsMyName con nombre del cliente
        const wmnInput = document.getElementById('wmnUsernameInput');
        if (wmnInput && client.nombre) {
            // Convertir nombre a formato username: minúsculas, sin acentos, puntos en vez de espacios
            const usernameFromName = client.nombre
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
                .replace(/\s+/g, '.');  // espacios → puntos
            wmnInput.value = usernameFromName;
        }

        // 5. Si hay auditoría previa, mostrar los resultados guardados
        if (client.auditoriaDigital && client.auditoriaDigital.perfiles) {
            const ad = client.auditoriaDigital;
            if (wmnInput) wmnInput.value = ad.username || wmnInput.value;

            const rc = document.getElementById('wmnResultsContainer');
            const rl = document.getElementById('wmnResultsList');
            const rn = document.getElementById('wmnResultCount');
            const rs = document.getElementById('wmnResultSource');
            if (rc && rl && rn && rs) {
                rc.style.display = 'block';
                rn.innerText = `📋 ${ad.total || ad.perfiles.length} perfiles (auditoría previa)`;
                rs.innerText = `@${ad.username} · ${ad.fecha ? new Date(ad.fecha).toLocaleDateString() : ''}`;
                rl.innerHTML = ad.perfiles.map(p => `
                    <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary w-full" style="justify-content: flex-start; padding: 0.5rem 1rem;">
                        <span>${p.plataforma || p.nombre || 'Desconocido'}</span>
                        <span class="text-accent" style="margin-left:auto; font-size:0.75rem;">Abrir ↗</span>
                    </a>
                `).join('');
            }
        }


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
    const statusClass = isMora ? 'status-overdue' : 'status-active';
    const statusText = isMora ? `MORA: ${formatCurrency(loan.mora_acumulada)}` : 'Al día';

    const html = `
    <div class="card mb-1">
        <div class="flex-between mb-1">
            <div>
                <h3 class="mt-1">Préstamo #${loanId.substr(0, 5)}</h3>
                <small class="text-muted">Vence: ${loan.proximo_pago ? new Date(loan.proximo_pago.seconds * 1000).toLocaleDateString() : 'N/A'}</small>
            </div>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>

        <div class="grid-2 gap-2 mb-1 card-inner-wrapper">
            <div>
                <small class="text-muted">Capital Pendiente</small>
                <div class="card-value-sm">${formatCurrency(loan.capital_actual)}</div>
            </div>
            <div>
                <small class="text-muted">Interés Pendiente</small>
                <div class="card-value-sm">${formatCurrency(loan.interes_pendiente || 0)}</div>
            </div>
            <div class="span-2 border-top-danger">
                <small class="text-danger">Mora Acumulada</small>
                <div class="card-value-md text-danger">${formatCurrency(loan.mora_acumulada || 0)}</div>
            </div>
        </div>

        <div class="mb-2">
            <details style="cursor: pointer;">
                <summary style="color: var(--primary); font-weight: 700; font-size: 0.85rem;">Ver Detalles de Garantía</summary>
                <div class="mt-1" style="font-size: 0.9rem; padding: 0.75rem; background: #fff; border: 1px solid var(--border); border-radius: 6px;">
                    <p><strong>🚗 Garantía:</strong> ${loan.garantia?.descripcion || loan.garantia_desc || 'No registrada'}</p>
                    <p><strong>👤 Fiador:</strong> ${loan.fiador_nombre || 'No registrado'}</p>
                </div>
            </details>
        </div>

        <div class="flex-between" style="gap: 0.75rem;">
            <button class="btn btn-primary w-full" onclick="openPaymentModal('${loanId}', ${loan.capital_actual}, ${loan.interes_pendiente || 0}, ${loan.mora_acumulada || 0})">
                💰 Registrar Cobro
            </button>
            <button class="btn btn-secondary w-full" onclick="generarReporteEstado('${loanId}')">
                📄 Tabla / Informe
            </button>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
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

// PDF Generation Logic
window.downloadFichaPDF = function () {
    const element = document.getElementById('fichaTecnicaSection');
    const clientName = document.getElementById('clientName').innerText;

    // Temporarily ensure it's visible for capture if it's hidden, 
    // though the button is inside it, so it should be visible.

    const opt = {
        margin: 10,
        filename: `Ficha_${clientName.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // New Promise-based usage:
    html2pdf().set(opt).from(element).save();
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
        const mimeType = base64.split(';')[0].split(':')[1];
        const scanDocument = firebase.functions().httpsCallable('scanDocument');
        const result = await scanDocument({
            image: base64.split(',')[1],
            docType: type,
            mimeType: mimeType
        });

        const data = result.data;
        if (type === 'id') {
            if (data.nombre) document.getElementById('regName').value = data.nombre;
            if (data.cedula) document.getElementById('regId').value = data.cedula;
            if (data.fecha_nacimiento) document.getElementById('regDob').value = data.fecha_nacimiento;
            if (data.lugar_nacimiento) document.getElementById('regBirthPlace').value = data.lugar_nacimiento;
            if (data.sexo) document.getElementById('regGender').value = data.sexo;
            if (data.direccion) document.getElementById('regAddress').value = data.direccion;
            alert("✅ Información del ID extraída. Si escaneaste el frente, ahora puedes escanear el reverso para la dirección.");
        } else if (type === 'guarantee') {
            if (data.descripcion) document.getElementById('regGuaranteeDesc').value = data.descripcion;
            if (data.valor_estimado) document.getElementById('regGuaranteeValue').value = data.valor_estimado;
            alert("✅ Garantía analizada");
        }
        return true; // Return success for auto-upload
    } catch (error) {
        console.error("OCR Error:", error);
        alert("❌ Error de IA: " + error.message);
        return false;
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = originalText;
        }
    }
}

// --- Digital Audit (KYC) Logic --- REESTRUCTURADO v13.0 ---
window.runKYCAuditV9 = async function () {
    console.log("Iniciando Auditoría KYC v13 (reestructurada)...");

    // 1. Captura de datos ultra-robusta
    let name = '';
    let cedula = '';

    const regName = document.getElementById('regName');
    const regId = document.getElementById('regId');
    if (regName) name = regName.value.trim();
    if (regId) cedula = regId.value.trim();

    // Fallback: obtener del encabezado del perfil
    if (!name) {
        const clientNameEl = document.getElementById('clientName');
        if (clientNameEl) {
            name = clientNameEl.innerText;
            if (name === "Cargando cliente...") name = "";
        }
    }
    if (!cedula) {
        const idDisplay = document.getElementById('clientIdDisplay');
        if (idDisplay) {
            const idText = idDisplay.innerText;
            cedula = idText.includes('ID:') ? idText.replace('ID: ', '').trim() : '';
        }
    }

    // 2. Validar
    if (!name || name === "") {
        alert("Por favor, ingresa el Nombre Completo del cliente para realizar la auditoría.");
        return;
    }

    // 3. UI: Preparar estado de carga
    const kycBtn = document.getElementById('kycMainBtn');
    const container = document.getElementById('kycResultsContainer');
    const summaryEl = document.getElementById('kycSummary');
    const linksEl = document.getElementById('kycLinks');
    const badgesEl = document.getElementById('kycBadges');

    if (!kycBtn || !container || !summaryEl || !linksEl || !badgesEl) {
        console.error("KYC: Elementos HTML no encontrados.");
        alert("Error interno: los elementos de la interfaz KYC no se encontraron.");
        return;
    }

    kycBtn.disabled = true;
    kycBtn.innerHTML = "<span>⌛</span> Consultando IA...";
    container.style.display = 'block';
    summaryEl.innerText = "🔍 Investigando con Inteligencia Artificial... (puede tomar hasta 30 segundos)";
    linksEl.innerHTML = "";
    badgesEl.innerHTML = "";

    // 4. Llamar a la Cloud Function con timeout del cliente
    try {
        const auditoriaKYC = firebase.functions().httpsCallable('auditoriaKYC');

        // Timeout de 60 segundos del lado del cliente
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("La auditoría tardó demasiado. Intenta de nuevo.")), 60000)
        );

        const result = await Promise.race([
            auditoriaKYC({ nombre: name, cedula: cedula }),
            timeoutPromise
        ]);

        const data = result.data;
        console.log("KYC resultado:", data);

        // 5. Renderizar Resumen con Estilo Checklist
        const riskLevel = data.nivel_riesgo || 'INDETERMINADO';
        const riskStyles = {
            'BAJO': { bg: '#f0fdf4', text: '#166534', icon: '✅' },
            'MEDIO': { bg: '#fffbeb', text: '#92400e', icon: '⚠️' },
            'ALTO': { bg: '#fef2f2', text: '#991b1b', icon: '🛑' },
            'INDETERMINADO': { bg: '#f9fafb', text: '#374151', icon: '❓' }
        };
        const style = riskStyles[riskLevel] || riskStyles['INDETERMINADO'];

        summaryEl.innerHTML = `
            <div style="background:${style.bg}; border:1px solid ${style.text}44; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; color:${style.text}; font-weight:800; font-size:0.9rem;">
                    <span>${style.icon}</span> NIVEL DE RIESGO: ${riskLevel}
                </div>
                <p style="margin:0; font-size:0.875rem; color:${style.text}; font-weight:500;">${data.resumen_riesgo || 'Análisis completado.'}</p>
            </div>
        `;

        // 6. Hallazgos como Checklist (Sugerencia UX #2)
        badgesEl.innerHTML = `
            <div style="border-top:1px solid var(--border); padding-top:1rem; margin-top:1rem;">
                <h5 style="font-size:0.75rem; font-weight:800; text-transform:uppercase; margin-bottom:0.75rem; color:var(--text-secondary);">✓ Puntos Verificados:</h5>
                <div style="display:grid; gap:0.5rem;">
                    ${(data.hallazgos_clave || []).map(h => `
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-primary);">
                            <span style="color:var(--success);">✔</span> ${h}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 7. Enlaces vinculables
        linksEl.innerHTML = (data.perfiles_encontrados || []).map(p => `
            <div class="flex-between mb-1" style="border:1px solid var(--border); padding:0.75rem 1rem; border-radius:10px; background: white;">
                <a href="${p.url}" target="_blank" style="font-size:0.9rem; color:var(--primary); text-decoration:none; font-weight:800;">
                    ${p.plataforma} ${p.coincidencia_alta ? '⭐' : ''}
                </a>
                <button onclick="vincularPerfil('${p.plataforma}', '${p.url}')" 
                    class="btn btn-secondary" style="font-size:0.7rem; padding:0.4rem 0.6rem; border-radius:8px;">
                    VINCULAR
                </button>
            </div>
        `).join('');

    } catch (error) {
        console.error("KYC Error:", error);
        summaryEl.innerHTML = `<p style="color:var(--danger); margin:0;">❌ ${error.message || 'Error desconocido en la auditoría.'}</p>`;
        linksEl.innerHTML = "";
        badgesEl.innerHTML = "";
    } finally {
        kycBtn.disabled = false;
        kycBtn.innerHTML = "<span>🚀</span> Re-iniciar Auditoría";
    }
};

window.vincularPerfil = async function (plataforma, url) {
    const clientId = new URLSearchParams(window.location.search).get('id');
    if (!clientId) return;

    try {
        await db.collection('clientes').doc(clientId).collection('expediente').add({
            nombre: `🔗 Perfil: ${plataforma}`,
            url: url,
            tipo: 'link',
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`✅ Perfil de ${plataforma} vinculado exitosamente al Expediente Digital.`);
    } catch (e) {
        console.error("Error vinculando perfil:", e);
        alert("No se pudo vincular el perfil.");
    }
};

// --- WhatsMyName Digital Audit (via Cloud Function Proxy) ---
window.realizarAuditoriaDigital = async function () {
    const usernameInput = document.getElementById('wmnUsernameInput');
    const searchBtn = document.getElementById('wmnSearchBtn');
    const loadingState = document.getElementById('wmnLoadingState');
    const loadingText = document.getElementById('wmnLoadingText');
    const resultsContainer = document.getElementById('wmnResultsContainer');
    const resultCount = document.getElementById('wmnResultCount');
    const resultSource = document.getElementById('wmnResultSource');
    const resultsList = document.getElementById('wmnResultsList');

    const username = usernameInput.value.trim();
    if (!username) {
        alert("Por favor ingresa un username para buscar.");
        return;
    }

    // UI: Estado de carga
    searchBtn.disabled = true;
    searchBtn.innerText = "⏳ Buscando...";
    loadingState.style.display = 'block';
    resultsContainer.style.display = 'none';
    loadingText.innerText = "Buscando en +700 plataformas... (puede tomar hasta 90 segundos)";

    try {
        // Llamar a Cloud Function proxy (evita CORS)
        const whatsMyNameSearch = firebase.functions().httpsCallable('whatsMyNameSearch');

        // Timeout de 120s del lado del cliente
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("La búsqueda tardó demasiado. Intenta de nuevo.")), 120000)
        );

        const result = await Promise.race([
            whatsMyNameSearch({ username }),
            timeoutPromise
        ]);

        const data = result.data;
        console.log("WhatsMyName resultado:", data);

        // Renderizar resultados
        loadingState.style.display = 'none';
        resultsContainer.style.display = 'block';
        resultCount.innerText = `✅ ${data.total || 0} perfiles encontrados`;
        resultSource.innerText = `@${username} · WhatsMyName`;

        const perfiles = data.perfiles || [];
        if (perfiles.length === 0) {
            resultsList.innerHTML = `<p style="text-align:center; color:var(--text-muted); font-size:0.875rem; padding:2rem; background:var(--bg-main); border-radius:12px;">No se encontraron perfiles públicos para @${username}.</p>`;
        } else {
            resultsList.innerHTML = perfiles.map(p => `
                <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary w-full" style="justify-content: flex-start;">
                    <span>${p.plataforma}</span>
                    <span class="text-accent" style="margin-left:auto; font-size:0.8rem;">VER PERFIL ↗</span>
                </a>
            `).join('');
        }

        // Guardar en Firebase bajo el documento del cliente
        const clientId = new URLSearchParams(window.location.search).get('id');
        if (clientId) {
            try {
                await db.collection('clientes').doc(clientId).update({
                    auditoriaDigital: {
                        username: username,
                        fecha: new Date().toISOString(),
                        perfiles: perfiles,
                        total: data.total || 0
                    }
                });
                console.log("Auditoría WhatsMyName guardada en Firebase.");
                resultSource.innerText += ` · 💾 Guardado`;
            } catch (saveError) {
                console.error("Error guardando auditoría en Firebase:", saveError);
            }
        }

    } catch (error) {
        console.error("WhatsMyName Error:", error);
        loadingState.style.display = 'none';
        resultsContainer.style.display = 'block';
        resultCount.innerText = "⚠️ Búsqueda automática interrumpida";

        // Fallback robusto: Búsqueda manual en Google (Google Dorking)
        const googleSearchUrl = `https://www.google.com/search?q=site:instagram.com+OR+site:facebook.com+OR+site:linkedin.com+OR+site:twitter.com+OR+site:tiktok.com+"${username}"`;

        resultsList.innerHTML = `
            <div style="background:#fff3cd; color:#856404; padding:0.75rem; border-radius:6px; font-size:0.85rem; margin-bottom:0.5rem; border:1px solid #ffeeba;">
                <p style="margin:0 0 0.5rem 0;">La conexión con WhatsMyName falló (${error.message}).</p>
                <a href="${googleSearchUrl}" target="_blank" class="btn btn-secondary" style="display:block; text-align:center; text-decoration:none; font-weight:600; font-size:0.8rem;">
                    🔎 Buscar "${username}" manualmente en Google
                </a>
            </div>
        `;
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerText = "🔎 Buscar";
    }
};

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
                                style="background:none; border:none; cursor:pointer; color:var(--danger); font-size:1rem; padding:0;">🗑️</button>
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

// --- 4. Cartera de Clientes Logic ---
let allClients = [];

window.loadClientsList = function () {
    const grid = document.getElementById('clientsGrid');
    if (!grid) return;

    db.collection('clientes').orderBy('nombre').onSnapshot(snapshot => {
        allClients = [];
        snapshot.forEach(doc => {
            allClients.push({ id: doc.id, ...doc.data() });
        });
        renderClientsGrid(allClients);
    }, err => {
        console.error("Error loading clients:", err);
        grid.innerHTML = `<div class="empty-state"><p>Error cargando clientes: ${err.message}</p></div>`;
    });
};

window.renderClientsGrid = function (clients) {
    const grid = document.getElementById('clientsGrid');
    if (!grid) return;

    if (clients.length === 0) {
        grid.innerHTML = `<div class="empty-state"><p>No se encontraron clientes.</p></div>`;
        return;
    }

    grid.innerHTML = clients.map(client => {
        const initials = client.nombre ? client.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
        return `
            <div class="client-card">
                <div class="initials">${initials}</div>
                <div class="client-info">
                    <h3>${client.nombre}</h3>
                    <p>🆔 ${client.cedula}</p>
                    <p>📞 ${client.telefono || 'Sin teléfono'}</p>
                    <p>📍 ${client.direccion || 'Sin dirección'}</p>
                </div>
                <div class="client-actions-grid">
                    <button class="btn btn-secondary" onclick="window.location.href='client.html?id=${client.id}'">
                        👁️ Ver
                    </button>
                    <button class="btn btn-danger-soft" onclick="deleteClient('${client.id}', '${client.nombre}')">
                        🗑️ Borrar
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.filterClients = function (query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderClientsGrid(allClients);
        return;
    }

    const filtered = allClients.filter(c =>
        (c.nombre && c.nombre.toLowerCase().includes(q)) ||
        (c.cedula && c.cedula.includes(q)) ||
        (c.direccion && c.direccion.toLowerCase().includes(q))
    );
    renderClientsGrid(filtered);
};

// --- Reporting Logic ---
window.generarReporteEstado = async function(loanId) {
    const loanDoc = await db.collection('prestamos').doc(loanId).get();
    if(!loanDoc.exists) return alert("Préstamo no encontrado");
    const loan = loanDoc.data();
    
    // Fetch Transactions - REMOVED orderBy to avoid index error
    const txSnapshot = await db.collection('transactions')
        .where('loan_id', '==', loanId)
        .get();

    // Sort in memory to avoid missing index error
    const txs = [];
    txSnapshot.forEach(doc => txs.push({ id: doc.id, ...doc.data() }));
    txs.sort((a, b) => (a.fecha?.seconds || 0) - (b.fecha?.seconds || 0));

    let historyHtml = '';
    let runningBalance = loan.monto_principal;

    // Fila inicial: Capital Unificado
    historyHtml += `
        <tr style="background: #f8fafc; font-weight: bold;">
            <td>INICIO</td>
            <td>CAPITAL UNIFICADO INICIAL</td>
            <td style="color: var(--primary); font-weight:bold;">${formatCurrency(loan.monto_principal)}</td>
            <td>-</td>
            <td>${formatCurrency(loan.monto_principal)}</td>
        </tr>
    `;

    txs.forEach(tx => {
        const date = tx.fecha ? new Date(tx.fecha.seconds * 1000).toLocaleDateString('es-DO', { month: 'long', day: 'numeric' }) : 'N/A';
        const isPayment = ['inteligente', 'solo_interes', 'abono_capital_directo'].includes(tx.tipo_pago);
        const isCargo = tx.tipo_pago === 'cargo_historico';
        
        if (isCargo) {
            runningBalance += tx.monto_total;
            historyHtml += `
                <tr>
                    <td style="text-transform: uppercase; font-size:0.8rem;">${date.split(' de ')[1] || date}</td>
                    <td style="font-size:0.8rem;">${tx.nota || 'Interés o Mora'}</td>
                    <td>-</td>
                    <td style="color:var(--danger); font-weight:600;">${formatCurrency(tx.monto_total)}</td>
                    <td>-</td>
                    <td style="font-weight:700;">${formatCurrency(runningBalance)}</td>
                </tr>
            `;
        } else if (isPayment) {
            runningBalance -= tx.monto_total;
            const capPaid = tx.desglose?.capital || 0;
            const intPaid = (tx.desglose?.interes || 0) + (tx.desglose?.mora || 0);
            
            historyHtml += `
                <tr style="background: #f0fdf4;">
                    <td style="text-transform: uppercase; font-size:0.8rem;">${date.split(' de ')[1] || date}</td>
                    <td style="font-weight:700; font-size:0.8rem;">PAGO: ${tx.origen || 'Efectivo'}</td>
                    <td style="color:#64748b; font-size:0.8rem;">${capPaid > 0 ? '-' + formatCurrency(capPaid) : '-'}</td>
                    <td style="color:#64748b; font-size:0.8rem;">${intPaid > 0 ? '-' + formatCurrency(intPaid) : '-'}</td>
                    <td class="text-success" style="color:#16a34a !important; font-weight:800;">${formatCurrency(tx.monto_total)}</td>
                    <td style="font-weight:800;">${formatCurrency(runningBalance)}</td>
                </tr>
            `;
        }
    });

    // Corte final
    historyHtml += `
        <tr style="border-top: 3px solid var(--primary); background: #fff; font-weight:800;">
            <td colspan="4" style="text-align:right; padding:1.5rem;">TOTAL PENDIENTE A LA FECHA:</td>
            <td colspan="2" style="text-align:right; font-size:1.5rem; color:var(--primary); padding:1.5rem;">${formatCurrency(runningBalance)}</td>
        </tr>
    `;

    // Create Report Overlay
    const modal = document.createElement('div');
    modal.id = 'reportOverlay';
    modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:2000; overflow-y:auto; padding:1.5rem; display:flex; justify-content:center;";
    
    modal.innerHTML = `
        <div class="card glass report-paper" style="max-width:900px; width:100%; height:fit-content; background:white; color:black; padding:2rem !important; border-radius:0;">
            <div class="flex-between mb-1">
                <div style="text-align:left;">
                    <h1 style="margin:0; font-family:'Outfit'; color:var(--primary); font-size:2.2rem; letter-spacing:-1px;">VYJ CAPITAL</h1>
                    <p style="margin:0; color:#64748b; font-weight:600; font-size:0.9rem;">Gestión de Préstamos e Inversiones</p>
                </div>
                <div class="no-print" style="display:flex; gap:0.5rem;">
                    <button onclick="window.print()" class="btn btn-primary" style="padding:0.5rem 1rem;">🖨️ Imprimir</button>
                    <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" class="btn btn-secondary" style="padding:0.5rem 1rem;">Cerrar ✕</button>
                </div>
            </div>
            
            <hr style="border:0; border-top:1px solid #000; margin:1.5rem 0;">

            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:2rem; margin-bottom:1.5rem; font-size:0.95rem;">
                <div>
                    <p style="margin:0.25rem 0;"><strong>CLIENTE:</strong> ${loan.nombre_cliente}</p>
                    <p style="margin:0.25rem 0;"><strong>CAPITAL UNIFICADO:</strong> ${formatCurrency(loan.monto_principal)}</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0.25rem 0;"><strong>FECHA:</strong> ${new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p style="margin:0.25rem 0;"><strong>TASA:</strong> ${loan.tasa_mensual * 100}% Mensual</p>
                </div>
            </div>

            <table class="report-table" style="width:100%; border-collapse: collapse; margin: 1rem 0; font-size:0.8rem;">
                <thead style="background:var(--primary); color:white; text-align:left;">
                    <tr>
                        <th style="padding:0.6rem;">FECHA</th>
                        <th style="padding:0.6rem;">DESCRIPCIÓN</th>
                        <th style="padding:0.6rem; text-align:right;">CARGOS (+)</th>
                        <th style="padding:0.6rem; text-align:right;">PAGOS (-)</th>
                        <th style="padding:0.6rem; text-align:right;">BAL. RÉDITOS</th>
                        <th style="padding:0.6rem; text-align:right;">BAL. CAPITAL</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #f1f5f9; font-weight: bold;">
                        <td>INICIO</td>
                        <td>Capital Inicial Unificado</td>
                        <td style="text-align:right;">-</td>
                        <td style="text-align:right;">-</td>
                        <td style="text-align:right;">$0.00</td>
                        <td style="text-align:right;">${formatCurrency(loan.monto_principal)}</td>
                    </tr>
                    ${(() => {
                        let currentCap = loan.monto_principal;
                        let currentInt = 0;
                        let rows = [];

                        // Definir qué es cargo y qué es pago
                        const paymentTypes = ['inteligente', 'solo_interes', 'abono_capital', 'pago_mixto', 'pago_fijo'];
                        const chargeTypes = ['cargo_historico', 'cargo_interes', 'cargo_mora'];

                        txs.forEach(t => {
                            // Ignorar si es un cargo que solo repite el capital inicial
                            if (t.monto_total === loan.monto_principal && t.tipo_pago === 'cargo_historico' && (t.nota || '').includes('INICIAL')) return;
                            
                            const date = t.fecha ? (t.fecha.toDate ? t.fecha.toDate() : new Date(t.fecha)) : new Date();
                            const formattedDate = date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
                            
                            let cargo = 0;
                            let pago = 0;
                            let detalle = t.nota || t.tipo_pago;

                            if (chargeTypes.includes(t.tipo_pago)) {
                                cargo = t.monto_total;
                                currentInt += cargo;
                            } else if (paymentTypes.includes(t.tipo_pago)) {
                                pago = t.monto_total;
                                // Aplicar pago: Primero a intereses/mora, luego a capital
                                if (pago <= currentInt) {
                                    currentInt -= pago;
                                } else {
                                    let sobrante = pago - currentInt;
                                    currentInt = 0;
                                    currentCap -= sobrante;
                                }
                            }

                            rows.push(`
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding:0.5rem;">${formattedDate}</td>
                                    <td style="padding:0.5rem; color:#444;">${detalle}</td>
                                    <td style="padding:0.5rem; text-align:right; color:${cargo > 0 ? '#dc2626' : '#999'};">
                                        ${cargo > 0 ? formatCurrency(cargo) : '-'}
                                    </td>
                                    <td style="padding:0.5rem; text-align:right; color:#059669; font-weight:bold;">
                                        ${pago > 0 ? formatCurrency(pago) : '-'}
                                    </td>
                                    <td style="padding:0.5rem; text-align:right; font-weight:600; color:${currentInt > 0 ? '#000' : '#94a3b8'};">
                                        ${formatCurrency(currentInt)}
                                    </td>
                                    <td style="padding:0.5rem; text-align:right; font-weight:bold;">
                                        ${formatCurrency(currentCap)}
                                    </td>
                                </tr>
                            `);
                        });
                        return rows.join('');
                    })()}
                </tbody>
            </table>

            <div style="margin-top:2rem; display:grid; grid-template-columns: 1fr 1fr; gap:2rem;">
                <div style="border: 2px solid #e2e8f0; padding:1.5rem; border-radius:12px; background: #f8fafc;">
                    <h4 style="margin:0 0 1.25rem 0; font-size:0.9rem; color:#1e293b; text-transform:uppercase; border-bottom:1px solid #e2e8f0; padding-bottom:0.5rem; font-weight:800;">RESUMEN DE SALDOS</h4>
                    <p style="display:flex; justify-content:space-between; margin:0.75rem 0; font-size:1rem; color:#475569;">
                        <span>Capital Pendiente:</span> 
                        <strong style="color:#000;">${formatCurrency(loan.capital_actual)}</strong>
                    </p>
                    <p style="display:flex; justify-content:space-between; margin:0.75rem 0; font-size:1rem; color:#475569;">
                        <span>Réditos Pendientes:</span> 
                        <strong style="color:#000;">${formatCurrency(loan.interes_pendiente + (loan.mora_acumulada || 0))}</strong>
                    </p>
                    <hr style="border:0; border-top:2px solid #e2e8f0; margin:1rem 0;">
                    <p style="display:flex; justify-content:space-between; margin:0; font-size:1.25rem; color:var(--primary); font-weight:900;">
                        <span>TOTAL GENERAL:</span> 
                        <strong style="color:var(--primary);">${formatCurrency(runningBalance)}</strong>
                    </p>
                </div>
                <div style="text-align:center; padding-top:2rem;">
                    <div style="width:200px; border-top:1.5px solid #000; margin: 4.5rem auto 0.5rem auto;"></div>
                    <p style="margin:0; font-weight:800; font-size:0.85rem; color:#000;">Firma Autorizada</p>
                    <p style="margin:0; font-size:0.75rem; color:#64748b;">VYJ CAPITAL</p>
                </div>
            </div>

            <div style="margin-top:3rem; text-align:left; font-size:0.75rem; color:#94a3b8; line-height:1.4;">
                <p>Nota: Este informe separa los cargos por Réditos (intereses y moras) de los movimientos de Capital para mayor transparencia.</p>
                <div style="font-size: 0.55rem; opacity: 0.4; line-height: 1; margin-top: 10px;">
                    <p style="margin:2px 0;">* Se aplicará un cargo de mora del 5% sobre los réditos adeudados si las cuotas tienen más de 12 días de atraso.</p>
                    <p style="margin:2px 0;">* Penalidad adicional calculada en base al 12% sobre saldos en atraso prolongado.</p>
                </div>
                <p style="margin-top: 10px;">Generado digitalmente por el sistema VYJ Capital - ${new Date().toLocaleString()}</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};


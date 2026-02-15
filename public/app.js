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
                <p><strong>Nacimiento:</strong> ${client.fecha_nacimiento || 'N/A'} (${client.lugar_nacimiento || 'N/A'})</p>
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
                    <a href="${p.url}" target="_blank" rel="noopener noreferrer"
                        style="display:flex; justify-content:space-between; align-items:center; background:white; padding:0.5rem 0.75rem; border-radius:6px; border:1px solid #eee; text-decoration:none; color:var(--text-primary); transition: transform 0.1s;"
                        onmouseover="this.style.transform='translateX(2px)'" onmouseout="this.style.transform='none'">
                        <span style="font-size:0.8rem; font-weight:500;">${p.plataforma || p.nombre || 'Desconocido'}</span>
                        <span style="font-size:0.65rem; color:var(--primary-color);">Abrir ↗</span>
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

        // 5. Renderizar Resumen con nivel de riesgo
        const riskColors = { 'BAJO': '#22c55e', 'MEDIO': '#f59e0b', 'ALTO': '#ef4444', 'INDETERMINADO': '#6b7280' };
        const riskColor = riskColors[data.nivel_riesgo] || riskColors['INDETERMINADO'];

        summaryEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                <span style="background:${riskColor}; color:white; padding:0.15rem 0.5rem; border-radius:12px; font-size:0.7rem; font-weight:700;">
                    RIESGO ${data.nivel_riesgo || 'N/A'}
                </span>
                <small style="color:var(--text-secondary);">Fuente: ${data._source === 'grounded' ? '🌐 Google Search' : '🤖 IA'}</small>
            </div>
            <p style="margin:0; font-size:0.85rem;">${data.resumen_riesgo || 'Análisis completado sin detalles.'}</p>
        `;

        // 6. Renderizar Enlaces (LinkedIn, FB, etc.)
        linksEl.innerHTML = (data.perfiles_encontrados || []).map(p => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:0.5rem; border-radius:6px; border:1px solid #eee;">
                <a href="${p.url}" target="_blank" style="font-size:0.8rem; color:var(--text-primary); text-decoration:none;">
                    ${p.plataforma} ${p.coincidencia_alta ? '⭐' : ''}
                </a>
                <button onclick="vincularPerfil('${p.plataforma}', '${p.url}')" 
                    style="font-size:0.7rem; color:var(--primary-color); background:none; border:none; cursor:pointer; font-weight:600;">
                    Vincular
                </button>
            </div>
        `).join('');

        // 7. Renderizar Hallazgos Clave
        badgesEl.innerHTML = (data.hallazgos_clave || []).map(h => `
            <span style="background:rgba(59, 130, 246, 0.1); color:var(--primary-color); padding:0.25rem 0.6rem; border-radius:20px; font-size:0.7rem; font-weight:500;">
                ${h}
            </span>
        `).join('');

    } catch (error) {
        console.error("KYC Error:", error);
        summaryEl.innerHTML = `<p style="color:var(--danger-color); margin:0;">❌ ${error.message || 'Error desconocido en la auditoría.'}</p>`;
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
            resultsList.innerHTML = `<p style="text-align:center; color:var(--text-secondary); font-size:0.85rem; padding:1rem;">No se encontraron perfiles para @${username}.</p>`;
        } else {
            resultsList.innerHTML = perfiles.map(p => `
                <a href="${p.url}" target="_blank" rel="noopener noreferrer"
                    style="display:flex; justify-content:space-between; align-items:center; background:white; padding:0.5rem 0.75rem; border-radius:6px; border:1px solid #eee; text-decoration:none; color:var(--text-primary); transition: transform 0.1s;"
                    onmouseover="this.style.transform='translateX(2px)'" onmouseout="this.style.transform='none'">
                    <span style="font-size:0.8rem; font-weight:500;">${p.plataforma}</span>
                    <span style="font-size:0.65rem; color:var(--primary-color);">Abrir ↗</span>
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
        resultCount.innerText = "❌ Error en la búsqueda";
        resultsList.innerHTML = `<p style="color:var(--danger-color); font-size:0.85rem; padding:0.5rem;">${error.message}</p>`;
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


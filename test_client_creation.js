const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestClient() {
    try {
        const newClient = {
            nombre: "Test User Node",
            cedula: "001-9999999-9",
            fecha_nacimiento: "1990-01-01",
            sexo: "Masculino",
            estado_civil: "Soltero",
            telefono: "809-555-9999",
            email: "testnode@example.com",
            direccion: "Calle Test Node #1",
            fecha_registro: admin.firestore.FieldValue.serverTimestamp(),
            trabajo: {
                ocupacion: "Tester",
                empresa: "Node JS Inc",
                sueldo: 50000,
                telefono: "809-555-8888"
            },
            solidario: {
                nombre: "Solidario Node",
                cedula: "001-8888888-8",
                telefono: "809-555-7777",
                referencia_laboral: "Dev"
            },
            referencias: [
                { nombre: "Ref 1 Node", telefono: "809-111-1111" },
                { nombre: "Ref 2 Node", telefono: "809-222-2222" }
            ],
            folder_virtual: ''
        };

        const docRef = await db.collection('clientes').add(newClient);
        console.log("✅ Client created with ID:", docRef.id);
    } catch (error) {
        console.error("❌ Error creating client:", error);
    }
}

createTestClient();

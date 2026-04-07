import { useState } from 'react';
import { functions } from './firebase-config';
import { httpsCallable } from 'firebase/functions';

/**
 * Hook personalizado para manejar el escaneo de documentos con Inteligencia Artificial (Gemini 2.0 Flash)
 */
export const useOCR = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState(null);

    const scanReceipt = async (file) => {
        if (!file) return null;
        
        setIsScanning(true);
        setScanError(null);

        try {
            // Convertir archivo a Base64
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(file);
            });

            // Llamar a la Cloud Function 'scanDocument'
            const scanner = httpsCallable(functions, 'scanDocument');
            const result = await scanner({
                image: base64,
                docType: 'receipt', // Nuestro nuevo tipo configurado en el backend
                mimeType: file.type
            });

            console.log("Resultado del escaneo de Recibo con IA:", result.data);
            return result.data;

        } catch (error) {
            console.error("AI OCR Hook Error:", error);
            setScanError(error.message || "Error al procesar el recibo.");
            return null;
        } finally {
            setIsScanning(false);
        }
    };

    return { scanReceipt, isScanning, scanError };
};

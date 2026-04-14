import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase-config';

/**
 * useOCR Hook
 * Handles scanning documents (IDs, Receipts, etc.) using Gemini AI via Firebase Functions.
 */
export function useOCR() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const scanReceipt = async (file) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Convert file to Base64
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      // 2. Call Firebase Function
      const functions = getFunctions(app);
      const scanDocument = httpsCallable(functions, 'scanDocument');
      
      const response = await scanDocument({
        image: base64,
        docType: 'receipt', // Specifically for bank transfer receipts
        mimeType: file.type
      });

      setResult(response.data);
      return response.data;
    } catch (err) {
      console.error("OCR Scan Error:", err);
      setError(err.message || "Error al procesar el recibo con IA");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { scanReceipt, loading, error, result, setResult };
}

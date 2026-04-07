import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Puerto por defecto para el portal
    host: true, // Accesible en red local (útil para pruebas mobile)
  }
})

# Mini-Games · Crossplay P2P (PC + Android)

Colección de juegos web multijugador **P2P Crossplay** diseñados para jugar al instante entre **PC** y **Android** sin necesidad de cuentas ni servidores de juego dedicados, e instalable como **PWA** a pantalla completa.

## Juegos incluidos

1. **Neo Air Hockey (60 FPS · Tiempo real)**
   - Física 2D con sub-stepping, estelas y chispas de impacto.
   - **Perspectiva simétrica**: tanto en PC como en Android siempre defiendes tu portería en la parte inferior de tu pantalla, evitando que tu dedo tape la pista en móviles.
   - Controles adaptados: Ratón o `WASD` / Flechas en PC; arrastre táctil directo con respuesta háptica en Android; soporte multitáctil para 2 jugadores en el mismo dispositivo.
2. **Conecta 4 Táctico (7×6)**
   - Vista previa de columna, caída con rebote físico, soporte de teclado (`1`–`7` / flechas) y toque táctil directo.
   - Modo 1 jugador con IA Minimax (poda alfa-beta).
3. **Tres en Raya Infinito + Clásico**
   - **Modo Infinito (Sin empates)**: cada jugador solo puede mantener **3 marcas activas** en el tablero; al colocar la cuarta, la más antigua desaparece automáticamente.
   - Incluye también el **Modo Clásico** tradicional e IA para ambos modos.

## Características Crossplay & PWA

- **WebRTC P2P directo (`PeerJS`)**: Salas con código corto de 5 caracteres, generador local de **Código QR** y enlace directo (`?room=XXXXX`) con entrada automática al escanear desde Android.
- **Sesión persistente**: Cambia entre juegos o pide la revancha sin perder la conexión P2P ni el marcador global de victorias, con indicador de latencia (`ms`) y reacciones rápidas.
- **PWA Instalable**: Incluye `manifest.webmanifest`, Service Worker (`sw.js`), iconos adaptables y soporte de **Screen Wake Lock** para que la pantalla de Android no se apague en mitad de una partida.

## Desarrollo local

```bash
npm install
npm run dev
```

## Despliegue en Vercel

El repositorio incluye `vercel.json` preconfigurado para Vite:

1. Importa el repositorio `ezearocha0-stack/mini-games` en [Vercel](https://vercel.com/new).
2. Mantén los ajustes detectados automáticamente (`Framework Preset: Vite`, `Build Command: npm run build`, `Output Directory: dist`) y pulsa **Deploy**.
3. Abre la URL de Vercel en tu PC, pulsa **Crear Sala P2P**, y escanea el código QR con la cámara de tu Android (donde además podrás pulsar **Instalar App** para jugarlo a pantalla completa).

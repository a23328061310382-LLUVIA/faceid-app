# FaceID App 🎭

Aplicación web de reconocimiento facial en tiempo real con inicio de sesión, historial de detecciones y estadísticas.

---

## 📱 Demo en vivo

🔗 [https://bucolic-hummingbird-b6f978.netlify.app](https://bucolic-hummingbird-b6f978.netlify.app)

---

## 📋 Descripción

FaceID App es una aplicación web progresiva (PWA) que permite registrar personas mediante fotos y detectarlas automáticamente usando la cámara del dispositivo. Utiliza modelos de inteligencia artificial para el reconocimiento facial en tiempo real.

---

## ✅ Funciones principales

1. **Inicio de sesión y registro** — Sistema de autenticación con usuario y contraseña.
2. **Registro de personas** — Agrega personas con nombre y una o varias fotos.
3. **Reconocimiento facial en tiempo real** — Detecta e identifica rostros usando la cámara.
4. **Historial de detecciones** — Registro de todas las detecciones con fecha y hora, exportable en .txt.
5. **Estadísticas** — Visualiza totales de detecciones, personas reconocidas, desconocidos y actividad por hora.

---

## 🗂️ Estructura del proyecto

```
faceid-app/
├── index.html        # Estructura principal de la app (todas las pantallas)
├── style.css         # Estilos y diseño visual
├── app.js            # Lógica de reconocimiento facial e interacción
├── sw.js             # Service Worker para funcionalidad PWA
├── manifest.json     # Configuración PWA (nombre, iconos, colores)
├── icon-192.png      # Ícono de la app 192x192
├── icon-512.png      # Ícono de la app 512x512
└── README.md         # Este archivo
```

---

## ⚙️ Requisitos del sistema

- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Cámara web o cámara del dispositivo móvil
- Conexión a internet (para cargar los modelos de IA la primera vez)

---

## 🚀 Instalación y uso

### Opción 1 — Usar en línea
Entra directamente a: [https://bucolic-hummingbird-b6f978.netlify.app](https://bucolic-hummingbird-b6f978.netlify.app)

### Opción 2 — Ejecutar localmente
1. Clona el repositorio:
   ```bash
   git clone https://github.com/a23328061310382-LLUVIA/faceid-app.git
   ```
2. Entra a la carpeta:
   ```bash
   cd faceid-app
   ```
3. Abre `index.html` en tu navegador o usa un servidor local:
   ```bash
   npx serve .
   ```

---

## 📖 Guía de uso

1. **Crear cuenta** — En la pantalla de inicio de sesión, toca "Crear cuenta nueva", ingresa un usuario y contraseña (mínimo 4 caracteres).
2. **Agregar personas** — En la sección "Personas", toca el botón **+**, escribe el nombre y selecciona una o varias fotos.
3. **Abrir cámara** — Toca "Abrir Cámara" para iniciar el escáner facial en tiempo real.
4. **Ver historial** — En la sección "Historial" puedes ver todas las detecciones y exportarlas en .txt.
5. **Ver estadísticas** — En "Estadísticas" puedes ver gráficas de actividad y totales.

---

## 🛠️ Tecnologías utilizadas

- **HTML5 / CSS3 / JavaScript** — Sin frameworks, código puro.
- **face-api.js** — Librería de reconocimiento facial basada en TensorFlow.js.
- **PWA** — Funciona como app instalable en móviles y escritorio.
- **localStorage** — Almacenamiento local de usuarios y datos.

---

## 👩‍💻 Autor

Desarrollado como proyecto final del Submódulo 2 — Implementa aplicaciones móviles multiplataforma.

# 🏛️ Arquitectura y Tecnologías del Proyecto (LUPSI ChatOps)

Este documento detalla el funcionamiento interno, la arquitectura y las principales herramientas, protocolos y APIs que utiliza el proyecto para operar como un Agente Autónomo de Telegram en el contexto de **ChatOps** y gestión ágil de proyectos de software.

---

## 1. Core y Framework Principal
**[NestJS](https://nestjs.com/) (Node.js + TypeScript)**
El proyecto está construido sobre **NestJS**, un framework progresivo y escalable para Node.js.
- **¿Para qué se usa?** Permite estructurar una arquitectura altamente modular, desacoplada y mantenible mediante **Inyección de Dependencias (DI)**. El código se divide lógicamente en:
  - **Controllers:** Endpoints HTTP para webhooks de servicios externos (`webhook.controller.ts`, `app.controller.ts`).
  - **Services:** Lógica de negocio especializada (`bot.service.ts`, `ai.service.ts`, `trello.service.ts`, `github.service.ts`, `pdf.service.ts`, `cron.service.ts`, etc.).
  - **Modules:** Empaquetado cohesivo de componentes (`app.module.ts`).
- **Ventajas:** Facilita la orquestación de tareas programadas en segundo plano (`@nestjs/schedule`), el manejo de APIs asíncronas con RxJS/Promises y la mantenibilidad a largo plazo.

---

## 2. Interfaz de Usuario y Comunicación
**API de Telegram (vía [Telegraf](https://telegraf.js.org/))**
El bot interactúa con los usuarios y el equipo de desarrollo a través de Telegram.
- **¿Cómo funciona?** El servicio `bot.service.ts` utiliza la librería `telegraf` para conectarse a la API oficial de Telegram mediante polling o webhooks.
- **Flujo de Interacción:** 
  - Escucha eventos entrantes (mensajes de texto, comandos con barra, documentos PDF y callbacks de botones).
  - Presenta teclados en línea (*inline keyboards*) para menús de navegación rápida y flujos interactivos de aprobación (**Human-in-the-Loop**).
  - Emite alertas proactivas a grupos de desarrolladores ante eventos de CI/CD o fechas límite.

---

## 3. Inteligencia Artificial (Cerebro del Bot)
**Orquestador de LLMs con [OpenRouter](https://openrouter.ai/) y [NVIDIA NIM](https://build.nvidia.com/)**
Para el procesamiento de lenguaje natural y el razonamiento contextual, el agente incorpora un subsistema de IA resiliente (`ai.service.ts`).
- **OpenRouter:** Enrutador de APIs de modelos fundacionales (Claude 3.5 Sonnet, Llama 3.3 70B, DeepSeek). Permite definir un orden de prioridad de modelos y rotación dinámica de llaves API (`AI_KEYS`).
- **Tolerancia a Fallos y Failover:** Si una llave supera la cuota diaria o un modelo experimenta latencia/indisponibilidad, el servicio conmuta automáticamente a modelos de respaldo gratuitos o a la API de **NVIDIA NIM**, garantizando alta disponibilidad sin interrumpir la operación del bot.

---

## 4. Motor RAG (Retrieval-Augmented Generation)
**Indexación en Memoria y Análisis Documental (`docs.service.ts`)**
- **¿Cómo funciona?** Al arrancar, el agente escanea la carpeta `conocimiento/` e indexa archivos PDF (mediante `pdf-parse`) y Markdown.
- **Búsqueda Semántica/Contextual:** Los documentos se dividen en fragmentos (*chunks* de 1500 caracteres con solapamiento). Ante una consulta técnica sobre el proyecto, el sistema puntúa y recupera los fragmentos más pertinentes, inyectándolos como contexto maestro al prompt del LLM.

---

## 5. Base de Datos y Persistencia
**[Supabase](https://supabase.com/) (PostgreSQL BaaS)**
Se utiliza como plataforma de Backend-as-a-Service para persistencia relacional.
- **¿Para qué se usa?** (`supabase.service.ts`)
  - Almacenamiento de sesiones e historial conversacional.
  - Trazabilidad de decisiones tomadas por el agente.
  - Registro histórico de métricas de desempeño y standups.

---

## 6. Infraestructura y Alojamiento en la Nube (Cloud)
El sistema está distribuido en servicios modernos en la nube:
- **[Render](https://render.com/):** Plataforma PaaS donde se aloja el microservicio de NestJS ejecutado dentro de contenedores Docker (con *multi-stage builds* para optimizar el tamaño de la imagen y la velocidad de arranque).
- **[Supabase](https://supabase.com/):** DBaaS PostgreSQL administrado en la nube con réplicas y alta disponibilidad.
- **[Cloudinary](https://cloudinary.com/):** Almacenamiento de objetos (*object storage*) para respaldar entregables pesados y documentos generados.

---

## 7. Integraciones de Terceros (ChatOps)
El bot actúa como el centro de control que unifica las herramientas del ciclo de desarrollo:
- **Trello REST API (`trello.service.ts`):** Lectura e inspección en tiempo real de listas y tarjetas del tablero Kanban; asignación de tareas, cálculo de retrasos y publicación automática de comentarios de seguimiento.
- **GitHub REST API & Webhooks (`github.service.ts` y `webhook.controller.ts`):** Monitoreo de commits, pull requests, issues y eventos de workflows de CI/CD. Notifica inmediatamente al chat ante builds rotos o despliegues fallidos.

---

## 8. Generación Dinámica de Documentos
**[PDFKit](https://pdfkit.org/) (`pdf.service.ts`)**
- El agente puede generar documentos PDF vectoriales sobre la marcha con un diseño editorial profesional: encabezados institucionales, tablas de datos tabulares, gráficas Burndown embebidas y bloques de resumen ejecutivo.

---

## 9. Automatización y Tareas en Segundo Plano
**Cron Jobs (`@nestjs/schedule` y `cron.service.ts`)**
- **Stand-ups Diarios:** Ejecuta recordatorios automáticos matutinos dirigidos a cada miembro del equipo para registrar su progreso.
- **Auditoría de Consistencia:** Contrasta periódicamente lo manifestado en los standups frente al estado verificado en Trello y los commits en GitHub.
- **Detección de Bloqueos:** Identifica tarjetas estancadas por más de 48 horas sin actividad y notifica al Project Manager.

---

## 10. Resumen del Flujo de Trabajo Operativo
```text
1. Usuario envía un mensaje, comando o archivo PDF a través de Telegram.
2. NestJS recibe el evento en bot.service.ts vía Telegraf.
3. Para consultas analíticas o complejas, el mensaje se transfiere a ai.service.ts.
4. El orquestador de IA consulta:
   ├── RAG Engine (docs.service.ts) para extraer contexto de especificaciones.
   ├── Trello API (trello.service.ts) para el estado del tablero Kanban.
   └── GitHub API (github.service.ts) para la actividad reciente de código.
5. Si la acción requiere mutar datos críticos, se activa el flujo Human-in-the-Loop (HITL).
6. Se persiste el evento en Supabase (supabase.service.ts).
7. Se formula la respuesta y se envía de regreso por Telegram (texto formateado o PDF dinámico).
```

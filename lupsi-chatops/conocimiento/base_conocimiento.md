# BASE DE CONOCIMIENTO OFICIAL — PROYECTO LUPSI
# Sistema Web PWA de Gestión de Agendamiento Médico
# FUENTE DE VERDAD ABSOLUTA — Actualizado: 2026-04-24

ADVERTENCIA PARA EL AGENTE: Todo dato de personas, fechas, costos, tecnologías y entregables
que no esté en este documento o en los otros archivos de la carpeta /conocimiento se
considera HALLUCINATION PROHIBIDA. Si no lo sabes, di que no lo sabes.

---

## 1. DATOS GENERALES DEL PROYECTO

- **Nombre del proyecto:** Sistema Web Progresivo (PWA) de Gestión de Agendamiento Médico LUPSI
- **Empresa ejecutora:** SKT Software Solution
- **Código de proyecto:** MI-GAM-PRO-001
- **Cliente:** Centro Médico LUPSI (Directora: Dra. Luz Marina Saenz Díaz de Jesús)
- **Patrocinador académico:** Ing. Paulo Torres, Mg. (Universidad Técnica de Ambato)
- **Universidaad:** Universidad Técnica de Ambato — Facultad de Ingeniería en Sistemas, Electrónica e Industrial — Carrera de Software

---

## 2. EQUIPO DE DESARROLLO (NOMBRES EXACTOS — NO INVENTAR OTROS)

| Rol                     | Nombre completo            | Telegram vinculado |
|-------------------------|----------------------------|--------------------|
| Gestor del Proyecto (PM)| Angel Ayuquina             | (ver equipo.json)  |
| Desarrollador Backend   | Sebastián Ortiz            | (ver equipo.json)  |
| Desarrollador Fullstack | Daniel Luisa               | (ver equipo.json)  |
| Desarrollador Frontend  | Alex Guachi (también Huachi)| (ver equipo.json) |

REGLA: Solo existen 4 personas en el equipo. No existen otros desarrolladores.

---

## 3. STACK TECNOLÓGICO REAL

- **Backend:** NestJS (Node.js + TypeScript)
- **Frontend:** Angular (PWA — Progressive Web App)
- **Base de datos:** Supabase (PostgreSQL con Row Level Security — RLS)
- **Autenticación:** JWT (JSON Web Tokens) + Módulo 10 (validación de cédula ecuatoriana)
- **Storage de archivos médicos:** Cloudinary (PDFs de recetas)
- **Control de versiones:** GitHub (GitFlow)
- **Gestión de tareas:** Trello (tablero Scrum)
- **CI/CD y producción:** Render (servidor cloud)
- **Seguridad de datos:** RBAC (Control de Acceso Basado en Roles) + TLS 1.3 + AES-256

---

## 4. CRONOGRAMA OFICIAL — FECHAS EXACTAS (NO MODIFICAR)

### Sprint 1: Planificación, Requisitos y Arquitectura
- **Inicio:** 2026-03-02 | **Fin:** 2026-03-20
- **Responsables:** Todo el equipo
- **Entregables:**
  - Entrevista con profesional médico ✅
  - Análisis de procesos AS-IS ✅
  - Historias de usuario (PB-01 a PB-07) ✅
  - Modelado BD (ER), wireframes, prototipos UX/UI ✅
  - Repositorios GitHub inicializados ✅
  - Arquitectura definida y APIs diseñadas ✅

### Sprint 2: Backend, Autenticación y Seguridad
- **Inicio:** 2026-03-23 | **Fin:** 2026-04-07
- **Responsables:** Sebastián (Backend), Alex (Frontend base)
- **Entregables:**
  - Creación de BD Supabase con RLS ✅
  - Autenticación JWT y validación de cédula (Módulo 10) ✅
  - Backend: Gestión de catálogos paramétricos ✅

### Sprint 3: Motor de Agendamiento e Interfaces Frontend
- **Inicio:** 2026-04-08 | **Fin:** 2026-04-30
- **Estado actual a 2026-04-24:** EN CURSO
- **Responsables por tarea:**
  - T-01 Motor de Reservas → Sebastián Ortiz (fecha: 21/04/2026)
  - T-02 Portal del Paciente (PWA) → Daniel Luisa (fecha: 30/04/2026)
  - T-03 Panel Administrativo → Alex Guachi (fecha: 30/04/2026)
  - T-04 Integración Auth-Frontend (Deuda S2) → Alex Guachi (fecha: 15/04/2026)
- **Hitos:**
  - Hito 1: Login PWA + API Agendamiento (hasta 21/04)
  - Hito 2: Vistas Frontend completas (hasta 30/04)
- **Historias de usuario cubiertas:** US-02 (Agendamiento Síncrono), US-03 (Agenda Administrativa)
- **Informe de avance S3:** Progreso confirmado. Sistema permite autenticación, consulta de disponibilidad y reservas. Equipo listo para Sprint 4.

### Sprint 4: Integración y Calidad (QA)
- **Inicio:** 2026-05-04 | **Fin:** 2026-05-27
- **Entregables planificados:**
  - Backend RBAC + rutas médicas protegidas (10/05/2026) — Sebastián
  - Integración API Cloudinary para PDFs (12/05/2026) — Daniel/Alex
  - Interfaz del Médico (carga de expedientes) (15/05/2026)
- **Costo acumulado a fin de Sprint 4:** $4,690.40 USD (valor de horas de ingeniería, NO desembolso real)
- **Historias de usuario:** US-04 (Expedientes Cloud), US-05 (Privacidad RBAC)

### Sprint 5: Capacitación, Gestión del Cambio y Despliegue (Final)
- **Inicio:** 2026-05-28 | **Fin:** 2026-06-10
- **Entregables:**
  - Reporte QA: pruebas de estrés + versión piloto sin bugs críticos (27/05)
  - Manuales de usuario + taller de capacitación médica (02/06)
  - Despliegue en producción Render + SSL (10/06)
- **Costo acumulado final:** $5,850.00 USD (valorización total de 5 sprints)
- **Estado al cierre:** 100% operativo, entregado al cliente

---

## 5. PRODUCT BACKLOG COMPLETO Y ESTADO (Actualizado desde PDF de Progreso)

| ID | Tarea | Responsable | Prioridad | Sprint | Estado |
|----|-------|-------------|-----------|--------|--------|
| 1 | Entrevista con profesional médico | Angel/Sebastián | Media | S1 | Completada |
| 2 | Análisis de procesos actuales | Angel Ayuquina | Alta | S1 | Completada |
| 3 | Definición de historias de usuario | Angel Ayuquina | Alta | S1 | Completada |
| 4 | Creación del Product Backlog | Angel Ayuquina | Alta | S1 | Completada |
| 5 | Modelado de Base de Datos | Sebastián Ortiz | Alta | S1 | Completada |
| 6 | Definición arquitectura y APIs | Angel/Daniel/Sebastián | Alta | S1 | Completada |
| 7 | Diseño wireframes y navegación | Alex Huachi | Media | S1 | Completada |
| 8 | Prototipos de alta fidelidad | Alex Huachi | Baja | S1 | Completada |
| 9 | Validación de interfaces | Alex Huachi | Baja | S1 | Completada |
| 10 | Configuración entorno (Git/Docker) | Alex Huachi | Media | S1 | Completada |
| 11 | Creación de BD y seguridad (RLS) | Sebastián Ortiz | Alta | S2 | Completada |
| 12 | Backend: Autenticación y Cédula | Sebastián Ortiz | Alta | S2 | Completada |
| 13 | Backend: Motor de Reservas | Sebastián/Daniel | Alta | S3 | Completada |
| 14 | Backend: Repositorio RBAC | Daniel Luisa | Alta | S4 | En progreso |
| 15 | Frontend: Portal del Paciente | Alex Huachi | Alta | S3 | Pendiente |
| 16 | Frontend: Panel Administrativo | Alex Huachi | Media | S3 | Pendiente |
| 17 | Integración Frontend-Backend | Equipo | Alta | S4 | Pendiente |
| 18 | Pruebas de estrés y concurrencia | Sebastián Ortiz | Alta | S4 | Pendiente |
| 19 | Despliegue versión Beta (Piloto) | Equipo | Alta | S4 | Pendiente |
| 20 | Pruebas de usabilidad con paciente | Angel Ayuquina | Media | S5 | Pendiente |
| 21 | Depuración de errores y parches | Daniel Luisa | Alta | S5 | Pendiente |
| 22 | Pruebas de estrés superadas y estable | Sebastián Ortiz | Media | S5 | Pendiente |

---

## 6. HISTORIAS DE USUARIO (US-01 a US-05)

### US-01: Registro e Identificación Segura
- **Rol:** Paciente
- **Objetivo:** Crear una cuenta verificando mi identidad mediante cédula ecuatoriana
- **Criterios de aceptación:**
  - Sistema valida la cédula con el algoritmo del Módulo 10
  - Datos únicos (correo/cédula) no se duplican
  - Token JWT se emite correctamente tras el login
- **Sprint:** S2

### US-02: Agendamiento Médico Sin Conflictos
- **Rol:** Paciente
- **Objetivo:** Reservar una cita en un horario disponible
- **Criterios de aceptación:**
  - Sistema deniega estrictamente la superposición de citas
  - No permite doble agendamiento sobre el mismo horario
  - La reserva se persiste en la BD automáticamente
  - El horario ocupado deja de estar disponible para otros usuarios concurrentes
- **Sprint:** S3

### US-03: Visualización de Agenda Administrativa
- **Rol:** Recepcionista
- **Objetivo:** Previsualizar el calendario médico general sin ver datos clínicos sensibles
- **Criterios de aceptación:**
  - La agenda refleja en tiempo real los horarios reservados
  - Solo muestra detalles primarios y demográficos
  - Acceso restringido: rechaza token de Recepción con error 403/401 en tabla Historias
- **Sprint:** S3

### US-04: Digitalización de Expedientes en Nube
- **Rol:** Médico
- **Objetivo:** Subir recetas y reportes clínicos PDF asociados a pacientes
- **Criterios de aceptación:**
  - Solo acepta archivos PDF (bloquea otros tipos)
  - Almacenamiento delegado a Cloudinary
  - El médico visualiza los documentos desde su panel
  - La asociación documento-paciente es correcta
- **Sprint:** S4

### US-05: Restricción de Privacidad y Data Médica
- **Rol:** Centro clínico
- **Objetivo:** Proteger la privacidad del paciente del personal de secretaría
- **Criterios de aceptación:**
  - Políticas RLS y RBAC implementadas a nivel de BD
  - Todo intento no autorizado rechazado con error 403/401
  - Información clínica restringida solo a perfiles permitidos
- **Sprint:** S4

---

## 7. PRESUPUESTO Y FINANCIAMIENTO (DATOS EXACTOS DEL CASO DE NEGOCIO)

### Costos Directos de Desarrollo (Estimación de Mercado)
| Rubro                                              | Monto       |
|----------------------------------------------------|-------------|
| Desarrollador Full Stack (1) $600/mes × 3.5 meses | $2,100.00   |
| Desarrollador de apoyo (1) $500/mes × 3.5 meses   | $1,750.00   |
| Servidor / Seguridad inicial                       | $100.00     |
| Herramientas y servicios (dominio, backups)        | $100.00     |
| Energía eléctrica ($40/mes × 3.5)                 | $140.00     |
| Internet ($30/mes × 3.5)                           | $105.00     |
| **Subtotal costos directos**                       | **$4,295.00** |
| Imprevistos (10%)                                  | $429.50     |
| **TOTAL COSTOS DIRECTOS (Valorización mercado)**   | **$4,724.50** |

### Costos Indirectos (Primer año post-implementación)
| Rubro                                              | Monto       |
|----------------------------------------------------|-------------|
| Capacitación del personal usuario                  | $200.00     |
| Mantenimiento y soporte técnico anual              | $600.00     |
| Servicios operativos ($70/mes × 12 meses)          | $840.00     |
| **Total costos indirectos (primer año)**           | **$1,640.00** |

### Resumen Financiero Clave
- **Valoración de mercado total del sistema:** $4,724.50
- **Costo estimado de desarrollo (referencial):** ~$3,000
- **Desembolso real del centro médico:** $200 iniciales (solo infraestructura básica)
- **Costo de infraestructura cloud (Supabase/Cloudinary/Render en fase inicial):** $0.00 (capas gratuitas)
- **ROI estimado (recuperación de inversión):** 10 a 12 meses
- **Modalidad de financiamiento:** El equipo de desarrollo absorbe el costo de talento humano como proyecto académico, reduciendo el riesgo financiero institucional a cero.

### Evolución del costo acumulado por sprint
| Sprint | Fecha de corte | Costo acumulado (horas de ingeniería valoradas) |
|--------|---------------|------------------------------------------------|
| S1-S2  | 07/04/2026    | No reportado explícitamente                    |
| S3     | 30/04/2026    | En curso                                       |
| S4     | 15/05/2026    | $4,690.40 USD                                  |
| S5 (Final) | 10/06/2026 | $5,850.00 USD                                 |

---

## 8. ESTADO ACTUAL DEL PROYECTO (A 2026-04-24)

- **Sprint activo:** Sprint 3 (08/04 al 30/04/2026)
- **Días restantes del sprint:** 6 días hábiles aproximados
- **Estado general:** Sin atrasos. El Motor de Reservas (T-01) tuvo su hito el 21/04 con la API de Agendamiento entregada. Portal Paciente (T-02) y Panel Admin (T-03) en cierre hacia el 30/04.
- **Puntos abiertos para Sprint 4:**
  - Backend RBAC (Sebastián, 10/05)
  - Integración Cloudinary (Daniel/Alex, 15/05)
  - Inicio QA (Angel, 11/05)

---

## 9. ANÁLISIS DEL PROBLEMA ORIGINAL (AS-IS)

El Centro Médico LUPSI antes del sistema operaba con:
- WhatsApp Business (gestión informal de citas)
- Agenda física de papel y hojas de cálculo aisladas
- Sin backups automáticos ni nube
- Sin validación de identidad de pacientes
- La médica psicóloga (Dra. Saenz) interrumpía consultas para gestionar citas

**Cuellos de botella identificados:**
1. Doble función de la profesional médica (clínica + administración)
2. Sin validación de datos de pacientes (identidad a ciegas)
3. Riesgo de doble agendamiento sin mecanismo de control
4. Cero trazabilidad de expedientes (papel o WhatsApp)
5. Sin privacidad diferenciada por rol

---

## 10. RIESGOS CONOCIDOS (IDENTIFICADOS FORMALMENTE)

| Riesgo                          | Probabilidad | Impacto   | Mitigación                                        |
|---------------------------------|-------------|-----------|---------------------------------------------------|
| Resistencia al cambio (WhatsApp)| Alta        | Medio     | UX en < 2 min, registro asistido, mini-talleres   |
| Caída del servidor cloud        | Media       | Alto      | SLA 99.9%, backups diarios, RTO=2h, RPO=1h        |
| Ciberataques / vulneraciones    | Baja        | Crítico   | TLS 1.3, AES-256, RBAC, DPA con proveedor cloud   |
| Perfiles falsos / bots          | Media       | Alto      | Verificación por email + monitoreo de IPs         |
| Deficiencias en dirección del proyecto | Media | Alto     | Scrum quincenal, Trello, auditoría del docente    |
| Incompatibilidades tecnológicas | Baja        | Medio     | Stack probado: NestJS + Angular + Supabase        |

---

## 11. INVOLUCRADOS CLAVE DEL PROYECTO

| Involucrado                   | Rol                    | Responsabilidad                                          |
|-------------------------------|------------------------|----------------------------------------------------------|
| Centro Médico LUPSI           | Institución beneficiaria| Entorno de implementación y usuarios del sistema         |
| Personal de recepción/admisión| Usuario principal       | Gestión de pacientes y citas                             |
| Pacientes de la clínica       | Usuarios finales        | Agendar citas y recibir notificaciones                   |
| Equipo SKT (estudiantes)      | Desarrolladores         | Análisis, diseño, desarrollo, pruebas e implementación   |
| Ing. Paulo Torres             | Supervisor académico    | Orientación metodológica y verificación de objetivos     |
| Administrador de sistemas     | Soporte técnico         | Infraestructura, mantenimiento y disponibilidad          |

### Patrocinadores del proyecto
- Dra. Luz Marina Saenz — Directora Médica LUPSI — 07/03/2026
- Dr. Edgar José Lama von Buchwald — SaludSA — 07/03/2026
- Dr. Carlos Andrés Manzano — Ecuasanitas — 07/03/2026

---

## 12. CRITERIOS DE CALIDAD DEL PROYECTO

Una historia de usuario se considera TERMINADA cuando:
1. La funcionalidad responde al rol y necesidad descritos en la HU
2. Todos los criterios de aceptación están cubiertos y verificados
3. La implementación conserva la seguridad y privacidad del sistema
4. La UX es clara y funcional
5. La historia puede probarse individualmente y dentro del flujo general

---

## 13. DOCUMENTOS OFICIALES DISPONIBLES (REFERENCIA)

| Documento                               | Estado   |
|-----------------------------------------|----------|
| CASODEUSO-Presupuesto.pdf               | Completo |
| Historias_de_usuario.pdf                | Completo |
| Product_Backlog.pdf                     | Completo |
| Requerimientos.pdf                      | Completo |
| Entrevista personal médico.pdf          | Completo |
| PLanificacion_sprint_1.pdf              | Completo |
| PlanificacionSprint3.pdf                | Completo |
| PlanificacionSprint4.pdf                | Completo |
| PlanificacionSprint5.pdf                | Completo |
| InformeAvanceSprint1.pdf a Sprint5.pdf  | Completos|
| Informe_del_Proyecto-AOLH.pdf           | Completo |
| PlantillaCalidad.pdf                    | Completo |
| cronograma_oficial.md                   | MAESTRO  |

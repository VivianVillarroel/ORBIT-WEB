-- ORBIT — esquema de base de datos (MySQL 8 / MariaDB 10.4+)
-- Crea las tablas si no existen. Se puede importar desde phpMyAdmin dentro de la base "orbit".

SET NAMES utf8mb4;

-- Instituciones cliente: universidades, institutos y colegios
CREATE TABLE IF NOT EXISTS universidades (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(160) NOT NULL,
  sigla           VARCHAR(20)  NULL,
  tipo            ENUM('universidad','instituto','colegio') NOT NULL DEFAULT 'universidad',
  ciudad          VARCHAR(80)  NULL,
  pais            VARCHAR(60)  NOT NULL DEFAULT 'Bolivia',
  email_contacto  VARCHAR(160) NULL,
  telefono        VARCHAR(30)  NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_universidades_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carreras de cada institución
CREATE TABLE IF NOT EXISTS carreras (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  universidad_id      INT UNSIGNED NOT NULL,
  nombre              VARCHAR(140) NOT NULL,
  codigo              VARCHAR(20)  NULL,
  area                ENUM('Salud','Ingeniería y técnica','Ciencias sociales','Educación','Otra') NOT NULL DEFAULT 'Salud',
  duracion_semestres  TINYINT UNSIGNED NULL,
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carreras_univ_nombre (universidad_id, nombre),
  CONSTRAINT fk_carreras_universidad FOREIGN KEY (universidad_id) REFERENCES universidades (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cuentas de acceso. El rol define qué puede hacer cada persona.
CREATE TABLE IF NOT EXISTS usuarios (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(80)  NOT NULL,
  apellido        VARCHAR(80)  NOT NULL,
  email           VARCHAR(160) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  rol             ENUM('admin','director','docente','estudiante') NOT NULL,
  universidad_id  INT UNSIGNED NULL,
  telefono        VARCHAR(30)  NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso   DATETIME     NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  KEY ix_usuarios_rol (rol),
  CONSTRAINT fk_usuarios_universidad FOREIGN KEY (universidad_id) REFERENCES universidades (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos propios de cada docente (1 a 1 con usuarios)
CREATE TABLE IF NOT EXISTS docentes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id       INT UNSIGNED NOT NULL,
  especialidad     VARCHAR(120) NULL,
  grado_academico  ENUM('Licenciatura','Especialidad','Maestría','Doctorado') NULL,
  creado_en        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_docentes_usuario (usuario_id),
  CONSTRAINT fk_docentes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carreras en las que enseña cada docente (muchos a muchos)
CREATE TABLE IF NOT EXISTS docente_carrera (
  docente_id  INT UNSIGNED NOT NULL,
  carrera_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (docente_id, carrera_id),
  CONSTRAINT fk_dc_docente FOREIGN KEY (docente_id) REFERENCES docentes (id) ON DELETE CASCADE,
  CONSTRAINT fk_dc_carrera FOREIGN KEY (carrera_id) REFERENCES carreras (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos propios de cada estudiante (1 a 1 con usuarios).
-- tipo = institucional: pertenece a una carrera de una institución con licencia.
-- tipo = independiente: se registró solo desde la página (versión freemium), sin carrera.
CREATE TABLE IF NOT EXISTS estudiantes (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED NOT NULL,
  tipo            ENUM('institucional','independiente') NOT NULL DEFAULT 'institucional',
  carrera_id      INT UNSIGNED NULL,
  codigo          VARCHAR(30)  NOT NULL,
  semestre        TINYINT UNSIGNED NULL,
  fecha_ingreso   DATE         NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_estudiantes_usuario (usuario_id),
  UNIQUE KEY uq_estudiantes_codigo (codigo),
  KEY ix_estudiantes_carrera (carrera_id),
  CONSTRAINT fk_estudiantes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_estudiantes_carrera FOREIGN KEY (carrera_id) REFERENCES carreras (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clases (materias o paralelos) de una carrera, a cargo de un docente
CREATE TABLE IF NOT EXISTS clases (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  carrera_id      INT UNSIGNED NOT NULL,
  docente_id      INT UNSIGNED NULL,
  nombre          VARCHAR(140) NOT NULL,
  codigo          VARCHAR(30)  NULL,
  descripcion     TEXT         NULL,
  periodo         VARCHAR(20)  NOT NULL,
  horario         VARCHAR(120) NULL,
  aula            VARCHAR(60)  NULL,
  cupo            SMALLINT UNSIGNED NULL,
  estado          ENUM('planificada','activa','finalizada') NOT NULL DEFAULT 'activa',
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_clases_docente (docente_id),
  KEY ix_clases_carrera (carrera_id),
  CONSTRAINT fk_clases_carrera FOREIGN KEY (carrera_id) REFERENCES carreras (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_clases_docente FOREIGN KEY (docente_id) REFERENCES docentes (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estudiantes inscritos en cada clase
CREATE TABLE IF NOT EXISTS inscripciones (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  clase_id       INT UNSIGNED NOT NULL,
  estudiante_id  INT UNSIGNED NOT NULL,
  estado         ENUM('inscrito','retirado','aprobado','reprobado') NOT NULL DEFAULT 'inscrito',
  nota_final     DECIMAL(5,2) NULL,
  inscrito_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inscripcion (clase_id, estudiante_id),
  KEY ix_inscripciones_estudiante (estudiante_id),
  CONSTRAINT fk_insc_clase FOREIGN KEY (clase_id) REFERENCES clases (id) ON DELETE CASCADE,
  CONSTRAINT fk_insc_estudiante FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Laboratorios. Hoy se usan en 3D desde el navegador; vr_disponible queda listo para la versión en Realidad Virtual.
-- estado: solicitado (lo pidió una institución) -> en_desarrollo -> publicado (visible para estudiantes).
-- catalogo_publico: lo ven los estudiantes independientes (freemium). gratis: se abre sin plan Premium.
CREATE TABLE IF NOT EXISTS laboratorios (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  creado_por INT UNSIGNED NULL,
  nombre            VARCHAR(140) NOT NULL,
  area              ENUM('Salud','Ingeniería y técnica','Ciencias sociales','Educación','Otra') NOT NULL DEFAULT 'Salud',
  equipo            VARCHAR(140) NULL,
  descripcion       TEXT         NULL,
  modelo_url        VARCHAR(500) NULL,
  imagen_url        VARCHAR(500) NULL,
  vr_disponible     TINYINT(1)   NOT NULL DEFAULT 0,
  estado            ENUM('solicitado','en_desarrollo','publicado') NOT NULL DEFAULT 'solicitado',
  solicitado_por    INT UNSIGNED NULL,
  catalogo_publico  TINYINT(1)   NOT NULL DEFAULT 0,
  gratis            TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_laboratorios_nombre (nombre),
  KEY ix_laboratorios_estado (estado),
  CONSTRAINT fk_lab_creador FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_lab_solicitante FOREIGN KEY (solicitado_por) REFERENCES universidades (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carreras que tienen acceso a cada laboratorio (no todos los estudiantes ven lo mismo)
CREATE TABLE IF NOT EXISTS laboratorio_carrera (
  laboratorio_id  INT UNSIGNED NOT NULL,
  carrera_id      INT UNSIGNED NOT NULL,
  PRIMARY KEY (laboratorio_id, carrera_id),
  KEY ix_lc_carrera (carrera_id),
  CONSTRAINT fk_lc_laboratorio FOREIGN KEY (laboratorio_id) REFERENCES laboratorios (id) ON DELETE CASCADE,
  CONSTRAINT fk_lc_carrera FOREIGN KEY (carrera_id) REFERENCES carreras (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Libros con Realidad Aumentada (AR): el estudiante apunta la cámara a las páginas del libro
-- y la app ORBIT AR muestra personajes 3D que explican cada tema y cierran con un quiz.
--   libro_url:  PDF del libro o de las páginas marcadoras para imprimir
--   app_url:    descarga de la app ORBIT AR (Play Store, APK, etc.)
--   modelo_url: modelo .glb para ver en AR directo desde el navegador del celular (sin instalar nada)
--   temas:      un tema por línea (cada página marcadora)
CREATE TABLE IF NOT EXISTS libros (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo            VARCHAR(160) NOT NULL,
  autor             VARCHAR(140) NULL,
  materia           VARCHAR(100) NULL,
  descripcion       TEXT         NULL,
  temas             TEXT         NULL,
  portada_url       VARCHAR(500) NULL,
  libro_url         VARCHAR(500) NULL,
  app_url           VARCHAR(500) NULL,
  modelo_url        VARCHAR(500) NULL,
  estado            ENUM('en_desarrollo','publicado') NOT NULL DEFAULT 'en_desarrollo',
  catalogo_publico  TINYINT(1)   NOT NULL DEFAULT 0,
  gratis            TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_libros_titulo (titulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carreras que tienen acceso a cada libro
CREATE TABLE IF NOT EXISTS libro_carrera (
  libro_id    INT UNSIGNED NOT NULL,
  carrera_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (libro_id, carrera_id),
  KEY ix_lbc_carrera (carrera_id),
  CONSTRAINT fk_lbc_libro FOREIGN KEY (libro_id) REFERENCES libros (id) ON DELETE CASCADE,
  CONSTRAINT fk_lbc_carrera FOREIGN KEY (carrera_id) REFERENCES carreras (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resultados de los quiz de cada tema de un libro AR (los envía la app ORBIT AR o el propio estudiante)
CREATE TABLE IF NOT EXISTS libro_resultados (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  estudiante_id  INT UNSIGNED NOT NULL,
  libro_id       INT UNSIGNED NOT NULL,
  tema           VARCHAR(140) NOT NULL,
  puntaje        TINYINT UNSIGNED NULL,
  realizado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lr_estudiante (estudiante_id, libro_id),
  CONSTRAINT fk_lr_estudiante FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_libro FOREIGN KEY (libro_id) REFERENCES libros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Laboratorios que el docente asigna a una clase, con fecha límite opcional
CREATE TABLE IF NOT EXISTS clase_laboratorio (
  clase_id        INT UNSIGNED NOT NULL,
  laboratorio_id  INT UNSIGNED NOT NULL,
  fecha_limite    DATE     NULL,
  asignado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clase_id, laboratorio_id),
  CONSTRAINT fk_cl_clase FOREIGN KEY (clase_id) REFERENCES clases (id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_laboratorio FOREIGN KEY (laboratorio_id) REFERENCES laboratorios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada práctica de un estudiante en un laboratorio (la registra el visor 3D; más adelante, la app VR)
CREATE TABLE IF NOT EXISTS practicas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  estudiante_id   INT UNSIGNED NOT NULL,
  laboratorio_id  INT UNSIGNED NOT NULL,
  clase_id        INT UNSIGNED NULL,
  modalidad       ENUM('3D','VR') NOT NULL DEFAULT '3D',
  realizada_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duracion_min    SMALLINT UNSIGNED NULL,
  puntaje         TINYINT UNSIGNED NULL,
  completada      TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_practicas_estudiante (estudiante_id),
  KEY ix_practicas_clase (clase_id),
  CONSTRAINT fk_pr_estudiante FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_laboratorio FOREIGN KEY (laboratorio_id) REFERENCES laboratorios (id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_clase FOREIGN KEY (clase_id) REFERENCES clases (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Licencias contratadas por cada institución (piloto, licencia de 35 Bs por estudiante, proyecto a medida)
CREATE TABLE IF NOT EXISTS licencias (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  universidad_id         INT UNSIGNED NOT NULL,
  plan                   ENUM('piloto','institucional','proyecto_medida') NOT NULL DEFAULT 'institucional',
  precio_estudiante_mes  DECIMAL(8,2) NOT NULL DEFAULT 35.00,
  estudiantes_max        INT UNSIGNED NULL,
  fecha_inicio           DATE NOT NULL,
  fecha_fin              DATE NULL,
  estado                 ENUM('activa','vencida','suspendida') NOT NULL DEFAULT 'activa',
  notas                  VARCHAR(255) NULL,
  creado_en              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_licencias_universidad (universidad_id),
  CONSTRAINT fk_licencias_universidad FOREIGN KEY (universidad_id) REFERENCES universidades (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Planes para estudiantes independientes (freemium): Gratis y Premium mensual
CREATE TABLE IF NOT EXISTS planes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo       VARCHAR(30)  NOT NULL,
  nombre       VARCHAR(80)  NOT NULL,
  precio_mes   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  descripcion  VARCHAR(255) NULL,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_planes_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Suscripciones de pago de los estudiantes independientes
CREATE TABLE IF NOT EXISTS suscripciones (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id    INT UNSIGNED NOT NULL,
  plan_id       INT UNSIGNED NOT NULL,
  estado        ENUM('pendiente','activa','vencida','cancelada') NOT NULL DEFAULT 'pendiente',
  fecha_inicio  DATE NULL,
  fecha_fin     DATE NULL,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_suscripciones_usuario (usuario_id, estado),
  CONSTRAINT fk_sus_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_sus_plan FOREIGN KEY (plan_id) REFERENCES planes (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pagos mensuales. El estudiante reporta su pago (QR o transferencia) y el admin lo confirma:
-- eso activa la suscripción o la extiende por los meses pagados.
CREATE TABLE IF NOT EXISTS pagos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  suscripcion_id   INT UNSIGNED NOT NULL,
  usuario_id       INT UNSIGNED NOT NULL,
  monto            DECIMAL(8,2) NOT NULL,
  meses            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  metodo           ENUM('qr','transferencia','tarjeta','efectivo') NOT NULL DEFAULT 'qr',
  referencia       VARCHAR(80)  NULL,
  estado           ENUM('pendiente','confirmado','rechazado') NOT NULL DEFAULT 'pendiente',
  revisado_por     INT UNSIGNED NULL,
  revisado_en      DATETIME NULL,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pagos_estado (estado),
  CONSTRAINT fk_pagos_suscripcion FOREIGN KEY (suscripcion_id) REFERENCES suscripciones (id) ON DELETE CASCADE,
  CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_pagos_revisor FOREIGN KEY (revisado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Solicitudes de cotización que llegan desde el formulario de contacto del sitio
CREATE TABLE IF NOT EXISTS solicitudes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre       VARCHAR(120) NOT NULL,
  institucion  VARCHAR(160) NULL,
  email        VARCHAR(160) NOT NULL,
  tipo         VARCHAR(80)  NULL,
  mensaje      TEXT         NOT NULL,
  estado       ENUM('nueva','en_proceso','cotizada','cerrada') NOT NULL DEFAULT 'nueva',
  creado_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Dirección académica, trazabilidad de notas y certificados
CREATE TABLE IF NOT EXISTS `directores` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `carrera_id` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario_id` (`usuario_id`),
  KEY `carrera_id` (`carrera_id`),
  CONSTRAINT `directores_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `directores_ibfk_2` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notas_historial` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `inscripcion_id` int unsigned NOT NULL,
  `actor_id` int unsigned NOT NULL,
  `anterior` json NOT NULL,
  `nueva` json NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inscripcion_id` (`inscripcion_id`),
  KEY `actor_id` (`actor_id`),
  CONSTRAINT `notas_historial_ibfk_1` FOREIGN KEY (`inscripcion_id`) REFERENCES `inscripciones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notas_historial_ibfk_2` FOREIGN KEY (`actor_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `certificados` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `inscripcion_id` int unsigned NOT NULL,
  `codigo` char(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estudiante` varchar(170) COLLATE utf8mb4_unicode_ci NOT NULL,
  `curso` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `carrera` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `institucion` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nota` decimal(5,2) NOT NULL,
  `emitido_por` int unsigned NOT NULL,
  `emitido_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inscripcion_id` (`inscripcion_id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `emitido_por` (`emitido_por`),
  CONSTRAINT `certificados_ibfk_1` FOREIGN KEY (`inscripcion_id`) REFERENCES `inscripciones` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `certificados_ibfk_2` FOREIGN KEY (`emitido_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


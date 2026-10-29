-- ORBIT: respaldo completo para restaurar en una base vacía.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
CREATE TABLE `carreras` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `universidad_id` int unsigned NOT NULL,
  `nombre` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigo` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area` enum('Salud','Ingeniería y técnica','Ciencias sociales','Educación','Otra') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Salud',
  `duracion_semestres` tinyint unsigned DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carreras_univ_nombre` (`universidad_id`,`nombre`),
  CONSTRAINT `fk_carreras_universidad` FOREIGN KEY (`universidad_id`) REFERENCES `universidades` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `carreras` (`id`,`universidad_id`,`nombre`,`codigo`,`area`,`duracion_semestres`,`activo`,`creado_en`,`actualizado_en`) VALUES ('1','1','Ingeniería Biomédica','IBM','Ingeniería y técnica','10','1','2026-10-20 15:43:30',NULL);
INSERT INTO `carreras` (`id`,`universidad_id`,`nombre`,`codigo`,`area`,`duracion_semestres`,`activo`,`creado_en`,`actualizado_en`) VALUES ('2','1','Medicina','MED','Salud','12','1','2026-10-20 15:43:30',NULL);
INSERT INTO `carreras` (`id`,`universidad_id`,`nombre`,`codigo`,`area`,`duracion_semestres`,`activo`,`creado_en`,`actualizado_en`) VALUES ('3','1','Enfermería','ENF','Salud','10','1','2026-10-20 15:43:30',NULL);
INSERT INTO `carreras` (`id`,`universidad_id`,`nombre`,`codigo`,`area`,`duracion_semestres`,`activo`,`creado_en`,`actualizado_en`) VALUES ('4','1','Psicología','PSI','Ciencias sociales','10','1','2026-10-20 15:43:30',NULL);
INSERT INTO `carreras` (`id`,`universidad_id`,`nombre`,`codigo`,`area`,`duracion_semestres`,`activo`,`creado_en`,`actualizado_en`) VALUES ('5','2','Técnico Superior en Radiología','RAD','Salud','6','1','2026-10-20 15:43:30',NULL);
CREATE TABLE `certificados` (
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `clase_laboratorio` (
  `clase_id` int unsigned NOT NULL,
  `laboratorio_id` int unsigned NOT NULL,
  `fecha_limite` date DEFAULT NULL,
  `asignado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clase_id`,`laboratorio_id`),
  KEY `fk_cl_laboratorio` (`laboratorio_id`),
  CONSTRAINT `fk_cl_clase` FOREIGN KEY (`clase_id`) REFERENCES `clases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cl_laboratorio` FOREIGN KEY (`laboratorio_id`) REFERENCES `laboratorios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `clases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `carrera_id` int unsigned NOT NULL,
  `docente_id` int unsigned DEFAULT NULL,
  `nombre` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigo` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `periodo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `horario` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aula` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cupo` smallint unsigned DEFAULT NULL,
  `estado` enum('planificada','activa','finalizada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activa',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_clases_docente` (`docente_id`),
  KEY `ix_clases_carrera` (`carrera_id`),
  CONSTRAINT `fk_clases_carrera` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_clases_docente` FOREIGN KEY (`docente_id`) REFERENCES `docentes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `directores` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `carrera_id` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario_id` (`usuario_id`),
  KEY `carrera_id` (`carrera_id`),
  CONSTRAINT `directores_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `directores_ibfk_2` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `docente_carrera` (
  `docente_id` int unsigned NOT NULL,
  `carrera_id` int unsigned NOT NULL,
  PRIMARY KEY (`docente_id`,`carrera_id`),
  KEY `fk_dc_carrera` (`carrera_id`),
  CONSTRAINT `fk_dc_carrera` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dc_docente` FOREIGN KEY (`docente_id`) REFERENCES `docentes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `docentes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `especialidad` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `grado_academico` enum('Licenciatura','Especialidad','Maestría','Doctorado') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_docentes_usuario` (`usuario_id`),
  CONSTRAINT `fk_docentes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `estudiantes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `tipo` enum('institucional','independiente') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'institucional',
  `carrera_id` int unsigned DEFAULT NULL,
  `codigo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `semestre` tinyint unsigned DEFAULT NULL,
  `fecha_ingreso` date DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estudiantes_usuario` (`usuario_id`),
  UNIQUE KEY `uq_estudiantes_codigo` (`codigo`),
  KEY `ix_estudiantes_carrera` (`carrera_id`),
  CONSTRAINT `fk_estudiantes_carrera` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_estudiantes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `inscripciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `clase_id` int unsigned NOT NULL,
  `estudiante_id` int unsigned NOT NULL,
  `estado` enum('inscrito','retirado','aprobado','reprobado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inscrito',
  `nota_final` decimal(5,2) DEFAULT NULL,
  `inscrito_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inscripcion` (`clase_id`,`estudiante_id`),
  KEY `ix_inscripciones_estudiante` (`estudiante_id`),
  CONSTRAINT `fk_insc_clase` FOREIGN KEY (`clase_id`) REFERENCES `clases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_insc_estudiante` FOREIGN KEY (`estudiante_id`) REFERENCES `estudiantes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `laboratorio_carrera` (
  `laboratorio_id` int unsigned NOT NULL,
  `carrera_id` int unsigned NOT NULL,
  PRIMARY KEY (`laboratorio_id`,`carrera_id`),
  KEY `ix_lc_carrera` (`carrera_id`),
  CONSTRAINT `fk_lc_carrera` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lc_laboratorio` FOREIGN KEY (`laboratorio_id`) REFERENCES `laboratorios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('1','1');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('2','1');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('4','1');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('1','2');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('3','2');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('5','2');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('1','3');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('3','3');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('4','3');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('5','3');
INSERT INTO `laboratorio_carrera` (`laboratorio_id`,`carrera_id`) VALUES ('2','5');
CREATE TABLE `laboratorios` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `area` enum('Salud','Ingeniería y técnica','Ciencias sociales','Educación','Otra') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Salud',
  `equipo` varchar(140) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `modelo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imagen_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vr_disponible` tinyint(1) NOT NULL DEFAULT '0',
  `estado` enum('solicitado','en_desarrollo','publicado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'solicitado',
  `solicitado_por` int unsigned DEFAULT NULL,
  `catalogo_publico` tinyint(1) NOT NULL DEFAULT '0',
  `gratis` tinyint(1) NOT NULL DEFAULT '0',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `creado_por` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_laboratorios_nombre` (`nombre`),
  KEY `ix_laboratorios_estado` (`estado`),
  KEY `fk_lab_solicitante` (`solicitado_por`),
  KEY `fk_lab_creador` (`creado_por`),
  CONSTRAINT `fk_lab_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lab_solicitante` FOREIGN KEY (`solicitado_por`) REFERENCES `universidades` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`,`creado_por`) VALUES ('1','VentLab: ventilador mecánico','Salud','Dräger Savina 300','Componentes, funcionamiento y mantenimiento guiado de un ventilador mecánico.',NULL,'img/ventilador.webp','1','publicado','1','1','0','2026-10-20 15:43:30',NULL,NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`,`creado_por`) VALUES ('2','CT Virtual Lab: tomógrafo','Salud','Siemens SOMATOM','Cómo está hecho un tomógrafo, cómo funciona y cómo se mantiene.',NULL,'img/tomografo.webp','1','publicado','1','1','0','2026-10-20 15:43:30',NULL,NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`,`creado_por`) VALUES ('3','Corazón humano en 3D','Salud',NULL,'Cavidades, válvulas y circulación del corazón para girar y explorar.',NULL,'img/aula.webp','0','publicado',NULL,'1','1','2026-10-20 15:43:30',NULL,NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`,`creado_por`) VALUES ('4','Desfibrilador externo','Salud',NULL,'Partes del equipo, carga y descarga segura.',NULL,'img/doctora-vr.webp','0','en_desarrollo','1','0','0','2026-10-20 15:43:30',NULL,NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`,`creado_por`) VALUES ('5','Monitor de signos vitales','Salud',NULL,'Pedido por Univalle para el piloto.',NULL,'img/estudiantes-vr.webp','0','solicitado','1','0','0','2026-10-20 15:43:30',NULL,NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`,`creado_por`) VALUES ('6','M2 · Celda robotizada: robot, PLC y HMI','Otra','Robot industrial, cinta transportadora, PLC y HMI','Práctica interactiva de puesta en marcha: carga una pieza, cierra la puerta de seguridad, energiza la celda, enseña los puntos de toma y depósito y ejecuta el ciclo. Finaliza aislando el equipo y descarga tu informe. Usa computadora y mouse.','simuladores/m2/index.html',NULL,'0','publicado','1','1','1','2026-10-20 20:51:07','2026-10-20 20:54:27',NULL);
CREATE TABLE `libro_carrera` (
  `libro_id` int unsigned NOT NULL,
  `carrera_id` int unsigned NOT NULL,
  PRIMARY KEY (`libro_id`,`carrera_id`),
  KEY `ix_lbc_carrera` (`carrera_id`),
  CONSTRAINT `fk_lbc_carrera` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lbc_libro` FOREIGN KEY (`libro_id`) REFERENCES `libros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `libro_carrera` (`libro_id`,`carrera_id`) VALUES ('1','4');
INSERT INTO `libro_carrera` (`libro_id`,`carrera_id`) VALUES ('2','4');
INSERT INTO `libro_carrera` (`libro_id`,`carrera_id`) VALUES ('3','4');
CREATE TABLE `libro_resultados` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `estudiante_id` int unsigned NOT NULL,
  `libro_id` int unsigned NOT NULL,
  `tema` varchar(140) COLLATE utf8mb4_unicode_ci NOT NULL,
  `puntaje` tinyint unsigned DEFAULT NULL,
  `realizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_lr_estudiante` (`estudiante_id`,`libro_id`),
  KEY `fk_lr_libro` (`libro_id`),
  CONSTRAINT `fk_lr_estudiante` FOREIGN KEY (`estudiante_id`) REFERENCES `estudiantes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_libro` FOREIGN KEY (`libro_id`) REFERENCES `libros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `libros` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `titulo` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `autor` varchar(140) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `materia` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `temas` text COLLATE utf8mb4_unicode_ci,
  `portada_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `libro_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `app_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modelo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('en_desarrollo','publicado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_desarrollo',
  `catalogo_publico` tinyint(1) NOT NULL DEFAULT '0',
  `gratis` tinyint(1) NOT NULL DEFAULT '0',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_libros_titulo` (`titulo`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `libros` (`id`,`titulo`,`autor`,`materia`,`descripcion`,`temas`,`portada_url`,`libro_url`,`app_url`,`modelo_url`,`estado`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('1','Sigmund Freud en Realidad Aumentada','Equipo ORBIT','Psicología','Freud aparece sobre la página y explica sus ideas principales; tú eliges qué preguntas explorar.','Sublimación\nEllo, Yo y Superyó\nEl arte\nLos sueños','img/ar-celular.webp',NULL,NULL,NULL,'publicado','1','1','2026-10-20 15:43:30',NULL);
INSERT INTO `libros` (`id`,`titulo`,`autor`,`materia`,`descripcion`,`temas`,`portada_url`,`libro_url`,`app_url`,`modelo_url`,`estado`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('2','Carl Gustav Jung en Realidad Aumentada','Equipo ORBIT','Psicología','Jung presenta el inconsciente colectivo con ejemplos visuales en 3D.','Arquetipos\nMandala\nSelf\nSombra\nIndividuación\nInconsciente colectivo','img/ar-tablet.webp',NULL,NULL,NULL,'publicado','1','0','2026-10-20 15:43:30',NULL);
INSERT INTO `libros` (`id`,`titulo`,`autor`,`materia`,`descripcion`,`temas`,`portada_url`,`libro_url`,`app_url`,`modelo_url`,`estado`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('3','Lev Vygotsky en Realidad Aumentada','Equipo ORBIT','Psicología','Vygotsky explica cómo aprendemos con otros, con preguntas interactivas.','Aprendizaje social\nCultura\nJuego simbólico\nZona de desarrollo próximo\nLenguaje privado\nFunciones ejecutivas','img/ecosistema.webp',NULL,NULL,NULL,'publicado','1','0','2026-10-20 15:43:30',NULL);
CREATE TABLE `licencias` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `universidad_id` int unsigned NOT NULL,
  `plan` enum('piloto','institucional','proyecto_medida') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'institucional',
  `precio_estudiante_mes` decimal(8,2) NOT NULL DEFAULT '35.00',
  `estudiantes_max` int unsigned DEFAULT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date DEFAULT NULL,
  `estado` enum('activa','vencida','suspendida') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activa',
  `notas` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_licencias_universidad` (`universidad_id`),
  CONSTRAINT `fk_licencias_universidad` FOREIGN KEY (`universidad_id`) REFERENCES `universidades` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `notas_historial` (
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `pagos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `suscripcion_id` int unsigned NOT NULL,
  `usuario_id` int unsigned NOT NULL,
  `monto` decimal(8,2) NOT NULL,
  `meses` tinyint unsigned NOT NULL DEFAULT '1',
  `metodo` enum('qr','transferencia','tarjeta','efectivo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'qr',
  `referencia` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('pendiente','confirmado','rechazado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `revisado_por` int unsigned DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_pagos_estado` (`estado`),
  KEY `fk_pagos_suscripcion` (`suscripcion_id`),
  KEY `fk_pagos_usuario` (`usuario_id`),
  KEY `fk_pagos_revisor` (`revisado_por`),
  CONSTRAINT `fk_pagos_revisor` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pagos_suscripcion` FOREIGN KEY (`suscripcion_id`) REFERENCES `suscripciones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pagos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `planes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `precio_mes` decimal(8,2) NOT NULL DEFAULT '0.00',
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_planes_codigo` (`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `planes` (`id`,`codigo`,`nombre`,`precio_mes`,`descripcion`,`activo`) VALUES ('1','gratis','Gratis','0.00','Laboratorios y libros de muestra','1');
INSERT INTO `planes` (`id`,`codigo`,`nombre`,`precio_mes`,`descripcion`,`activo`) VALUES ('2','premium','Premium mensual','35.00','Todo el catálogo público de laboratorios 3D y libros','1');
CREATE TABLE `practicas` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `estudiante_id` int unsigned NOT NULL,
  `laboratorio_id` int unsigned NOT NULL,
  `clase_id` int unsigned DEFAULT NULL,
  `modalidad` enum('3D','VR') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '3D',
  `realizada_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `duracion_min` smallint unsigned DEFAULT NULL,
  `puntaje` tinyint unsigned DEFAULT NULL,
  `completada` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `ix_practicas_estudiante` (`estudiante_id`),
  KEY `ix_practicas_clase` (`clase_id`),
  KEY `fk_pr_laboratorio` (`laboratorio_id`),
  CONSTRAINT `fk_pr_clase` FOREIGN KEY (`clase_id`) REFERENCES `clases` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_estudiante` FOREIGN KEY (`estudiante_id`) REFERENCES `estudiantes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_laboratorio` FOREIGN KEY (`laboratorio_id`) REFERENCES `laboratorios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `solicitudes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `institucion` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mensaje` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` enum('nueva','en_proceso','cotizada','cerrada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'nueva',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `suscripciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `plan_id` int unsigned NOT NULL,
  `estado` enum('pendiente','activa','vencida','cancelada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_suscripciones_usuario` (`usuario_id`,`estado`),
  KEY `fk_sus_plan` (`plan_id`),
  CONSTRAINT `fk_sus_plan` FOREIGN KEY (`plan_id`) REFERENCES `planes` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sus_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `universidades` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sigla` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` enum('universidad','instituto','colegio') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'universidad',
  `ciudad` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pais` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Bolivia',
  `email_contacto` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_universidades_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `universidades` (`id`,`nombre`,`sigla`,`tipo`,`ciudad`,`pais`,`email_contacto`,`telefono`,`activo`,`creado_en`,`actualizado_en`) VALUES ('1','Universidad Privada del Valle','Univalle','universidad','Cochabamba','Bolivia',NULL,NULL,'1','2026-10-20 15:43:30',NULL);
INSERT INTO `universidades` (`id`,`nombre`,`sigla`,`tipo`,`ciudad`,`pais`,`email_contacto`,`telefono`,`activo`,`creado_en`,`actualizado_en`) VALUES ('2','Instituto Técnico de Salud (demo)','ITS','instituto','La Paz','Bolivia',NULL,NULL,'1','2026-10-20 15:43:30',NULL);
INSERT INTO `universidades` (`id`,`nombre`,`sigla`,`tipo`,`ciudad`,`pais`,`email_contacto`,`telefono`,`activo`,`creado_en`,`actualizado_en`) VALUES ('3','Colegio San Martín (demo)','CSM','colegio','Santa Cruz','Bolivia',NULL,NULL,'1','2026-10-20 15:43:30',NULL);
CREATE TABLE `usuarios` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `apellido` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rol` enum('admin','director','docente','estudiante') COLLATE utf8mb4_unicode_ci NOT NULL,
  `universidad_id` int unsigned DEFAULT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `ultimo_acceso` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_email` (`email`),
  KEY `ix_usuarios_rol` (`rol`),
  KEY `fk_usuarios_universidad` (`universidad_id`),
  CONSTRAINT `fk_usuarios_universidad` FOREIGN KEY (`universidad_id`) REFERENCES `universidades` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SET FOREIGN_KEY_CHECKS=1;
SET FOREIGN_KEY_CHECKS=0;
INSERT INTO usuarios (id,nombre,apellido,email,password_hash,rol,activo) VALUES (1,'Administración','ORBIT','admin@orbit.bo','$2y$10$0Dw3EW70QZvafHHXc4pL5eGVLKZu2xd/ef/GFjPFBXT8qKBWvWbue','admin',1);
UPDATE laboratorios SET creado_por = NULL;
SET FOREIGN_KEY_CHECKS=1;

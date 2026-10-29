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
INSERT INTO `clase_laboratorio` (`clase_id`,`laboratorio_id`,`fecha_limite`,`asignado_en`) VALUES ('1','1','2026-11-15','2026-10-20 15:43:30');
INSERT INTO `clase_laboratorio` (`clase_id`,`laboratorio_id`,`fecha_limite`,`asignado_en`) VALUES ('2','2','2026-11-30','2026-10-20 15:43:30');
INSERT INTO `clase_laboratorio` (`clase_id`,`laboratorio_id`,`fecha_limite`,`asignado_en`) VALUES ('4','2',NULL,'2026-10-20 15:43:30');
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `clases` (`id`,`carrera_id`,`docente_id`,`nombre`,`codigo`,`descripcion`,`periodo`,`horario`,`aula`,`cupo`,`estado`,`creado_en`,`actualizado_en`) VALUES ('1','1','1','Equipos de soporte vital','IBM-410','Funcionamiento y mantenimiento de ventiladores mecánicos.','2026-II','Lun y Mié 08:00–10:00','Lab. Biomédica 2','30','activa','2026-10-20 15:43:30',NULL);
INSERT INTO `clases` (`id`,`carrera_id`,`docente_id`,`nombre`,`codigo`,`descripcion`,`periodo`,`horario`,`aula`,`cupo`,`estado`,`creado_en`,`actualizado_en`) VALUES ('2','1','1','Imagenología médica','IBM-520','Principios y mantenimiento de equipos de tomografía.','2026-II','Mar y Jue 10:00–12:00','Lab. Biomédica 1','25','activa','2026-10-20 15:43:30',NULL);
INSERT INTO `clases` (`id`,`carrera_id`,`docente_id`,`nombre`,`codigo`,`descripcion`,`periodo`,`horario`,`aula`,`cupo`,`estado`,`creado_en`,`actualizado_en`) VALUES ('3','4','2','Teorías de la personalidad','PSI-230','Freud, Jung y Vygotsky con libros en Realidad Aumentada.','2026-II','Vie 14:00–17:00','Aula 305','40','activa','2026-10-20 15:43:30',NULL);
INSERT INTO `clases` (`id`,`carrera_id`,`docente_id`,`nombre`,`codigo`,`descripcion`,`periodo`,`horario`,`aula`,`cupo`,`estado`,`creado_en`,`actualizado_en`) VALUES ('4','5','3','Tomografía computarizada I','RAD-201',NULL,'2027-I',NULL,NULL,'20','planificada','2026-10-20 15:43:30',NULL);
CREATE TABLE `docente_carrera` (
  `docente_id` int unsigned NOT NULL,
  `carrera_id` int unsigned NOT NULL,
  PRIMARY KEY (`docente_id`,`carrera_id`),
  KEY `fk_dc_carrera` (`carrera_id`),
  CONSTRAINT `fk_dc_carrera` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dc_docente` FOREIGN KEY (`docente_id`) REFERENCES `docentes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `docente_carrera` (`docente_id`,`carrera_id`) VALUES ('1','1');
INSERT INTO `docente_carrera` (`docente_id`,`carrera_id`) VALUES ('1','2');
INSERT INTO `docente_carrera` (`docente_id`,`carrera_id`) VALUES ('2','4');
INSERT INTO `docente_carrera` (`docente_id`,`carrera_id`) VALUES ('3','5');
CREATE TABLE `docentes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int unsigned NOT NULL,
  `especialidad` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `grado_academico` enum('Licenciatura','Especialidad','Maestría','Doctorado') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_docentes_usuario` (`usuario_id`),
  CONSTRAINT `fk_docentes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `docentes` (`id`,`usuario_id`,`especialidad`,`grado_academico`,`creado_en`) VALUES ('1','2','Equipos médicos y soporte vital','Maestría','2026-10-20 15:43:30');
INSERT INTO `docentes` (`id`,`usuario_id`,`especialidad`,`grado_academico`,`creado_en`) VALUES ('2','3','Psicología de la personalidad','Doctorado','2026-10-20 15:43:30');
INSERT INTO `docentes` (`id`,`usuario_id`,`especialidad`,`grado_academico`,`creado_en`) VALUES ('3','4','Imagenología','Especialidad','2026-10-20 15:43:30');
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('1','5','institucional','1','IBM-2023-014','6','2023-02-01','2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('2','6','institucional','1','IBM-2023-027','6','2023-02-01','2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('3','7','institucional','2','MED-2022-102','8','2022-02-01','2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('4','8','institucional','4','PSI-2024-033','4','2024-02-01','2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('5','9','institucional','4','PSI-2024-041','4','2024-02-01','2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('6','10','institucional','5','RAD-2025-008','2','2025-02-01','2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('7','11','independiente',NULL,'LIBRE-000011',NULL,NULL,'2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('8','12','independiente',NULL,'LIBRE-000012',NULL,NULL,'2026-10-20 15:43:30');
INSERT INTO `estudiantes` (`id`,`usuario_id`,`tipo`,`carrera_id`,`codigo`,`semestre`,`fecha_ingreso`,`creado_en`) VALUES ('9','13','independiente',NULL,'LIBRE-000013',NULL,NULL,'2026-10-20 15:43:30');
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('1','1','1','inscrito',NULL,'2026-10-20 15:43:30');
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('2','1','2','inscrito',NULL,'2026-10-20 15:43:30');
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('3','1','3','inscrito',NULL,'2026-10-20 15:43:30');
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('4','2','1','inscrito',NULL,'2026-10-20 15:43:30');
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('5','2','2','inscrito',NULL,'2026-10-20 15:43:30');
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('6','3','4','inscrito',NULL,'2026-10-20 15:43:30');
INSERT INTO `inscripciones` (`id`,`clase_id`,`estudiante_id`,`estado`,`nota_final`,`inscrito_en`) VALUES ('7','3','5','aprobado','88.50','2026-10-20 15:43:30');
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_laboratorios_nombre` (`nombre`),
  KEY `ix_laboratorios_estado` (`estado`),
  KEY `fk_lab_solicitante` (`solicitado_por`),
  CONSTRAINT `fk_lab_solicitante` FOREIGN KEY (`solicitado_por`) REFERENCES `universidades` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('1','VentLab: ventilador mecánico','Salud','Dräger Savina 300','Componentes, funcionamiento y mantenimiento guiado de un ventilador mecánico.',NULL,'img/ventilador.webp','1','publicado','1','1','0','2026-10-20 15:43:30',NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('2','CT Virtual Lab: tomógrafo','Salud','Siemens SOMATOM','Cómo está hecho un tomógrafo, cómo funciona y cómo se mantiene.',NULL,'img/tomografo.webp','1','publicado','1','1','0','2026-10-20 15:43:30',NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('3','Corazón humano en 3D','Salud',NULL,'Cavidades, válvulas y circulación del corazón para girar y explorar.',NULL,'img/aula.webp','0','publicado',NULL,'1','1','2026-10-20 15:43:30',NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('4','Desfibrilador externo','Salud',NULL,'Partes del equipo, carga y descarga segura.',NULL,'img/doctora-vr.webp','0','en_desarrollo','1','0','0','2026-10-20 15:43:30',NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('5','Monitor de signos vitales','Salud',NULL,'Pedido por Univalle para el piloto.',NULL,'img/estudiantes-vr.webp','0','solicitado','1','0','0','2026-10-20 15:43:30',NULL);
INSERT INTO `laboratorios` (`id`,`nombre`,`area`,`equipo`,`descripcion`,`modelo_url`,`imagen_url`,`vr_disponible`,`estado`,`solicitado_por`,`catalogo_publico`,`gratis`,`creado_en`,`actualizado_en`) VALUES ('6','M2 · Celda robotizada: robot, PLC y HMI','Otra','Robot industrial, cinta transportadora, PLC y HMI','Práctica interactiva de puesta en marcha: carga una pieza, cierra la puerta de seguridad, energiza la celda, enseña los puntos de toma y depósito y ejecuta el ciclo. Finaliza aislando el equipo y descarga tu informe. Usa computadora y mouse.','simuladores/m2/index.html',NULL,'0','publicado','1','1','1','2026-10-20 20:51:07','2026-10-20 20:54:27');
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
INSERT INTO `libro_resultados` (`id`,`estudiante_id`,`libro_id`,`tema`,`puntaje`,`realizado_en`) VALUES ('1','4','1','Sublimación','90','2026-10-09 15:10:00');
INSERT INTO `libro_resultados` (`id`,`estudiante_id`,`libro_id`,`tema`,`puntaje`,`realizado_en`) VALUES ('2','4','1','Ello, Yo y Superyó','80','2026-10-09 15:25:00');
INSERT INTO `libro_resultados` (`id`,`estudiante_id`,`libro_id`,`tema`,`puntaje`,`realizado_en`) VALUES ('3','5','1','Sublimación','100','2026-10-10 14:40:00');
INSERT INTO `libro_resultados` (`id`,`estudiante_id`,`libro_id`,`tema`,`puntaje`,`realizado_en`) VALUES ('4','5','2','Arquetipos','85','2026-10-17 15:05:00');
INSERT INTO `libro_resultados` (`id`,`estudiante_id`,`libro_id`,`tema`,`puntaje`,`realizado_en`) VALUES ('5','8','2','Sombra','100','2026-10-20 15:57:13');
INSERT INTO `libro_resultados` (`id`,`estudiante_id`,`libro_id`,`tema`,`puntaje`,`realizado_en`) VALUES ('6','8','2','Individuación','100','2026-10-20 15:57:20');
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
INSERT INTO `licencias` (`id`,`universidad_id`,`plan`,`precio_estudiante_mes`,`estudiantes_max`,`fecha_inicio`,`fecha_fin`,`estado`,`notas`,`creado_en`) VALUES ('1','1','piloto','0.00','60','2026-08-01','2026-12-15','activa','Piloto acompañado de un semestre','2026-10-20 15:43:30');
INSERT INTO `licencias` (`id`,`universidad_id`,`plan`,`precio_estudiante_mes`,`estudiantes_max`,`fecha_inicio`,`fecha_fin`,`estado`,`notas`,`creado_en`) VALUES ('2','2','institucional','35.00','120','2026-09-01','2027-08-31','activa',NULL,'2026-10-20 15:43:30');
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
INSERT INTO `pagos` (`id`,`suscripcion_id`,`usuario_id`,`monto`,`meses`,`metodo`,`referencia`,`estado`,`revisado_por`,`revisado_en`,`creado_en`) VALUES ('1','1','12','35.00','1','qr','QR-884512','confirmado','1','2026-10-05 15:43:30','2026-10-20 15:43:30');
INSERT INTO `pagos` (`id`,`suscripcion_id`,`usuario_id`,`monto`,`meses`,`metodo`,`referencia`,`estado`,`revisado_por`,`revisado_en`,`creado_en`) VALUES ('2','2','13','35.00','1','transferencia','TRX-55120','pendiente',NULL,NULL,'2026-10-20 15:43:30');
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('1','1','1','1','VR','2026-10-06 08:30:00','25','78','1');
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('2','1','1','1','3D','2026-10-13 08:20:00','22','91','1');
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('3','2','1','1','3D','2026-10-08 09:10:00','30','64','0');
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('4','3','1','1','VR','2026-10-15 08:45:00','27','85','1');
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('5','1','2','2','3D','2026-10-14 10:30:00','35','72','1');
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('6','3','3',NULL,'3D','2026-10-16 19:10:00','12',NULL,'1');
INSERT INTO `practicas` (`id`,`estudiante_id`,`laboratorio_id`,`clase_id`,`modalidad`,`realizada_en`,`duracion_min`,`puntaje`,`completada`) VALUES ('7','8','1',NULL,'3D','2026-10-12 21:00:00','18','80','1');
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
INSERT INTO `solicitudes` (`id`,`nombre`,`institucion`,`email`,`tipo`,`mensaje`,`estado`,`creado_en`) VALUES ('1','Rosa Fernández','Hospital Obrero (demo)','rosa@ejemplo.bo','Capacitación para empresas','Queremos capacitar al personal de UTI en el uso del ventilador.','nueva','2026-10-20 15:43:30');
INSERT INTO `solicitudes` (`id`,`nombre`,`institucion`,`email`,`tipo`,`mensaje`,`estado`,`creado_en`) VALUES ('2','Editorial Andina (demo)','Editorial Andina','contacto@andina-demo.bo','Realidad Aumentada para libros o materiales','Nos interesa integrar RA en nuestros libros de biología de secundaria.','en_proceso','2026-10-20 15:43:30');
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
INSERT INTO `suscripciones` (`id`,`usuario_id`,`plan_id`,`estado`,`fecha_inicio`,`fecha_fin`,`creado_en`) VALUES ('1','12','2','activa','2026-10-05','2026-11-04','2026-10-20 15:43:30');
INSERT INTO `suscripciones` (`id`,`usuario_id`,`plan_id`,`estado`,`fecha_inicio`,`fecha_fin`,`creado_en`) VALUES ('2','13','2','pendiente',NULL,NULL,'2026-10-20 15:43:30');
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
  `rol` enum('admin','docente','estudiante') COLLATE utf8mb4_unicode_ci NOT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('1','Administrador','ORBIT','admin@orbit.bo','$2y$10$IvGmiHTuH4EvRB8PkJJGOOb5l4nj3zqP51AMnY25QGS3SYTh6LeBO','admin',NULL,NULL,'1','2026-10-20 20:51:07','2026-10-20 15:43:30','2026-10-20 20:51:07');
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('2','Carla','Rojas Vargas','docente@orbit.bo','$2y$10$PnanZ4GwoHfC/PPM1VO9z.a1HmGBzwlexzYbJXjrtdGhZwmKu3XX6','docente','1','70711111','1','2026-10-20 16:26:45','2026-10-20 15:43:30','2026-10-20 16:26:45');
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('3','Marco','Gutiérrez Soto','mgutierrez@orbit.bo','$2y$10$PnanZ4GwoHfC/PPM1VO9z.a1HmGBzwlexzYbJXjrtdGhZwmKu3XX6','docente','1','70722222','1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('4','Lucía','Paredes Quiroga','lparedes@orbit.bo','$2y$10$PnanZ4GwoHfC/PPM1VO9z.a1HmGBzwlexzYbJXjrtdGhZwmKu3XX6','docente','2',NULL,'1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('5','Ana','Mamani Flores','estudiante@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante','1','71000001','1','2026-10-20 16:28:28','2026-10-20 15:43:30','2026-10-20 16:28:28');
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('6','Diego','Choque Rivera','dchoque@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante','1',NULL,'1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('7','Valeria','Torrez Medina','vtorrez@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante','1',NULL,'1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('8','Joaquín','Arce Peña','jarce@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante','1',NULL,'1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('9','Camila','Vargas Luna','cvargas@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante','1',NULL,'1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('10','Mateo','Quispe Rocha','mquispe@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante','2',NULL,'1',NULL,'2026-10-20 15:43:30',NULL);
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('11','Sofía','Ortiz Calle','libre@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante',NULL,NULL,'1','2026-10-20 16:30:15','2026-10-20 15:43:30','2026-10-20 16:30:15');
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('12','Bruno','Céspedes Lara','premium@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante',NULL,NULL,'1','2026-10-20 16:31:06','2026-10-20 15:43:30','2026-10-20 16:31:06');
INSERT INTO `usuarios` (`id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`universidad_id`,`telefono`,`activo`,`ultimo_acceso`,`creado_en`,`actualizado_en`) VALUES ('13','Nicolás','Pinto Aguilar','npinto@orbit.bo','$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy','estudiante',NULL,NULL,'1',NULL,'2026-10-20 15:43:30',NULL);

-- ORBIT — datos de prueba
-- Usuarios de prueba (cambia estas contraseñas antes de publicar el sitio):
--   Admin                                       admin@orbit.bo        Admin123!
--   Docente                                     docente@orbit.bo      Docente123!
--   Estudiante de Univalle                      estudiante@orbit.bo   Estudiante123!
--   Estudiante independiente (plan Gratis)      libre@orbit.bo        Estudiante123!
--   Estudiante independiente (Premium activo)   premium@orbit.bo      Estudiante123!
-- Los demás docentes y estudiantes de ejemplo usan Docente123! / Estudiante123!

SET NAMES utf8mb4;

INSERT INTO universidades (id, nombre, sigla, tipo, ciudad, pais, email_contacto, telefono) VALUES
  (1, 'Universidad Privada del Valle', 'Univalle', 'universidad', 'Cochabamba', 'Bolivia', NULL, NULL),
  (2, 'Instituto Técnico de Salud (demo)', 'ITS', 'instituto', 'La Paz', 'Bolivia', NULL, NULL),
  (3, 'Colegio San Martín (demo)', 'CSM', 'colegio', 'Santa Cruz', 'Bolivia', NULL, NULL);

INSERT INTO carreras (id, universidad_id, nombre, codigo, area, duracion_semestres) VALUES
  (1, 1, 'Ingeniería Biomédica', 'IBM', 'Ingeniería y técnica', 10),
  (2, 1, 'Medicina', 'MED', 'Salud', 12),
  (3, 1, 'Enfermería', 'ENF', 'Salud', 10),
  (4, 1, 'Psicología', 'PSI', 'Ciencias sociales', 10),
  (5, 2, 'Técnico Superior en Radiología', 'RAD', 'Salud', 6);

-- Contraseñas: Admin123! / Docente123! / Estudiante123!
INSERT INTO usuarios (id, nombre, apellido, email, password_hash, rol, universidad_id, telefono) VALUES
  (1,  'Administrador', 'ORBIT',     'admin@orbit.bo',       '$2y$10$IvGmiHTuH4EvRB8PkJJGOOb5l4nj3zqP51AMnY25QGS3SYTh6LeBO', 'admin',      NULL, NULL),
  (2,  'Carla',   'Rojas Vargas',    'docente@orbit.bo',     '$2y$10$PnanZ4GwoHfC/PPM1VO9z.a1HmGBzwlexzYbJXjrtdGhZwmKu3XX6', 'docente',    1, '70711111'),
  (3,  'Marco',   'Gutiérrez Soto',  'mgutierrez@orbit.bo',  '$2y$10$PnanZ4GwoHfC/PPM1VO9z.a1HmGBzwlexzYbJXjrtdGhZwmKu3XX6', 'docente',    1, '70722222'),
  (4,  'Lucía',   'Paredes Quiroga', 'lparedes@orbit.bo',    '$2y$10$PnanZ4GwoHfC/PPM1VO9z.a1HmGBzwlexzYbJXjrtdGhZwmKu3XX6', 'docente',    2, NULL),
  (5,  'Ana',     'Mamani Flores',   'estudiante@orbit.bo',  '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', 1, '71000001'),
  (6,  'Diego',   'Choque Rivera',   'dchoque@orbit.bo',     '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', 1, NULL),
  (7,  'Valeria', 'Torrez Medina',   'vtorrez@orbit.bo',     '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', 1, NULL),
  (8,  'Joaquín', 'Arce Peña',       'jarce@orbit.bo',       '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', 1, NULL),
  (9,  'Camila',  'Vargas Luna',     'cvargas@orbit.bo',     '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', 1, NULL),
  (10, 'Mateo',   'Quispe Rocha',    'mquispe@orbit.bo',     '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', 2, NULL),
  (11, 'Sofía',   'Ortiz Calle',     'libre@orbit.bo',       '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', NULL, NULL),
  (12, 'Bruno',   'Céspedes Lara',   'premium@orbit.bo',     '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', NULL, NULL),
  (13, 'Nicolás', 'Pinto Aguilar',   'npinto@orbit.bo',      '$2y$10$KD3TrXVth5UE9oCNCj4/Ceki.wpmJ6nUazk2ngWYnJNZ48Rrk5hhy', 'estudiante', NULL, NULL);

INSERT INTO docentes (id, usuario_id, especialidad, grado_academico) VALUES
  (1, 2, 'Equipos médicos y soporte vital', 'Maestría'),
  (2, 3, 'Psicología de la personalidad', 'Doctorado'),
  (3, 4, 'Imagenología', 'Especialidad');

INSERT INTO docente_carrera (docente_id, carrera_id) VALUES
  (1, 1), (1, 2), (2, 4), (3, 5);

INSERT INTO estudiantes (id, usuario_id, tipo, carrera_id, codigo, semestre, fecha_ingreso) VALUES
  (1, 5,  'institucional', 1, 'IBM-2023-014', 6, '2023-02-01'),
  (2, 6,  'institucional', 1, 'IBM-2023-027', 6, '2023-02-01'),
  (3, 7,  'institucional', 2, 'MED-2022-102', 8, '2022-02-01'),
  (4, 8,  'institucional', 4, 'PSI-2024-033', 4, '2024-02-01'),
  (5, 9,  'institucional', 4, 'PSI-2024-041', 4, '2024-02-01'),
  (6, 10, 'institucional', 5, 'RAD-2025-008', 2, '2025-02-01'),
  (7, 11, 'independiente', NULL, 'LIBRE-000011', NULL, NULL),
  (8, 12, 'independiente', NULL, 'LIBRE-000012', NULL, NULL),
  (9, 13, 'independiente', NULL, 'LIBRE-000013', NULL, NULL);

-- Laboratorios: hoy en 3D (navegador); vr_disponible = 1 si ya existe la versión para visor
INSERT INTO laboratorios (id, nombre, area, equipo, descripcion, imagen_url, vr_disponible, estado, solicitado_por, catalogo_publico, gratis) VALUES
  (1, 'VentLab: ventilador mecánico', 'Salud', 'Dräger Savina 300', 'Componentes, funcionamiento y mantenimiento guiado de un ventilador mecánico.', 'img/ventilador.webp', 1, 'publicado', 1, 1, 0),
  (2, 'CT Virtual Lab: tomógrafo', 'Salud', 'Siemens SOMATOM', 'Cómo está hecho un tomógrafo, cómo funciona y cómo se mantiene.', 'img/tomografo.webp', 1, 'publicado', 1, 1, 0),
  (3, 'Corazón humano en 3D', 'Salud', NULL, 'Cavidades, válvulas y circulación del corazón para girar y explorar.', 'img/aula.webp', 0, 'publicado', NULL, 1, 1),
  (4, 'Desfibrilador externo', 'Salud', NULL, 'Partes del equipo, carga y descarga segura.', 'img/doctora-vr.webp', 0, 'en_desarrollo', 1, 0, 0),
  (5, 'Monitor de signos vitales', 'Salud', NULL, 'Pedido por Univalle para el piloto.', 'img/estudiantes-vr.webp', 0, 'solicitado', 1, 0, 0);

-- Qué carreras ven cada laboratorio
INSERT INTO laboratorio_carrera (laboratorio_id, carrera_id) VALUES
  (1, 1), (1, 2), (1, 3),
  (2, 1), (2, 5),
  (3, 2), (3, 3),
  (4, 1), (4, 3),
  (5, 2), (5, 3);

-- Libros AR: al apuntar la cámara a cada página, un personaje 3D explica el tema y cierra con un quiz
INSERT INTO libros (id, titulo, autor, materia, descripcion, temas, portada_url, estado, catalogo_publico, gratis) VALUES
  (1, 'Sigmund Freud en Realidad Aumentada', 'Equipo ORBIT', 'Psicología', 'Freud aparece sobre la página y explica sus ideas principales; tú eliges qué preguntas explorar.', 'Sublimación\nEllo, Yo y Superyó\nEl arte\nLos sueños', 'img/ar-celular.webp', 'publicado', 1, 1),
  (2, 'Carl Gustav Jung en Realidad Aumentada', 'Equipo ORBIT', 'Psicología', 'Jung presenta el inconsciente colectivo con ejemplos visuales en 3D.', 'Arquetipos\nMandala\nSelf\nSombra\nIndividuación\nInconsciente colectivo', 'img/ar-tablet.webp', 'publicado', 1, 0),
  (3, 'Lev Vygotsky en Realidad Aumentada', 'Equipo ORBIT', 'Psicología', 'Vygotsky explica cómo aprendemos con otros, con preguntas interactivas.', 'Aprendizaje social\nCultura\nJuego simbólico\nZona de desarrollo próximo\nLenguaje privado\nFunciones ejecutivas', 'img/ecosistema.webp', 'publicado', 1, 0);

INSERT INTO libro_carrera (libro_id, carrera_id) VALUES
  (1, 4), (2, 4), (3, 4);

INSERT INTO libro_resultados (estudiante_id, libro_id, tema, puntaje, realizado_en) VALUES
  (4, 1, 'Sublimación', 90, '2026-10-09 15:10:00'),
  (4, 1, 'Ello, Yo y Superyó', 80, '2026-10-09 15:25:00'),
  (5, 1, 'Sublimación', 100, '2026-10-10 14:40:00'),
  (5, 2, 'Arquetipos', 85, '2026-10-17 15:05:00');

INSERT INTO clases (id, carrera_id, docente_id, nombre, codigo, descripcion, periodo, horario, aula, cupo, estado) VALUES
  (1, 1, 1, 'Equipos de soporte vital', 'IBM-410', 'Funcionamiento y mantenimiento de ventiladores mecánicos.', '2026-II', 'Lun y Mié 08:00–10:00', 'Lab. Biomédica 2', 30, 'activa'),
  (2, 1, 1, 'Imagenología médica', 'IBM-520', 'Principios y mantenimiento de equipos de tomografía.', '2026-II', 'Mar y Jue 10:00–12:00', 'Lab. Biomédica 1', 25, 'activa'),
  (3, 4, 2, 'Teorías de la personalidad', 'PSI-230', 'Freud, Jung y Vygotsky con libros en Realidad Aumentada.', '2026-II', 'Vie 14:00–17:00', 'Aula 305', 40, 'activa'),
  (4, 5, 3, 'Tomografía computarizada I', 'RAD-201', NULL, '2027-I', NULL, NULL, 20, 'planificada');

INSERT INTO inscripciones (clase_id, estudiante_id, estado, nota_final) VALUES
  (1, 1, 'inscrito', NULL),
  (1, 2, 'inscrito', NULL),
  (1, 3, 'inscrito', NULL),
  (2, 1, 'inscrito', NULL),
  (2, 2, 'inscrito', NULL),
  (3, 4, 'inscrito', NULL),
  (3, 5, 'aprobado', 88.50);

INSERT INTO clase_laboratorio (clase_id, laboratorio_id, fecha_limite) VALUES
  (1, 1, '2026-11-15'),
  (2, 2, '2026-11-30'),
  (4, 2, NULL);

INSERT INTO practicas (estudiante_id, laboratorio_id, clase_id, modalidad, realizada_en, duracion_min, puntaje, completada) VALUES
  (1, 1, 1, 'VR', '2026-10-06 08:30:00', 25, 78, 1),
  (1, 1, 1, '3D', '2026-10-13 08:20:00', 22, 91, 1),
  (2, 1, 1, '3D', '2026-10-08 09:10:00', 30, 64, 0),
  (3, 1, 1, 'VR', '2026-10-15 08:45:00', 27, 85, 1),
  (1, 2, 2, '3D', '2026-10-14 10:30:00', 35, 72, 1),
  (3, 3, NULL, '3D', '2026-10-16 19:10:00', 12, NULL, 1),
  (8, 1, NULL, '3D', '2026-10-12 21:00:00', 18, 80, 1);

INSERT INTO licencias (universidad_id, plan, precio_estudiante_mes, estudiantes_max, fecha_inicio, fecha_fin, estado, notas) VALUES
  (1, 'piloto', 0.00, 60, '2026-08-01', '2026-12-15', 'activa', 'Piloto acompañado de un semestre'),
  (2, 'institucional', 35.00, 120, '2026-09-01', '2027-08-31', 'activa', NULL);

-- Freemium: plan Gratis (muestras) y Premium mensual (el precio se edita desde el panel)
INSERT INTO planes (id, codigo, nombre, precio_mes, descripcion) VALUES
  (1, 'gratis', 'Gratis', 0.00, 'Laboratorios y libros de muestra'),
  (2, 'premium', 'Premium mensual', 35.00, 'Todo el catálogo público de laboratorios 3D y libros');

-- Bruno tiene Premium vigente; Nicolás reportó un pago que el admin aún debe confirmar
INSERT INTO suscripciones (id, usuario_id, plan_id, estado, fecha_inicio, fecha_fin) VALUES
  (1, 12, 2, 'activa', CURDATE() - INTERVAL 15 DAY, CURDATE() + INTERVAL 15 DAY),
  (2, 13, 2, 'pendiente', NULL, NULL);

INSERT INTO pagos (suscripcion_id, usuario_id, monto, meses, metodo, referencia, estado, revisado_por, revisado_en) VALUES
  (1, 12, 35.00, 1, 'qr', 'QR-884512', 'confirmado', 1, NOW() - INTERVAL 15 DAY),
  (2, 13, 35.00, 1, 'transferencia', 'TRX-55120', 'pendiente', NULL, NULL);

INSERT INTO solicitudes (nombre, institucion, email, tipo, mensaje, estado) VALUES
  ('Rosa Fernández', 'Hospital Obrero (demo)', 'rosa@ejemplo.bo', 'Capacitación para empresas', 'Queremos capacitar al personal de UTI en el uso del ventilador.', 'nueva'),
  ('Editorial Andina (demo)', 'Editorial Andina', 'contacto@andina-demo.bo', 'Realidad Aumentada para libros o materiales', 'Nos interesa integrar RA en nuestros libros de biología de secundaria.', 'en_proceso');

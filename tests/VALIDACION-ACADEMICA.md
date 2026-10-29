# Validación académica de ORBIT

21 de octubre de 2026.

- Copia de seguridad de las 20 tablas originales antes de la migración. Las tres tablas nuevas son directores, notas_historial y certificados. Los registros originales se conservaron.
- Instalación nueva: esquema y datos de ejemplo ejecutados en una base temporal independiente; 23 tablas creadas correctamente. La base temporal se eliminó tras verificarla.
- Pruebas de integración HTTP correctas: alta/edición de director por administrador; inicio de sesión de los cuatro roles; aislamiento por carrera y docente; rechazo de edición de notas por director; creación de laboratorio y asignación forzada a la carrera del director; rechazo de modificación de laboratorios ajenos; creación de clase e inscripción por docente.
- Dos intentos completos del mismo laboratorio produjeron 100% de avance y un solo laboratorio completado. Certificado rechazado sin finalización o aprobación. Certificado emitido tras aprobar, reutilizado sin duplicar y protegido frente a otro estudiante.
- Historial de notas confirmado con valor anterior, nuevo y responsable. En navegador, el docente guardó una nota temporal de 85 a 86, y el historial lo reflejó.
- Interfaz revisada: formulario de director con carreras y contraseña inicial; formulario de laboratorio del director; inscripción y nota del docente; aviso del SIU sin conexión; certificado ORBIT imprimible.
- Todos los datos y cuentas temporales de las pruebas se retiraron. No se crearon cuentas de director permanentes: se administran desde el panel.

El SIU sigue deliberadamente sin integración. La emisión se basa en las prácticas registradas y la aprobación docente; el simulador M2 mantiene su registro de prácticas existente desde el panel, y no hay validación industrial ni firma externa del certificado.

# Revisión de ORBIT · 5 de noviembre de 2026

Se revisaron el servidor Node/Express activo, autenticación y sesiones, rutas de
los cuatro roles, prácticas, certificados, importación, pagos, activos privados,
interfaz académica, integración pendiente de Unity, esquema y migraciones MySQL,
respaldo y configuración de despliegue. Las carpetas de versiones, el despliegue
PHP anterior y sus archivos ZIP son históricos; no constituyen el servidor actual.

El resultado es una base reforzada y verificada localmente. **No se realizó un
despliegue ni se declara validado un alojamiento de producción.** Las pruebas
se ejecutaron en una instancia MySQL aislada, con datos ficticios y remitente de
correo simulado. Después, por solicitud explícita del usuario, se respaldó y
migró la base local `orbit` y se archivaron sus seis laboratorios de muestra con
sus tres asignaciones. Las siete prácticas históricas se conservaron. La
intervención está documentada en [DEMO-LABS-CLEANUP.md](DEMO-LABS-CLEANUP.md).

## Prácticas y Unity

- Docencia puede abrir y probar los laboratorios de sus carreras, incluidos
  aquellos en desarrollo. El modo docente no crea intentos de estudiantes ni notas.
- El escenario Unity queda vacío, con el aviso de preparación fuera del área de
  ejecución. No se carga el build anterior. El estudiante no puede guardar una
  práctica de Unity pendiente ni una práctica sin contenido.
- `UNITY_WEBGL_ENABLED=false` es el valor seguro por defecto. Para habilitarlo hay
  que publicar la nueva compilación WebGL y su plantilla, reemplazar la plantilla
  M2 vacía y probarla desde el panel con las cuentas autorizadas. La variable por
  sí sola no instala el simulador. Se mantiene la autorización de sus archivos
  también al acceder directamente por URL.
- El visor GLB controla carga, error y espera agotada. No cuenta tiempo ni permite
  guardar mientras el recurso no haya cargado; ofrece reintento ante errores.
- Guardar un recorrido y la autoevaluación de un libro son declaraciones del
  estudiante. La calificación final corresponde al docente autorizado. Falta
  diseñar la rúbrica y validación de resultados Unity en el servidor para tener
  evaluación automática confiable. El SIU universitario sigue sin integrarse.

## Correcciones de seguridad e integridad

- Auditoría persistente de cambios administrativos y académicos, credenciales y
  accesos exitosos. Las denegaciones HTTP 401/403/419/429 se registran sin guardar
  cuerpos, cookies o códigos de autenticación. Si no puede persistirse una
  denegación, se emite un evento operativo `AUDIT_UNAVAILABLE` con request ID.
- Una mutación de negocio que falla al escribir su auditoría se revierte en la
  misma transacción. Se comprobó mediante inyección de un fallo del registro.
- `GET /api/auditoria` y la vista de auditoría son exclusivos de administración.
  La API tiene filtros, límite de hasta 100 registros y cursor por ID.
- Los datos de negocio se retiran mediante baja lógica: `deleted_at` y
  `deleted_by` conservan fecha y responsable, y los registros dejan de aparecer
  en el uso normal. Retirar una inscripción conserva su fila con estado
  `retirado`; reingresar también registra el cambio de nota/estado. Las notas,
  certificados emitidos y auditoría siguen disponibles como historial autorizado.
  Las asignaciones retiradas conservan su clave compuesta y pueden reasignarse
  sin duplicar filas. No hay eliminación física de negocio desde las rutas.
  Sesiones, códigos y límites temporales sí se depuran para la seguridad operativa.
- Inscripciones de la misma carrera, cupos y estados de aprobación coherentes con
  la nota. Bloqueos de filas evitan comprobar requisitos y emitir certificados
  sobre estados que cambian a mitad de la operación.
- Cambiar correo, contraseña o estado de cuenta desde administración revoca las
  sesiones anteriores. Los cambios de cuenta propia también quedan auditados.
- Las rutas estáticas rechazan alias codificados antes de autorizar o servir
  archivos; las respuestas privadas y páginas con nonce no se almacenan en caché.
  Se comprueban origen y CSRF, también en retiradas sin cuerpo JSON.
- La producción exige un origen HTTPS válido y transporte HTTPS del usuario;
  los health checks locales pueden seguir usando HTTP. Se comprueba el esquema
  de auditoría antes de arrancar el servidor.
- Las URL heredadas peligrosas se anulan al leer. Los nuevos GLB deben tener
  estructura coherente y recursos embebidos; se rechazan recursos externos y SVG.
  Esto no sustituye un validador completo de mallas/animaciones ni un antivirus.
- Respaldo corregido para conservar JSON y números exactos, con memoria acotada
  por páginas y publicación del archivo sólo al terminar. No ejecutar DDL durante
  el respaldo; las migraciones requieren mantenimiento y copia previa.

## Base de datos

Se añadieron restricciones CHECK, índices para progreso/actividad/suscripciones,
historial de migraciones y exclusión mutua entre migradores. El migrador aborta
ante datos incompatibles sin inventar notas ni corregir registros en silencio.
Los pasos DDL son reejecutables; MySQL no permite revertir toda la migración
mediante una única transacción.

El modelo y sus excepciones están explicados en
[DATABASE-REVIEW.md](DATABASE-REVIEW.md). Las relaciones múltiples usan tablas
puente. Las instantáneas de certificados y eventos de auditoría se conservan por
trazabilidad. `libros.temas` sigue siendo texto editorial y `pagos.usuario_id`
repite el propietario de una suscripción: no se afirma normalización estricta
de todas las columnas. Una futura evaluación por temas debe asignar identidad y
versión a esos temas antes de migrar sus resultados.

## Comprobaciones reproducibles

Resultado de la primera revisión: **14/14 pruebas unitarias y 8/8 pruebas de
integración aprobadas**, incluidas las pruebas de navegador en escritorio/móvil
y de bajas lógicas. La restauración de datos verificó 2.010 filas en tres páginas,
JSON primitivos, números exactos y marcas de tiempo. `format:check` y
`git diff --check` pasaron. `npm audit --omit=dev` no reportó vulnerabilidades
conocidas en las dependencias Node de producción al momento de la revisión;
no evalúa el editor/build de Unity, servicios externos ni el código remoto del
visor GLB. El error `SERVER_ERROR` de la prueba de auditoría es una falla
inyectada deliberadamente para comprobar el rollback, no un fallo de la suite.

```powershell
npm test
npm run format:check
npm audit --omit=dev
npm run test:integration
```

Las pruebas de integración requieren una base dedicada cuyo nombre contenga
`test`; nunca se deben ejecutar en producción. En esta revisión se usó MySQL
8.0.43 en `127.0.0.1:3307`, base `orbit_review_test`, con credenciales privadas en
`.env.review-test.local`. Para repetir esta ejecución aislada:

```powershell
node --env-file=.env.review-test.local --test --test-concurrency=1 server/tests/*.integration.js
```

Los archivos de configuración, datos del servidor de pruebas, capturas y
respaldos privados se excluyen de Git y del contexto Docker. La instancia de
pruebas no sustituye ni repara el servidor MySQL original del equipo.

## Antes de abrir producción

La revisión de cierre añadió controles para pagos sin configuración, límites de
cargas simultáneas, suscripciones con inicio futuro, instituciones/carreras
inactivas, respuestas HTTP sin rutas internas, compresión gzip/Brotli de Unity,
contraseñas con espacios y exportaciones CSV seguras. Se corrigieron envíos
duplicados y respuestas de formularios que llegaban después de abandonar una vista.

**Validación local final: 20/20 pruebas unitarias y 12/12 pruebas de integración
aprobadas**, además de formato y auditoría de dependencias sin vulnerabilidades
conocidas reportadas. Se verificó autenticación SMTP sin enviar mensajes; la
entrega al destinatario y el callback Google de producción siguen requiriendo
una prueba en el dominio definitivo. Se añadieron CI con MySQL 8.4/Chromium y
construcción Docker, y `npm run check:production` para validar configuración,
versión y permisos sin modificar datos.

La cuenta de ejecución local se limitó a permisos por tabla; auditoría,
historial de notas y certificados quedaron sin UPDATE/DELETE, y no hay DELETE
sobre datos de negocio. La comprobación de sus permisos no reportó hallazgos.
El entorno local **sigue siendo de desarrollo**, con MySQL 8.0.43; para un
servidor nuevo se requiere MySQL LTS vigente, recomendado 8.4. Docker Desktop
no estaba activo, por lo que la construcción de imagen debe confirmarse en CI.
La guía de destino está en [DEPLOYMENT.md](DEPLOYMENT.md).

1. Configurar el dominio, HTTPS, el proxy de confianza y el bloqueo del puerto
   Node al acceso público directo. Validar cookies, CSP y carga en ese entorno.
2. Respaldar la base real, probar restauración completa en otra base y ejecutar
   `db:migrate` con una cuenta DDL separada durante mantenimiento. El servidor
   rechaza un esquema sin la versión requerida.
3. Otorgar permisos por tabla: runtime sólo SELECT/INSERT sobre `orbit_audit`,
   sin UPDATE/DELETE ni DDL, y SELECT/INSERT/UPDATE sobre las tablas de negocio.
   DELETE se reserva a las tablas técnicas de sesiones, códigos y límites.
   Un GRANT amplio sobre toda la base vuelve a conceder capacidad de borrar la
   auditoría. Exportar eventos a un destino separado si se exige inmutabilidad.
4. Configurar y probar SMTP real, recuperación y confirmación de correo. Activar
   Google sólo con el cliente OAuth y callback de producción registrados. Las
   pruebas con proveedores simulados no comprueban entrega real ni consentimiento.
5. Publicar la práctica Unity terminada y verificar sus controles, rendimiento,
   recursos y permisos con un docente y un estudiante reales. Mientras tanto,
   mantener `UNITY_WEBGL_ENABLED=false`.
6. Configurar cuenta/QR de cobro antes de ofrecer pagos a estudiantes. No se
   inventaron datos bancarios. La confirmación actual de pagos es administrativa,
   sin pasarela bancaria ni comprobación automática del depósito.
7. Rotar las credenciales que hayan estado publicadas o versionadas en despliegues
   anteriores. Borrar archivos del árbol actual no elimina el historial Git.
8. Definir monitorización, alertas, retención de auditoría, copias externas y
   restauración periódica. Probar concurrencia y carga con un volumen similar al
   esperado en producción, incluido el almacenamiento persistente de uploads.

Los nombres y correos únicos de registros archivados quedan reservados: archivar
no libera una identidad para crear otra cuenta con el mismo correo. Una
recuperación administrativa debe restaurar deliberadamente el registro original;
esta revisión no introduce una pantalla de restauración ni un borrado definitivo.
Los privilegios DDL/administrativos de MySQL quedan fuera de esta garantía de la
aplicación: una persona con acceso directo privilegiado puede borrar registros.

La política actual autoriza contenido por cuenta activa, institución/carrera
activa, rol y plan individual dentro de sus fechas de vigencia. Desactivar una licencia institucional no revoca por sí solo todas
las cuentas; hay que definir y aplicar esa política comercial antes de depender
de licencias como control de acceso. Varios listados de gestión cargan conjuntos
completos: se requiere paginación adicional y pruebas de carga para instituciones
grandes. El limitador general por proceso necesita complemento compartido en el
proxy si se ejecutan varias réplicas.

Referencias técnicas utilizadas: [seguridad de Express](https://expressjs.com/en/advanced/best-practice-security/),
[registro de eventos de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
y [formato GLB de Khronos](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification).

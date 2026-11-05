# ORBIT · Node.js

Plataforma educativa con web HTML/CSS/JavaScript, API Node.js/Express, MySQL y laboratorios Unity WebGL. El servidor sirve la web y la API desde el mismo origen. No requiere PHP.

## Ejecutar

Requisitos: Node.js 22 actualizado y MySQL 8.4 LTS para producción nueva; se conserva compatibilidad con MySQL 8.0.16+ para instalaciones heredadas. Instala las dependencias con `npm ci`. Copia `.env.example` a `.env`, configura la base y genera un secreto aleatorio de al menos 48 caracteres para `SESSION_SECRET`.

1. Crea una base vacía con codificación `utf8mb4`, o restaura una copia de tu instalación.
2. Ejecuta `npm run db:migrate`. Crea tablas y columnas faltantes sin borrar registros. No instala usuarios ni contraseñas de demostración.
3. Ejecuta `npm run admin:create` para una instalación nueva. La contraseña se lee de `ORBIT_ADMIN_PASSWORD` en el entorno, nunca de argumentos de consola. Mínimo 12 caracteres y máximo 72 bytes.
4. Ejecuta `npm start` y abre <http://localhost:3000>.

Una instalación nueva no contiene laboratorios ni cuentas de muestra. `database/seed.sql` no inserta datos; las pruebas crean sus propios registros temporales en una base aislada. El catálogo de la portada sólo muestra contenido devuelto por la API y presenta un aviso de preparación cuando no hay laboratorios. Unity permanece desactivado hasta publicar las prácticas nuevas.

Para instalaciones que ya tengan muestras, existe una limpieza por IDs explícitos: `npm run db:archive-demo-labs -- --help`. Primero consulta los IDs de esa instalación; la ejecución sin `--apply` es de sólo lectura. Con `--apply` genera un respaldo privado y archiva únicamente los laboratorios seleccionados y sus asignaciones, dejando notas, prácticas y certificados intactos. No se ejecuta automáticamente al arrancar o migrar, para proteger laboratorios nuevos. Consulta [la limpieza realizada y las verificaciones](docs/DEMO-LABS-CLEANUP.md).

La configuración local ya preparada utiliza una cuenta MySQL con permisos de lectura y escritura exclusivamente sobre `orbit`. Las credenciales administrativas de migración están separadas en `.env.migration.local`; ese archivo es opcional, privado y no se despliega. La configuración de migración prevalece solo al ejecutar `db:migrate`. El acceso local del administrador preparado está en `ORBIT_ADMIN_EMAIL` y `ORBIT_ADMIN_PASSWORD` dentro de `.env`.

`npm run db:backup` genera una copia privada en `backups/`. Debe restaurarse en una base vacía. Esos archivos contienen datos personales y hashes: no se publican ni se suben a Git. Antes de migrar una instalación existente, genera una copia y prueba su restauración.

En este equipo no existía la base `orbit`: se restauró la instantánea local del proyecto del 21 de octubre de 2026 y se actualizó el esquema. Las cuentas de demostración con contraseñas publicadas quedaron inactivas; el administrador recibió una contraseña aleatoria guardada en `.env`. Las otras bases del servidor no se modificaron. Los accesos privados del despliegue anterior se conservaron en `.private/deploy-infinityfree/`, fuera de los archivos versionados. Esto no elimina sus versiones anteriores del historial Git.

## Correos con Gmail

Configura la cuenta de ORBIT con verificación en dos pasos. Genera una **contraseña de aplicación** en la cuenta de Google e introdúcela como `SMTP_PASSWORD` en `.env`; no uses la contraseña habitual de Gmail. Algunas cuentas administradas no permiten contraseñas de aplicación; en ese caso necesitas un proveedor SMTP autorizado por su administrador.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contacto.orbit.bo@gmail.com
SMTP_PASSWORD=tu-contraseña-de-aplicación
MAIL_FROM=ORBIT <contacto.orbit.bo@gmail.com>
```

Las nuevas cuentas independientes se crean **después** de confirmar el código enviado al correo. Cada código vence en 10 minutos, admite 5 intentos y es de un solo uso. El servidor guarda un HMAC del código, nunca su valor original. El reenvío se realiza repitiendo la solicitud desde «Cambiar datos o solicitar otro código», con límite de frecuencia. También hay recuperación de contraseña y cambio de correo, que exige contraseña actual y confirmación del nuevo correo. Se notifica al correo anterior cuando se completa el cambio. Cambiar o recuperar la contraseña invalida otras sesiones.

Sin credenciales SMTP válidas no se envían códigos reales. Las pruebas usan un remitente de correo simulado que solo se inyecta al crear la aplicación desde el código de pruebas. No existe un endpoint para obtener códigos ni un modo de omitir la verificación en producción.

Documentación del proveedor: [contraseñas de aplicación de Google](https://support.google.com/accounts/answer/185833) y [SMTP de Gmail](https://support.google.com/a/answer/176600).

## Funciones y permisos

### Registro e inicio de sesión con Google

Las pantallas de registro e inicio de sesión incluyen **Continuar con Google**. Se usa OpenID Connect con flujo de código, PKCE, estado ligado a la sesión, nonce y callback de un solo uso. La biblioteca oficial de Google comprueba la firma, el emisor, la audiencia y el vencimiento del token en el servidor. Solo se solicitan `openid email profile`; ORBIT no pide leer Gmail ni almacena tokens de acceso o actualización.

Para activarlo, entra con la cuenta de ORBIT en [Google Cloud Console](https://console.cloud.google.com/auth/clients), configura la pantalla de consentimiento y crea un cliente OAuth de tipo **Aplicación web**. Autoriza esta URI de redirección para desarrollo:

```text
http://localhost:3000/api/auth/google/callback
```

Guarda las credenciales en el archivo privado `.env` y reinicia `npm start`:

```dotenv
GOOGLE_CLIENT_ID=tu-cliente.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-secreto-de-cliente
```

Para producción registra también `https://tu-dominio/api/auth/google/callback` y configura `APP_ORIGIN` con ese dominio. La URI debe coincidir exactamente; `localhost` y `127.0.0.1` son orígenes diferentes. Si el proyecto Google está en modo de pruebas, agrega los usuarios de prueba autorizados en Google antes de intentar entrar. No subas el secreto a Git ni lo insertes en JavaScript del navegador. Estas credenciales OAuth son distintas de la contraseña de aplicación usada para SMTP.

Una cuenta nueva de Google se crea como estudiante independiente, con correo confirmado por Google. La identidad queda vinculada al identificador estable `sub`, por lo que los cambios de nombre o de correo en Google no generan cuentas duplicadas. Google no requiere recibir además un código de correo de ORBIT. El registro tradicional conserva su verificación por código.

Si el correo ya pertenece a una cuenta ORBIT, no se vincula automáticamente: el usuario debe entrar con su contraseña y usar **Mi cuenta → Acceso con Google → Vincular Google**, confirmando su contraseña actual. Así conserva su rol, clases y datos. Las cuentas desactivadas siguen sin poder entrar. Las cuentas creadas con Google pueden establecer una contraseña propia usando el flujo de recuperación por correo cuando SMTP esté configurado.

Sin `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, el botón se muestra deshabilitado con una explicación y no envía al usuario a otro formulario. Al activarlo, Google confirma la identidad y ORBIT crea la cuenta de estudiante si es nueva e inicia sesión directamente, sin completar el registro manual. La integración está implementada; una prueba real contra Google requiere esas credenciales y la autorización del usuario en Google. Documentación: [OpenID Connect de Google](https://developers.google.com/identity/openid-connect/openid-connect).

### Plataforma académica

- Administración: instituciones, carreras, usuarios, licencias, planes, pagos, importación CSV y solicitudes.
- Dirección: laboratorios propios y seguimiento de su carrera. No puede cambiar notas ni acceder a otras carreras.
- Docencia: clases propias, inscripciones, asignación de laboratorios, calificación y seguimiento.
- Estudiantes: contenidos habilitados por carrera o plan, prácticas propias, resultados de libros y certificados autorizados.
- Certificados: todos los laboratorios del curso completados y aprobación docente de al menos 51/100. La emisión es única por inscripción y conserva los datos de emisión.
- Notas: la nota final solo se modifica por administración o docencia autorizada, y cada modificación queda en el historial. Una práctica declarada por el estudiante no equivale a una evaluación oficial. El servidor rechaza puntajes arbitrarios enviados por el navegador.

La API usa `/api/auth/login`, `/api/laboratorios`, `/api/clases`, etc.; mantiene las estructuras JSON que utiliza el panel. Los métodos admitidos son GET, POST, PUT y DELETE. Las operaciones privadas que modifican datos requieren el encabezado `X-CSRF-Token` recibido al iniciar sesión o consultar `/api/auth/me`.

Las acciones de archivar usan baja lógica: los datos de negocio permanecen en MySQL con `deleted_at` y `deleted_by`, dejan de mostrarse en las vistas normales y se registra su auditoría. Las inscripciones se retiran conservando su historial. Las asignaciones también conservan sus filas. Los correos y nombres únicos archivados permanecen reservados. Sólo se eliminan físicamente los datos temporales de sesiones, códigos y límites; el usuario de ejecución no debe tener permiso DELETE sobre tablas de negocio.

Unity tiene su espacio reservado dentro de la web y permanece **vacío y desactivado por defecto** mientras se desarrolla la nueva práctica. `UNITY_WEBGL_ENABLED=false` impide descargar los builds anteriores y registrar prácticas de ese contenido. El docente puede abrir la vista de prueba de sus laboratorios, incluso en desarrollo, sin generar entregas ni notas. En modelos GLB publicados, el estudiante puede guardar un recorrido declarado únicamente cuando el visor ha cargado; eso no equivale a una evaluación oficial. Los resultados de libros son autoevaluaciones declaradas por el estudiante.

Para habilitar una práctica Unity terminada: publicar su compilación WebGL y su plantilla en `orbit-web/simuladores/<practica>/`, asociar `simuladores/<practica>/index.html` al laboratorio, y configurar `UNITY_WEBGL_ENABLED=true`. La plantilla M2 vacía debe sustituirse por la nueva plantilla WebGL: cambiar solamente la variable no instala Unity ni su evaluación. **No existe todavía una rúbrica de nota automática validada por el servidor ni una integración de notas con el sistema académico de una universidad.** Nunca se debe aceptar como nota oficial un puntaje arbitrario enviado desde JavaScript/Unity.

## Seguridad y despliegue

Las contraseñas nuevas usan bcrypt con coste 12. Los hashes heredados bcrypt `$2y$` siguen siendo compatibles. Las sesiones se guardan en MySQL y expiran por inactividad y por duración absoluta. Cada petición revalida la cuenta activa y su versión de autenticación. Hay límites de acceso por IP y por cuenta en MySQL; consultas SQL parametrizadas; listas explícitas de campos editables; comprobaciones de rol y ámbito en cada recurso; protección CSRF y de origen; cookies HttpOnly y SameSite; y CSP con nonce para scripts embebidos, incluyendo Unity.

Los archivos privados, configuración, código del servidor, base y archivos ocultos nunca se sirven. Los modelos y libros subidos se autorizan también al acceder por su URL directa. La carga de archivos exige permisos, limita tamaño y comprueba la firma binaria GLB/PDF. No se acepta `.gltf` por sus referencias externas. El servidor no descarga enlaces proporcionados por usuarios.

Para producción:

1. Usa alojamiento compatible con Node.js y MySQL. InfinityFree no ejecuta este servidor; las carpetas de ese despliegue y de versiones anteriores son material histórico.
2. Configura `NODE_ENV=production`, `APP_ORIGIN=https://tu-dominio` y un secreto único de sesión. Usa HTTPS en un proxy inverso. Configura `HOST=0.0.0.0` cuando el entorno de alojamiento lo requiera.
3. Activa `TRUST_PROXY=1` solo si existe exactamente un proxy de confianza y Node no queda accesible directamente desde Internet. Configura límites de cuerpo/tiempo también en el proxy.
4. Usa una cuenta MySQL con SELECT/INSERT/UPDATE sobre las tablas de negocio; SELECT/INSERT sobre auditoría, historial de notas y certificados; y DELETE únicamente sobre las tablas técnicas de sesiones, códigos y límites/flujos de autenticación. Otorga permisos por tabla y reserva DDL para migraciones. Mantén MySQL en red privada. No despliegues las credenciales de migración ni de administrador inicial.
5. Configura SMTP, copias de seguridad, monitorización y actualizaciones. Cada respuesta de error incluye un identificador de solicitud sin revelar consultas, contraseñas ni trazas.

`GET /health/live` comprueba el proceso; `GET /health/ready` comprueba MySQL. El cierre atiende solicitudes en curso antes de terminar. Las sesiones y códigos vencidos se limpian periódicamente. El limitador general de tráfico es por proceso; si despliegas varias réplicas, añade un límite compartido en el proxy. Los límites de credenciales y códigos ya se comparten mediante MySQL.

Ninguna implementación garantiza ausencia de vulnerabilidades. Las pruebas verifican comportamientos concretos; no sustituyen una revisión independiente ni la operación segura del servidor. Gmail tiene límites y políticas de envío; para mayor volumen debe utilizarse un servicio de correo transaccional.

## Validación

Antes de abrir tráfico en el alojamiento definitivo, ejecuta `npm run check:production` y revisa [la guía de despliegue y CI](docs/DEPLOYMENT.md). El comando es de sólo lectura y bloquea configuración de desarrollo, versiones MySQL fuera de la política LTS o permisos excesivos; no sustituye las pruebas de HTTPS, entrega de correo y carga en ese servidor.

Los pagos manuales permanecen desactivados hasta configurar `PAYMENT_ENABLED=true`, `PAYMENT_HOLDER` y al menos un método de cobro: `PAYMENT_BANK`/`PAYMENT_ACCOUNT` para transferencia o `PAYMENT_QR_URL` para QR. La API y el formulario usan la misma configuración. No se aceptan solicitudes de pago cuando falta esa configuración.

La revisión del 5 de noviembre de 2026 está documentada en [docs/PRODUCTION-REVIEW.md](docs/PRODUCTION-REVIEW.md). El modelo, las excepciones de normalización y los permisos de auditoría están en [docs/DATABASE-REVIEW.md](docs/DATABASE-REVIEW.md).

```sh
npm test
npm run format:check
npm audit --omit=dev
```

Las pruebas de integración necesitan una base dedicada cuyo nombre contenga `test`, configurada en `.env.test.local`. Nunca deben apuntar a producción. `npm run test:integration` ejecuta las pruebas de API y de navegador en serie; requieren Chrome instalado o `CHROME_PATH` apuntando a su ejecutable. El puerto 3138 debe estar libre. No se utilizan destinatarios reales en esas pruebas.

Las pruebas cubren permisos de cuatro roles, acceso cruzado, CRUD, progreso sin duplicados, auditoría de notas, certificados, activos protegidos, código vencido/incorrecto/reutilizado, límite de intentos, revocación de sesiones, y formularios reales de registro, cuenta, correo y recuperación en escritorio y móvil.

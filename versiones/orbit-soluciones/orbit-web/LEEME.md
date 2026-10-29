# ORBIT — sitio web con base de datos

El sitio público (index.html) sigue igual y ahora tiene:

- **Base de datos MySQL** con 23 tablas (ver `database/schema.sql`).
- **Inicio de sesión real** con 4 roles: administrador, director de carrera, docente y estudiante.
- **Panel** (`panel.html`) distinto para cada rol, con CRUD de instituciones, carreras, docentes, estudiantes, clases, laboratorios, libros, licencias y planes.
- **Laboratorios 3D por carrera**: cada laboratorio se habilita para una o varias carreras; un estudiante solo ve los de su carrera. Hoy se abren en 3D en el navegador (archivo `.glb`); la columna `vr_disponible` deja lista la versión en Realidad Virtual.
- **Libros en Realidad Aumentada (AR)**, también por carrera. Cada libro tiene su página con los temas (cada página marcadora), los 3 pasos para usarlo (descargar la app ORBIT AR, tener las páginas a mano, apuntar la cámara), un modelo 3D opcional para verlo en AR directo desde el navegador del celular, y los resultados de los quiz de cada tema. El admin sube el PDF de las páginas y el modelo `.glb` desde el panel. La app AR puede enviar los resultados a `POST api/index.php?r=libros/{id}/resultados`.
- **Versión freemium**: cualquier estudiante sin universidad se registra gratis en `registro.html`, ve el catálogo público y paga una mensualidad (Premium) por QR o transferencia. El admin confirma el pago y el plan se activa por los meses pagados.
- **Importar listas** (CSV de Excel): estudiantes con su carrera, carreras y laboratorios pedidos. Pensado para las listas del piloto con Univalle.
- El formulario de contacto ahora también guarda cada solicitud en la base de datos (panel › Solicitudes).

## Dónde está la base de datos

En **tu MySQL80** (el servicio de Windows, puerto 3306), base **`orbit`**, usuario `root`.
La conexión está en `api/config.local.php`. Ese archivo tiene tu contraseña: no lo subas a ningún lado (el zip no lo incluye).
Puedes abrirla con MySQL Workbench o con `mysql -u root -p orbit`.

## Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@orbit.bo | Admin123! |
| Docente (Univalle) | docente@orbit.bo | Docente123! |
| Estudiante (Univalle, Ing. Biomédica) | estudiante@orbit.bo | Estudiante123! |
| Estudiante independiente, plan Gratis | libre@orbit.bo | Estudiante123! |
| Estudiante independiente, Premium activo | premium@orbit.bo | Estudiante123! |

Hay más docentes y estudiantes de ejemplo con las mismas contraseñas (ver `database/seed.sql`).
**Antes de publicar el sitio, cambia o borra estos usuarios.**

## Cómo correrlo en tu computadora (XAMPP)

1. Copia la carpeta `orbit-web` dentro de `C:\xampp\htdocs\`.
2. Abre el panel de XAMPP y enciende **Apache** y **MySQL**.
   - Tienes además el servicio **MySQL80** usando el puerto 3306. Si el MySQL de XAMPP no arranca por eso, usa MySQL80: pon su usuario y contraseña en `api/config.local.php`.
3. Revisa `api/config.local.php` (puerto, usuario y contraseña de MySQL). Si no existe, copia `api/config.example.php` con ese nombre.
   - Ya está configurado para tu MySQL80 (puerto 3306, root). La base `orbit` ya está creada con los datos de prueba, así que puedes saltarte el paso 4.
   - Sin XAMPP también funciona: dentro de la carpeta corre `php -S localhost:8090` y abre http://localhost:8090.
4. En una terminal, dentro de la carpeta del sitio:
   ```
   php database/install.php
   ```
   Crea la base `orbit`, las tablas y los datos de prueba. Con `--reset` borra todo y empieza de cero; con `--sin-datos` crea solo las tablas.
   *Alternativa sin terminal:* en phpMyAdmin crea la base `orbit` e importa `database/schema.sql` y luego `database/seed.sql`.
5. Abre `http://localhost/orbit-web/` y entra con un usuario de prueba.

## Cómo publicarlo en un hosting

Sirve cualquier hosting con **PHP 8.0 o superior** y **MySQL/MariaDB** (por ejemplo cPanel).

1. Sube todo el contenido de la carpeta, **excepto** `api/config.local.php`.
2. Crea la base de datos en el hosting e importa `database/schema.sql` (y `seed.sql` solo si quieres los datos de prueba).
3. En el servidor crea `api/config.local.php` con los datos de esa base y `'debug' => false`.
4. Los archivos `.htaccess` ya bloquean el acceso web a `database/`, `api/lib/`, `api/routes/` y a la configuración.
5. Usa HTTPS: la cookie de sesión se marca como segura automáticamente.

## Lo que debes completar

- **Datos de pago del plan Premium**: en `js/panel.js`, al inicio, edita `PAGO_INFO` (banco, número de cuenta y la imagen del QR de cobro).
- **Precio del Premium**: panel › Planes freemium (hoy 35 Bs al mes, puesto como ejemplo).
- **Modelos 3D**: en panel › Laboratorios › editar, sube el `.glb` del laboratorio o pega un enlace. Mientras no tenga modelo, el estudiante ve "El modelo 3D está en preparación". El tamaño máximo depende de `upload_max_filesize` y `post_max_size` de PHP (súbelos a 100M si tus modelos pesan más).

## Flujo del piloto con Univalle

1. Panel › **Importar listas** › *Carreras* (opcional; las carreras también se crean solas al importar estudiantes).
2. **Importar listas** › *Estudiantes*: cada fila con nombre, apellido, email, código y carrera. Al terminar descarga el CSV con las **contraseñas iniciales** (solo se muestran una vez) y entrégalo a Univalle.
3. **Importar listas** › *Laboratorios pedidos*: entran como **Solicitado** con sus carreras. Cuando los desarrollen, pásalos a *En desarrollo* y luego a *Publicado* (recién ahí los ven los estudiantes).
4. Crea los **docentes** (panel › Docentes) y marca sus carreras. Cada docente crea sus clases, inscribe estudiantes y asigna laboratorios con fecha límite.

Hay plantillas en `plantillas/` (se descargan también desde la pantalla de importar). Excel en español guarda los CSV con `;`; el importador acepta `;`, `,` o tabulador, y archivos en UTF-8 o ANSI.

## Estructura

```
api/
  index.php           punto de entrada de la API (api/index.php?r=recurso/id)
  config.php          configuración por defecto (no editar)
  config.example.php  copia esto como config.local.php
  lib/                conexión, sesión, validación y reglas de acceso
  routes/             auth, catálogos, personas, clases, contenidos, freemium, importar, panel
database/
  schema.sql          tablas
  seed.sql            datos y usuarios de prueba
  install.php         instalador (php database/install.php)
plantillas/           CSV de ejemplo para importar
uploads/modelos/      modelos 3D subidos desde el panel
panel.html, js/panel.js, css/panel.css   panel por rol (incluye el visor 3D)
registro.html         registro gratis de estudiantes independientes
```

## Tablas

`universidades`, `carreras`, `usuarios` (rol: admin, docente, estudiante), `docentes`, `docente_carrera`,
`estudiantes` (tipo: institucional o independiente), `clases`, `inscripciones`, `laboratorios`, `laboratorio_carrera`,
`libros` (AR), `libro_carrera`, `libro_resultados` (quiz de cada tema), `clase_laboratorio`, `practicas`, `licencias`, `planes`, `suscripciones`, `pagos`, `solicitudes`.

## Notas

- El panel está solo en español; la página principal, el login y el registro siguen en español, inglés y portugués.
- Las contraseñas se guardan cifradas (bcrypt). Hay protección contra CSRF y un freno a intentos de inicio de sesión repetidos.
- Los pagos se confirman a mano (no hay pasarela de pago todavía). Se puede conectar una pasarela más adelante sobre las tablas `suscripciones` y `pagos`.
- Las prácticas se guardan con `modalidad` 3D o VR, así la futura app VR puede registrar prácticas en la misma tabla (`POST api/index.php?r=practicas`).


## Dirección de carrera y seguimiento académico

El administrador crea las cuentas en **Directores de carrera → Nuevo director**, asignando una carrera y una contraseña inicial. Cada director puede crear y administrar sus propios laboratorios en esa carrera. Puede consultar cursos, estudiantes, docentes y certificados de su ámbito; no puede editar notas ni administrar otras carreras. Los laboratorios creados por dirección quedan habilitados para su carrera, sin publicarse automáticamente en el catálogo freemium.

**Resumen / Seguimiento académico** muestra avance de laboratorios, cursos activos, estudiantes, prácticas, tiempo registrado, notas pendientes, resultados por curso, perfiles de estudiantes y docentes, actividad reciente e historial de cambios de notas. El porcentaje cuenta cada laboratorio asignado una vez por estudiante y curso; repetir un intento no aumenta el avance. Un curso sin laboratorios asignados se identifica como tal. Las prácticas sin curso aparecen en actividad y en los totales generales, pero no completan tareas de una clase.

El docente crea clases, inscribe cuentas de estudiantes existentes, asigna laboratorios y edita estado y nota final de sus inscripciones. Cada edición queda registrada con el responsable, la fecha y los valores anterior y nuevo. **Enviar al SIU** solo muestra un aviso: no hay envío ni conexión con el sistema de Univalle.

**Certificados** emite una constancia ORBIT por curso cuando todos sus laboratorios asignados están completados y el docente ha registrado aprobación con nota mínima de 51/100. El documento conserva nombre, curso, institución, nota, fecha y código único de emisión. Se puede imprimir o guardar como PDF desde el navegador. Solo lo consultan el estudiante y los responsables autorizados; no hay verificación pública ni firma digital externa. El documento acredita el curso en ORBIT, no un título universitario.

Para actualizar una instalación anterior sin borrar datos:

```
php database/migrations/20261020_academico.php
```

La migración crea antes una copia SQL en `../backups/`, fuera del directorio público. No usar `install.php --reset` sobre datos que se quieran conservar. Las instalaciones nuevas ya incluyen las tres tablas adicionales y el rol director en `schema.sql`.

Pruebas: desde la raíz del proyecto, ejecutar `./tests/academico.integration.ps1` con PowerShell 7 y el servidor local funcionando. Crea cuentas temporales, comprueba el aislamiento por carrera y docente, clases, inscripciones, historial de notas, avance sin duplicados y requisitos/acceso de certificados; al terminar elimina sus registros temporales. Requiere las dos primeras carreras y el usuario administrador de demostración. También se verificó la instalación de esquema y semilla en una base temporal separada.

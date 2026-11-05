# Despliegue y comprobación de ORBIT

La aplicación está preparada para desplegarse en un alojamiento Node.js con
MySQL y HTTPS. Las pruebas locales o CI no certifican un servidor que todavía
no se ha configurado: el dominio, certificados, correo, almacenamiento y
permisos definitivos deben verificarse en el destino.

## Instalación desde un clon limpio

Usar Node.js 22 con su actualización de seguridad vigente y **MySQL 8.4 LTS**.
El migrador conserva compatibilidad con MySQL 8.0.16+, pero MySQL 8.0 pasó a
Sustaining Support el 21 de abril de 2026; para una instalación nueva se requiere
una línea LTS con actualizaciones vigentes. No actualizar el servidor ni sus
directorios de datos en el lugar sin un plan de respaldo y restauración.

1. Ejecutar `npm ci` desde la raíz; el lockfile fija las dependencias.
2. Configurar `.env` a partir de `.env.example`, o inyectar variables desde el
   gestor de secretos del alojamiento. Generar un `SESSION_SECRET` aleatorio de
   al menos 48 caracteres. No reutilizar las credenciales de pruebas.
3. Crear una base vacía `utf8mb4`. Configurar las credenciales DDL de migración
   por separado y ejecutar `npm run db:migrate`. En una base existente, respaldar
   y probar la restauración antes de migrar durante mantenimiento.
4. Crear el administrador con `npm run admin:create`; entregar la contraseña por
   `ORBIT_ADMIN_PASSWORD` en el entorno, nunca como argumento de consola.
   Retirar esa variable de las credenciales de ejecución después de crear la cuenta.
5. Configurar las credenciales de ejecución con los permisos mínimos descritos
   abajo, y comprobarlas con `npm run check:production` en el entorno definitivo.
6. Arrancar con `npm start` o con la imagen Docker. No importar semillas ni
   respaldos históricos de demostración.

Las cuentas se registran confirmando un correo real; sin SMTP válido no se puede
terminar el registro tradicional ni recuperar una contraseña. Las pruebas usan
correo simulado y no verifican entrega real. Google es opcional: registrar el
callback HTTPS del dominio definitivo y configurar ambas credenciales, o dejar
ambas vacías para mantener deshabilitado ese acceso. Unity permanece vacío con
`UNITY_WEBGL_ENABLED=false` hasta publicar y probar la nueva compilación.

## Cuenta de ejecución y preflight

El comando `npm run check:production` **no escribe en MySQL ni envía correos**.
Comprueba configuración, versión LTS de MySQL, versión del esquema, auditoría,
CHECKs habilitados y concesiones directas de permisos. No imprime contraseñas ni
concesiones completas. Un bloqueo devuelve código de salida 1; las advertencias
identifican funciones opcionales todavía desactivadas.

La comprobación exige:

- `NODE_ENV=production`, `APP_ORIGIN=https://dominio` sin ruta ni parámetros,
  secreto de sesión, puertos válidos y cuenta MySQL dedicada con contraseña.
- SMTP configurado para los flujos de registro y recuperación.
- MySQL 8.4 LTS o 9.7 LTS; CI verifica actualmente la línea 8.4.
- SELECT/INSERT/UPDATE sobre las tablas de negocio necesarias, con concesiones
  **por tabla**. No hay DELETE sobre datos de negocio ni DDL en la cuenta pública.
- SELECT/INSERT sobre `orbit_audit`, `notas_historial` y `certificados`, sin
  UPDATE/DELETE; SELECT sobre `orbit_schema_migrations`.
- SELECT/INSERT/UPDATE/DELETE sobre las tablas técnicas `orbit_sessions`,
  `orbit_codes`, `orbit_limits` y `orbit_google_flows`, para consumo y revocación
  de datos temporales de seguridad.

Un GRANT amplio sobre `base.*` o `*.*` vuelve a conceder borrado, cambios de
esquema o modificación de la auditoría; debe retirarse antes de dar permisos por
tabla. Las cuentas basadas en roles heredados requieren revisar sus privilegios
efectivos: el preflight las bloquea hasta certificar una configuración de
concesiones directas. Es una decisión conservadora, no una afirmación de que todo
rol sea inseguro. Las credenciales DDL no se incorporan al contenedor público.

El preflight no comprueba la calidad de una contraseña SMTP, DNS, certificados
TLS, entrega de correo, rendimiento o todas las decisiones académicas. Esas
pruebas se realizan en staging y en el servidor definitivo.

## Docker, proxy y persistencia

Construir desde la raíz:

```sh
docker build --file deploy/node/Dockerfile --tag orbit-web:release .
```

Ejemplo para un único proxy instalado en el mismo servidor:

```sh
docker volume create orbit_uploads
docker run --detach --init --name orbit-web --restart unless-stopped \
  --stop-timeout 20 --publish 127.0.0.1:3000:3000 \
  --env-file /ruta-segura/orbit-runtime.env \
  --mount type=volume,source=orbit_uploads,target=/app/orbit-web/uploads \
  orbit-web:release
```

El archivo de entorno real vive fuera del repositorio y debe tener acceso
restringido. Configurar `NODE_ENV=production`, `HOST=0.0.0.0`, el origen público
HTTPS y `TRUST_PROXY=1` sólo cuando hay exactamente un proxy de confianza.
MySQL permanece en red privada. En este ejemplo sólo el proxy puede llegar al
puerto Node; no publicar ese puerto en todas las interfaces de Internet.

El proxy debe sobrescribir `X-Forwarded-Proto` con su protocolo real y
`X-Forwarded-For` con la dirección del cliente que haya verificado. No aceptar
esas cabeceras de clientes externos sin procesarlas. Con más de un proxy,
configurar y revisar la topología antes de activar confianza. Establecer un
límite de cuerpo suficiente para el máximo de archivo admitido por ORBIT y
límites de tiempo y frecuencia en el proxy. En varias réplicas, el límite
general debe compartirse en ese proxy; los límites de credenciales ya usan MySQL.

El contenedor corre como usuario `node`. El volumen de uploads debe permitirle
escritura y conservarse entre versiones; respaldarlo aparte junto con MySQL.
La imagen excluye datos MySQL, `.env`, respaldos, uploads de usuarios, versiones
históricas y el editor Unity. Incluye el programa de comprobación y un health
check de readiness que verifica la disponibilidad de MySQL. El cierre usa
SIGTERM y tiene un margen de 20 segundos en el ejemplo para atender el cierre
de la aplicación.

## Verificación antes de abrir tráfico

Comprobar `/health/live`, `/health/ready`, inicio y cierre del proceso; acceso
por HTTPS con cookies Secure/HttpOnly; login de cada rol y rechazo de acceso
cruzado; confirmación y recuperación de correo con destinatarios controlados;
baja lógica y auditoría; publicación de contenido y almacenamiento persistente;
y restauración completa en otra base vacía. Los archivos subidos y secretos no
forman parte del respaldo SQL. Probar carga representativa y configurar alertas,
rotación de credenciales y retención de eventos.

## Integración continua

`.github/workflows/ci.yml` ejecuta instalación con lockfile, pruebas unitarias,
formato, auditoría de dependencias y pruebas de API/MySQL/navegador en serie sobre
una base desechable `orbit_ci_test` con MySQL 8.4. Usa Chrome del runner cuando
está disponible y, si falta, instala Chromium mediante Playwright; después
construye la imagen de producción. Sus contraseñas de servicio
son públicas y desechables: se usan sólo dentro de ese job aislado, sin datos ni
credenciales reales. Las acciones GitHub se fijan a SHA y tienen acceso de sólo
lectura al repositorio.

En Linux las pruebas usan el Chromium instalado por Playwright. En Windows
usan Chrome local por defecto; `CHROME_PATH` puede seleccionar otro ejecutable.
La CI no hace despliegues, no requiere secretos de producción ni sube capturas
de datos reales. Un job verde valida el código y la imagen; no sustituye el
preflight y las verificaciones del alojamiento definitivo.

Referencias: [fin de soporte MySQL](https://www.mysql.com/support/eol-notice.html),
[CI de Playwright](https://playwright.dev/docs/ci-intro) y
[credenciales de checkout](https://github.com/actions/checkout).

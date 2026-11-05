# Despliegue Node.js

La raíz de construcción de Docker es la raíz del repositorio:

```sh
docker build -f deploy/node/Dockerfile -t orbit-web .
```

Pasa la configuración por un gestor de secretos o variables de entorno. Ejecuta las migraciones en una tarea separada con credenciales DDL antes de arrancar la aplicación. El proceso de aplicación se ejecuta como usuario sin privilegios; monta un volumen persistente en `/app/orbit-web/uploads`. MySQL debe estar en una red privada. Termina HTTPS en un proxy inverso y establece `APP_ORIGIN` al dominio público.

La imagen no incluye contraseñas, datos MySQL, respaldos, archivos subidos ni el editor de Unity. Monta el volumen privado de archivos subidos al desplegar; no los incorpores en la imagen. Las compilaciones WebGL se sirven desde `orbit-web/simuladores/`, con autorización de usuario. `UNITY_WEBGL_ENABLED=false` mantiene el espacio vacío y bloquea los builds anteriores hasta publicar la práctica nueva.

Ejecuta `db:migrate` antes del arranque: el servidor comprueba la versión de esquema y la tabla de auditoría. La aplicación rechaza conexiones HTTP de usuario en producción; configura el proxy HTTPS y `TRUST_PROXY` correctamente. Los health checks locales siguen disponibles por HTTP. Se requiere MySQL 8.0.16+ para aplicar las restricciones CHECK.

La cuenta de ejecución necesita SELECT/INSERT en `orbit_audit`, sin UPDATE/DELETE; SELECT/INSERT/UPDATE sobre tablas de negocio y DELETE únicamente sobre tablas técnicas de sesiones, códigos y límites/flujos de autenticación. Los permisos se otorgan por tabla. Un GRANT general sobre toda la base vuelve a conceder la capacidad de borrar auditoría y datos de negocio. Consulta [el informe de despliegue](../../docs/PRODUCTION-REVIEW.md) y [el modelo de datos](../../docs/DATABASE-REVIEW.md).

Para una instalación nueva de producción usa MySQL 8.4 LTS actualizado. La compatibilidad del migrador con MySQL 8.0 no implica que esa línea siga recibiendo nuevas correcciones de seguridad. `npm run check:production` verifica configuración y permisos mediante operaciones de sólo lectura y devuelve un error ante bloqueos. El Dockerfile incluye health check de readiness y el programa de comprobación; se recomienda ejecutar con `--init` y `--stop-timeout 20`.

La guía completa de instalación limpia, proxy, permisos y CI está en [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md). La construcción Docker se valida en CI; si Docker Desktop no está activo en el equipo, no debe afirmarse que esa construcción ya pasó localmente.

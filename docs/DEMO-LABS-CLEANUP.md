# Retiro de laboratorios de muestra · 5 de noviembre de 2026

Por solicitud del usuario se archivaron los seis laboratorios de muestra de la
base local `orbit`. Se generó un respaldo privado antes de migrar y otro antes
de aplicar la baja. La migración de integridad, auditoría y bajas lógicas se
aplicó correctamente a esa base. No se realizó un despliegue externo.

| ID local | Laboratorio archivado |
| --- | --- |
| 1 | VentLab: ventilador mecánico |
| 2 | CT Virtual Lab: tomógrafo |
| 3 | Corazón humano en 3D |
| 4 | Desfibrilador externo |
| 5 | Monitor de signos vitales |
| 6 | M2 · Celda robotizada: robot, PLC y HMI |

La operación conservó las seis filas de laboratorios y las tres asignaciones a
clases mediante `deleted_at` y `deleted_by`. Conservó las siete prácticas
históricas, sin modificar notas, certificados, clases ni libros. Se registraron
nueve eventos de auditoría con motivo `demo_cleanup`, agrupados por solicitud
`c401992f3f39c4648b9a1fe4`.

Se verificó en la aplicación conectada a la base local:

- `GET /api/catalogo`: cero laboratorios disponibles.
- `GET /api/laboratorios` con administrador: cero laboratorios.
- La URL directa `simuladores/m2/index.html` devuelve 403 aun para administrador.
- Las prácticas y filas archivadas permanecen en la base.

## Qué recibe quien clona el repositorio

El estado de una base local no se transmite mediante Git. Por eso la instalación
ya no carga semillas de muestra: `db:migrate` prepara el esquema y los planes,
`admin:create` crea el administrador y `database/seed.sql` no inserta datos. La
portada carga el catálogo desde la API y no contiene tarjetas de muestra como
respaldo si el catálogo está vacío o falla. La plantilla CSV de laboratorios
contiene sólo encabezados. Las secciones comerciales de proyectos permanecen
como portafolio; no representan prácticas disponibles en el panel.

Los respaldos y exportaciones SQL históricas con cuentas, y los ZIP obsoletos,
se conservaron localmente bajo `.private/push-quarantine-2026-11-05/` y se
retiraron del árbol público. `.env`, respaldos, archivos privados y datos MySQL
están ignorados. La retirada del árbol no elimina los archivos de commits
anteriores; cualquier credencial real expuesta previamente debe rotarse.

## Otras instalaciones existentes

No aplicar los IDs anteriores sin comprobar su contenido: corresponden sólo a
la base local intervenida. Para seleccionar muestras en otra instalación:

```powershell
npm run db:migrate
npm run db:archive-demo-labs -- --help
```

La herramienta exige una lista explícita `--ids=...` y un administrador activo
mediante `ORBIT_ADMIN_EMAIL` o `--actor-id=...`. Sin `--apply` sólo muestra los
registros seleccionados. Con `--apply` genera primero un respaldo y archiva los
laboratorios y sus asignaciones en una transacción auditada. Repetir una baja
ya aplicada no duplica eventos ni registros. Nunca se ejecuta automáticamente
al iniciar el servidor, para evitar retirar las prácticas nuevas en desarrollo.

La prueba de integración cubre conservación del historial, selección exacta,
idempotencia y reversión al fallar la transacción. La prueba de navegador del
catálogo cubre contenido vacío, libros sin laboratorios y API no disponible.

Validación final de estos cambios: 14/14 pruebas unitarias, 2/2 pruebas específicas
de catálogo/limpieza, formato y revisión de diff aprobados. Para el commit hay
que incluir archivos nuevos y bajas, además de modificaciones: el servidor Node,
sus pruebas y la documentación todavía pueden aparecer como archivos nuevos en
Git. Un commit que sólo incluya archivos ya seguidos no transporta el servidor.

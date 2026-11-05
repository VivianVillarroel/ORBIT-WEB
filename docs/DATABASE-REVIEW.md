# Revisión de base de datos y auditoría · 5 de noviembre de 2026

El esquema operativo es el creado por `npm run db:migrate`; importar únicamente
`orbit-web/database/schema.sql` no instala las extensiones de Node, las nuevas
restricciones, los índices ni la auditoría. La migración requiere MySQL 8.0.16 o
superior, o MariaDB 10.4 o superior. MySQL anterior a 8.0.16 puede aceptar cláusulas
CHECK sin aplicarlas; el migrador rechaza esas versiones.

## Modelo y decisiones de normalización

Las entidades principales tienen claves primarias y referencias explícitas:
institución → carrera → clase; usuario → perfil docente/estudiante/director;
clase ↔ estudiante mediante inscripción; carrera ↔ laboratorio/libro y docente
mediante tablas puente. Las claves compuestas evitan asignaciones duplicadas;
la clave única de inscripción evita duplicar un estudiante en una clase; cada
certificado pertenece a una inscripción y tiene código único. Un intento de
práctica es un evento independiente: varios intentos son válidos y no deben
eliminarse para calcular progreso. El progreso cuenta laboratorios completados,
no el número de intentos.

El modelo usa las formas normalizadas para relaciones y perfiles. No se afirma
que cada campo satisfaga estrictamente la tercera forma normal:

- `libros.temas` conserva texto editorial con un tema por línea. Si los temas
  necesitan identidad, orden estable y evaluaciones versionadas, deben migrarse
  a `libro_temas` y referenciarse por ID; hoy el resultado guarda el nombre del
  tema. No se dividen textos automáticamente porque perderían su identidad.
- `pagos.usuario_id` repite al propietario de `suscripciones`; se conserva por
  compatibilidad y trazabilidad de pagos. Antes de retirar esa columna hay que
  comprobar consistencia y actualizar todos los consumidores. La aplicación
  debe asignarla desde la sesión y nunca aceptar el propietario del navegador.
- `usuarios.universidad_id` y la institución de la carrera del perfil tienen una
  relación que una FK simple no puede comprobar. Cambiar institución/carrera
  requiere validar la combinación en la misma transacción. Los perfiles deben
  coincidir con el rol de la cuenta; tampoco lo garantiza una FK simple.
- Los nombres y nota de `certificados` son una instantánea deliberada de emisión.
  No se recalculan cuando cambia el nombre de una institución o de una persona.
- Los JSON de historial/auditoría son eventos, no la fuente de estado actual.
  La auditoría no tiene claves foráneas: debe conservarse aunque se retire el
  usuario o recurso original. `notas_historial` sí conserva sus FK históricas;
  las rutas deben preservar inscripciones con notas mediante retiro lógico.

## Restricciones e índices añadidos

La migración verifica rangos de notas y puntajes (0–100), nota de certificados
(51–100), booleanos de usuarios/prácticas, versión de autenticación positiva,
precios/montos no negativos, meses de pago (1–12) y fechas no invertidas. Si
encuentra datos históricos incompatibles, informa tabla, restricción y cantidad,
y se detiene sin cambiar esos datos. Es necesario resolverlos con respaldo y
una decisión académica/administrativa; no se inventan notas ni fechas.

Los índices compuestos de prácticas apoyan progreso por clase/estudiante/
laboratorio y actividad por estudiante/fecha. Las suscripciones se buscan por
usuario/estado/vencimiento y las notas por inscripción/fecha. Sesiones, códigos,
límites y flujos Google ya incluyen índices para su vencimiento. La auditoría
se indexa por fecha, recurso y actor. Estos índices deben contrastarse con
`EXPLAIN` y carga representativa en el alojamiento definitivo.

## Ejecución y recuperación de migraciones

1. Generar respaldo privado y probar su restauración en otra base.
2. Poner la aplicación en mantenimiento y ejecutar la migración con una cuenta
   DDL separada. `GET_LOCK` serializa migradores que usan este script en la misma
   instancia; no bloquea escrituras de otras aplicaciones.
3. El lock se mantiene en una única conexión y se libera incluso al fallar. La
   espera de otro migrador y de metadata locks está limitada a 30 segundos.
4. MySQL confirma DDL implícitamente: no hay rollback global del esquema. Cada
   paso comprueba si existe y permite reejecutar después de corregir un error.
   `orbit_schema_migrations` registra versiones terminadas; no se considera
   terminada una ejecución fallida. Un fallo puede dejar pasos aditivos aplicados.
5. Ejecutar las pruebas contra una base dedicada cuyo nombre contenga `test`,
   revisar los datos y volver a abrir tráfico. No ejecutar pruebas en producción.

No se eliminan automáticamente índices, columnas, duplicados o claves históricas.
`CREATE TABLE IF NOT EXISTS` no repara una tabla alterada manualmente: antes de
producción hay que comparar su `SHOW CREATE TABLE` con una instalación nueva.

## Alcance del respaldo y prueba de restauración

`npm run db:backup` exporta las tablas base del esquema de aplicación y sus filas
desde una instantánea consistente de InnoDB. Lee en páginas de 1.000 registros,
avanzando por la clave primaria cuando existe, y publica el archivo SQL solo
después de completarlo y sincronizarlo. El archivo temporal y el final tienen
nombres aleatorios para evitar colisiones. Conserva JSON sin convertirlo a
valores JavaScript, números BIGINT/DECIMAL exactos, binarios y fechas; los
TIMESTAMP se exportan e importan temporalmente en UTC. El SQL fija el modo de
escape durante la restauración y restaura el modo/zona de la conexión al final.

La prueba `server/tests/backup.integration.js` crea 2.010 filas propias y restaura
su SQL a una segunda tabla dentro de la base de pruebas. Comprueba tres páginas,
JSON objeto/array/string/boolean/null frente a SQL NULL, enteros mayores a la
precisión de JavaScript, decimales, caracteres de escape, binarios y marcas de
tiempo con microsegundos bajo otra zona horaria. No requiere permisos globales ni
credenciales administrativas. Esto verifica la serialización y restauración de
esos datos; no equivale a un simulacro completo de recuperación de producción.

Para recuperación completa hay que restaurar el SQL en una base **vacía** y
ejecutar los controles funcionales de la aplicación. Pausar cambios de esquema
mientras se exporta: una instantánea de datos no protege frente a DDL concurrente.
El script no exporta vistas, triggers, rutinas, eventos de MySQL, usuarios/grants
ni archivos subidos; el esquema actual no depende de esos objetos auxiliares.
Respaldar por separado `orbit-web/uploads`, la configuración privada y la
configuración del alojamiento. Proteger todos los respaldos y probar su
restauración de forma periódica en un entorno aislado.

## Operación de la auditoría

`orbit_audit` conserva actor, rol, acción, entidad, identificador de solicitud,
hash de IP y un JSON con los datos aprobados por el servidor. No es una prueba
criptográfica de inmutabilidad ni registra automáticamente cualquier SQL escrito
fuera de la aplicación. Respaldar y exportar los eventos a un destino con acceso
restringido; definir responsables y retención según las necesidades reales.

La cuenta de ejecución debe tener SELECT/INSERT en `orbit_audit`, sin UPDATE ni
DELETE. Ejemplo para un usuario de runtime ya creado (adaptar base y host):

```sql
GRANT SELECT, INSERT ON orbit.orbit_audit TO 'orbit_app'@'app-host';
GRANT SELECT ON orbit.orbit_schema_migrations TO 'orbit_app'@'app-host';
```

MySQL acumula privilegios: otorgar solo INSERT/SELECT en esta tabla no elimina
UPDATE/DELETE concedidos en `orbit.*` o globalmente. Hay que retirar esos permisos
amplios y otorgar SELECT/INSERT/UPDATE **tabla por tabla** para los datos de
negocio, dejando auditoría con los permisos anteriores. DELETE solo se concede
a tablas técnicas de sesiones, códigos y límites/flujos de autenticación para
su revocación y limpieza. Revisar `SHOW GRANTS` y comprobar con la
cuenta de runtime que UPDATE/DELETE de auditoría y DDL fallan. Las credenciales
de migración y administración permanecen fuera del proceso público.

## Baja lógica y conservación de datos

Las operaciones de baja conservan el registro y sus relaciones históricas en la
base de datos. Las entidades `universidades`, `carreras`, `usuarios`, `clases`,
`laboratorios`, `libros`, `licencias`, `planes`, `solicitudes` y `practicas`, y
las cuatro tablas de asignaciones (`docente_carrera`, `laboratorio_carrera`,
`libro_carrera`, `clase_laboratorio`), incorporan `deleted_at` y `deleted_by`.
La migración `20261105_soft_delete` los añade de forma idempotente y no cambia
registros existentes ni reactiva bajas anteriores. `deleted_by` no tiene FK para
conservar el identificador histórico del autor.

Los listados, opciones, acceso por ID y acceso a archivos privados excluyen bajas
según los permisos de cada recurso. Dar de baja una cuenta también la desactiva,
incrementa su versión de autenticación y revoca sus sesiones; el perfil académico
permanece. Una clase archivada conserva inscripciones, prácticas, notas y
certificados. Retirar una inscripción cambia su estado a `retirado`, conservando
la nota y su historial; un reingreso reutiliza la misma inscripción y conserva la
nota registrada. Desasignar un recurso marca su tabla puente: al volver a
asignarlo se reactiva la misma clave compuesta y se registra la nueva acción.

Las dependencias todavía vigentes pueden bloquear la baja con un error de
conflicto; no se eliminan en cascada para forzarla. Las claves únicas siguen
reservando correos, códigos y nombres de los registros archivados. No se crea
automáticamente otra identidad con esos mismos identificadores. Una restauración
de entidad completa requiere un flujo explícito y autorizado; el cambio no añade
una interfaz general de restauración ni un borrado físico de negocio.

La cuenta pública de aplicación no debe disponer de DELETE sobre tablas de
negocio. Las FK históricas del esquema conservan sus reglas para integridad, pero
una baja de la aplicación usa UPDATE y no activa las cascadas de borrado. La
cuenta de migración y los fixtures de una base de pruebas aislada tienen permisos
distintos. Eliminar datos personales por una obligación concreta, si se requiere,
debe tener su propio procedimiento autorizado y verificable; no forma parte del
botón de baja.

## Comprobaciones de datos heredados

Estas consultas son de solo lectura y devuelven anomalías que requieren revisión;
un resultado vacío no sustituye una revisión de permisos de aplicación:

```sql
-- El pago debe pertenecer al mismo usuario que su suscripción.
SELECT p.id FROM pagos p JOIN suscripciones s ON s.id=p.suscripcion_id
WHERE p.usuario_id<>s.usuario_id;

-- El perfil y su rol de acceso deben coincidir.
SELECT d.usuario_id FROM docentes d JOIN usuarios u ON u.id=d.usuario_id
WHERE u.rol<>'docente';
SELECT e.usuario_id FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id
WHERE u.rol<>'estudiante';
SELECT d.usuario_id FROM directores d JOIN usuarios u ON u.id=d.usuario_id
WHERE u.rol<>'director';

-- La institución de la cuenta institucional debe corresponder a la carrera.
SELECT e.id FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id
JOIN carreras c ON c.id=e.carrera_id
WHERE e.tipo='institucional' AND NOT (u.universidad_id <=> c.universidad_id);

-- Aprobaciones históricas incoherentes; no corregir automáticamente.
SELECT id FROM inscripciones
WHERE (estado='aprobado' AND (nota_final IS NULL OR nota_final<51))
   OR (estado='reprobado' AND (nota_final IS NULL OR nota_final>=51));
```

Referencias: [CHECK de MySQL](https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html)
y [locks de conexión](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html).

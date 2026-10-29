<?php
// Quién puede ver qué: laboratorios y libros por carrera, y catálogo freemium para estudiantes independientes.
declare(strict_types=1);

/** Datos de estudiante (tipo y carrera) del usuario, o null si no es estudiante. */
function student_of(array $u): ?array
{
    if ($u['rol'] !== 'estudiante' || !$u['estudiante_id']) return null;
    static $cache = [];
    return $cache[$u['estudiante_id']] ??= one('SELECT id, tipo, carrera_id FROM estudiantes WHERE id = ?', [$u['estudiante_id']]);
}

/** Suscripción Premium vigente del usuario (o null). Marca como vencidas las que ya pasaron su fecha. */
function premium_of(int $usuarioId): ?array
{
    q("UPDATE suscripciones SET estado = 'vencida' WHERE usuario_id = ? AND estado = 'activa' AND fecha_fin < CURDATE()", [$usuarioId]);
    return one("SELECT s.id, s.fecha_inicio, s.fecha_fin, p.nombre AS plan
                  FROM suscripciones s JOIN planes p ON p.id = s.plan_id
                 WHERE s.usuario_id = ? AND s.estado = 'activa' AND s.fecha_fin >= CURDATE()
                 ORDER BY s.fecha_fin DESC LIMIT 1", [$usuarioId]);
}

/**
 * Filtro SQL de contenidos visibles para el usuario.
 * $t: alias de la tabla (l = laboratorios, b = libros); $join: tabla puente; $fk: columna del contenido en la tabla puente.
 * Devuelve [sql extra para WHERE, params, sql de la columna "bloqueado"].
 */
function content_scope(array $u, string $t, string $join, string $fk): array
{
    if ($u['rol'] === 'admin') return ['', [], '0'];
    if ($u['rol'] === 'director') return [" AND EXISTS (SELECT 1 FROM $join x WHERE x.$fk = $t.id AND x.carrera_id = ?)", [$u['director_carrera_id']], '0'];
    if ($u['rol'] === 'docente') {
        return [" AND EXISTS (SELECT 1 FROM $join x JOIN docente_carrera dc ON dc.carrera_id = x.carrera_id WHERE x.$fk = $t.id AND dc.docente_id = ?)",
                [$u['docente_id']], '0'];
    }
    $st = student_of($u);
    if (!$st) throw new HttpError(403, 'No tienes permiso para esta acción.');
    if ($st['tipo'] === 'institucional') {
        return [" AND $t.estado = 'publicado' AND EXISTS (SELECT 1 FROM $join x WHERE x.$fk = $t.id AND x.carrera_id = ?)",
                [$st['carrera_id']], '0'];
    }
    // Independiente (freemium): ve el catálogo público; lo que no es gratis queda bloqueado sin Premium.
    $premium = premium_of((int)$u['id']) ? 1 : 0;
    return [" AND $t.estado = 'publicado' AND $t.catalogo_publico = 1", [], $premium ? '0' : "($t.gratis = 0)"];
}

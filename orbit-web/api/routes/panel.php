<?php
// Resumen del panel según el rol, listas para los selectores de formularios y registro de prácticas.
declare(strict_types=1);

function route_dashboard(string $m, array $p): void
{
    if ($m !== 'GET' || count($p) > 1) throw new HttpError(404, 'Ruta no encontrada.');
    $u = require_user();

    if ($u['rol'] === 'director') json_out(academic_data($u));
    if ($u['rol'] === 'admin') {
        $stats = one("SELECT
            (SELECT COUNT(*) FROM universidades WHERE activo = 1) AS universidades,
            (SELECT COUNT(*) FROM carreras WHERE activo = 1) AS carreras,
            (SELECT COUNT(*) FROM docentes) AS docentes,
            (SELECT COUNT(*) FROM directores) AS directores,
            (SELECT COUNT(*) FROM estudiantes WHERE tipo = 'institucional') AS estudiantes,
            (SELECT COUNT(*) FROM estudiantes WHERE tipo = 'independiente') AS independientes,
            (SELECT COUNT(DISTINCT usuario_id) FROM suscripciones WHERE estado = 'activa' AND fecha_fin >= CURDATE()) AS premium,
            (SELECT COUNT(*) FROM clases WHERE estado = 'activa') AS clases_activas,
            (SELECT COUNT(*) FROM laboratorios WHERE estado = 'publicado') AS labs_publicados,
            (SELECT COUNT(*) FROM laboratorios WHERE estado = 'en_desarrollo') AS labs_desarrollo,
            (SELECT COUNT(*) FROM laboratorios WHERE estado = 'solicitado') AS labs_solicitados,
            (SELECT COUNT(*) FROM libros WHERE estado = 'publicado') AS libros,
            (SELECT COUNT(*) FROM solicitudes WHERE estado = 'nueva') AS solicitudes_nuevas,
            (SELECT COUNT(*) FROM pagos WHERE estado = 'pendiente') AS pagos_pendientes,
            (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE estado = 'confirmado' AND revisado_en >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS cobrado_mes,
            (SELECT COUNT(*) FROM practicas) AS practicas,
            (SELECT ROUND(AVG(puntaje)) FROM practicas) AS promedio");
        // Ingreso mensual estimado por licencias: precio por estudiante x estudiantes registrados (hasta el máximo contratado).
        $lic = rows("SELECT l.precio_estudiante_mes AS precio, l.estudiantes_max AS max,
                            (SELECT COUNT(*) FROM estudiantes e JOIN carreras c ON c.id = e.carrera_id WHERE c.universidad_id = l.universidad_id) AS n
                       FROM licencias l WHERE l.estado = 'activa'");
        $ingreso = 0.0;
        foreach ($lic as $l) $ingreso += (float)$l['precio'] * ($l['max'] !== null ? min((int)$l['n'], (int)$l['max']) : (int)$l['n']);
        $stats['ingreso_licencias'] = round($ingreso, 2);
        json_out([
            'rol' => 'admin',
            'stats' => $stats,
            'solicitudes' => rows("SELECT id, nombre, institucion, tipo, estado, creado_en FROM solicitudes ORDER BY creado_en DESC LIMIT 5"),
            'laboratorios' => rows("SELECT l.nombre, l.estado, COUNT(pr.id) AS practicas, ROUND(AVG(pr.puntaje)) AS promedio,
                                           (SELECT GROUP_CONCAT(c.nombre ORDER BY c.nombre SEPARATOR ', ') FROM laboratorio_carrera lc JOIN carreras c ON c.id = lc.carrera_id WHERE lc.laboratorio_id = l.id) AS carreras
                                      FROM laboratorios l LEFT JOIN practicas pr ON pr.laboratorio_id = l.id
                                     GROUP BY l.id, l.nombre, l.estado ORDER BY FIELD(l.estado, 'publicado', 'en_desarrollo', 'solicitado'), practicas DESC"),
        ]);
    }

    if ($u['rol'] === 'docente') {
        $d = $u['docente_id'];
        $stats = one("SELECT
            (SELECT COUNT(*) FROM clases WHERE docente_id = ? AND estado = 'activa') AS clases_activas,
            (SELECT COUNT(DISTINCT i.estudiante_id) FROM inscripciones i JOIN clases k ON k.id = i.clase_id WHERE k.docente_id = ? AND i.estado <> 'retirado') AS estudiantes,
            (SELECT COUNT(*) FROM practicas pr JOIN clases k ON k.id = pr.clase_id WHERE k.docente_id = ?) AS practicas,
            (SELECT ROUND(AVG(pr.puntaje)) FROM practicas pr JOIN clases k ON k.id = pr.clase_id WHERE k.docente_id = ?) AS promedio", [$d, $d, $d, $d]);
        json_out([
            'rol' => 'docente',
            'stats' => $stats,
            'clases' => rows("SELECT k.id, k.nombre, k.periodo, k.estado, c.nombre AS carrera,
                                     (SELECT COUNT(*) FROM inscripciones i WHERE i.clase_id = k.id AND i.estado <> 'retirado') AS inscritos,
                                     (SELECT COUNT(*) FROM practicas pr WHERE pr.clase_id = k.id) AS practicas,
                                     (SELECT ROUND(AVG(pr.puntaje)) FROM practicas pr WHERE pr.clase_id = k.id) AS promedio
                                FROM clases k JOIN carreras c ON c.id = k.carrera_id
                               WHERE k.docente_id = ? ORDER BY k.estado = 'activa' DESC, k.nombre", [$d]),
            'recientes' => rows("SELECT pr.realizada_en, pr.puntaje, pr.completada, pr.modalidad, l.nombre AS laboratorio, k.nombre AS clase,
                                        CONCAT(u.nombre, ' ', u.apellido) AS estudiante
                                   FROM practicas pr
                                   JOIN clases k ON k.id = pr.clase_id
                                   JOIN laboratorios l ON l.id = pr.laboratorio_id
                                   JOIN estudiantes e ON e.id = pr.estudiante_id
                                   JOIN usuarios u ON u.id = e.usuario_id
                                  WHERE k.docente_id = ? ORDER BY pr.realizada_en DESC LIMIT 8", [$d]),
        ]);
    }

    $e = $u['estudiante_id'];
    $st = student_of($u);
    $stats = one("SELECT
        (SELECT COUNT(*) FROM inscripciones WHERE estudiante_id = ? AND estado <> 'retirado') AS clases,
        (SELECT COUNT(*) FROM practicas WHERE estudiante_id = ?) AS practicas,
        (SELECT COUNT(*) FROM practicas WHERE estudiante_id = ? AND completada = 1) AS completadas,
        (SELECT ROUND(AVG(puntaje)) FROM practicas WHERE estudiante_id = ?) AS promedio", [$e, $e, $e, $e]);
    [$scope, $sp, $locked] = content_scope($u, 'l', 'laboratorio_carrera', 'laboratorio_id');
    $stats['laboratorios'] = (int)val("SELECT COUNT(*) FROM laboratorios l WHERE 1=1 $scope", $sp);
    [$scopeB, $spB] = content_scope($u, 'b', 'libro_carrera', 'libro_id');
    $stats['libros'] = (int)val("SELECT COUNT(*) FROM libros b WHERE 1=1 $scopeB", $spB);
    json_out([
        'rol' => 'estudiante',
        'tipo' => $st['tipo'],
        'premium' => $st['tipo'] === 'independiente' ? premium_of((int)$u['id']) : null,
        'carrera' => $st['carrera_id'] ? val('SELECT c.nombre FROM carreras c WHERE c.id = ?', [$st['carrera_id']]) : null,
        'stats' => $stats,
        'pendientes' => rows("SELECT k.id AS clase_id, k.nombre AS clase, l.id AS laboratorio_id, l.nombre AS laboratorio, l.vr_disponible, cl.fecha_limite,
                                     (SELECT COUNT(*) FROM practicas pr WHERE pr.estudiante_id = ? AND pr.laboratorio_id = l.id AND pr.clase_id = k.id) AS intentos,
                                     (SELECT MAX(pr.puntaje) FROM practicas pr WHERE pr.estudiante_id = ? AND pr.laboratorio_id = l.id AND pr.clase_id = k.id) AS mejor
                                FROM inscripciones i
                                JOIN clases k ON k.id = i.clase_id
                                JOIN clase_laboratorio cl ON cl.clase_id = k.id
                                JOIN laboratorios l ON l.id = cl.laboratorio_id AND l.estado = 'publicado'
                               WHERE i.estudiante_id = ? AND i.estado <> 'retirado'
                               ORDER BY cl.fecha_limite IS NULL, cl.fecha_limite, k.nombre", [$e, $e, $e]),
        'recientes' => rows("SELECT pr.realizada_en, pr.puntaje, pr.completada, pr.duracion_min, pr.modalidad, l.nombre AS laboratorio, k.nombre AS clase
                               FROM practicas pr JOIN laboratorios l ON l.id = pr.laboratorio_id LEFT JOIN clases k ON k.id = pr.clase_id
                              WHERE pr.estudiante_id = ? ORDER BY pr.realizada_en DESC LIMIT 8", [$e]),
    ]);
}

function route_opciones(string $m, array $p): void
{
    if ($m !== 'GET' || count($p) > 1) throw new HttpError(404, 'Ruta no encontrada.');
    $u = require_user();
    $out = [];
    $labs = "SELECT l.id, l.nombre, l.estado, (SELECT GROUP_CONCAT(lc.carrera_id) FROM laboratorio_carrera lc WHERE lc.laboratorio_id = l.id) AS carrera_ids FROM laboratorios l";

    if ($u['rol'] === 'director') {
        $out['carreras']=rows('SELECT id,nombre,universidad_id FROM carreras WHERE id=?',[$u['director_carrera_id']]);
        $out['universidades']=rows('SELECT id,nombre,sigla FROM universidades WHERE id=?',[$u['universidad_id']]);
        $out['laboratorios']=rows("$labs WHERE EXISTS(SELECT 1 FROM laboratorio_carrera lc WHERE lc.laboratorio_id=l.id AND lc.carrera_id=?)",[$u['director_carrera_id']]);
    } elseif ($u['rol'] === 'admin') {
        $out['universidades'] = rows('SELECT id, nombre, sigla FROM universidades ORDER BY nombre');
        $out['carreras'] = rows('SELECT c.id, c.nombre, c.universidad_id, COALESCE(u.sigla, u.nombre) AS universidad FROM carreras c JOIN universidades u ON u.id = c.universidad_id ORDER BY u.nombre, c.nombre');
        $out['docentes'] = rows("SELECT d.id, CONCAT(us.nombre, ' ', us.apellido) AS nombre, us.universidad_id FROM docentes d JOIN usuarios us ON us.id = d.usuario_id WHERE us.activo = 1 ORDER BY us.apellido, us.nombre");
        $out['estudiantes'] = rows("SELECT e.id, CONCAT(us.nombre, ' ', us.apellido) AS nombre, e.codigo, e.carrera_id, c.universidad_id, c.nombre AS carrera
                                      FROM estudiantes e JOIN usuarios us ON us.id = e.usuario_id JOIN carreras c ON c.id = e.carrera_id
                                     WHERE us.activo = 1 ORDER BY us.apellido, us.nombre");
        $out['laboratorios'] = rows("$labs ORDER BY l.nombre");
    } elseif ($u['rol'] === 'docente') {
        $out['carreras'] = rows('SELECT c.id, c.nombre, c.universidad_id FROM docente_carrera dc JOIN carreras c ON c.id = dc.carrera_id WHERE dc.docente_id = ? ORDER BY c.nombre', [$u['docente_id']]);
        $out['estudiantes'] = rows("SELECT e.id, CONCAT(us.nombre, ' ', us.apellido) AS nombre, e.codigo, e.carrera_id, c.universidad_id, c.nombre AS carrera
                                      FROM estudiantes e JOIN usuarios us ON us.id = e.usuario_id JOIN carreras c ON c.id = e.carrera_id
                                     WHERE us.activo = 1 AND c.universidad_id = ? ORDER BY us.apellido, us.nombre", [$u['universidad_id']]);
        $out['laboratorios'] = rows("$labs WHERE EXISTS (SELECT 1 FROM laboratorio_carrera lc JOIN docente_carrera dc ON dc.carrera_id = lc.carrera_id WHERE lc.laboratorio_id = l.id AND dc.docente_id = ?) ORDER BY l.nombre", [$u['docente_id']]);
    }
    json_out($out);
}

function route_practicas(string $m, array $p): void
{
    $u = require_user();
    if ($m === 'GET' && count($p) === 1) {
        $params = [];
        $sql = "SELECT pr.id, pr.realizada_en, pr.duracion_min, pr.puntaje, pr.completada, pr.modalidad, pr.clase_id, pr.laboratorio_id,
                       l.nombre AS laboratorio, k.nombre AS clase, e.codigo, CONCAT(us.nombre, ' ', us.apellido) AS estudiante
                  FROM practicas pr
                  JOIN laboratorios l ON l.id = pr.laboratorio_id
                  JOIN estudiantes e ON e.id = pr.estudiante_id
                  JOIN usuarios us ON us.id = e.usuario_id
                  LEFT JOIN clases k ON k.id = pr.clase_id
                 WHERE 1=1";
        if ($u['rol'] === 'director') { $sql .= ' AND k.carrera_id = ?'; $params[] = $u['director_carrera_id']; }
        if ($u['rol'] === 'docente') { $sql .= ' AND k.docente_id = ?'; $params[] = $u['docente_id']; }
        if ($u['rol'] === 'estudiante') { $sql .= ' AND pr.estudiante_id = ?'; $params[] = $u['estudiante_id']; }
        foreach (['clase_id' => 'pr.clase_id', 'laboratorio_id' => 'pr.laboratorio_id'] as $k => $col) {
            if (!empty($_GET[$k])) { $sql .= " AND $col = ?"; $params[] = $_GET[$k]; }
        }
        $sql .= search_clause(['us.nombre', 'us.apellido', 'e.codigo', 'l.nombre', 'k.nombre'], $_GET['q'] ?? null, $params);
        json_out(['items' => rows($sql . ' ORDER BY pr.realizada_en DESC LIMIT 300', $params)]);
    }

    // El estudiante registra una práctica desde el visor 3D (más adelante, la app VR con su sesión).
    if ($m === 'POST' && count($p) === 1) {
        if ($u['rol'] !== 'estudiante') throw new HttpError(403, 'Solo los estudiantes registran prácticas.');
        $data = validate([
            'laboratorio_id' => ['type' => 'int', 'req' => true, 'label' => 'Laboratorio'],
            'clase_id'       => ['type' => 'int', 'label' => 'Clase'],
            'modalidad'      => ['type' => 'enum', 'values' => ['3D', 'VR'], 'label' => 'Modalidad'],
            'duracion_min'   => ['type' => 'int', 'min' => 1, 'max' => 600, 'label' => 'Duración'],
            'puntaje'        => ['type' => 'int', 'min' => 0, 'max' => 100, 'label' => 'Puntaje'],
            'completada'     => ['type' => 'bool', 'label' => 'Completada'],
        ], input());
        [$scope, $sp, $locked] = content_scope($u, 'l', 'laboratorio_carrera', 'laboratorio_id');
        $lab = one("SELECT l.id, $locked AS bloqueado FROM laboratorios l WHERE l.id = ? $scope", [$data['laboratorio_id'], ...$sp]);
        if (!$lab) throw new HttpError(422, 'Ese laboratorio no está disponible para ti.');
        if ((int)$lab['bloqueado']) throw new HttpError(402, 'Este laboratorio es parte del plan Premium.');
        if (!empty($data['clase_id'])) {
            $ok = val("SELECT 1 FROM inscripciones i JOIN clase_laboratorio cl ON cl.clase_id = i.clase_id
                        WHERE i.estudiante_id = ? AND i.clase_id = ? AND cl.laboratorio_id = ? AND i.estado <> 'retirado'",
                      [$u['estudiante_id'], $data['clase_id'], $data['laboratorio_id']]);
            if (!$ok) throw new HttpError(422, 'Ese laboratorio no está asignado a esa clase.');
        }
        $data['modalidad'] = $data['modalidad'] ?? '3D';
        json_out(['id' => insert('practicas', $data + ['estudiante_id' => $u['estudiante_id']])], 201);
    }

    if ($m === 'DELETE' && isset($p[1]) && ctype_digit($p[1])) {
        require_user('admin');
        must_exist('practicas', (int)$p[1], 'La práctica');
        q('DELETE FROM practicas WHERE id = ?', [(int)$p[1]]);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

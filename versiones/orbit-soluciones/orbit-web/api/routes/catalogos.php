<?php
// CRUD de tablas simples: universidades, carreras, simuladores, licencias y solicitudes de cotización.
declare(strict_types=1);

/**
 * CRUD genérico. $cfg:
 *   table, select (SELECT ... FROM ... WHERE 1=1), alias, search (columnas), filters (param => columna),
 *   order, spec (validación), label, roles (quién puede usarlo)
 */
function simple_crud(string $method, array $p, array $cfg): void
{
    require_user(...$cfg['roles']);
    $id = isset($p[1]) ? (ctype_digit($p[1]) ? (int)$p[1] : throw new HttpError(404, 'Ruta no encontrada.')) : null;
    if (count($p) > 2) throw new HttpError(404, 'Ruta no encontrada.');
    $a = $cfg['alias'];

    if ($method === 'GET' && $id === null) {
        $params = [];
        $sql = $cfg['select'] . search_clause($cfg['search'], $_GET['q'] ?? null, $params);
        foreach ($cfg['filters'] ?? [] as $param => $col) {
            if (isset($_GET[$param]) && $_GET[$param] !== '') { $sql .= " AND $col = ?"; $params[] = $_GET[$param]; }
        }
        json_out(['items' => rows($sql . ' ORDER BY ' . $cfg['order'], $params)]);
    }
    if ($method === 'GET') {
        $r = one($cfg['select'] . " AND $a.id = ?", [$id]);
        if (!$r) throw new HttpError(404, $cfg['label'] . ' no existe.');
        json_out(['item' => $r]);
    }
    if ($method === 'POST' && $id === null) {
        $data = validate($cfg['spec'], input());
        json_out(['id' => insert($cfg['table'], $data)], 201);
    }
    if ($method === 'PUT' && $id !== null) {
        must_exist($cfg['table'], $id, $cfg['label']);
        update($cfg['table'], $id, validate($cfg['spec'], input(), true));
        json_out(['ok' => true]);
    }
    if ($method === 'DELETE' && $id !== null) {
        must_exist($cfg['table'], $id, $cfg['label']);
        q("DELETE FROM `{$cfg['table']}` WHERE id = ?", [$id]);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

function route_universidades(string $m, array $p): void
{
    simple_crud($m, $p, [
        'table' => 'universidades', 'alias' => 'u', 'label' => 'La institución', 'roles' => ['admin'],
        'select' => 'SELECT u.*,
                        (SELECT COUNT(*) FROM carreras c WHERE c.universidad_id = u.id) AS carreras,
                        (SELECT COUNT(*) FROM estudiantes e JOIN carreras c ON c.id = e.carrera_id WHERE c.universidad_id = u.id) AS estudiantes
                      FROM universidades u WHERE 1=1',
        'search' => ['u.nombre', 'u.sigla', 'u.ciudad'],
        'filters' => ['tipo' => 'u.tipo'],
        'order' => 'u.nombre',
        'spec' => [
            'nombre'         => ['type' => 'str', 'req' => true, 'max' => 160, 'label' => 'Nombre'],
            'sigla'          => ['type' => 'str', 'max' => 20, 'label' => 'Sigla'],
            'tipo'           => ['type' => 'enum', 'req' => true, 'values' => ['universidad', 'instituto', 'colegio'], 'label' => 'Tipo'],
            'ciudad'         => ['type' => 'str', 'max' => 80, 'label' => 'Ciudad'],
            'pais'           => ['type' => 'str', 'req' => true, 'max' => 60, 'label' => 'País'],
            'email_contacto' => ['type' => 'email', 'max' => 160, 'label' => 'Correo de contacto'],
            'telefono'       => ['type' => 'str', 'max' => 30, 'label' => 'Teléfono'],
            'activo'         => ['type' => 'bool', 'label' => 'Activo'],
        ],
    ]);
}

function route_carreras(string $m, array $p): void
{
    simple_crud($m, $p, [
        'table' => 'carreras', 'alias' => 'c', 'label' => 'La carrera', 'roles' => ['admin'],
        'select' => 'SELECT c.*, u.nombre AS universidad, u.sigla AS universidad_sigla,
                        (SELECT COUNT(*) FROM estudiantes e WHERE e.carrera_id = c.id) AS estudiantes,
                        (SELECT COUNT(*) FROM clases k WHERE k.carrera_id = c.id) AS clases,
                        (SELECT COUNT(*) FROM laboratorio_carrera lc WHERE lc.carrera_id = c.id) AS laboratorios
                      FROM carreras c JOIN universidades u ON u.id = c.universidad_id WHERE 1=1',
        'search' => ['c.nombre', 'c.codigo', 'u.nombre', 'u.sigla'],
        'filters' => ['universidad_id' => 'c.universidad_id', 'area' => 'c.area'],
        'order' => 'u.nombre, c.nombre',
        'spec' => [
            'universidad_id'     => ['type' => 'int', 'req' => true, 'label' => 'Institución'],
            'nombre'             => ['type' => 'str', 'req' => true, 'max' => 140, 'label' => 'Nombre'],
            'codigo'             => ['type' => 'str', 'max' => 20, 'label' => 'Código'],
            'area'               => ['type' => 'enum', 'req' => true, 'values' => ['Salud', 'Ingeniería y técnica', 'Ciencias sociales', 'Educación', 'Otra'], 'label' => 'Área'],
            'duracion_semestres' => ['type' => 'int', 'min' => 1, 'max' => 20, 'label' => 'Duración'],
            'activo'             => ['type' => 'bool', 'label' => 'Activa'],
        ],
    ]);
}

function route_licencias(string $m, array $p): void
{
    if (in_array($m, ['POST', 'PUT'], true)) {
        $in = input();
        if (!empty($in['fecha_inicio']) && !empty($in['fecha_fin']) && $in['fecha_fin'] < $in['fecha_inicio']) {
            throw new HttpError(422, 'Revisa los campos marcados.', ['fecha_fin' => 'La fecha de fin debe ser posterior al inicio.']);
        }
    }
    simple_crud($m, $p, [
        'table' => 'licencias', 'alias' => 'l', 'label' => 'La licencia', 'roles' => ['admin'],
        'select' => 'SELECT l.*, u.nombre AS universidad,
                        (SELECT COUNT(*) FROM estudiantes e JOIN carreras c ON c.id = e.carrera_id WHERE c.universidad_id = l.universidad_id) AS estudiantes_actuales
                      FROM licencias l JOIN universidades u ON u.id = l.universidad_id WHERE 1=1',
        'search' => ['u.nombre', 'l.notas'],
        'filters' => ['estado' => 'l.estado', 'universidad_id' => 'l.universidad_id'],
        'order' => 'l.fecha_inicio DESC',
        'spec' => [
            'universidad_id'        => ['type' => 'int', 'req' => true, 'label' => 'Institución'],
            'plan'                  => ['type' => 'enum', 'req' => true, 'values' => ['piloto', 'institucional', 'proyecto_medida'], 'label' => 'Plan'],
            'precio_estudiante_mes' => ['type' => 'dec', 'req' => true, 'min' => 0, 'max' => 99999, 'label' => 'Precio por estudiante'],
            'estudiantes_max'       => ['type' => 'int', 'min' => 1, 'label' => 'Máximo de estudiantes'],
            'fecha_inicio'          => ['type' => 'date', 'req' => true, 'label' => 'Inicio'],
            'fecha_fin'             => ['type' => 'date', 'label' => 'Fin'],
            'estado'                => ['type' => 'enum', 'req' => true, 'values' => ['activa', 'vencida', 'suspendida'], 'label' => 'Estado'],
            'notas'                 => ['type' => 'str', 'max' => 255, 'label' => 'Notas'],
        ],
    ]);
}

function route_solicitudes(string $m, array $p): void
{
    // Cualquiera puede enviar una solicitud desde el formulario de contacto.
    if ($m === 'POST' && count($p) === 1) {
        $in = input();
        if (!empty($in['sitio_web'])) json_out(['ok' => true], 201); // campo trampa contra bots
        $last = $_SESSION['solicitud_ts'] ?? 0;
        if (time() - $last < 30) throw new HttpError(429, 'Ya recibimos tu solicitud. Espera un momento antes de enviar otra.');
        $data = validate([
            'nombre'      => ['type' => 'str', 'req' => true, 'max' => 120, 'label' => 'Nombre'],
            'institucion' => ['type' => 'str', 'max' => 160, 'label' => 'Institución'],
            'email'       => ['type' => 'email', 'req' => true, 'max' => 160, 'label' => 'Correo'],
            'tipo'        => ['type' => 'str', 'max' => 80, 'label' => 'Tipo'],
            'mensaje'     => ['type' => 'text', 'req' => true, 'min' => 5, 'max' => 3000, 'label' => 'Mensaje'],
        ], $in);
        $_SESSION['solicitud_ts'] = time();
        json_out(['id' => insert('solicitudes', $data)], 201);
    }
    if ($m === 'POST') throw new HttpError(405, 'Método no permitido.');
    simple_crud($m, $p, [
        'table' => 'solicitudes', 'alias' => 's', 'label' => 'La solicitud', 'roles' => ['admin'],
        'select' => 'SELECT s.* FROM solicitudes s WHERE 1=1',
        'search' => ['s.nombre', 's.institucion', 's.email', 's.mensaje'],
        'filters' => ['estado' => 's.estado'],
        'order' => 's.creado_en DESC',
        'spec' => [
            'estado' => ['type' => 'enum', 'req' => true, 'values' => ['nueva', 'en_proceso', 'cotizada', 'cerrada'], 'label' => 'Estado'],
        ],
    ]);
}

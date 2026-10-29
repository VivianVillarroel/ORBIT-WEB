<?php
// CRUD de docentes y estudiantes. Cada uno es un usuario (para iniciar sesión) más su ficha propia.
declare(strict_types=1);

function user_spec(): array
{
    return [
        'nombre'   => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Nombre'],
        'apellido' => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Apellido'],
        'email'    => ['type' => 'email', 'req' => true, 'max' => 160, 'label' => 'Correo'],
        'telefono' => ['type' => 'str', 'max' => 30, 'label' => 'Teléfono'],
        'activo'   => ['type' => 'bool', 'label' => 'Activo'],
    ];
}

function email_taken(string $email, ?int $exceptUserId = null): void
{
    $id = val('SELECT id FROM usuarios WHERE email = ?', [$email]);
    if ($id && (int)$id !== $exceptUserId) throw new HttpError(422, 'Revisa los campos marcados.', ['email' => 'Ya hay una cuenta con ese correo.']);
}

/** Crea o actualiza la fila de usuarios. En la creación la contraseña es obligatoria; al editar, vacía = no cambia. */
function save_user(array $in, string $rol, ?int $universidadId, ?int $userId = null): int
{
    $u = validate(user_spec(), $in);
    email_taken($u['email'], $userId);
    $pass = (string)($in['password'] ?? '');
    if ($userId === null || $pass !== '') {
        if ($userId === null && $pass === '') throw new HttpError(422, 'Revisa los campos marcados.', ['password' => 'La contraseña inicial es obligatoria.']);
        check_password($pass);
        $u['password_hash'] = password_hash($pass, PASSWORD_DEFAULT);
    }
    $u['universidad_id'] = $universidadId;
    if ($userId === null) {
        $u['rol'] = $rol;
        if (!array_key_exists('activo', $u)) $u['activo'] = 1;
        return insert('usuarios', $u);
    }
    update('usuarios', $userId, $u);
    return $userId;
}

/* ---------------- Docentes ---------------- */

function docentes_select(): string
{
    return 'SELECT d.id, d.usuario_id, u.nombre, u.apellido, u.email, u.telefono, u.activo, u.ultimo_acceso,
                   u.universidad_id, un.nombre AS universidad, d.especialidad, d.grado_academico,
                   (SELECT GROUP_CONCAT(c.nombre ORDER BY c.nombre SEPARATOR \', \') FROM docente_carrera dc JOIN carreras c ON c.id = dc.carrera_id WHERE dc.docente_id = d.id) AS carreras,
                   (SELECT GROUP_CONCAT(dc.carrera_id) FROM docente_carrera dc WHERE dc.docente_id = d.id) AS carrera_ids,
                   (SELECT COUNT(*) FROM clases k WHERE k.docente_id = d.id) AS clases
              FROM docentes d
              JOIN usuarios u ON u.id = d.usuario_id
              LEFT JOIN universidades un ON un.id = u.universidad_id
             WHERE 1=1';
}

function route_docentes(string $m, array $p): void
{
    require_user('admin');
    $id = isset($p[1]) && ctype_digit($p[1]) ? (int)$p[1] : null;
    if (isset($p[1]) && $id === null || count($p) > 2) throw new HttpError(404, 'Ruta no encontrada.');

    if ($m === 'GET' && $id === null) {
        $params = [];
        $sql = docentes_select() . search_clause(['u.nombre', 'u.apellido', 'u.email', 'd.especialidad'], $_GET['q'] ?? null, $params);
        if (!empty($_GET['universidad_id'])) { $sql .= ' AND u.universidad_id = ?'; $params[] = $_GET['universidad_id']; }
        json_out(['items' => rows($sql . ' ORDER BY u.apellido, u.nombre', $params)]);
    }
    if ($m === 'GET') {
        $r = one(docentes_select() . ' AND d.id = ?', [$id]);
        if (!$r) throw new HttpError(404, 'El docente no existe.');
        json_out(['item' => $r]);
    }

    if (($m === 'POST' && $id === null) || ($m === 'PUT' && $id !== null)) {
        $in = input();
        $doc = $id ? must_exist('docentes', $id, 'El docente') : null;
        $extra = validate([
            'universidad_id'  => ['type' => 'int', 'req' => true, 'label' => 'Institución'],
            'especialidad'    => ['type' => 'str', 'max' => 120, 'label' => 'Especialidad'],
            'grado_academico' => ['type' => 'enum', 'values' => ['Licenciatura', 'Especialidad', 'Maestría', 'Doctorado'], 'label' => 'Grado académico'],
        ], $in);
        must_exist('universidades', $extra['universidad_id'], 'La institución');
        $carreras = id_list($in['carrera_ids'] ?? [], 'carrera_ids');
        if ($carreras) {
            $ph = implode(',', array_fill(0, count($carreras), '?'));
            $ok = (int)val("SELECT COUNT(*) FROM carreras WHERE universidad_id = ? AND id IN ($ph)", [$extra['universidad_id'], ...$carreras]);
            if ($ok !== count($carreras)) throw new HttpError(422, 'Revisa los campos marcados.', ['carrera_ids' => 'Elige carreras de la misma institución.']);
        }

        db()->beginTransaction();
        try {
            $uid = save_user($in, 'docente', $extra['universidad_id'], $doc ? (int)$doc['usuario_id'] : null);
            $fields = ['especialidad' => $extra['especialidad'] ?? null, 'grado_academico' => $extra['grado_academico'] ?? null];
            if ($doc) { update('docentes', $id, $fields); $did = $id; }
            else { $did = insert('docentes', $fields + ['usuario_id' => $uid]); }
            q('DELETE FROM docente_carrera WHERE docente_id = ?', [$did]);
            foreach ($carreras as $cid) q('INSERT INTO docente_carrera (docente_id, carrera_id) VALUES (?, ?)', [$did, $cid]);
            db()->commit();
        } catch (Throwable $e) { db()->rollBack(); throw $e; }
        json_out($doc ? ['ok' => true] : ['id' => $did], $doc ? 200 : 201);
    }

    if ($m === 'DELETE' && $id !== null) {
        $doc = must_exist('docentes', $id, 'El docente');
        // Sus clases quedan sin docente asignado (no se borran).
        q('DELETE FROM usuarios WHERE id = ?', [$doc['usuario_id']]);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

/* ---------------- Estudiantes ---------------- */

function estudiantes_select(): string
{
    return 'SELECT e.id, e.usuario_id, u.nombre, u.apellido, u.email, u.telefono, u.activo, u.ultimo_acceso, e.tipo,
                   e.carrera_id, c.nombre AS carrera, c.universidad_id, un.nombre AS universidad, un.sigla AS universidad_sigla,
                   e.codigo, e.semestre, e.fecha_ingreso,
                   (SELECT COUNT(*) FROM inscripciones i WHERE i.estudiante_id = e.id AND i.estado <> \'retirado\') AS clases,
                   (SELECT COUNT(*) FROM practicas pr WHERE pr.estudiante_id = e.id) AS practicas,
                   (SELECT MAX(s.fecha_fin) FROM suscripciones s WHERE s.usuario_id = u.id AND s.estado = \'activa\' AND s.fecha_fin >= CURDATE()) AS premium_hasta
              FROM estudiantes e
              JOIN usuarios u ON u.id = e.usuario_id
              LEFT JOIN carreras c ON c.id = e.carrera_id
              LEFT JOIN universidades un ON un.id = c.universidad_id
             WHERE 1=1';
}

function route_estudiantes(string $m, array $p): void
{
    require_user('admin');
    $id = isset($p[1]) && ctype_digit($p[1]) ? (int)$p[1] : null;
    if (isset($p[1]) && $id === null || count($p) > 2) throw new HttpError(404, 'Ruta no encontrada.');

    if ($m === 'GET' && $id === null) {
        $params = [];
        $sql = estudiantes_select() . search_clause(['u.nombre', 'u.apellido', 'u.email', 'e.codigo'], $_GET['q'] ?? null, $params);
        foreach (['carrera_id' => 'e.carrera_id', 'universidad_id' => 'c.universidad_id', 'tipo' => 'e.tipo'] as $k => $col) {
            if (!empty($_GET[$k])) { $sql .= " AND $col = ?"; $params[] = $_GET[$k]; }
        }
        json_out(['items' => rows($sql . ' ORDER BY u.apellido, u.nombre', $params)]);
    }
    if ($m === 'GET') {
        $r = one(estudiantes_select() . ' AND e.id = ?', [$id]);
        if (!$r) throw new HttpError(404, 'El estudiante no existe.');
        json_out(['item' => $r]);
    }

    if (($m === 'POST' && $id === null) || ($m === 'PUT' && $id !== null)) {
        $in = input();
        $est = $id ? must_exist('estudiantes', $id, 'El estudiante') : null;
        $tipo = ($in['tipo'] ?? 'institucional') === 'independiente' ? 'independiente' : 'institucional';
        $inst = $tipo === 'institucional';
        $extra = validate([
            'carrera_id'    => ['type' => 'int', 'req' => $inst, 'label' => 'Carrera'],
            'codigo'        => ['type' => 'str', 'req' => $inst, 'max' => 30, 'label' => 'Código de estudiante'],
            'semestre'      => ['type' => 'int', 'min' => 1, 'max' => 20, 'label' => 'Semestre'],
            'fecha_ingreso' => ['type' => 'date', 'label' => 'Fecha de ingreso'],
        ], $in);
        $extra['tipo'] = $tipo;
        $universidadId = null;
        if ($inst) {
            $universidadId = (int)must_exist('carreras', $extra['carrera_id'], 'La carrera')['universidad_id'];
        } else {
            $extra['carrera_id'] = null; // los independientes no pertenecen a una carrera
        }
        if (!empty($extra['codigo'])) {
            $dup = val('SELECT id FROM estudiantes WHERE codigo = ?', [$extra['codigo']]);
            if ($dup && (int)$dup !== $id) throw new HttpError(422, 'Revisa los campos marcados.', ['codigo' => 'Ese código ya está registrado.']);
        }

        db()->beginTransaction();
        try {
            $uid = save_user($in, 'estudiante', $universidadId, $est ? (int)$est['usuario_id'] : null);
            if (empty($extra['codigo'])) $extra['codigo'] = $est['codigo'] ?? 'LIBRE-' . str_pad((string)$uid, 6, '0', STR_PAD_LEFT);
            if ($est) { update('estudiantes', $id, $extra); $eid = $id; }
            else { $eid = insert('estudiantes', $extra + ['usuario_id' => $uid]); }
            db()->commit();
        } catch (Throwable $e) { db()->rollBack(); throw $e; }
        json_out($est ? ['ok' => true] : ['id' => $eid], $est ? 200 : 201);
    }

    if ($m === 'DELETE' && $id !== null) {
        $est = must_exist('estudiantes', $id, 'El estudiante');
        q('DELETE FROM usuarios WHERE id = ?', [$est['usuario_id']]);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

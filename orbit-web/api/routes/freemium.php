<?php
// Versión freemium: catálogo público, registro de estudiantes independientes, plan Premium mensual y pagos.
declare(strict_types=1);

/** Catálogo que se muestra en la página principal sin iniciar sesión. */
function route_catalogo(string $m, array $p): void
{
    if ($m !== 'GET' || count($p) > 1) throw new HttpError(404, 'Ruta no encontrada.');
    json_out([
        'laboratorios' => rows("SELECT id, nombre, area, equipo, descripcion, imagen_url, gratis, vr_disponible
                                  FROM laboratorios WHERE estado = 'publicado' AND catalogo_publico = 1
                                 ORDER BY gratis DESC, nombre"),
        'libros' => rows("SELECT id, titulo, autor, materia, descripcion, portada_url, gratis
                            FROM libros WHERE estado = 'publicado' AND catalogo_publico = 1
                           ORDER BY gratis DESC, titulo"),
        'planes' => rows('SELECT codigo, nombre, precio_mes, descripcion FROM planes WHERE activo = 1 ORDER BY precio_mes'),
    ]);
}

/** Registro abierto para estudiantes que no pertenecen a una institución con licencia. */
function route_registro(string $m, array $p): void
{
    if ($m !== 'POST' || count($p) > 1) throw new HttpError(404, 'Ruta no encontrada.');
    $hits = array_filter($_SESSION['registros'] ?? [], fn($ts) => $ts > time() - 600);
    if (count($hits) >= 3) throw new HttpError(429, 'Demasiados registros seguidos. Espera unos minutos.');

    $in = input();
    $data = validate([
        'nombre'   => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Nombre'],
        'apellido' => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Apellido'],
        'email'    => ['type' => 'email', 'req' => true, 'max' => 160, 'label' => 'Correo'],
    ], $in);
    $pass = (string)($in['password'] ?? '');
    check_password($pass);
    if (val('SELECT id FROM usuarios WHERE email = ?', [$data['email']])) {
        throw new HttpError(422, 'Revisa los campos marcados.', ['email' => 'Ya hay una cuenta con ese correo. Inicia sesión.']);
    }

    db()->beginTransaction();
    try {
        $uid = insert('usuarios', $data + ['password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'rol' => 'estudiante', 'universidad_id' => null, 'activo' => 1]);
        insert('estudiantes', ['usuario_id' => $uid, 'tipo' => 'independiente', 'carrera_id' => null, 'codigo' => 'LIBRE-' . str_pad((string)$uid, 6, '0', STR_PAD_LEFT)]);
        db()->commit();
    } catch (Throwable $e) { db()->rollBack(); throw $e; }

    $hits[] = time();
    session_regenerate_id(true);
    $_SESSION = ['uid' => $uid, 'registros' => $hits];
    q('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [$uid]);
    json_out(['user' => public_user(current_user()), 'csrf' => csrf_token()], 201);
}

/** Plan del estudiante independiente: ver estado y reportar un pago. */
function route_suscripcion(string $m, array $p): void
{
    $u = require_user('estudiante');
    $st = student_of($u);
    if (!$st || $st['tipo'] !== 'independiente') throw new HttpError(403, 'Tu acceso lo da tu institución; no necesitas un plan.');
    $uid = (int)$u['id'];
    $action = $p[1] ?? null;

    if ($m === 'GET' && $action === null) {
        json_out([
            'planes' => rows('SELECT id, codigo, nombre, precio_mes, descripcion FROM planes WHERE activo = 1 ORDER BY precio_mes'),
            'actual' => premium_of($uid),
            'pendiente' => one("SELECT id, monto, meses, metodo, referencia, creado_en FROM pagos WHERE usuario_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1", [$uid]),
            'pagos' => rows('SELECT id, monto, meses, metodo, referencia, estado, creado_en, revisado_en FROM pagos WHERE usuario_id = ? ORDER BY creado_en DESC', [$uid]),
        ]);
    }

    if ($m === 'POST' && $action === 'pago') {
        $data = validate([
            'metodo'     => ['type' => 'enum', 'req' => true, 'values' => ['qr', 'transferencia'], 'label' => 'Método de pago'],
            'referencia' => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Número de transacción'],
            'meses'      => ['type' => 'int', 'req' => true, 'min' => 1, 'max' => 12, 'label' => 'Meses'],
        ], input());
        if (val("SELECT 1 FROM pagos WHERE usuario_id = ? AND estado = 'pendiente'", [$uid])) {
            throw new HttpError(409, 'Ya tienes un pago en revisión. Te avisaremos cuando se confirme.');
        }
        $plan = one("SELECT id, precio_mes FROM planes WHERE codigo = 'premium' AND activo = 1");
        if (!$plan) throw new HttpError(409, 'El plan Premium no está disponible en este momento.');

        db()->beginTransaction();
        try {
            $sub = premium_of($uid);
            $subId = $sub ? (int)$sub['id'] : (int)val("SELECT id FROM suscripciones WHERE usuario_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1", [$uid]);
            if (!$subId) $subId = insert('suscripciones', ['usuario_id' => $uid, 'plan_id' => $plan['id'], 'estado' => 'pendiente']);
            $pid = insert('pagos', [
                'suscripcion_id' => $subId, 'usuario_id' => $uid, 'monto' => round((float)$plan['precio_mes'] * $data['meses'], 2),
                'meses' => $data['meses'], 'metodo' => $data['metodo'], 'referencia' => $data['referencia'],
            ]);
            db()->commit();
        } catch (Throwable $e) { db()->rollBack(); throw $e; }
        json_out(['id' => $pid], 201);
    }
    throw new HttpError(405, 'Método no permitido.');
}

/** Admin: revisar pagos. Confirmar activa la suscripción o la extiende por los meses pagados. */
function route_pagos(string $m, array $p): void
{
    $admin = require_user('admin');
    $id = isset($p[1]) && ctype_digit($p[1]) ? (int)$p[1] : null;

    if ($m === 'GET' && $id === null) {
        $params = [];
        $sql = "SELECT pg.*, CONCAT(u.nombre, ' ', u.apellido) AS estudiante, u.email, s.estado AS suscripcion_estado, s.fecha_fin,
                       CONCAT(r.nombre, ' ', r.apellido) AS revisor
                  FROM pagos pg
                  JOIN usuarios u ON u.id = pg.usuario_id
                  JOIN suscripciones s ON s.id = pg.suscripcion_id
                  LEFT JOIN usuarios r ON r.id = pg.revisado_por
                 WHERE 1=1" . search_clause(['u.nombre', 'u.apellido', 'u.email', 'pg.referencia'], $_GET['q'] ?? null, $params);
        if (!empty($_GET['estado'])) { $sql .= ' AND pg.estado = ?'; $params[] = $_GET['estado']; }
        json_out(['items' => rows($sql . " ORDER BY pg.estado = 'pendiente' DESC, pg.creado_en DESC", $params)]);
    }

    if ($m === 'PUT' && $id !== null) {
        $data = validate(['accion' => ['type' => 'enum', 'req' => true, 'values' => ['confirmar', 'rechazar'], 'label' => 'Acción']], input());
        $pago = must_exist('pagos', $id, 'El pago');
        if ($pago['estado'] !== 'pendiente') throw new HttpError(409, 'Este pago ya fue revisado.');
        db()->beginTransaction();
        try {
            if ($data['accion'] === 'confirmar') {
                $sub = one('SELECT * FROM suscripciones WHERE id = ? FOR UPDATE', [$pago['suscripcion_id']]);
                $meses = (int)$pago['meses'];
                if ($sub['estado'] === 'activa' && $sub['fecha_fin'] >= date('Y-m-d')) {
                    q("UPDATE suscripciones SET fecha_fin = DATE_ADD(fecha_fin, INTERVAL $meses MONTH) WHERE id = ?", [$sub['id']]);
                } else {
                    q("UPDATE suscripciones SET estado = 'activa', fecha_inicio = CURDATE(), fecha_fin = DATE_ADD(CURDATE(), INTERVAL $meses MONTH) WHERE id = ?", [$sub['id']]);
                }
                q("UPDATE pagos SET estado = 'confirmado', revisado_por = ?, revisado_en = NOW() WHERE id = ?", [$admin['id'], $id]);
            } else {
                q("UPDATE pagos SET estado = 'rechazado', revisado_por = ?, revisado_en = NOW() WHERE id = ?", [$admin['id'], $id]);
                q("UPDATE suscripciones SET estado = 'cancelada' WHERE id = ? AND estado = 'pendiente'", [$pago['suscripcion_id']]);
            }
            db()->commit();
        } catch (Throwable $e) { db()->rollBack(); throw $e; }
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

/** Admin: precios y descripción de los planes freemium. */
function route_planes(string $m, array $p): void
{
    if (!in_array($m, ['GET', 'PUT'], true)) throw new HttpError(405, 'Los planes solo se pueden editar.');
    simple_crud($m, $p, [
        'table' => 'planes', 'alias' => 'pl', 'label' => 'El plan', 'roles' => ['admin'],
        'select' => "SELECT pl.*, (SELECT COUNT(*) FROM suscripciones s WHERE s.plan_id = pl.id AND s.estado = 'activa' AND s.fecha_fin >= CURDATE()) AS activas
                       FROM planes pl WHERE 1=1",
        'search' => ['pl.nombre'], 'order' => 'pl.precio_mes',
        'spec' => [
            'nombre'      => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Nombre'],
            'precio_mes'  => ['type' => 'dec', 'req' => true, 'min' => 0, 'max' => 99999, 'label' => 'Precio mensual'],
            'descripcion' => ['type' => 'str', 'max' => 255, 'label' => 'Descripción'],
            'activo'      => ['type' => 'bool', 'label' => 'Activo'],
        ],
    ]);
}

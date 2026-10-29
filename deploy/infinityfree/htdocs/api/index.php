<?php
// ORBIT — API JSON. Todas las rutas entran por aquí: api/index.php?r=recurso/id/subrecurso/id
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/acceso.php';
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/academico.php';
require __DIR__ . '/routes/catalogos.php';
require __DIR__ . '/routes/personas.php';
require __DIR__ . '/routes/clases.php';
require __DIR__ . '/routes/panel.php';
require __DIR__ . '/routes/contenidos.php';
require __DIR__ . '/routes/freemium.php';
require __DIR__ . '/routes/importar.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

try {
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE'], true)) throw new HttpError(405, 'Método no permitido.');

    start_session();
    $parts = array_values(array_filter(explode('/', (string)($_GET['r'] ?? '')), 'strlen'));
    $res = $parts[0] ?? '';

    // Rutas públicas que cambian datos: iniciar sesión, registrarse (freemium) y enviar una solicitud de cotización.
    $public = ($res === 'auth' && ($parts[1] ?? '') === 'login')
        || ($res === 'registro' && count($parts) === 1)
        || ($res === 'solicitudes' && $method === 'POST' && count($parts) === 1);
    if ($method !== 'GET' && !$public) check_csrf();

    $routes = [
        'auth'          => 'route_auth',
        'dashboard'     => 'route_dashboard',
        'academico' => 'route_academico', 'directores' => 'route_directores', 'certificados' => 'route_certificados',
        'opciones'      => 'route_opciones',
        'universidades' => 'route_universidades',
        'carreras'      => 'route_carreras',
        'licencias'     => 'route_licencias',
        'solicitudes'   => 'route_solicitudes',
        'docentes'      => 'route_docentes',
        'estudiantes'   => 'route_estudiantes',
        'clases'        => 'route_clases',
        'practicas'     => 'route_practicas',
        'laboratorios'  => 'route_laboratorios',
        'libros'        => 'route_libros',
        'catalogo'      => 'route_catalogo',
        'registro'      => 'route_registro',
        'suscripcion'   => 'route_suscripcion',
        'pagos'         => 'route_pagos',
        'planes'        => 'route_planes',
        'importar'      => 'route_importar',
    ];
    if (!isset($routes[$res])) throw new HttpError(404, 'Ruta no encontrada.');
    $routes[$res]($method, $parts);
    throw new HttpError(404, 'Ruta no encontrada.');
} catch (HttpError $e) {
    $body = ['error' => $e->getMessage()];
    if ($e->fields) $body['fields'] = $e->fields;
    json_out($body, $e->getCode());
} catch (PDOException $e) {
    $code = $e->errorInfo[1] ?? 0;
    if ($code === 1062) json_out(['error' => 'Ya existe un registro con esos datos (correo, código o nombre repetido).'], 409);
    if ($code === 1451) json_out(['error' => 'No se puede eliminar porque tiene registros asociados. Elimina o mueve primero esos registros.'], 409);
    if ($code === 1452) json_out(['error' => 'Uno de los datos relacionados no existe.'], 422);
    if (in_array($code, [1044, 1045, 1049, 2002, 2003, 2005], true) || stripos($e->getMessage(), 'connection') !== false) {
        json_out(['error' => 'No se pudo conectar con la base de datos. Revisa api/config.local.php.'], 503);
    }
    error_log('[ORBIT] ' . $e->getMessage());
    json_out(['error' => 'Error de base de datos.' . (config()['debug'] ? ' ' . $e->getMessage() : '')], 500);
} catch (Throwable $e) {
    error_log('[ORBIT] ' . $e);
    json_out(['error' => 'Error inesperado en el servidor.' . (config()['debug'] ? ' ' . $e->getMessage() : '')], 500);
}

<?php
// Inicio y cierre de sesión, perfil propio y cambio de contraseña.
declare(strict_types=1);

function public_user(array $u): array
{
    $st = student_of($u);
    $premium = $st && $st['tipo'] === 'independiente' ? premium_of((int)$u['id']) : null;
    return [
        'tipo_estudiante' => $st['tipo'] ?? null,
        'premium_hasta' => $premium['fecha_fin'] ?? null,
        'id' => (int)$u['id'], 'nombre' => $u['nombre'], 'apellido' => $u['apellido'], 'email' => $u['email'],
        'director_carrera_id' => $u['director_carrera_id'] !== null ? (int)$u['director_carrera_id'] : null, 'rol' => $u['rol'], 'telefono' => $u['telefono'], 'universidad' => $u['universidad'],
        'docente_id' => $u['docente_id'] !== null ? (int)$u['docente_id'] : null,
        'estudiante_id' => $u['estudiante_id'] !== null ? (int)$u['estudiante_id'] : null,
    ];
}

function route_auth(string $method, array $p): void
{
    $action = $p[1] ?? '';

    if ($action === 'login' && $method === 'POST') {
        $in = input();
        $email = mb_strtolower(trim((string)($in['email'] ?? '')));
        $pass = (string)($in['password'] ?? '');
        if ($email === '' || $pass === '') throw new HttpError(422, 'Escribe tu correo y tu contraseña.');

        // Freno simple a intentos repetidos desde la misma sesión.
        $fails = $_SESSION['login_fails'] ?? 0;
        if ($fails >= 5 && time() - ($_SESSION['login_last'] ?? 0) < 60) {
            throw new HttpError(429, 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
        }

        $row = one('SELECT id, password_hash, activo FROM usuarios WHERE email = ?', [$email]);
        if (!$row || !password_verify($pass, $row['password_hash'])) {
            $_SESSION['login_fails'] = $fails + 1; $_SESSION['login_last'] = time();
            usleep(300000);
            throw new HttpError(401, 'El correo o la contraseña no son correctos.');
        }
        if (!(int)$row['activo']) throw new HttpError(403, 'Tu cuenta está desactivada. Habla con el administrador de tu institución.');

        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            q('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $row['id']]);
        }
        session_regenerate_id(true);
        $_SESSION = ['uid' => (int)$row['id']];
        q('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [$row['id']]);
        json_out(['user' => public_user(current_user()), 'csrf' => csrf_token()]);
    }

    if ($action === 'logout' && $method === 'POST') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $c = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $c['path'], 'secure' => $c['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        }
        session_destroy();
        json_out(['ok' => true]);
    }

    if ($action === 'me' && $method === 'GET') {
        $u = require_user();
        json_out(['user' => public_user($u), 'csrf' => csrf_token()]);
    }

    if ($action === 'me' && $method === 'PUT') {
        $u = require_user();
        $data = validate([
            'nombre'   => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Nombre'],
            'apellido' => ['type' => 'str', 'req' => true, 'max' => 80, 'label' => 'Apellido'],
            'telefono' => ['type' => 'str', 'max' => 30, 'label' => 'Teléfono'],
        ], input());
        update('usuarios', (int)$u['id'], $data);
        json_out(['ok' => true]);
    }

    if ($action === 'password' && $method === 'POST') {
        $u = require_user();
        $in = input();
        $hash = val('SELECT password_hash FROM usuarios WHERE id = ?', [$u['id']]);
        if (!password_verify((string)($in['actual'] ?? ''), (string)$hash)) {
            throw new HttpError(422, 'Revisa los campos marcados.', ['actual' => 'La contraseña actual no es correcta.']);
        }
        $new = (string)($in['nueva'] ?? '');
        check_password($new, 'nueva');
        q('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        json_out(['ok' => true]);
    }

    throw new HttpError(404, 'Ruta no encontrada.');
}

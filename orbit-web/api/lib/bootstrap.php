<?php
// Utilidades comunes de la API: conexión, respuestas JSON, sesión, roles y validación.
declare(strict_types=1);

final class HttpError extends Exception
{
    public array $fields;
    public function __construct(int $status, string $message, array $fields = [])
    {
        parent::__construct($message, $status);
        $this->fields = $fields;
    }
}

function config(): array
{
    static $c = null;
    if ($c === null) $c = require __DIR__ . '/../config.php';
    return $c;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db_host'], $c['db_port'], $c['db_name']);
        $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}
function rows(string $sql, array $params = []): array { return q($sql, $params)->fetchAll(); }
function one(string $sql, array $params = []): ?array { $r = q($sql, $params)->fetch(); return $r === false ? null : $r; }
function val(string $sql, array $params = []) { return q($sql, $params)->fetchColumn(); }

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function input(): array
{
    static $data = null;
    if ($data !== null) return $data;
    $raw = file_get_contents('php://input') ?: '';
    $data = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($data)) throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido.');
    return $data;
}

/* ---------- Sesión ---------- */
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('orbit_sid');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function check_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
        throw new HttpError(419, 'Tu sesión expiró. Recarga la página e inténtalo de nuevo.');
    }
}

/** Usuario con sesión iniciada, con sus ids de docente o estudiante. */
function current_user(): ?array
{
    static $u = false;
    if ($u !== false) return $u;
    $id = $_SESSION['uid'] ?? null;
    if (!$id) return $u = null;
    $u = one(
        'SELECT u.id, u.nombre, u.apellido, u.email, u.rol, u.universidad_id, u.telefono, u.activo,
                d.id AS docente_id, e.id AS estudiante_id, dr.carrera_id AS director_carrera_id, un.nombre AS universidad
           FROM usuarios u
           LEFT JOIN directores dr ON dr.usuario_id = u.id
           LEFT JOIN docentes d ON d.usuario_id = u.id
           LEFT JOIN estudiantes e ON e.usuario_id = u.id
           LEFT JOIN universidades un ON un.id = u.universidad_id
          WHERE u.id = ?',
        [$id]
    );
    if (!$u || !(int)$u['activo']) { $_SESSION = []; return $u = null; }
    return $u;
}

function require_user(string ...$roles): array
{
    $u = current_user();
    if (!$u) throw new HttpError(401, 'Inicia sesión para continuar.');
    if ($roles && !in_array($u['rol'], $roles, true)) throw new HttpError(403, 'No tienes permiso para esta acción.');
    return $u;
}

/* ---------- Validación ----------
   Cada campo: ['type' => str|text|int|dec|date|enum|bool|email, 'req' => bool, 'max' => n, 'min' => n, 'values' => [...], 'label' => '...'] */
function validate(array $spec, array $in, bool $partial = false): array
{
    $out = []; $err = [];
    foreach ($spec as $name => $r) {
        $label = $r['label'] ?? $name;
        if (!array_key_exists($name, $in)) {
            if (!$partial && !empty($r['req'])) $err[$name] = "$label es obligatorio.";
            continue;
        }
        $v = $in[$name];
        if (is_string($v)) $v = trim($v);
        if ($v === '' || $v === null) {
            if (!empty($r['req'])) { $err[$name] = "$label es obligatorio."; continue; }
            $out[$name] = ($r['type'] ?? 'str') === 'bool' ? 0 : null;
            continue;
        }
        switch ($r['type'] ?? 'str') {
            case 'int':
                if (filter_var($v, FILTER_VALIDATE_INT) === false) { $err[$name] = "$label debe ser un número entero."; break; }
                $v = (int)$v;
                if (isset($r['min']) && $v < $r['min']) { $err[$name] = "$label debe ser al menos {$r['min']}."; break; }
                if (isset($r['max']) && $v > $r['max']) { $err[$name] = "$label no puede ser mayor que {$r['max']}."; break; }
                $out[$name] = $v; break;
            case 'dec':
                if (!is_numeric($v)) { $err[$name] = "$label debe ser un número."; break; }
                $v = round((float)$v, 2);
                if (isset($r['min']) && $v < $r['min']) { $err[$name] = "$label debe ser al menos {$r['min']}."; break; }
                if (isset($r['max']) && $v > $r['max']) { $err[$name] = "$label no puede ser mayor que {$r['max']}."; break; }
                $out[$name] = $v; break;
            case 'date':
                $d = DateTime::createFromFormat('!Y-m-d', (string)$v);
                if (!$d || $d->format('Y-m-d') !== $v) { $err[$name] = "$label debe ser una fecha válida."; break; }
                $out[$name] = $v; break;
            case 'enum':
                if (!in_array($v, $r['values'], true)) { $err[$name] = "$label no es una opción válida."; break; }
                $out[$name] = $v; break;
            case 'bool':
                $out[$name] = ($v === true || $v === 1 || $v === '1' || $v === 'true') ? 1 : 0; break;
            case 'email':
                if (!is_string($v) || !filter_var($v, FILTER_VALIDATE_EMAIL)) { $err[$name] = "$label no es un correo válido."; break; }
                $out[$name] = mb_strtolower($v); break;
            default: // str, text
                if (!is_string($v) && !is_numeric($v)) { $err[$name] = "$label no es válido."; break; }
                $v = (string)$v;
                $max = $r['max'] ?? (($r['type'] ?? 'str') === 'text' ? 5000 : 255);
                if (mb_strlen($v) > $max) { $err[$name] = "$label admite hasta $max caracteres."; break; }
                if (isset($r['min']) && mb_strlen($v) < $r['min']) { $err[$name] = "$label debe tener al menos {$r['min']} caracteres."; break; }
                $out[$name] = $v;
        }
    }
    if ($err) throw new HttpError(422, 'Revisa los campos marcados.', $err);
    return $out;
}

function check_password(string $p, string $field = 'password'): void
{
    if (mb_strlen($p) < 8) throw new HttpError(422, 'Revisa los campos marcados.', [$field => 'La contraseña debe tener al menos 8 caracteres.']);
}

/* ---------- SQL de ayuda ---------- */
function insert(string $table, array $data): int
{
    $cols = array_keys($data);
    $sql = "INSERT INTO `$table` (`" . implode('`,`', $cols) . "`) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")";
    q($sql, array_values($data));
    return (int)db()->lastInsertId();
}

function update(string $table, int $id, array $data): void
{
    if (!$data) return;
    $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($data)));
    q("UPDATE `$table` SET $set WHERE id = ?", [...array_values($data), $id]);
}

function must_exist(string $table, int $id, string $what = 'El registro'): array
{
    $r = one("SELECT * FROM `$table` WHERE id = ?", [$id]);
    if (!$r) throw new HttpError(404, "$what no existe.");
    return $r;
}

/** Arma filtros de búsqueda de texto (LIKE) para una lista de columnas. */
function search_clause(array $cols, ?string $term, array &$params): string
{
    $term = trim((string)$term);
    if ($term === '') return '';
    $parts = [];
    foreach ($cols as $c) { $parts[] = "$c LIKE ?"; $params[] = '%' . $term . '%'; }
    return ' AND (' . implode(' OR ', $parts) . ')';
}

function id_list($v, string $field): array
{
    if ($v === null || $v === '') return [];
    if (!is_array($v)) throw new HttpError(422, 'Revisa los campos marcados.', [$field => 'Formato no válido.']);
    $ids = [];
    foreach ($v as $x) {
        if (filter_var($x, FILTER_VALIDATE_INT) === false) throw new HttpError(422, 'Revisa los campos marcados.', [$field => 'Formato no válido.']);
        $ids[] = (int)$x;
    }
    return array_values(array_unique($ids));
}

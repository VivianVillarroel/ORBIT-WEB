<?php
// Instala la base de datos de ORBIT desde la terminal:
//   php database/install.php           crea la base y las tablas; carga los datos de prueba si está vacía
//   php database/install.php --reset   BORRA todas las tablas de ORBIT y las vuelve a crear con los datos de prueba
//   php database/install.php --sin-datos   solo crea las tablas
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Solo desde la terminal.'); }

$c = require __DIR__ . '/../api/config.php';
$reset = in_array('--reset', $argv, true);
$noSeed = in_array('--sin-datos', $argv, true);

try {
    $pdo = new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['db_host'], $c['db_port']), $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "No se pudo conectar a MySQL ({$c['db_host']}:{$c['db_port']}): {$e->getMessage()}\nRevisa api/config.local.php\n");
    exit(1);
}

$db = str_replace('`', '', $c['db_name']);
$pdo->exec("CREATE DATABASE IF NOT EXISTS `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `$db`");

function run_sql_file(PDO $pdo, string $file): int
{
    $sql = file_get_contents($file);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);           // quita comentarios de línea
    $parts = preg_split('/;\s*(\r?\n|$)/', $sql);             // separa sentencias por ";" al final de línea
    $n = 0;
    foreach ($parts as $stmt) {
        if (trim($stmt) === '') continue;
        $pdo->exec($stmt);
        $n++;
    }
    return $n;
}

if ($reset) {
    $tables = ['certificados','notas_historial','directores','pagos', 'suscripciones', 'planes', 'solicitudes', 'licencias', 'practicas', 'clase_laboratorio', 'libro_resultados', 'libro_carrera', 'libros',
               'laboratorio_carrera', 'laboratorios', 'inscripciones', 'clases', 'estudiantes', 'docente_carrera', 'docentes', 'usuarios',
               'carreras', 'universidades'];
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($tables as $t) $pdo->exec("DROP TABLE IF EXISTS `$t`");
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    echo "Tablas anteriores borradas.\n";
}

echo 'Esquema: ' . run_sql_file($pdo, __DIR__ . '/schema.sql') . " sentencias.\n";

$users = (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
if ($noSeed) {
    echo "Sin datos de prueba.\n";
} elseif ($users === 0) {
    $pdo->beginTransaction();
    run_sql_file($pdo, __DIR__ . '/seed.sql');
    $pdo->commit();
    echo "Datos de prueba cargados.\n";
} else {
    echo "La base ya tiene $users usuarios: no se cargaron datos de prueba (usa --reset para empezar de cero).\n";
}
echo "Listo. Base de datos: $db\n";

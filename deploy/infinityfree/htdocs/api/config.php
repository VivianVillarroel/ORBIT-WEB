<?php
// Conexión a la base de datos. No edites este archivo en el servidor:
// copia config.example.php como config.local.php y pon ahí tus datos.
$config = [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'orbit',
    'db_user' => 'root',
    'db_pass' => '',
    'debug'   => false,
];
$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_merge($config, require $local);
}
return $config;

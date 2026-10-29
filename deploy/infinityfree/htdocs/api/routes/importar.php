<?php
// Importación masiva (admin) de las listas que envían las instituciones: carreras, estudiantes y laboratorios pedidos.
// El panel lee el CSV (exportado desde Excel) y envía las filas como JSON.
declare(strict_types=1);

function random_password(): string
{
    $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $p = '';
    for ($i = 0; $i < 10; $i++) $p .= $chars[random_int(0, strlen($chars) - 1)];
    return $p;
}

function norm_key(string $s): string
{
    $s = mb_strtolower(trim(preg_replace('/\s+/', ' ', $s)));
    return strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
}

/** Busca una carrera de la institución por nombre o código; si no existe la crea (y la anota en $creadas). */
function find_or_create_carrera(int $uni, string $name, array &$cache, array &$creadas, bool $create = true): ?int
{
    $key = norm_key($name);
    if ($key === '') return null;
    if (!$cache) {
        foreach (rows('SELECT id, nombre, codigo FROM carreras WHERE universidad_id = ?', [$uni]) as $c) {
            $cache[norm_key($c['nombre'])] = (int)$c['id'];
            if ($c['codigo']) $cache[norm_key($c['codigo'])] = (int)$c['id'];
        }
    }
    if (isset($cache[$key])) return $cache[$key];
    if (!$create) return null;
    $id = insert('carreras', ['universidad_id' => $uni, 'nombre' => mb_substr(trim($name), 0, 140), 'area' => 'Otra']);
    $cache[$key] = $id;
    $creadas[] = trim($name);
    return $id;
}

function route_importar(string $m, array $p): void
{
    require_user('admin');
    if ($m !== 'POST' || count($p) !== 2) throw new HttpError(404, 'Ruta no encontrada.');
    $in = input();
    $uni = filter_var($in['universidad_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$uni) throw new HttpError(422, 'Elige la institución.', ['universidad_id' => 'Elige la institución.']);
    must_exist('universidades', $uni, 'La institución');
    $filas = $in['filas'] ?? null;
    if (!is_array($filas) || !$filas) throw new HttpError(422, 'El archivo no tiene filas.');
    if (count($filas) > 3000) throw new HttpError(422, 'Importa como máximo 3000 filas por archivo.');
    $crear = !array_key_exists('crear_carreras', $in) || !empty($in['crear_carreras']);
    @set_time_limit(600);

    $cache = []; $creadas = []; $omitidas = []; $n = 0;
    $s = fn($row, $k) => trim((string)($row[$k] ?? ''));

    switch ($p[1]) {
        case 'carreras':
            $areas = ['salud' => 'Salud', 'ingenieria y tecnica' => 'Ingeniería y técnica', 'ciencias sociales' => 'Ciencias sociales', 'educacion' => 'Educación'];
            foreach ($filas as $i => $r) {
                $nombre = $s($r, 'nombre');
                if ($nombre === '') { $omitidas[] = ['fila' => $i + 2, 'motivo' => 'Falta el nombre']; continue; }
                if (find_or_create_carrera($uni, $nombre, $cache, $creadas, false)) { $omitidas[] = ['fila' => $i + 2, 'motivo' => "«$nombre» ya existe"]; continue; }
                $dur = filter_var($s($r, 'duracion_semestres'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 20]]);
                $id = insert('carreras', [
                    'universidad_id' => $uni, 'nombre' => mb_substr($nombre, 0, 140), 'codigo' => mb_substr($s($r, 'codigo'), 0, 20) ?: null,
                    'area' => $areas[norm_key($s($r, 'area'))] ?? 'Otra', 'duracion_semestres' => $dur ?: null,
                ]);
                $cache[norm_key($nombre)] = $id;
                $n++;
            }
            json_out(['creados' => $n, 'omitidas' => $omitidas]);

        case 'estudiantes':
            $cred = [];
            foreach ($filas as $i => $r) {
                $fila = $i + 2; // fila 1 = encabezados
                $nombre = $s($r, 'nombre'); $apellido = $s($r, 'apellido');
                $email = mb_strtolower($s($r, 'email')); $codigo = $s($r, 'codigo'); $carrera = $s($r, 'carrera');
                if ($nombre === '' || $apellido === '' || $email === '' || $codigo === '' || $carrera === '') {
                    $omitidas[] = ['fila' => $fila, 'motivo' => 'Faltan datos (nombre, apellido, email, código o carrera)']; continue;
                }
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { $omitidas[] = ['fila' => $fila, 'motivo' => "Correo no válido: $email"]; continue; }
                if (val('SELECT 1 FROM usuarios WHERE email = ?', [$email])) { $omitidas[] = ['fila' => $fila, 'motivo' => "Ya existe una cuenta con $email"]; continue; }
                if (val('SELECT 1 FROM estudiantes WHERE codigo = ?', [$codigo])) { $omitidas[] = ['fila' => $fila, 'motivo' => "El código $codigo ya está registrado"]; continue; }
                $sem = filter_var($s($r, 'semestre'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 20]]);

                $antes = count($creadas);
                db()->beginTransaction();
                try {
                    $cid = find_or_create_carrera($uni, $carrera, $cache, $creadas, $crear);
                    if (!$cid) { db()->rollBack(); $omitidas[] = ['fila' => $fila, 'motivo' => "La carrera «$carrera» no existe"]; continue; }
                    $pass = random_password();
                    $uid = insert('usuarios', [
                        'nombre' => mb_substr($nombre, 0, 80), 'apellido' => mb_substr($apellido, 0, 80), 'email' => $email,
                        'password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'rol' => 'estudiante', 'universidad_id' => $uni,
                        'telefono' => mb_substr($s($r, 'telefono'), 0, 30) ?: null, 'activo' => 1,
                    ]);
                    insert('estudiantes', ['usuario_id' => $uid, 'tipo' => 'institucional', 'carrera_id' => $cid, 'codigo' => mb_substr($codigo, 0, 30), 'semestre' => $sem ?: null]);
                    db()->commit();
                } catch (Throwable $e) {
                    if (db()->inTransaction()) db()->rollBack();
                    // Si la carrera se creó dentro de la transacción revertida, se olvida para volver a crearla en la siguiente fila.
                    $cache = []; $creadas = array_slice($creadas, 0, $antes);
                    $omitidas[] = ['fila' => $fila, 'motivo' => 'No se pudo guardar'];
                    continue;
                }
                $cred[] = ['nombre' => "$nombre $apellido", 'email' => $email, 'codigo' => $codigo, 'carrera' => $carrera, 'password' => $pass];
                $n++;
            }
            json_out(['creados' => $n, 'omitidas' => $omitidas, 'carreras_creadas' => array_values(array_unique($creadas)), 'credenciales' => $cred]);

        case 'laboratorios':
            $areas = ['salud' => 'Salud', 'ingenieria y tecnica' => 'Ingeniería y técnica', 'ciencias sociales' => 'Ciencias sociales', 'educacion' => 'Educación'];
            $actualizados = 0;
            foreach ($filas as $i => $r) {
                $fila = $i + 2;
                $nombre = $s($r, 'nombre');
                if ($nombre === '') { $omitidas[] = ['fila' => $fila, 'motivo' => 'Falta el nombre']; continue; }
                $nombresCarreras = array_filter(preg_split('/\s*[|;,]\s*/', $s($r, 'carreras')), 'strlen');
                db()->beginTransaction();
                try {
                    $labId = val('SELECT id FROM laboratorios WHERE nombre = ?', [mb_substr($nombre, 0, 140)]);
                    if ($labId) { $labId = (int)$labId; $actualizados++; }
                    else {
                        $labId = insert('laboratorios', [
                            'nombre' => mb_substr($nombre, 0, 140), 'area' => $areas[norm_key($s($r, 'area'))] ?? 'Salud',
                            'equipo' => mb_substr($s($r, 'equipo'), 0, 140) ?: null, 'descripcion' => mb_substr($s($r, 'descripcion'), 0, 3000) ?: null,
                            'estado' => 'solicitado', 'solicitado_por' => $uni,
                        ]);
                        $n++;
                    }
                    foreach ($nombresCarreras as $nc) {
                        $cid = find_or_create_carrera($uni, $nc, $cache, $creadas, $crear);
                        if ($cid) q('INSERT IGNORE INTO laboratorio_carrera (laboratorio_id, carrera_id) VALUES (?, ?)', [$labId, $cid]);
                        else $omitidas[] = ['fila' => $fila, 'motivo' => "La carrera «$nc» no existe (el laboratorio se guardó sin ella)"];
                    }
                    db()->commit();
                } catch (Throwable $e) {
                    if (db()->inTransaction()) db()->rollBack();
                    $cache = [];
                    $omitidas[] = ['fila' => $fila, 'motivo' => 'No se pudo guardar'];
                }
            }
            json_out(['creados' => $n, 'actualizados' => $actualizados, 'omitidas' => $omitidas, 'carreras_creadas' => array_values(array_unique($creadas))]);
    }
    throw new HttpError(404, 'Ruta no encontrada.');
}

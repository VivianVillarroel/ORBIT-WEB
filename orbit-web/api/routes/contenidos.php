<?php
// Laboratorios (3D hoy, VR después) y libros con Realidad Aumentada.
// Admin: CRUD completo y carreras con acceso. Docente: los de sus carreras. Estudiante: los de su carrera,
// o el catálogo público si es independiente (lo que no es gratis requiere Premium).
declare(strict_types=1);

function url_rule(string $label): array { return ['type' => 'str', 'max' => 500, 'label' => $label, 'url' => true]; }

function check_urls(array $data, array $spec): void
{
    foreach ($spec as $k => $r) {
        if (empty($r['url']) || empty($data[$k])) continue;
        $localSimulator = $k === 'modelo_url' && preg_match('#^simuladores/[a-z0-9_-]+/index\.html$#D', $data[$k]);
        if (!$localSimulator && !preg_match('#^(https?://|uploads/|img/)[^\s<>"\']+$#i', $data[$k])) {
            throw new HttpError(422, 'Revisa los campos marcados.', [$k => 'Usa un enlace que empiece con https:// o un archivo subido.']);
        }
    }
}

function content_cfg(string $kind): array
{
    $areas = ['Salud', 'Ingeniería y técnica', 'Ciencias sociales', 'Educación', 'Otra'];
    if ($kind === 'lab') {
        return [
            'table' => 'laboratorios', 't' => 'l', 'join' => 'laboratorio_carrera', 'fk' => 'laboratorio_id', 'label' => 'El laboratorio',
            'search' => ['l.nombre', 'l.equipo', 'l.descripcion'],
            'filters' => ['estado' => 'l.estado', 'area' => 'l.area', 'solicitado_por' => 'l.solicitado_por'],
            'extra_select' => ', un.nombre AS solicitante', 'extra_join' => ' LEFT JOIN universidades un ON un.id = l.solicitado_por',
            'order' => "FIELD(l.estado, 'publicado', 'en_desarrollo', 'solicitado'), l.nombre",
            'private' => ['modelo_url'],
            'spec' => [
                'nombre'           => ['type' => 'str', 'req' => true, 'max' => 140, 'label' => 'Nombre'],
                'area'             => ['type' => 'enum', 'req' => true, 'values' => $areas, 'label' => 'Área'],
                'equipo'           => ['type' => 'str', 'max' => 140, 'label' => 'Equipo'],
                'descripcion'      => ['type' => 'text', 'max' => 3000, 'label' => 'Descripción'],
                'modelo_url'       => url_rule('Modelo 3D'),
                'imagen_url'       => url_rule('Imagen'),
                'vr_disponible'    => ['type' => 'bool', 'label' => 'Versión VR disponible'],
                'estado'           => ['type' => 'enum', 'req' => true, 'values' => ['solicitado', 'en_desarrollo', 'publicado'], 'label' => 'Estado'],
                'solicitado_por'   => ['type' => 'int', 'label' => 'Solicitado por'],
                'catalogo_publico' => ['type' => 'bool', 'label' => 'Catálogo público'],
                'gratis'           => ['type' => 'bool', 'label' => 'Gratis'],
            ],
        ];
    }
    return [
        'table' => 'libros', 't' => 'b', 'join' => 'libro_carrera', 'fk' => 'libro_id', 'label' => 'El libro',
        'search' => ['b.titulo', 'b.autor', 'b.materia', 'b.descripcion'],
        'filters' => ['estado' => 'b.estado'],
        'extra_select' => '', 'extra_join' => '',
        'order' => 'b.titulo',
        'private' => ['libro_url', 'app_url', 'modelo_url'],
        'spec' => [
            'titulo'           => ['type' => 'str', 'req' => true, 'max' => 160, 'label' => 'Título'],
            'autor'            => ['type' => 'str', 'max' => 140, 'label' => 'Autor'],
            'materia'          => ['type' => 'str', 'max' => 100, 'label' => 'Materia'],
            'descripcion'      => ['type' => 'text', 'max' => 3000, 'label' => 'Descripción'],
            'temas'            => ['type' => 'text', 'max' => 3000, 'label' => 'Temas'],
            'portada_url'      => url_rule('Portada'),
            'libro_url'        => url_rule('Libro o páginas marcadoras (PDF)'),
            'app_url'          => url_rule('App ORBIT AR'),
            'modelo_url'       => url_rule('Modelo 3D para AR'),
            'estado'           => ['type' => 'enum', 'req' => true, 'values' => ['en_desarrollo', 'publicado'], 'label' => 'Estado'],
            'catalogo_publico' => ['type' => 'bool', 'label' => 'Catálogo público'],
            'gratis'           => ['type' => 'bool', 'label' => 'Gratis'],
        ],
    ];
}

function content_query(array $cfg, array $u, string $where, array $whereParams): array
{
    ['t' => $t, 'join' => $join, 'fk' => $fk] = $cfg;
    [$scope, $scopeParams, $locked] = content_scope($u, $t, $join, $fk);
    $selParams = [];
    $mine = '';
    if ($cfg['table'] === 'laboratorios' && $u['rol'] === 'estudiante') {
        $mine = ', (SELECT COUNT(*) FROM practicas p WHERE p.laboratorio_id = l.id AND p.estudiante_id = ?) AS mis_practicas,
                   (SELECT MAX(p.puntaje) FROM practicas p WHERE p.laboratorio_id = l.id AND p.estudiante_id = ?) AS mi_mejor_puntaje';
        $selParams = [$u['estudiante_id'], $u['estudiante_id']];
    }
    $sql = "SELECT $t.*,
                   (SELECT GROUP_CONCAT(c.nombre ORDER BY c.nombre SEPARATOR ', ') FROM $join x JOIN carreras c ON c.id = x.carrera_id WHERE x.$fk = $t.id) AS carreras,
                   (SELECT GROUP_CONCAT(x.carrera_id) FROM $join x WHERE x.$fk = $t.id) AS carrera_ids,
                   $locked AS bloqueado {$cfg['extra_select']} $mine
              FROM {$cfg['table']} $t {$cfg['extra_join']}
             WHERE 1=1 $scope $where
             ORDER BY {$cfg['order']}";
    $items = rows($sql, [...$selParams, ...$scopeParams, ...$whereParams]);
    foreach ($items as &$it) {
        $it['bloqueado'] = (int)$it['bloqueado'];
        if ($it['bloqueado']) foreach ($cfg['private'] as $f) $it[$f] = null; // sin Premium no se entrega el contenido
    }
    return $items;
}

function content_route(string $kind, string $m, array $p): void
{
    $u = require_user();
    $cfg = content_cfg($kind);
    $t = $cfg['t'];
    $id = null;
    if (isset($p[1])) { if (!ctype_digit($p[1])) throw new HttpError(404, 'Ruta no encontrada.'); $id = (int)$p[1]; }

    $sub = $p[2] ?? null;
    if ($m === 'POST' && $id && $sub === 'modelo') { if($u['rol']==='director' && ($kind!=='lab'||(int)val('SELECT creado_por FROM laboratorios WHERE id=?',[$id])!==(int)$u['id'])) throw new HttpError(403,'No puedes modificar este contenido.'); upload_file($cfg['table'], $id, 'modelo_url', ['glb', 'gltf'], 'modelos'); }
    if ($m === 'POST' && $id && $sub === 'pdf' && $kind === 'libro') upload_file('libros', $id, 'libro_url', ['pdf'], 'libros');
    if ($kind === 'libro' && $id && $sub === 'resultados') libro_resultados($m, $u, $id, $cfg);
    if (count($p) > 2) throw new HttpError(404, 'Ruta no encontrada.');

    if ($m === 'GET' && $id === null) {
        $params = [];
        $where = search_clause($cfg['search'], $_GET['q'] ?? null, $params);
        foreach ($cfg['filters'] as $k => $col) {
            if (isset($_GET[$k]) && $_GET[$k] !== '') { $where .= " AND $col = ?"; $params[] = $_GET[$k]; }
        }
        if (!empty($_GET['carrera_id'])) {
            $where .= " AND EXISTS (SELECT 1 FROM {$cfg['join']} y WHERE y.{$cfg['fk']} = $t.id AND y.carrera_id = ?)";
            $params[] = $_GET['carrera_id'];
        }
        json_out(['items' => content_query($cfg, $u, $where, $params)]);
    }

    if ($m === 'GET') {
        $items = content_query($cfg, $u, " AND $t.id = ?", [$id]);
        if (!$items) throw new HttpError(404, $cfg['label'] . ' no existe o no está disponible para ti.');
        $item = $items[0];
        if ($kind === 'lab' && $u['rol'] === 'estudiante') {
            // Clases del estudiante donde el docente asignó este laboratorio (para asociar la práctica).
            $item['clases'] = rows("SELECT k.id, k.nombre, cl.fecha_limite FROM clase_laboratorio cl
                                      JOIN clases k ON k.id = cl.clase_id
                                      JOIN inscripciones i ON i.clase_id = k.id AND i.estudiante_id = ? AND i.estado <> 'retirado'
                                     WHERE cl.laboratorio_id = ? ORDER BY k.nombre", [$u['estudiante_id'], $id]);
        }
        if ($kind === 'libro' && $u['rol'] === 'estudiante') {
            $item['resultados'] = rows('SELECT tema, puntaje, realizado_en FROM libro_resultados WHERE estudiante_id = ? AND libro_id = ? ORDER BY realizado_en DESC', [$u['estudiante_id'], $id]);
        }
        json_out(['item' => $item]);
    }

    // El director administra los laboratorios que crea para su carrera.
    require_user(...($kind === 'lab' ? ['admin','director'] : ['admin']));
    if($u['rol']==='director' && $id && ((int)val('SELECT creado_por FROM laboratorios WHERE id=?',[$id])!==(int)$u['id'] || !val('SELECT 1 FROM laboratorio_carrera WHERE laboratorio_id=? AND carrera_id=?',[$id,$u['director_carrera_id']]))) throw new HttpError(403,'Solo puedes modificar los laboratorios que creaste.');
    if (($m === 'POST' && $id === null) || ($m === 'PUT' && $id !== null)) {
        $in = input();
        if ($id) must_exist($cfg['table'], $id, $cfg['label']);
        $data = validate($cfg['spec'], $in);
        check_urls($data, $cfg['spec']);
        if (!empty($data['solicitado_por'])) must_exist('universidades', $data['solicitado_por'], 'La institución');
        $carreras = id_list($in['carrera_ids'] ?? [], 'carrera_ids');
        if ($carreras) {
            $ph = implode(',', array_fill(0, count($carreras), '?'));
            if ((int)val("SELECT COUNT(*) FROM carreras WHERE id IN ($ph)", $carreras) !== count($carreras)) {
                throw new HttpError(422, 'Revisa los campos marcados.', ['carrera_ids' => 'Una de las carreras no existe.']);
            }
        }
        if($u['rol']==='director'){ $carreras=[(int)$u['director_carrera_id']]; $data['creado_por']=$u['id']; $data['catalogo_publico']=0; $data['gratis']=0; $data['solicitado_por']=$u['universidad_id']; }
        db()->beginTransaction();
        try {
            if ($id) update($cfg['table'], $id, $data); else $id = insert($cfg['table'], $data);
            q("DELETE FROM {$cfg['join']} WHERE {$cfg['fk']} = ?", [$id]);
            foreach ($carreras as $cid) q("INSERT INTO {$cfg['join']} ({$cfg['fk']}, carrera_id) VALUES (?, ?)", [$id, $cid]);
            db()->commit();
        } catch (Throwable $e) { db()->rollBack(); throw $e; }
        json_out(['id' => $id], $m === 'POST' ? 201 : 200);
    }
    if ($m === 'DELETE' && $id !== null) {
        $row = must_exist($cfg['table'], $id, $cfg['label']);
        q("DELETE FROM {$cfg['table']} WHERE id = ?", [$id]);
        remove_local_file($row['modelo_url'] ?? null);
        remove_local_file($row['libro_url'] ?? null);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

function route_laboratorios(string $m, array $p): void { content_route('lab', $m, $p); }
function route_libros(string $m, array $p): void { content_route('libro', $m, $p); }

/* ---------- Resultados de los quiz de un libro AR ---------- */

function libro_resultados(string $m, array $u, int $id, array $cfg): void
{
    if ($u['rol'] !== 'estudiante') throw new HttpError(403, 'Solo los estudiantes registran resultados.');
    $items = content_query($cfg, $u, ' AND b.id = ?', [$id]);
    if (!$items) throw new HttpError(404, 'El libro no está disponible para ti.');
    if ($items[0]['bloqueado']) throw new HttpError(402, 'Este libro es parte del plan Premium.');
    if ($m === 'GET') {
        json_out(['items' => rows('SELECT tema, puntaje, realizado_en FROM libro_resultados WHERE estudiante_id = ? AND libro_id = ? ORDER BY realizado_en DESC', [$u['estudiante_id'], $id])]);
    }
    if ($m === 'POST') {
        $data = validate([
            'tema'    => ['type' => 'str', 'req' => true, 'max' => 140, 'label' => 'Tema'],
            'puntaje' => ['type' => 'int', 'min' => 0, 'max' => 100, 'label' => 'Puntaje'],
        ], input());
        json_out(['id' => insert('libro_resultados', $data + ['estudiante_id' => $u['estudiante_id'], 'libro_id' => $id])], 201);
    }
    throw new HttpError(405, 'Método no permitido.');
}

/* ---------- Archivos subidos: modelos 3D (.glb) y libros (PDF) ---------- */

function remove_local_file(?string $url): void
{
    if ($url && preg_match('#^uploads/(modelos|libros)/[\w.-]+$#', $url)) {
        $f = __DIR__ . '/../../' . $url;
        if (is_file($f)) @unlink($f);
    }
}

function upload_file(string $table, int $id, string $column, array $exts, string $folder): void
{
    $actor=require_user('admin','director');
    $row = must_exist($table, $id, 'El registro');
    if($actor['rol']==='director' && ($table!=='laboratorios'||(int)($row['creado_por']??0)!==(int)$actor['id']||!val('SELECT 1 FROM laboratorio_carrera WHERE laboratorio_id=? AND carrera_id=?',[$id,$actor['director_carrera_id']])))throw new HttpError(403,'No puedes modificar este contenido.');
    $f = $_FILES['archivo'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) throw new HttpError(422, 'Elige un archivo.');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
        throw new HttpError(413, 'El archivo supera el tamaño permitido por el servidor (' . ini_get('upload_max_filesize') . ').');
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new HttpError(422, 'No se pudo recibir el archivo.');
    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $exts, true)) throw new HttpError(422, 'El archivo debe ser .' . implode(' o .', $exts) . '.');
    if ($f['size'] > 80 * 1024 * 1024) throw new HttpError(413, 'El archivo no puede pesar más de 80 MB.');
    $head = (string)file_get_contents($f['tmp_name'], false, null, 0, 5);
    if ($ext === 'glb' && substr($head, 0, 4) !== 'glTF') throw new HttpError(422, 'El archivo no es un modelo .glb válido.');
    if ($ext === 'pdf' && $head !== '%PDF-') throw new HttpError(422, 'El archivo no es un PDF válido.');

    $dir = __DIR__ . '/../../uploads/' . $folder;
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) throw new HttpError(500, "No se pudo crear la carpeta uploads/$folder.");
    $name = $table . '-' . $id . '-' . bin2hex(random_bytes(6)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) throw new HttpError(500, 'No se pudo guardar el archivo.');
    remove_local_file($row[$column] ?? null);
    $url = "uploads/$folder/$name";
    q("UPDATE `$table` SET `$column` = ? WHERE id = ?", [$url, $id]);
    json_out([$column => $url], 201);
}


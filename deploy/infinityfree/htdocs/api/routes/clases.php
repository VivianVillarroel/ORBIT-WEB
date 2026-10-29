<?php
// Clases: CRUD (admin y docente), inscripción de estudiantes y simuladores asignados.
declare(strict_types=1);

function clases_select(array $u, array &$params): string
{
    $extra = '';
    if ($u['rol'] === 'estudiante') {
        $extra = ', (SELECT i.estado FROM inscripciones i WHERE i.clase_id = k.id AND i.estudiante_id = ?) AS mi_estado,
                   (SELECT i.nota_final FROM inscripciones i WHERE i.clase_id = k.id AND i.estudiante_id = ?) AS mi_nota';
        $params[] = $u['estudiante_id']; $params[] = $u['estudiante_id'];
    }
    $sql = "SELECT k.*, c.nombre AS carrera, c.universidad_id, un.nombre AS universidad, un.sigla AS universidad_sigla,
                   CONCAT(du.nombre, ' ', du.apellido) AS docente,
                   (SELECT COUNT(*) FROM inscripciones i WHERE i.clase_id = k.id AND i.estado <> 'retirado') AS inscritos,
                   (SELECT GROUP_CONCAT(l.nombre ORDER BY l.nombre SEPARATOR ', ') FROM clase_laboratorio cl JOIN laboratorios l ON l.id = cl.laboratorio_id WHERE cl.clase_id = k.id) AS laboratorios
                   $extra
              FROM clases k
              JOIN carreras c ON c.id = k.carrera_id
              JOIN universidades un ON un.id = c.universidad_id
              LEFT JOIN docentes d ON d.id = k.docente_id
              LEFT JOIN usuarios du ON du.id = d.usuario_id
             WHERE 1=1";
    if ($u['rol'] === 'director') { $sql .= ' AND k.carrera_id = ?'; $params[] = $u['director_carrera_id']; }
    if ($u['rol'] === 'docente') { $sql .= ' AND k.docente_id = ?'; $params[] = $u['docente_id']; }
    if ($u['rol'] === 'estudiante') {
        $sql .= " AND EXISTS (SELECT 1 FROM inscripciones i WHERE i.clase_id = k.id AND i.estudiante_id = ? AND i.estado <> 'retirado')";
        $params[] = $u['estudiante_id'];
    }
    return $sql;
}

/** Devuelve la clase si el usuario puede verla ($write = false) o modificarla ($write = true). */
function clase_access(int $id, array $u, bool $write): array
{
    $k = must_exist('clases', $id, 'La clase');
    if ($u['rol'] === 'admin') return $k;
    if (!$write && $u['rol'] === 'director' && (int)$k['carrera_id'] === (int)$u['director_carrera_id']) return $k;
    if ($u['rol'] === 'docente' && (int)$k['docente_id'] === (int)$u['docente_id']) return $k;
    if (!$write && $u['rol'] === 'estudiante') {
        $in = val("SELECT 1 FROM inscripciones WHERE clase_id = ? AND estudiante_id = ? AND estado <> 'retirado'", [$id, $u['estudiante_id']]);
        if ($in) return $k;
    }
    throw new HttpError(403, 'No tienes permiso sobre esta clase.');
}

function route_clases(string $m, array $p): void
{
    $u = require_user();
    $id = null;
    if (isset($p[1])) { if (!ctype_digit($p[1])) throw new HttpError(404, 'Ruta no encontrada.'); $id = (int)$p[1]; }
    $sub = $p[2] ?? null;

    if ($sub === 'inscripciones') clase_inscripciones($m, $u, $id, $p[3] ?? null);
    if ($sub === 'laboratorios') clase_laboratorios($m, $u, $id, $p[3] ?? null);
    if ($sub !== null) throw new HttpError(404, 'Ruta no encontrada.');

    if ($m === 'GET' && $id === null) {
        $params = [];
        $sql = clases_select($u, $params) . search_clause(['k.nombre', 'k.codigo', 'c.nombre', 'du.nombre', 'du.apellido'], $_GET['q'] ?? null, $params);
        foreach (['carrera_id' => 'k.carrera_id', 'estado' => 'k.estado', 'periodo' => 'k.periodo', 'docente_id' => 'k.docente_id'] as $k => $col) {
            if (isset($_GET[$k]) && $_GET[$k] !== '') { $sql .= " AND $col = ?"; $params[] = $_GET[$k]; }
        }
        json_out(['items' => rows($sql . ' ORDER BY k.periodo DESC, k.nombre', $params)]);
    }
    if ($m === 'GET') {
        clase_access($id, $u, false);
        $params = [];
        $r = one(clases_select($u, $params) . ' AND k.id = ?', [...$params, $id]);
        if (!$r) throw new HttpError(404, 'La clase no existe.');
        json_out(['item' => $r]);
    }

    if (($m === 'POST' && $id === null) || ($m === 'PUT' && $id !== null)) {
        if (!in_array($u['rol'], ['admin', 'docente'], true)) throw new HttpError(403, 'No tienes permiso para esta acción.');
        $current = $id ? clase_access($id, $u, true) : null;
        $in = input();
        $data = validate([
            'carrera_id'  => ['type' => 'int', 'req' => true, 'label' => 'Carrera'],
            'docente_id'  => ['type' => 'int', 'label' => 'Docente'],
            'nombre'      => ['type' => 'str', 'req' => true, 'max' => 140, 'label' => 'Nombre'],
            'codigo'      => ['type' => 'str', 'max' => 30, 'label' => 'Código'],
            'descripcion' => ['type' => 'text', 'max' => 3000, 'label' => 'Descripción'],
            'periodo'     => ['type' => 'str', 'req' => true, 'max' => 20, 'label' => 'Periodo'],
            'horario'     => ['type' => 'str', 'max' => 120, 'label' => 'Horario'],
            'aula'        => ['type' => 'str', 'max' => 60, 'label' => 'Aula'],
            'cupo'        => ['type' => 'int', 'min' => 1, 'max' => 2000, 'label' => 'Cupo'],
            'estado'      => ['type' => 'enum', 'req' => true, 'values' => ['planificada', 'activa', 'finalizada'], 'label' => 'Estado'],
        ], $in);
        $carrera = must_exist('carreras', $data['carrera_id'], 'La carrera');

        if ($u['rol'] === 'docente') {
            $data['docente_id'] = (int)$u['docente_id']; // un docente solo crea clases a su nombre
            $ok = val('SELECT 1 FROM docente_carrera WHERE docente_id = ? AND carrera_id = ?', [$u['docente_id'], $data['carrera_id']]);
            if (!$ok) throw new HttpError(422, 'Revisa los campos marcados.', ['carrera_id' => 'Solo puedes crear clases en las carreras donde enseñas.']);
        } elseif (!empty($data['docente_id'])) {
            $uni = val('SELECT u.universidad_id FROM docentes d JOIN usuarios u ON u.id = d.usuario_id WHERE d.id = ?', [$data['docente_id']]);
            if ($uni === false) throw new HttpError(422, 'Revisa los campos marcados.', ['docente_id' => 'El docente no existe.']);
            if ((int)$uni !== (int)$carrera['universidad_id']) throw new HttpError(422, 'Revisa los campos marcados.', ['docente_id' => 'El docente es de otra institución.']);
        }

        if ($current) { update('clases', $id, $data); json_out(['ok' => true]); }
        json_out(['id' => insert('clases', $data)], 201);
    }

    if ($m === 'DELETE' && $id !== null) {
        if (!in_array($u['rol'], ['admin', 'docente'], true)) throw new HttpError(403, 'No tienes permiso para esta acción.');
        clase_access($id, $u, true);
        q('DELETE FROM clases WHERE id = ?', [$id]);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

function clase_inscripciones(string $m, array $u, ?int $claseId, ?string $sub): void
{
    if (!in_array($u['rol'], ['admin','director','docente'], true)) throw new HttpError(403, 'Solo los responsables académicos consultan las inscripciones de una clase.');
    if ($claseId === null) throw new HttpError(404, 'Ruta no encontrada.');
    $k = clase_access($claseId, $u, $m !== 'GET');
    $iid = null;
    if ($sub !== null) { if (!ctype_digit($sub)) throw new HttpError(404, 'Ruta no encontrada.'); $iid = (int)$sub; }

    if ($m === 'GET' && $iid === null) {
        json_out(['items' => rows(
            'SELECT i.id, i.estudiante_id, i.estado, i.nota_final, i.inscrito_en, u.nombre, u.apellido, u.email, e.codigo,
                    (SELECT COUNT(*) FROM practicas pr WHERE pr.estudiante_id = e.id AND pr.clase_id = i.clase_id) AS practicas,
                    (SELECT ROUND(AVG(pr.puntaje)) FROM practicas pr WHERE pr.estudiante_id = e.id AND pr.clase_id = i.clase_id) AS promedio,
                    (SELECT MAX(pr.realizada_en) FROM practicas pr WHERE pr.estudiante_id = e.id AND pr.clase_id = i.clase_id) AS ultima_practica,
                    (SELECT COUNT(*) FROM clase_laboratorio cl WHERE cl.clase_id=i.clase_id) AS total_labs,
                    (SELECT COUNT(*) FROM clase_laboratorio cl WHERE cl.clase_id=i.clase_id AND EXISTS(SELECT 1 FROM practicas pr WHERE pr.clase_id=i.clase_id AND pr.estudiante_id=e.id AND pr.laboratorio_id=cl.laboratorio_id AND pr.completada=1)) AS labs_completados
               FROM inscripciones i
               JOIN estudiantes e ON e.id = i.estudiante_id
               JOIN usuarios u ON u.id = e.usuario_id
              WHERE i.clase_id = ?
              ORDER BY u.apellido, u.nombre',
            [$claseId]
        )]);
    }

    if ($m === 'POST' && $iid === null) {
        $data = validate(['estudiante_id' => ['type' => 'int', 'req' => true, 'label' => 'Estudiante']], input());
        $est = one('SELECT e.id, c.universidad_id FROM estudiantes e JOIN carreras c ON c.id = e.carrera_id WHERE e.id = ?', [$data['estudiante_id']]);
        if (!$est) throw new HttpError(422, 'Revisa los campos marcados.', ['estudiante_id' => 'El estudiante no existe.']);
        $uni = val('SELECT universidad_id FROM carreras WHERE id = ?', [$k['carrera_id']]);
        if ((int)$est['universidad_id'] !== (int)$uni) throw new HttpError(422, 'Revisa los campos marcados.', ['estudiante_id' => 'El estudiante es de otra institución.']);
        if ($k['cupo'] !== null) {
            $n = (int)val("SELECT COUNT(*) FROM inscripciones WHERE clase_id = ? AND estado <> 'retirado'", [$claseId]);
            if ($n >= (int)$k['cupo']) throw new HttpError(409, 'La clase ya llegó a su cupo de ' . $k['cupo'] . ' estudiantes.');
        }
        $prev = one('SELECT id, estado FROM inscripciones WHERE clase_id = ? AND estudiante_id = ?', [$claseId, $data['estudiante_id']]);
        if ($prev && $prev['estado'] !== 'retirado') throw new HttpError(409, 'Ese estudiante ya está inscrito en la clase.');
        if ($prev) { q("UPDATE inscripciones SET estado = 'inscrito', nota_final = NULL WHERE id = ?", [$prev['id']]); json_out(['id' => (int)$prev['id']], 201); }
        json_out(['id' => insert('inscripciones', ['clase_id' => $claseId, 'estudiante_id' => $data['estudiante_id']])], 201);
    }

    if ($iid !== null) {
        $ins = one('SELECT * FROM inscripciones WHERE id = ? AND clase_id = ?', [$iid, $claseId]);
        if (!$ins) throw new HttpError(404, 'La inscripción no existe.');
        if ($m === 'PUT') {
            $data = validate([
                'estado'     => ['type' => 'enum', 'req' => true, 'values' => ['inscrito', 'retirado', 'aprobado', 'reprobado'], 'label' => 'Estado'],
                'nota_final' => ['type' => 'dec', 'min' => 0, 'max' => 100, 'label' => 'Nota final'],
            ], input(), true);
            db()->beginTransaction();
            try { update('inscripciones', $iid, $data); insert('notas_historial', ['inscripcion_id'=>$iid,'actor_id'=>$u['id'],'anterior'=>json_encode(['estado'=>$ins['estado'],'nota_final'=>$ins['nota_final']]),'nueva'=>json_encode($data)]); db()->commit(); } catch(Throwable $e) { db()->rollBack(); throw $e; }
            json_out(['ok' => true]);
        }
        if ($m === 'DELETE') { q('DELETE FROM inscripciones WHERE id = ?', [$iid]); json_out(['ok' => true]); }
    }
    throw new HttpError(405, 'Método no permitido.');
}

/** Laboratorios asignados a una clase (deben ser laboratorios de la carrera de la clase). */
function clase_laboratorios(string $m, array $u, ?int $claseId, ?string $sub): void
{
    if ($claseId === null) throw new HttpError(404, 'Ruta no encontrada.');

    if ($m === 'GET' && $sub === null) {
        clase_access($claseId, $u, false);
        $params = [$claseId];
        $mine = '';
        if ($u['rol'] === 'estudiante') {
            // Progreso propio del estudiante en cada laboratorio de la clase.
            $mine = ', (SELECT COUNT(*) FROM practicas pr WHERE pr.estudiante_id = ? AND pr.laboratorio_id = l.id AND pr.clase_id = cl.clase_id) AS mis_practicas,
                       (SELECT MAX(pr.puntaje) FROM practicas pr WHERE pr.estudiante_id = ? AND pr.laboratorio_id = l.id AND pr.clase_id = cl.clase_id) AS mi_mejor_puntaje';
            array_unshift($params, $u['estudiante_id'], $u['estudiante_id']);
        }
        json_out(['items' => rows(
            "SELECT l.id, l.nombre, l.area, l.equipo, l.estado, l.vr_disponible, l.descripcion, cl.fecha_limite, cl.asignado_en $mine
               FROM clase_laboratorio cl JOIN laboratorios l ON l.id = cl.laboratorio_id
              WHERE cl.clase_id = ? ORDER BY l.nombre",
            $params
        )]);
    }

    $k = clase_access($claseId, $u, true);
    if ($m === 'POST' && $sub === null) {
        $data = validate([
            'laboratorio_id' => ['type' => 'int', 'req' => true, 'label' => 'Laboratorio'],
            'fecha_limite'   => ['type' => 'date', 'label' => 'Fecha límite'],
        ], input());
        must_exist('laboratorios', $data['laboratorio_id'], 'El laboratorio');
        $ok = val('SELECT 1 FROM laboratorio_carrera WHERE laboratorio_id = ? AND carrera_id = ?', [$data['laboratorio_id'], $k['carrera_id']]);
        if (!$ok) throw new HttpError(422, 'Revisa los campos marcados.', ['laboratorio_id' => 'Ese laboratorio no está habilitado para la carrera de esta clase.']);
        $exists = val('SELECT 1 FROM clase_laboratorio WHERE clase_id = ? AND laboratorio_id = ?', [$claseId, $data['laboratorio_id']]);
        if ($exists) q('UPDATE clase_laboratorio SET fecha_limite = ? WHERE clase_id = ? AND laboratorio_id = ?', [$data['fecha_limite'] ?? null, $claseId, $data['laboratorio_id']]);
        else insert('clase_laboratorio', ['clase_id' => $claseId, 'laboratorio_id' => $data['laboratorio_id'], 'fecha_limite' => $data['fecha_limite'] ?? null]);
        json_out(['ok' => true], 201);
    }
    if ($m === 'DELETE' && $sub !== null && ctype_digit($sub)) {
        q('DELETE FROM clase_laboratorio WHERE clase_id = ? AND laboratorio_id = ?', [$claseId, (int)$sub]);
        json_out(['ok' => true]);
    }
    throw new HttpError(405, 'Método no permitido.');
}

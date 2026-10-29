<?php
// Ejecutar solo desde CLI: php database/migrations/20261020_academico.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/../../api/lib/bootstrap.php';
$p=db();
$backupDir=dirname(__DIR__,3).'/backups';
if(!is_dir($backupDir))mkdir($backupDir,0700,true);
$backup=$backupDir.'/orbit-antes-academico-'.date('Ymd-His').'.sql';
$f=fopen($backup,'x');
foreach($p->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table){
 $create=$p->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];fwrite($f,$create.";\n");
 foreach($p->query("SELECT * FROM `$table`") as $r){$cols=implode(',',array_map(fn($x)=>"`$x`",array_keys($r)));$vals=implode(',',array_map(fn($v)=>$v===null?'NULL':$p->quote((string)$v),array_values($r)));fwrite($f,"INSERT INTO `$table` ($cols) VALUES ($vals);\n");}
}fclose($f);
$p->exec("ALTER TABLE usuarios MODIFY rol ENUM('admin','director','docente','estudiante') NOT NULL");
$p->exec("CREATE TABLE IF NOT EXISTS directores (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, usuario_id INT UNSIGNED NOT NULL UNIQUE, carrera_id INT UNSIGNED NOT NULL, FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE, FOREIGN KEY(carrera_id) REFERENCES carreras(id) ON DELETE RESTRICT) ENGINE=InnoDB");
if(!$p->query("SHOW COLUMNS FROM laboratorios LIKE 'creado_por'")->fetch())$p->exec("ALTER TABLE laboratorios ADD creado_por INT UNSIGNED NULL, ADD CONSTRAINT fk_lab_creador FOREIGN KEY(creado_por) REFERENCES usuarios(id) ON DELETE SET NULL");
$p->exec("CREATE TABLE IF NOT EXISTS notas_historial (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, inscripcion_id INT UNSIGNED NOT NULL, actor_id INT UNSIGNED NOT NULL, anterior JSON NOT NULL, nueva JSON NOT NULL, creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(inscripcion_id) REFERENCES inscripciones(id) ON DELETE CASCADE, FOREIGN KEY(actor_id) REFERENCES usuarios(id) ON DELETE RESTRICT) ENGINE=InnoDB");
$p->exec("CREATE TABLE IF NOT EXISTS certificados (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, inscripcion_id INT UNSIGNED NOT NULL UNIQUE, codigo CHAR(32) NOT NULL UNIQUE, estudiante VARCHAR(170) NOT NULL, curso VARCHAR(140) NOT NULL, carrera VARCHAR(140) NOT NULL, institucion VARCHAR(180) NOT NULL, nota DECIMAL(5,2) NOT NULL, emitido_por INT UNSIGNED NOT NULL, emitido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(inscripcion_id) REFERENCES inscripciones(id) ON DELETE RESTRICT, FOREIGN KEY(emitido_por) REFERENCES usuarios(id) ON DELETE RESTRICT) ENGINE=InnoDB");
echo "MIGRATION_OK backup=".basename($backup)."\n";

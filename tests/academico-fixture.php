<?php
require __DIR__.'/../orbit-web/api/lib/bootstrap.php';
$tag='orbit-check-'.bin2hex(random_bytes(5));$pass=getenv('ORBIT_TEST_PASSWORD')?:bin2hex(random_bytes(14)).'!aA1';
$careers=rows('SELECT id,universidad_id FROM carreras ORDER BY id LIMIT 2');
if(count($careers)<2)throw new Exception('Se requieren dos carreras para probar aislamiento.');
db()->beginTransaction();
$out=['tag'=>$tag,'password'=>$pass,'carrera'=>(int)$careers[0]['id'],'otra_carrera'=>(int)$careers[1]['id'],'usuarios'=>[]];
foreach(['director','docente','estudiante','otro'] as $role){$ci=$role==='otro'?1:0;$uid=insert('usuarios',['nombre'=>'Prueba','apellido'=>$tag.' '.$role,'email'=>$tag.'-'.$role.'@example.invalid','password_hash'=>password_hash($pass,PASSWORD_DEFAULT),'rol'=>$role==='otro'?'estudiante':$role,'universidad_id'=>$careers[$ci]['universidad_id'],'activo'=>1]);$out['usuarios'][]=$uid;$out[$role.'_email']=$tag.'-'.$role.'@example.invalid';if($role==='director')insert('directores',['usuario_id'=>$uid,'carrera_id'=>$careers[0]['id']]);elseif($role==='docente'){$did=insert('docentes',['usuario_id'=>$uid]);insert('docente_carrera',['docente_id'=>$did,'carrera_id'=>$careers[0]['id']]);$out['docente_id']=$did;}else{$eid=insert('estudiantes',['usuario_id'=>$uid,'tipo'=>'institucional','carrera_id'=>$careers[$ci]['id'],'codigo'=>substr($tag,-10).substr($role,0,2)]);$out[$role.'_id']=$eid;}}
db()->commit();echo json_encode($out);

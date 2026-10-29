<?php
declare(strict_types=1);
function academic_scope(array $u,string $alias='k'): array {
 if($u['rol']==='admin')return ['',[]];
 if($u['rol']==='director')return [" AND $alias.carrera_id = ?",[(int)$u['director_carrera_id']]];
 if($u['rol']==='docente')return [" AND $alias.docente_id = ?",[(int)$u['docente_id']]];
 return [" AND EXISTS (SELECT 1 FROM inscripciones ai WHERE ai.clase_id=$alias.id AND ai.estudiante_id=? AND ai.estado<>'retirado')",[(int)$u['estudiante_id']]];
}
function academic_data(array $u): array {
 [$scope,$params]=academic_scope($u);
 $clases=rows("SELECT k.id,k.nombre,k.codigo,k.periodo,k.estado,k.carrera_id,k.docente_id,c.nombre AS carrera,CONCAT(du.nombre,' ',du.apellido) AS docente FROM clases k JOIN carreras c ON c.id=k.carrera_id LEFT JOIN docentes d ON d.id=k.docente_id LEFT JOIN usuarios du ON du.id=d.usuario_id WHERE 1=1 $scope ORDER BY k.nombre",$params);
 $own=$u['rol']==='estudiante'?' AND e.id = ?':'';$ip=$params;if($own)$ip[]=$u['estudiante_id'];
 $ins=rows("SELECT i.id,i.clase_id,i.estudiante_id,i.estado,i.nota_final,e.codigo,CONCAT(us.nombre,' ',us.apellido) AS estudiante,us.ultimo_acceso,k.nombre AS clase,k.carrera_id,k.docente_id,c.nombre AS carrera,
 (SELECT COUNT(*) FROM clase_laboratorio cl WHERE cl.clase_id=k.id) AS total,
 (SELECT COUNT(*) FROM clase_laboratorio cl WHERE cl.clase_id=k.id AND EXISTS(SELECT 1 FROM practicas pr WHERE pr.clase_id=k.id AND pr.estudiante_id=e.id AND pr.laboratorio_id=cl.laboratorio_id AND pr.completada=1)) AS completados,
 (SELECT COUNT(*) FROM practicas pr WHERE pr.clase_id=k.id AND pr.estudiante_id=e.id) AS intentos,
 (SELECT ROUND(AVG(pr.puntaje),1) FROM practicas pr WHERE pr.clase_id=k.id AND pr.estudiante_id=e.id) AS promedio,
 (SELECT COALESCE(SUM(pr.duracion_min),0) FROM practicas pr WHERE pr.clase_id=k.id AND pr.estudiante_id=e.id) AS minutos,
 (SELECT MAX(pr.realizada_en) FROM practicas pr WHERE pr.clase_id=k.id AND pr.estudiante_id=e.id) AS ultima_practica,
 (SELECT ct.id FROM certificados ct WHERE ct.inscripcion_id=i.id) AS certificado_id
 FROM inscripciones i JOIN clases k ON k.id=i.clase_id JOIN carreras c ON c.id=k.carrera_id JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios us ON us.id=e.usuario_id WHERE i.estado<>'retirado' $scope $own ORDER BY us.apellido,k.nombre",$ip);
 $total=0;$done=0;$mins=0;$grades=[];$active=[];
 foreach($ins as &$r){$r['progreso']=(int)$r['total']>0?(int)round(100*(int)$r['completados']/(int)$r['total']):0;$r['certificable']=(int)$r['total']>0&&(int)$r['completados']===(int)$r['total']&&$r['estado']==='aprobado'&&$r['nota_final']!==null&&(float)$r['nota_final']>=51;$total+=(int)$r['total'];$done+=(int)$r['completados'];$mins+=(int)$r['minutos'];if($r['nota_final']!==null)$grades[]=(float)$r['nota_final'];$active[$r['estudiante_id']]=true;}unset($r);
 foreach($clases as &$k){$en=array_values(array_filter($ins,fn($r)=>(int)$r['clase_id']===(int)$k['id']));$k['inscritos']=count($en);$k['progreso']=count($en)?round(array_sum(array_column($en,'progreso'))/count($en)):0;$k['aprobados']=count(array_filter($en,fn($r)=>$r['estado']==='aprobado'));$k['pendientes_nota']=count(array_filter($en,fn($r)=>$r['nota_final']===null));}unset($k);
 $ap=[];$aw='';
 if($u['rol']==='director'){$aw=' AND (k.carrera_id=? OR (pr.clase_id IS NULL AND e.carrera_id=?))';$ap=[$u['director_carrera_id'],$u['director_carrera_id']];}
 elseif($u['rol']==='docente'){$aw=' AND k.docente_id=?';$ap=[$u['docente_id']];}
 elseif($u['rol']==='estudiante'){$aw=' AND e.id=?';$ap=[$u['estudiante_id']];}
 $activity=rows("SELECT pr.id,pr.estudiante_id,pr.clase_id,pr.realizada_en,pr.completada,pr.puntaje,pr.duracion_min,l.nombre AS laboratorio,k.nombre AS clase,CONCAT(us.nombre,' ',us.apellido) AS estudiante FROM practicas pr LEFT JOIN clases k ON k.id=pr.clase_id JOIN estudiantes e ON e.id=pr.estudiante_id JOIN usuarios us ON us.id=e.usuario_id JOIN laboratorios l ON l.id=pr.laboratorio_id WHERE 1=1 $aw ORDER BY pr.realizada_en DESC LIMIT 100",$ap);
 $practiceSummary=one("SELECT COUNT(*) AS intentos,COALESCE(SUM(pr.duracion_min),0) AS minutos,SUM(pr.clase_id IS NULL) AS sin_curso FROM practicas pr LEFT JOIN clases k ON k.id=pr.clase_id JOIN estudiantes e ON e.id=pr.estudiante_id WHERE 1=1 $aw",$ap);
 $sw='';$sp=[];
 if($u['rol']==='director'){$sw=" AND (e.carrera_id=? OR EXISTS(SELECT 1 FROM inscripciones ai JOIN clases ak ON ak.id=ai.clase_id WHERE ai.estudiante_id=e.id AND ai.estado<>'retirado' AND ak.carrera_id=?))";$sp=[$u['director_carrera_id'],$u['director_carrera_id']];}
 elseif($u['rol']==='docente'){$sw=" AND EXISTS(SELECT 1 FROM inscripciones ai JOIN clases ak ON ak.id=ai.clase_id WHERE ai.estudiante_id=e.id AND ai.estado<>'retirado' AND ak.docente_id=?)";$sp=[$u['docente_id']];}
 elseif($u['rol']==='estudiante'){$sw=' AND e.id=?';$sp=[$u['estudiante_id']];}
 $studentPractice=[];foreach(rows("SELECT pr.estudiante_id,COUNT(*) AS intentos,COALESCE(SUM(pr.duracion_min),0) AS minutos FROM practicas pr LEFT JOIN clases k ON k.id=pr.clase_id JOIN estudiantes e ON e.id=pr.estudiante_id WHERE 1=1 $aw GROUP BY pr.estudiante_id",$ap) as $sum)$studentPractice[$sum['estudiante_id']]=$sum;
 $students=rows("SELECT e.id,e.codigo,CONCAT(us.nombre,' ',us.apellido) AS nombre,us.ultimo_acceso,us.activo,c.nombre AS carrera,e.tipo FROM estudiantes e JOIN usuarios us ON us.id=e.usuario_id LEFT JOIN carreras c ON c.id=e.carrera_id WHERE 1=1 $sw ORDER BY us.apellido",$sp);
 foreach($students as &$st){$ei=array_values(array_filter($ins,fn($r)=>(int)$r['estudiante_id']===(int)$st['id']));$st['intentos']=(int)($studentPractice[$st['id']]['intentos']??0);$st['minutos']=(int)($studentPractice[$st['id']]['minutos']??0);$st['cursos']=count($ei);$st['progreso']=count($ei)?round(array_sum(array_column($ei,'progreso'))/count($ei)):0;}unset($st);
 $history=rows("SELECT nh.creado_en,nh.anterior,nh.nueva,CONCAT(au.nombre,' ',au.apellido) AS autor,CONCAT(us.nombre,' ',us.apellido) AS estudiante,k.nombre AS clase,i.estudiante_id,i.clase_id FROM notas_historial nh JOIN usuarios au ON au.id=nh.actor_id JOIN inscripciones i ON i.id=nh.inscripcion_id JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios us ON us.id=e.usuario_id JOIN clases k ON k.id=i.clase_id WHERE 1=1 $scope $own ORDER BY nh.creado_en DESC LIMIT 100",$ip);
 $tp=[];$tw='';if($u['rol']==='director'){$tw=' AND EXISTS(SELECT 1 FROM docente_carrera dc WHERE dc.docente_id=d.id AND dc.carrera_id=?)';$tp[]=$u['director_carrera_id'];}elseif($u['rol']==='docente'){$tw=' AND d.id=?';$tp[]=$u['docente_id'];}elseif($u['rol']==='estudiante'){$tw=' AND d.id IN (SELECT k.docente_id FROM clases k JOIN inscripciones i ON i.clase_id=k.id WHERE i.estudiante_id=?)';$tp[]=$u['estudiante_id'];}
 $teachers=rows("SELECT d.id,CONCAT(us.nombre,' ',us.apellido) AS nombre,us.ultimo_acceso,us.activo FROM docentes d JOIN usuarios us ON us.id=d.usuario_id WHERE 1=1 $tw ORDER BY us.apellido",$tp);
 foreach($teachers as &$t){$ks=array_values(array_filter($clases,fn($k)=>(int)$k['docente_id']===(int)$t['id']));$t['clases']=count($ks);$t['inscripciones']=array_sum(array_column($ks,'inscritos'));$t['progreso']=count($ks)?round(array_sum(array_column($ks,'progreso'))/count($ks)):0;$t['pendientes_nota']=array_sum(array_column($ks,'pendientes_nota'));}unset($t);
 return ['rol'=>$u['rol'],'stats'=>['cursos'=>count($clases),'estudiantes'=>count($students),'docentes'=>count($teachers),'asignaciones'=>$total,'completadas'=>$done,'progreso'=>$total?round($done*100/$total):0,'promedio'=>count($grades)?round(array_sum($grades)/count($grades),1):null,'minutos'=>$mins,'pendientes_nota'=>count(array_filter($ins,fn($r)=>$r['nota_final']===null)),'certificables'=>count(array_filter($ins,fn($r)=>$r['certificable']))], 'resumen_practicas'=>$practiceSummary,'clases'=>$clases,'estudiantes'=>$students,'notas_historial'=>$history,'inscripciones'=>$ins,'docentes'=>$teachers,'actividad'=>$activity];
}
function route_academico(string $m,array $p): void {
 if($m!=='GET')throw new HttpError(405,'Método no permitido.');$u=require_user();$d=academic_data($u);
 if(count($p)===1)json_out($d);
 if(count($p)!==3||!ctype_digit($p[2])||!in_array($p[1],['estudiantes','docentes'],true))throw new HttpError(404,'Ruta no encontrada.');
 $id=(int)$p[2];
 if($p[1]==='estudiantes'){$en=array_values(array_filter($d['inscripciones'],fn($r)=>(int)$r['estudiante_id']===$id));$student=array_values(array_filter($d['estudiantes'],fn($r)=>(int)$r['id']===$id));if(!$student)throw new HttpError(404,'Estudiante no disponible en tu ámbito.');$d['inscripciones']=$en;$d['actividad']=array_values(array_filter($d['actividad'],fn($r)=>(int)$r['estudiante_id']===$id));$ki=array_column($en,'clase_id');$d['clases']=array_values(array_filter($d['clases'],fn($k)=>in_array($k['id'],$ki)));$d['estudiantes']=$student;$d['notas_historial']=array_values(array_filter($d['notas_historial'],fn($r)=>(int)$r['estudiante_id']===$id));$d['perfil']=['nombre'=>$student[0]['nombre'],'codigo'=>$student[0]['codigo'],'tipo'=>'Estudiante'];}
 else{$t=array_values(array_filter($d['docentes'],fn($r)=>(int)$r['id']===$id));if(!$t)throw new HttpError(404,'Docente no disponible en tu ámbito.');$d['clases']=array_values(array_filter($d['clases'],fn($r)=>(int)$r['docente_id']===$id));$d['inscripciones']=array_values(array_filter($d['inscripciones'],fn($r)=>(int)$r['docente_id']===$id));$ki=array_column($d['clases'],'id');$d['actividad']=array_values(array_filter($d['actividad'],fn($r)=>in_array($r['clase_id'],$ki)));$ei=array_column($d['inscripciones'],'estudiante_id');$d['estudiantes']=array_values(array_filter($d['estudiantes'],fn($e)=>in_array($e['id'],$ei)));$d['notas_historial']=array_values(array_filter($d['notas_historial'],fn($r)=>in_array($r['clase_id'],$ki)));$d['perfil']=['nombre'=>$t[0]['nombre'],'tipo'=>'Docente','ultimo_acceso'=>$t[0]['ultimo_acceso']];}
 $en=$d['inscripciones'];$total=array_sum(array_column($en,'total'));$done=array_sum(array_column($en,'completados'));$notes=array_values(array_filter(array_column($en,'nota_final'),fn($n)=>$n!==null));$d['stats']=['cursos'=>count($d['clases']),'estudiantes'=>count($d['estudiantes']),'asignaciones'=>$total,'completadas'=>$done,'progreso'=>$total?round(100*$done/$total):0,'promedio'=>count($notes)?round(array_sum($notes)/count($notes),1):null,'pendientes_nota'=>count(array_filter($en,fn($r)=>$r['nota_final']===null))];
 $d['resumen_practicas']=['intentos'=>array_sum(array_column($en,'intentos')),'minutos'=>array_sum(array_column($en,'minutos'))];
 if($p[1]==='estudiantes')$d['resumen_practicas']=['intentos'=>$student[0]['intentos'],'minutos'=>$student[0]['minutos']];
 json_out($d);
}
function route_directores(string $m,array $p): void {
 require_user('admin');$id=isset($p[1])&&ctype_digit($p[1])?(int)$p[1]:null;if(count($p)>2||(isset($p[1])&&!$id))throw new HttpError(404,'Ruta no encontrada.');
 if($m==='GET'){ $list=rows("SELECT dr.id,dr.usuario_id,dr.carrera_id,c.nombre AS carrera,c.universidad_id,un.nombre AS universidad,us.nombre,us.apellido,us.email,us.activo,us.telefono,us.ultimo_acceso FROM directores dr JOIN usuarios us ON us.id=dr.usuario_id JOIN carreras c ON c.id=dr.carrera_id JOIN universidades un ON un.id=c.universidad_id".($id?' WHERE dr.id=?':'').' ORDER BY us.apellido',$id?[$id]:[]);if($id&&!$list)throw new HttpError(404,'Director no encontrado.');json_out($id?['item'=>$list[0]]:['items'=>$list]);}
 if(($m==='POST'&&$id)||($m==='PUT'&&!$id))throw new HttpError(405,'Ruta no válida para esta operación.');
 if($m==='POST'||$m==='PUT'){$in=input();$data=validate(['carrera_id'=>['type'=>'int','req'=>true,'label'=>'Carrera']],$in);$c=must_exist('carreras',$data['carrera_id'],'La carrera');$old=$id?must_exist('directores',$id,'El director'):null;db()->beginTransaction();try{$uid=save_user($in,'director',(int)$c['universidad_id'],$old?(int)$old['usuario_id']:null);if($old)update('directores',$id,$data);else $id=insert('directores',$data+['usuario_id'=>$uid]);db()->commit();}catch(Throwable $e){db()->rollBack();throw $e;}json_out(['id'=>$id]);}
 throw new HttpError(405,'Método no permitido. Desactiva la cuenta para revocar su acceso.');
}
function certificate_inscription(int $id,array $u): array {
 $r=one("SELECT i.*,e.usuario_id,CONCAT(us.nombre,' ',us.apellido) AS estudiante,k.nombre AS curso,k.carrera_id,c.nombre AS carrera,un.nombre AS institucion FROM inscripciones i JOIN estudiantes e ON e.id=i.estudiante_id JOIN usuarios us ON us.id=e.usuario_id JOIN clases k ON k.id=i.clase_id JOIN carreras c ON c.id=k.carrera_id JOIN universidades un ON un.id=c.universidad_id WHERE i.id=?",[$id]);
 if(!$r)throw new HttpError(404,'Inscripción no encontrada.');if($u['rol']==='estudiante'){if((int)$r['usuario_id']!==(int)$u['id'])throw new HttpError(403,'No tienes acceso a este certificado.');}else clase_access((int)$r['clase_id'],$u,false);return $r;
}
function route_certificados(string $m,array $p): void {
 $u=require_user();$id=isset($p[1])&&ctype_digit($p[1])?(int)$p[1]:null;
 if($m==='POST'&&count($p)===1){$in=validate(['inscripcion_id'=>['type'=>'int','req'=>true,'label'=>'Inscripción']],input());$r=certificate_inscription($in['inscripcion_id'],$u);$total=(int)val('SELECT COUNT(*) FROM clase_laboratorio WHERE clase_id=?',[$r['clase_id']]);$done=(int)val('SELECT COUNT(*) FROM clase_laboratorio cl WHERE cl.clase_id=? AND EXISTS(SELECT 1 FROM practicas pr WHERE pr.clase_id=cl.clase_id AND pr.laboratorio_id=cl.laboratorio_id AND pr.estudiante_id=? AND pr.completada=1)',[$r['clase_id'],$r['estudiante_id']]);
 if(!$total||$done!==$total||$r['estado']!=='aprobado'||$r['nota_final']===null||(float)$r['nota_final']<51)throw new HttpError(422,'Para emitir: completar todos los laboratorios asignados y tener aprobación docente con nota final mínima de 51/100.');
 $old=val('SELECT id FROM certificados WHERE inscripcion_id=?',[$r['id']]);if($old)json_out(['id'=>(int)$old]);
 $cid=insert('certificados',['inscripcion_id'=>$r['id'],'codigo'=>bin2hex(random_bytes(16)),'estudiante'=>$r['estudiante'],'curso'=>$r['curso'],'carrera'=>$r['carrera'],'institucion'=>$r['institucion'],'nota'=>$r['nota_final'],'emitido_por'=>$u['id']]);json_out(['id'=>$cid],201);}
 if($m==='GET'&&$id&&count($p)===3&&$p[2]==='documento'){$c=must_exist('certificados',$id,'El certificado');certificate_inscription((int)$c['inscripcion_id'],$u);header('Content-Type: text/html; charset=utf-8');$esc=fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');require __DIR__.'/../templates/certificado.php';exit;}
 throw new HttpError(404,'Ruta no encontrada.');
}

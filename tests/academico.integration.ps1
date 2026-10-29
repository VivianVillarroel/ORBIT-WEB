param([string]$Base='http://localhost:8096')
$ErrorActionPreference='Stop'
$fixture=(& php "$PSScriptRoot/academico-fixture.php" | ConvertFrom-Json)
function CallApi($session,$method,$route,$body=$null,$expected=200) {
 $args=@{Uri="$Base/api/index.php?r=$route";Method=$method;WebSession=$session.web;SkipHttpErrorCheck=$true}
 if($session.csrf){$args.Headers=@{'X-CSRF-Token'=$session.csrf}}
 if($null -ne $body){$args.ContentType='application/json; charset=utf-8';$args.Body=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Depth 8))}
 $res=Invoke-WebRequest @args
 if([int]$res.StatusCode -ne $expected){throw "$method $route expected $expected got $($res.StatusCode): $($res.Content)"}
 if($route -like '*/documento'){return $res.Content}
 return ($res.Content|ConvertFrom-Json)
}
function SignIn($email,$password){$w=New-Object Microsoft.PowerShell.Commands.WebRequestSession;$s=@{web=$w;csrf=''};$r=CallApi $s POST 'auth/login' @{email=$email;password=$password};$s.csrf=$r.csrf;return $s}
$labId=$null;$classId=$null
try {
 $admin=SignIn 'admin@orbit.bo' 'Admin123!'
 $createdDirector=CallApi $admin POST directores @{nombre='Prueba';apellido=$fixture.tag;email=($fixture.tag+'-api@example.invalid');password=$fixture.password;carrera_id=$fixture.carrera;activo=$true}
 $createdDirectorData=(CallApi $admin GET ('directores/'+$createdDirector.id)).item
 $fixture.usuarios+=@($createdDirectorData.usuario_id)
 CallApi $admin PUT ('directores/'+$createdDirector.id) @{nombre='Prueba editada';apellido=$fixture.tag;email=($fixture.tag+'-api@example.invalid');carrera_id=$fixture.carrera;activo=$true} | Out-Null
 $director=SignIn $fixture.director_email $fixture.password
 $teacher=SignIn $fixture.docente_email $fixture.password
 $student=SignIn $fixture.estudiante_email $fixture.password
 $other=SignIn $fixture.otro_email $fixture.password
 $before=CallApi $director GET academico
 if(@($before.clases|Where-Object {$_.carrera_id -ne $fixture.carrera}).Count){throw 'Director saw another career'}
 CallApi $director GET ('academico/estudiantes/'+$fixture.otro_id) $null 404 | Out-Null
 CallApi $director POST clases @{nombre='No permitido'} 403 | Out-Null
 CallApi $teacher GET directores $null 403 | Out-Null
 $lab=CallApi $director POST laboratorios @{nombre=$fixture.tag;area='Ingeniería y técnica';estado='publicado';carrera_ids=@($fixture.otra_carrera);catalogo_publico=$true;gratis=$true;modelo_url='simuladores/m2/index.html'} 201
 $labId=$lab.id
 $ld=(CallApi $director GET "laboratorios/$labId").item
 if($ld.carrera_ids -ne [string]$fixture.carrera -or $ld.catalogo_publico -ne 0){throw 'Director could publish outside career'}
 CallApi $director PUT 'laboratorios/1' @{nombre='No permitido'} 403 | Out-Null
 $course=CallApi $teacher POST clases @{nombre=$fixture.tag;periodo='TEST';estado='activa';carrera_id=$fixture.carrera} 201
 $classId=$course.id
 $en=CallApi $teacher POST "clases/$classId/inscripciones" @{estudiante_id=$fixture.estudiante_id} 201
 $iid=$en.id
 CallApi $student GET "clases/$classId/inscripciones" $null 403 | Out-Null
 CallApi $teacher POST "clases/$classId/laboratorios" @{laboratorio_id=$labId} 201 | Out-Null
 CallApi $director PUT "clases/$classId/inscripciones/$iid" @{nota_final=99;estado='aprobado'} 403 | Out-Null
 CallApi $student POST certificados @{inscripcion_id=$iid} 422 | Out-Null
 foreach($n in 1..2){CallApi $student POST practicas @{laboratorio_id=$labId;clase_id=$classId;completada=$true;duracion_min=5} 201 | Out-Null}
 $data=CallApi $teacher GET academico
 $row=$data.inscripciones|Where-Object {$_.id -eq $iid}
 if($row.total -ne 1 -or $row.completados -ne 1 -or $row.intentos -ne 2 -or $row.progreso -ne 100){throw 'Repeated attempts inflated progress'}
 CallApi $student POST certificados @{inscripcion_id=$iid} 422 | Out-Null
 CallApi $teacher PUT "clases/$classId/inscripciones/$iid" @{nota_final=85;estado='aprobado'} | Out-Null
 $history=(CallApi $director GET academico).notas_historial|Where-Object {$_.clase -eq $fixture.tag}
 if(@($history).Count -ne 1){throw 'Missing grade audit'}
 $cert=CallApi $student POST certificados @{inscripcion_id=$iid} 201
 $same=CallApi $student POST certificados @{inscripcion_id=$iid}
 if($cert.id -ne $same.id){throw 'Duplicate certificate'}
 $html=CallApi $student GET "certificados/$($cert.id)/documento"
 if($html -notmatch 'Certificado de finalización' -or $html -notmatch '85.00'){throw 'Invalid certificate content'}
 CallApi $other GET "certificados/$($cert.id)/documento" $null 403 | Out-Null
 CallApi $other GET "academico/estudiantes/$($fixture.estudiante_id)" $null 404 | Out-Null
 CallApi $teacher GET 'clases/1/inscripciones' $null 403 | Out-Null
 Write-Output 'ACADEMIC_INTEGRATION_OK roles, scope, classes, enrollment, grades audit, unique progress, certificates'
} finally {
 if($env:ORBIT_REVIEW_KEEP -eq '1' -and $cert){
 $fixture | Add-Member -NotePropertyName clase -NotePropertyValue $classId
 $fixture | Add-Member -NotePropertyName lab -NotePropertyValue $labId
 $fixture | Add-Member -NotePropertyName certificado -NotePropertyValue $cert.id
 $fixture | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$PSScriptRoot/review-fixture.json"
 Write-Output ('REVIEW_FIXTURE_READY certificate='+$cert.id+' director='+$fixture.director_email)
 } else {
 $env:ORBIT_TEST_CLEANUP=(@{usuarios=$fixture.usuarios;lab=$labId;clase=$classId}|ConvertTo-Json -Compress)
 & php "$PSScriptRoot/academico-cleanup.php"
 Remove-Item Env:ORBIT_TEST_CLEANUP
 }
}

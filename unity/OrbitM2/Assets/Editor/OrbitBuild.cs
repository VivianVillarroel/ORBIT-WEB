using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Orbit.M2;

public static class OrbitBuild {
 [MenuItem("Orbit/Exportar M2 para la web")]
 public static void Web() {
  Validate();
  Directory.CreateDirectory("Assets/Scenes");
  var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  new GameObject("Orbit M2 · Simulador").AddComponent<CellLab>();
  EditorSceneManager.SaveScene(scene,"Assets/Scenes/M2.unity");
  PlayerSettings.companyName="Orbit"; PlayerSettings.productName="Celda robotizada M2";
  PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Disabled;
  PlayerSettings.WebGL.template="APPLICATION:Default";
  PlayerSettings.defaultWebScreenWidth=1280; PlayerSettings.defaultWebScreenHeight=720;
  PlayerSettings.runInBackground=false;
  var path=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../orbit-web/simuladores/m2"));
  var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Scenes/M2.unity"},locationPathName=path,target=BuildTarget.WebGL,options=BuildOptions.None});
  if(report.summary.result!=UnityEditor.Build.Reporting.BuildResult.Succeeded) throw new Exception("Falló exportación: "+report.summary.result);
  File.Copy(Path.Combine(Application.dataPath,"../WebShell.html"),Path.Combine(path,"index.html"),true);
  Debug.Log("ORBIT_BUILD_OK "+path);
 }
 static void Assert(bool condition,string message) { if(!condition) throw new Exception("M2: "+message); }
 public static void Validate() {
  var s=new CellState(); Assert(!s.Start(),"bloquear inicio inseguro"); s.Verify();s.Power();s.CheckIo();s.Teach(true);s.Teach(false); Assert(s.Start(),"iniciar manual");s.Tick(9,1);Assert(s.ManualPassed&&s.Pieces==1&&!s.Running,"terminar prueba manual");
  s.ChangeMode(CellMode.Semiautomatico);Assert(s.Start(),"iniciar semiautomático");s.Tick(9,1);Assert(s.SemiPassed,"completar semiautomático"); s.ChangeMode(CellMode.Automatico);s.Start();s.Inject(CellFault.Sensor);Assert(!s.Running&&!s.Powered&&s.RecoveryRequired,"alarma desenergiza");s.Verify();s.Reset();Assert(s.RecoveryRequired,"no rearmar con falla");s.Correct();s.Verify();s.Reset();Assert(!s.Running&&!s.Powered&&!s.RecoveryRequired,"rearme sin arranque");s.Power();s.Start();s.SetDoor(false);Assert(!s.Running&&!s.Powered,"enclavamiento puerta");s.SetDoor(true);Assert(!s.Start(),"cerrar puerta no habilita reinicio");
  s.Progress=.42f;s.Trip("Prueba de retención");Assert(Math.Abs(s.Progress-.42f)<.001f,"conservar fase durante parada de seguridad");
  Debug.Log("ORBIT_STATE_TESTS_OK");
 }
}

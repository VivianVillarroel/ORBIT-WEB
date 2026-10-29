using System;
using System.Collections.Generic;

namespace Orbit.M2 {
 public enum CellMode { Manual, Semiautomatico, Automatico }
 public enum CellFault { Ninguna, Atasco, Sensor, Pinza }
 [Serializable] public class CellEvent { public float seconds; public string action; public string result; }
 [Serializable] public class CellReport { public string laboratory="M2 · Celda robotizada"; public string fidelity="PLC emulado, cinemática simplificada; sin conexión a equipo físico"; public bool completed; public int pieces; public int errors; public float elapsed; public List<CellEvent> events; }
 public sealed class CellState {
  public bool DoorClosed=true, CurtainClear=true, Emergency, Verified, Powered, IoChecked, PickTaught, PlaceTaught, ManualPassed, SemiPassed, Running, RecoveryRequired;
  public CellMode Mode; public CellFault Fault; public int Pieces, Errors; public float Elapsed, Progress; public string Message="Verifica puerta, cortina y paro antes de energizar.";
  public readonly List<CellEvent> Events=new List<CellEvent>();
  public bool Safe => DoorClosed && CurtainClear && !Emergency;
  public void Log(string action,string result) { Message=result; Events.Add(new CellEvent{seconds=Elapsed,action=action,result=result}); }
  bool Reject(string action,string reason) { Errors++; Log(action,reason); return false; }
  public void Verify() { if(!Safe) { Reject("Verificar seguridad","Cierra la puerta, despeja la cortina y libera el paro."); return; } Verified=true; Log("Verificar seguridad","Cadena de seguridad comprobada. Puedes energizar."); }
  public void Power() { if(!Safe||!Verified||RecoveryRequired) { Reject("Energizar","Verifica la seguridad y completa el rearme primero."); return; } Powered=true; Log("Energizar","Celda energizada. Comprueba las entradas y salidas."); }
  public void CheckIo() { if(!Powered||!Safe) { Reject("Comprobar E/S","La celda debe estar energizada y segura."); return; } IoChecked=true; Log("Comprobar E/S","Entradas y salidas verificadas en el PLC emulado."); }
  public void Teach(bool pick) { if(!Powered||!IoChecked||Mode!=CellMode.Manual||Running||!Safe||RecoveryRequired) { Reject("Enseñar punto","Usa modo manual con E/S comprobadas y celda detenida y segura."); return; } if(pick) PickTaught=true; else PlaceTaught=true; Log("Enseñar punto",pick?"Punto de toma guardado en posición didáctica.":"Punto de depósito guardado en posición didáctica."); }
  public void ChangeMode(CellMode mode) { if(Running) { Reject("Cambiar modo","Detén el ciclo antes de cambiar de modo."); return; } Mode=mode; Log("Cambiar modo",mode.ToString()); }
  public bool Start() {
   if(!Safe||!Verified||!Powered||RecoveryRequired) return Reject("Iniciar","Seguridad no habilitada: verifica y rearma la celda.");
   if(!IoChecked||!PickTaught||!PlaceTaught) return Reject("Iniciar","Comprueba E/S y enseña toma y depósito.");
   if(Fault!=CellFault.Ninguna) return Reject("Iniciar","La falla sigue activa. Aísla, corrige y rearma.");
   if(Mode==CellMode.Semiautomatico&&!ManualPassed) return Reject("Iniciar","Completa una prueba manual antes del modo semiautomático.");
   if(Mode==CellMode.Automatico&&!SemiPassed) return Reject("Iniciar","Completa una prueba semiautomática antes de automático.");
   Running=true; Log("Iniciar ciclo","Secuencia en marcha: transporte, toma, traslado y depósito."); return true;
  }
  public void Stop() { Running=false; Log("Detener","Ciclo pausado. Puedes continuar desde la misma posición."); }
  public void Trip(string reason) { Running=false; Powered=false; Verified=false; RecoveryRequired=true; Log("Parada de seguridad",reason+". Celda desenergizada; verifica y rearma."); }
  public void SetDoor(bool closed) { DoorClosed=closed; if(!closed) Trip("Puerta abierta"); else Log("Puerta","Puerta cerrada; el cierre no inicia el movimiento."); }
  public void SetCurtain(bool clear) { CurtainClear=clear; if(!clear) Trip("Cortina interrumpida"); else Log("Cortina","Cortina despejada; requiere rearme."); }
  public void SetEmergency(bool active) { Emergency=active; if(active) Trip("Paro de emergencia accionado"); else Log("Liberar paro","Paro liberado; verifica la seguridad y rearma."); }
  public void Inject(CellFault fault) { if(!Running) { Reject("Inyectar falla","Inicia un ciclo para observar una falla de producción."); return; } Fault=fault; Trip("Alarma: "+fault); }
  public void Correct() { if(Powered||Running||!RecoveryRequired) { Reject("Corregir falla","Aísla la celda antes de corregir la falla simulada."); return; } Fault=CellFault.Ninguna; Log("Corregir falla","Corrección simulada completada. Verifica seguridad y rearma."); }
  public void Reset() { if(!Safe||!Verified||Fault!=CellFault.Ninguna) { Reject("Rearmar","Comprueba seguridad y elimina la causa de la alarma."); return; } RecoveryRequired=false; Progress=0; Log("Rearmar","Rearme completado sin movimiento. Energiza e inicia por separado."); }
  public void Tick(float dt,float speed) { Elapsed+=dt; if(!Running) return; Progress+=dt*speed/8f; if(Progress<1) return; Progress=0; Pieces++; if(Mode==CellMode.Manual) ManualPassed=true; if(Mode==CellMode.Semiautomatico) SemiPassed=true; if(Mode!=CellMode.Automatico) Running=false; Log("Depósito","Pieza "+Pieces+" completada. "+(Running?"Siguiente ciclo.":"Prueba completada.")); }
  public CellReport Report() => new CellReport{completed=Pieces>0&&!Powered&&!Running&&!RecoveryRequired,pieces=Pieces,errors=Errors,elapsed=Elapsed,events=new List<CellEvent>(Events)};
 }
}

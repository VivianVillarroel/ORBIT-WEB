using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Orbit.M2 {
 public sealed partial class CellLab {
  [Serializable]class GuideFrame { public int step,pieces;public string title,instruction,gesture,status,feedback,context,targetLabel;public float x,y,dx,dy;public bool target,drop,holding,help;public bool[] checks; }
  [DllImport("__Internal")]static extern void OrbitGuide(string json);
  float nextGuide;LabHandle[] sceneHandles;
  Mesh Loft(float height,float[] radii,float depth){
   const int sides=40;var v=new List<Vector3>();var tri=new List<int>();
   for(int j=0;j<radii.Length;j++)for(int i=0;i<sides;i++){float a=i*Mathf.PI*2/sides;float c=Mathf.Cos(a),s=Mathf.Sin(a);v.Add(new Vector3(Mathf.Sign(c)*Mathf.Pow(Mathf.Abs(c),.65f)*radii[j],height*(j/(float)(radii.Length-1)-.5f),Mathf.Sign(s)*Mathf.Pow(Mathf.Abs(s),.65f)*radii[j]*depth));}
   for(int j=0;j<radii.Length-1;j++)for(int i=0;i<sides;i++){int a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;tri.AddRange(new[]{a,c,b,b,c,d});}
   int lo=v.Count;v.Add(new Vector3(0,-height/2,0));int hi=v.Count;v.Add(new Vector3(0,height/2,0));for(int i=0;i<sides;i++){tri.AddRange(new[]{lo,i,(i+1)%sides,hi,(radii.Length-1)*sides+(i+1)%sides,(radii.Length-1)*sides+i});}
   var mesh=new Mesh{name="Carcasa fundida de perfil variable"};mesh.SetVertices(v);mesh.SetTriangles(tri,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
  }
  void ReplaceMesh(string name,Mesh mesh,Material mat){var g=GameObject.Find(name);if(!g)return;g.GetComponent<MeshFilter>().sharedMesh=mesh;g.GetComponent<Renderer>().sharedMaterial=mat;}
  Mesh MachinedPlate(){
   const int count=64;var loops=new Vector3[8,count];
   for(int i=0;i<count;i++){float a=i*Mathf.PI*2/count,c=Mathf.Cos(a),s=Mathf.Sin(a);float r=Mathf.Pow(Mathf.Pow(Mathf.Abs(c)/.23f,6)+Mathf.Pow(Mathf.Abs(s)/.21f,6),-1f/6);
    loops[0,i]=new Vector3(c*(r-.013f),.11f,s*(r-.013f));loops[1,i]=new Vector3(c*r,.097f,s*r);loops[2,i]=new Vector3(c*r,-.097f,s*r);loops[3,i]=new Vector3(c*(r-.013f),-.11f,s*(r-.013f));loops[4,i]=new Vector3(c*.11f,-.11f,s*.11f);loops[5,i]=new Vector3(c*.096f,-.095f,s*.096f);loops[6,i]=new Vector3(c*.096f,.095f,s*.096f);loops[7,i]=new Vector3(c*.11f,.11f,s*.11f);
   }
   var v=new List<Vector3>();var t=new List<int>();for(int ring=0;ring<8;ring++)for(int i=0;i<count;i++){int n=(i+1)%count;int next=(ring+1)%8;int k=v.Count;v.AddRange(new[]{loops[ring,i],loops[ring,n],loops[next,n],loops[next,i]});t.AddRange(new[]{k,k+1,k+2,k,k+2,k+3});}
   var m=new Mesh{name="Brida mecanizada con taladro pasante y chaflanes"};m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();m.RecalculateBounds();return m;
  }
  Mesh Torus(float radius,float tube){const int a=48,b=10;var v=new List<Vector3>();var t=new List<int>();for(int i=0;i<a;i++)for(int j=0;j<b;j++){float x=i*Mathf.PI*2/a,y=j*Mathf.PI*2/b;v.Add(new Vector3(Mathf.Cos(x)*(radius+Mathf.Cos(y)*tube),Mathf.Sin(y)*tube,Mathf.Sin(x)*(radius+Mathf.Cos(y)*tube)));}for(int i=0;i<a;i++)for(int j=0;j<b;j++){int p=i*b+j,q=((i+1)%a)*b+j,r=i*b+(j+1)%b,s=((i+1)%a)*b+(j+1)%b;t.AddRange(new[]{p,r,q,q,r,s});}var m=new Mesh();m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();return m;}
  void JointHardware(Transform parent,float radius,float z){for(int i=0;i<8;i++){float a=i*Mathf.PI*2/8;Cyl("Tornillo de tapa",new Vector3(Mathf.Cos(a)*radius,Mathf.Sin(a)*radius,z),.024f,.025f,steel,parent,Vector3.forward);}}
  void RefineModels(){
   Material body=Mat("#CDD9D8",.52f,.25f),joint=Mat("#294957",.45f,.3f),alloy=Mat("#AEB8BA",.7f,.75f),darkMetal=Mat("#4C6069",.5f,.6f);
   ReplaceMesh("Brazo fundido",Loft(1.45f,new[]{.14f,.19f,.215f,.22f,.20f,.175f,.14f},1.10f),body);ReplaceMesh("Antebrazo",Loft(1.32f,new[]{.13f,.18f,.18f,.155f,.13f,.11f},1.04f),body);
   foreach(var r in robot.GetComponentsInChildren<Renderer>()){string n=r.gameObject.name;if(n.Contains("Tapa")||n=="Carcasa base")r.sharedMaterial=joint;if(n.Contains("Cubierta"))r.sharedMaterial=joint;}
   JointHardware(shoulder,.19f,-.36f);JointHardware(elbow,.16f,-.32f);
   Cyl("Carcasa de servo hombro",new Vector3(0,0,.37f),.2f,.22f,joint,shoulder,Vector3.forward);Bevel("Conector de potencia",new Vector3(.16f,.13f,.45f),new Vector3(.12f,.09f,.11f),.018f,rubber,shoulder);
   Cyl("Carcasa de servo codo",new Vector3(0,0,.31f),.16f,.18f,joint,elbow,Vector3.forward);for(int i=0;i<3;i++)Cyl("Anillo de muñeca",new Vector3(0,-.08f+i*.075f,0),.17f,.025f,i==1?darkMetal:alloy,wrist);
   Bevel("Placa de identificación R6",new Vector3(0,.35f,-.21f),new Vector3(.2f,.16f,.016f),.007f,joint,shoulder);Label("R6 / 03",new Vector3(0,.35f,-.222f),.011f,Color.white,shoulder);
   var handle=GameObject.Find("Aro manipulación");if(handle){handle.transform.localScale=Vector3.one;handle.GetComponent<MeshFilter>().sharedMesh=Torus(.23f,.018f);handle.GetComponent<Renderer>().sharedMaterial=yellow;var col=handle.GetComponent<CapsuleCollider>();if(col){Destroy(col);handle.AddComponent<BoxCollider>().size=new Vector3(.52f,.09f,.52f);}}
   var plate=MachinedPlate();foreach(var p in pieces){p.position=new Vector3(p.position.x,1.26f,p.position.z);p.GetComponent<MeshFilter>().sharedMesh=plate;p.GetComponent<Renderer>().sharedMaterial=alloy;p.GetComponent<LabHandle>().surfaces=new[]{p.GetComponent<Renderer>()};var c=p.GetComponent<BoxCollider>();c.size=new Vector3(.46f,.22f,.42f);foreach(Transform child in p)Destroy(child.gameObject);}
   foreach(var r in rollers)r.GetComponent<Renderer>().sharedMaterial=darkMetal;
   for(int side=-1;side<=1;side+=2){for(int i=0;i<3;i++)Cube("Canal de extrusión",new Vector3(-2.15f+side*.535f,.87f+i*.06f,-.5f),new Vector3(.012f,.012f,3.6f),rubber);for(int i=0;i<7;i++)Cyl("Fijación de bastidor",new Vector3(-2.15f+side*.55f,1.015f,-2+i*.5f),.02f,.018f,alloy,null,Vector3.right);for(float z=-2.65f;z<2.7f;z+=.17f)Cube("Alambre lateral",new Vector3(side*3.5f,1.25f,z),new Vector3(.009f,2,.009f),steel);for(int end=-1;end<=1;end+=2)Cube("Poste lateral",new Vector3(side*3.5f,1.18f,end*2.65f),new Vector3(.06f,2.3f,.06f),yellow);}
   foreach(float y in new[]{.36f,1.88f}){Cyl("Bisagra de seguridad",new Vector3(0,y,0),.05f,.19f,steel,gate);Bevel("Bisagra de gabinete",new Vector3(3.13f,y,1.60f),new Vector3(.06f,.14f,.05f),.01f,alloy);}
   Bevel("Junta de inspección",new Vector3(3.65f,1.52f,1.625f),new Vector3(.88f,.73f,.025f),.018f,rubber);Bevel("Tirador gabinete",new Vector3(4.06f,1.12f,1.59f),new Vector3(.035f,.25f,.055f),.012f,alloy);
   var sign=GameObject.Find("Rótulo taller");if(sign)Destroy(sign);
   foreach(var m in FindObjectsByType<TextMesh>(FindObjectsSortMode.None)){
    if(m.text.Contains("ROBOTICS LAB")||m.text.Contains("ESTACIÓN M2")){Destroy(m.gameObject);continue;}
    if(m.text=="PLC / 24 V"){m.text="CONTROL / 24 V";m.characterSize=.022f;}
    if(m.text.Contains("MATERIAL")){m.text="ALUMINIO / LOTE 03";m.characterSize=.02f;}
    if(m.text=="MODO      MARCHA")m.characterSize=.015f;
   }
   Bevel("Panel de trabajo del taller",new Vector3(-.8f,2.8f,7.1f),new Vector3(3.4f,1.55f,.06f),.02f,white);Label("INGENIERÍA MECATRÓNICA",new Vector3(-.8f,3.3f,7.055f),.035f,new Color(.15f,.26f,.3f));Label("CELDA R6-03\nPuesta en marcha y manipulación",new Vector3(-.8f,2.8f,7.055f),.028f,new Color(.15f,.26f,.3f));
   sceneHandles=FindObjectsByType<LabHandle>(FindObjectsSortMode.None);
  }
  LabHandle ByKind(string kind){foreach(var h in sceneHandles)if(h&&h.kind==kind)return h;return null;}
  void PublishGuide(){
   if(Time.unscaledTime<nextGuide)return;nextGuide=Time.unscaledTime+.08f;
   var g=new GuideFrame{pieces=state.Pieces,status=state.RecoveryRequired?"Rearme pendiente":state.Running?"En movimiento":state.Powered?"Energizada":"Equipo aislado",feedback=Time.time<noticeUntil?notice:"",context=held?held.caption:hovered?hovered.caption:"",holding=held,help=help,checks=new[]{loaded||state.Pieces>0,state.DoorClosed,state.Powered,state.PickTaught,state.PlaceTaught,state.Pieces>0}};
   Vector3 target=Vector3.zero,destination=Vector3.zero;LabHandle h=null;
   if(state.RecoveryRequired){g.step=6;g.title="Restablece la seguridad";g.instruction="Cierra la puerta, libera el paro y corrige la causa. Pulsa R para verificar y rearmar. El robot permanecerá detenido.";g.gesture="R · verificar y rearmar";h=ByKind(!state.DoorClosed?"door":state.Emergency?"estop":"sensor");g.targetLabel=h?h.caption:"";}
   else if(state.Running){g.step=5;g.title="Observa el ciclo del robot";g.instruction="La pinza toma la pieza y la traslada a la bandeja. Espera a que finalice antes de intervenir.";g.gesture="Ciclo en curso";}
   else if(state.Pieces>0){g.step=state.Powered?5:7;g.title=state.Powered?"Finaliza la práctica":"Práctica completada";g.instruction=state.Powered?"La pieza ya está en la bandeja y el robot regresó a reposo.\n\nAgarra el interruptor rojo y bájalo un poco hasta 0 para dejar la celda aislada.":"Entregaste una pieza y dejaste la celda aislada.\n\nHas terminado esta práctica. Puedes descargar tu informe o volver a realizarla.";g.gesture=state.Powered?"Interruptor rojo · arrastre corto hacia abajo":"Una pieza entregada · equipo aislado";if(state.Powered){h=ByKind("power");g.targetLabel="Apagar para finalizar";}}
   else if(!loaded){g.step=0;g.title=state.Powered?"Aísla antes de cargar otra pieza":state.Pieces>0?"Carga la siguiente pieza":"Coloca una pieza en la cinta";g.instruction=state.Powered?"Primero aísla la celda: arrastra el seccionador rojo hacia abajo. Luego podrás cargar la siguiente pieza.":"1. Pon el cursor sobre la pieza marcada.\n2. Mantén pulsado el botón izquierdo y muévela hasta el círculo amarillo.\n3. Suelta el botón.";g.gesture=state.Powered?"Arrastra el seccionador hacia abajo":"Agarrar · arrastrar · soltar";if(state.Powered){h=ByKind("power");g.targetLabel="Aislar celda";}else{foreach(var p in pieces)if(p&&!finished.Contains(p)&&p!=part){h=p.GetComponent<LabHandle>();break;}if(!h&&finished.Count>0)h=finished[0].GetComponent<LabHandle>();g.targetLabel="Pieza de aluminio";g.drop=true;destination=new Vector3(-2.15f,1.2f,-1.55f);}}
   else if(!state.DoorClosed){g.step=1;g.title="Cierra la puerta";g.instruction="1. Agarra la manija azul con el botón izquierdo.\n2. Muévela hacia la derecha hasta encajar en el poste.\n3. Suelta cuando la puerta quede alineada con la valla.";g.gesture="Mantén pulsado y mueve a la derecha";h=ByKind("door");g.targetLabel="Manija azul";g.drop=true;destination=new Vector3(-.65f,1.13f,-2.895f);}
   else if(!state.Powered){g.step=2;g.title="Enciende la celda";g.instruction="El interruptor rojo está en el armario de la derecha.\n\nAgárralo por cualquier parte del mando y súbelo un poco hasta I. No hace falta seguirlo con el cursor.";g.gesture="Arrastre corto hacia arriba · suelta";h=ByKind("power");g.targetLabel="Interruptor general";}
   else if(!state.PickTaught||!state.PlaceTaught){bool isPick=!state.PickTaught;g.step=isPick?3:4;g.title=isPick?"Marca dónde recoger la pieza":"Marca dónde dejar la pieza";g.instruction=isPick?"1. Agarra la argolla amarilla que está sobre la pinza.\n2. Llévala hasta el círculo azul de la cinta.\n3. Suelta: el robot guardará ese punto para recoger la pieza.":"1. Vuelve a agarrar la argolla de la pinza.\n2. Llévala hasta el círculo azul de la bandeja.\n3. Suelta para guardar el lugar de entrega.";g.gesture="Pinza · arrastrar hasta la marca";h=ByKind("tool");g.targetLabel="Argolla de la pinza";g.drop=true;destination=isPick?new Vector3(-2.15f,1.2f,-.2f):new Vector3(2.05f,1.2f,0);}
   else{g.step=5;g.title="Pon en marcha el robot";g.instruction="1. Agarra la palanca verde del panel delantero.\n2. Súbela un poco y suelta; un arrastre corto es suficiente.\n3. Observa cómo recoge y deja la pieza.";g.gesture="Palanca verde · arrastrar hacia arriba";h=ByKind("run");g.targetLabel="Palanca verde";}
   if(held&&(held.kind=="power"||held.kind=="run")){float dy=(Input.mousePosition.y-dragStart.y)*1280f/Screen.width;g.context=Mathf.Abs(dy)>6?(dy>0?(held.kind=="power"?"Suelta para encender":"Suelta para iniciar"):"Suelta para detener"):"Mueve un poco hacia arriba o abajo";}
   if(h){target=h.transform.position;var p=cam.WorldToViewportPoint(target);g.x=p.x;g.y=1-p.y;g.target=p.z>0;}
   if(g.drop){var p=cam.WorldToViewportPoint(destination);g.dx=p.x;g.dy=1-p.y;g.drop=p.z>0;}
   #if UNITY_WEBGL && !UNITY_EDITOR
   OrbitGuide(JsonUtility.ToJson(g));
   #endif
  }
 }
}

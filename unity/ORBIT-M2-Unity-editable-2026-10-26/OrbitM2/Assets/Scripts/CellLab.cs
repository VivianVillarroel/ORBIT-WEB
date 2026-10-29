using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

namespace Orbit.M2 {
 public sealed class LabHandle : MonoBehaviour { public string kind,caption,hint; public Renderer[] surfaces; }
 public sealed partial class CellLab : MonoBehaviour {
  readonly CellState state=new CellState(); readonly List<Transform> pieces=new List<Transform>(),finished=new List<Transform>(),rollers=new List<Transform>();
  Camera cam;Font font;Transform robot,shoulder,elbow,wrist,gate,power,mode,lever,part;Renderer beacon;LineRenderer cable;
  Material concrete,paint,steel,rubber,orange,white,cyan,green,red,yellow,glass,blue,highlight;Material[] originals;
  LabHandle hovered,held;Vector3 focus=new Vector3(-.3f,1.15f,0),smoothFocus,toolPosition=new Vector3(-1,2.4f,.2f),pick=new Vector3(-2.15f,1.95f,-.2f),place=new Vector3(2.05f,1.95f,0),dragStart,objectStart;
  float yaw=-29,pitch=29,distance=12.5f,doorAngle=78,startAngle,noticeUntil;Vector3 cycleOrigin;bool loaded,help=true,journal;string notice="";int completed;Vector2 scroll;
  Texture2D pixel;GUIStyle heading,text,small,number;
  [DllImport("__Internal")]static extern void OrbitDownload(string content);
  Material Mat(string hex,float gloss=.3f,float metal=0,float surface=0){ColorUtility.TryParseHtmlString(hex,out var c);var m=new Material(Resources.Load<Shader>("Industrial")){color=c};m.SetFloat("_Gloss",gloss);m.SetFloat("_Metallic",metal);m.SetFloat("_Surface",surface);return m;}
  Transform Root(string name,Vector3 p,Transform parent=null){var t=new GameObject(name).transform;t.SetParent(parent,false);t.localPosition=p;return t;}
  GameObject Cube(string name,Vector3 p,Vector3 size,Material mat,Transform parent=null){var g=GameObject.CreatePrimitive(PrimitiveType.Cube);g.name=name;g.transform.SetParent(parent,false);g.transform.localPosition=p;g.transform.localScale=size;g.GetComponent<Renderer>().sharedMaterial=mat;return g;}
  GameObject Cyl(string name,Vector3 p,float r,float h,Material mat,Transform parent=null,Vector3? axis=null){var g=GameObject.CreatePrimitive(PrimitiveType.Cylinder);g.name=name;g.transform.SetParent(parent,false);g.transform.localPosition=p;g.transform.localScale=new Vector3(r*2,h*.5f,r*2);if(axis.HasValue)g.transform.localRotation=Quaternion.FromToRotation(Vector3.up,axis.Value);g.GetComponent<Renderer>().sharedMaterial=mat;return g;}
  void Face(List<Vector3> v,List<int> tri,params Vector3[] p){int start=v.Count;var n=Vector3.Cross(p[1]-p[0],p[2]-p[0]);var center=Vector3.zero;foreach(var x in p)center+=x;if(Vector3.Dot(n,center)<0)Array.Reverse(p);v.AddRange(p);for(int i=1;i<p.Length-1;i++){tri.Add(start);tri.Add(start+i);tri.Add(start+i+1);}}
  GameObject Bevel(string name,Vector3 p,Vector3 size,float radius,Material mat,Transform parent=null){
   var g=Root(name,p,parent).gameObject;var h=size*.5f;float r=Mathf.Min(radius,Mathf.Min(h.x,Mathf.Min(h.y,h.z))*.75f);var axes=new[]{Vector3.right,Vector3.up,Vector3.forward};var v=new List<Vector3>();var tri=new List<int>();
   for(int a=0;a<3;a++)for(int s=-1;s<=1;s+=2){int b=(a+1)%3,c=(a+2)%3;var n=axes[a]*h[a]*s;var u=axes[b]*(h[b]-r);var w=axes[c]*(h[c]-r);Face(v,tri,n-u-w,n+u-w,n+u+w,n-u+w);}
   for(int a=0;a<3;a++)for(int b=a+1;b<3;b++){int c=3-a-b;for(int s=-1;s<=1;s+=2)for(int t=-1;t<=1;t+=2){var u=axes[a]*h[a]*s+axes[b]*(h[b]-r)*t;var w=axes[a]*(h[a]-r)*s+axes[b]*h[b]*t;var z=axes[c]*(h[c]-r);Face(v,tri,u-z,w-z,w+z,u+z);}}
   for(int x=-1;x<=1;x+=2)for(int y=-1;y<=1;y+=2)for(int z=-1;z<=1;z+=2){var c=new Vector3(h.x*x,h.y*y,h.z*z);Face(v,tri,c-new Vector3(0,r*y,r*z),c-new Vector3(r*x,0,r*z),c-new Vector3(r*x,r*y,0));}
   var mesh=new Mesh{name=name};mesh.SetVertices(v);mesh.SetTriangles(tri,0);mesh.RecalculateNormals();mesh.RecalculateBounds();g.AddComponent<MeshFilter>().sharedMesh=mesh;g.AddComponent<MeshRenderer>().sharedMaterial=mat;g.AddComponent<BoxCollider>().size=size;return g;
  }
  void Label(string value,Vector3 p,float size,Color color,Transform parent=null){var g=Root("Rótulo",p,parent);var m=g.gameObject.AddComponent<TextMesh>();m.font=font;m.fontSize=60;m.characterSize=size;m.text=value;m.color=color;m.anchor=TextAnchor.MiddleCenter;m.alignment=TextAlignment.Center;g.GetComponent<Renderer>().sharedMaterial=font.material;}
  void Handle(GameObject g,string kind,string caption,string hint){var h=g.AddComponent<LabHandle>();h.kind=kind;h.caption=caption;h.hint=hint;h.surfaces=g.GetComponentsInChildren<Renderer>();foreach(var child in g.GetComponentsInChildren<Transform>())child.gameObject.layer=8;var box=g.GetComponent<BoxCollider>();if(box&&(kind=="power"||kind=="mode"||kind=="run"||kind=="door"))box.size=new Vector3(Mathf.Max(.22f,box.size.x),Mathf.Max(.34f,box.size.y*1.2f),Mathf.Max(.24f,box.size.z*1.3f));}
  LineRenderer Line(string name,Vector3[] points,float width,Material mat,bool loop=false){var l=Root(name,Vector3.zero).gameObject.AddComponent<LineRenderer>();l.sharedMaterial=mat;l.generateLightingData=true;l.positionCount=points.Length;l.SetPositions(points);l.startWidth=l.endWidth=width;l.loop=loop;l.numCapVertices=4;l.numCornerVertices=3;l.shadowCastingMode=ShadowCastingMode.On;return l;}
  void Ring(Vector3 p,float r,Material mat){var points=new Vector3[64];for(int i=0;i<64;i++){float a=i*Mathf.PI*2/64;points[i]=p+new Vector3(Mathf.Cos(a)*r,0,Mathf.Sin(a)*r);}Line("Zona de manipulación",points,.018f,mat,true);}
  void Legs(Vector3 p,float w,float d,float h){for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2){Cube("Perfil aluminio",p+new Vector3(x*w/2,h/2,z*d/2),new Vector3(.07f,h,.07f),steel);Cyl("Pie regulable",p+new Vector3(x*w/2,.055f,z*d/2),.08f,.05f,rubber);}}
  void Desk(Vector3 p,float w,float d){Bevel("Mesa de trabajo",p,new Vector3(w,.12f,d),.035f,white);Legs(new Vector3(p.x,0,p.z),w-.2f,d-.2f,p.y-.06f);}
  void Fence(float a,float b,float z){for(float x=a;x<b+.01f;x+=1.4f){Cube("Poste vallado",new Vector3(x,1.15f,z),new Vector3(.06f,2.3f,.06f),yellow);Bevel("Anclaje",new Vector3(x,.04f,z),new Vector3(.2f,.06f,.2f),.015f,steel);}for(float y=.28f;y<=2.2f;y+=.17f)Cube("Malla horizontal",new Vector3((a+b)/2,y,z),new Vector3(b-a,.009f,.009f),steel);for(float x=a;x<b;x+=.17f)Cube("Malla vertical",new Vector3(x,1.25f,z),new Vector3(.009f,2,.009f),steel);}
  void Start(){
   Application.targetFrameRate=60;QualitySettings.antiAliasing=4;QualitySettings.shadows=ShadowQuality.All;QualitySettings.shadowResolution=ShadowResolution.High;QualitySettings.shadowDistance=40;
   font=Resources.Load<Font>("OrbitSans");concrete=Mat("#A2ADB4",.06f,0,1);paint=Mat("#34444E",.4f,.25f);steel=Mat("#9CAEB8",.8f,.7f);rubber=Mat("#1B252B",.12f);orange=Mat("#E67C31",.55f,.15f);white=Mat("#DCE3E4",.4f,.15f);cyan=Mat("#72DFED",.6f,.2f);green=Mat("#62D9A7",.5f);red=Mat("#DB4542",.5f);yellow=Mat("#DEC15B",.35f);glass=Mat("#A0C8D5",.9f,.3f);blue=Mat("#387DA0",.5f);highlight=Mat("#CACBE4",.5f,.5f);
   Room();Conveyor();Robot();Stations();Safety();RefineModels();FinishMechanicalDetails();cam=Camera.main;if(!cam){cam=new GameObject("Main Camera").AddComponent<Camera>();cam.tag="MainCamera";}cam.clearFlags=CameraClearFlags.SolidColor;cam.backgroundColor=new Color(.67f,.73f,.77f);cam.fieldOfView=42;cam.nearClipPlane=.08f;cam.farClipPlane=100;smoothFocus=focus;
   RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.62f,.70f,.79f);RenderSettings.ambientEquatorColor=new Color(.42f,.48f,.52f);RenderSettings.ambientGroundColor=new Color(.2f,.23f,.25f);RenderSettings.fog=true;RenderSettings.fogColor=new Color(.57f,.65f,.72f);RenderSettings.fogMode=FogMode.Exponential;RenderSettings.fogDensity=.018f;
   var sun=new GameObject("Luz de ventanales").AddComponent<Light>();sun.type=LightType.Directional;sun.intensity=1.05f;sun.color=new Color(1,.94f,.85f);sun.shadows=LightShadows.Soft;sun.shadowStrength=.8f;sun.shadowBias=.035f;sun.transform.rotation=Quaternion.Euler(47,-32,0);
   state.DoorClosed=false;state.Log("Entrar al laboratorio","Prepara la celda manipulando directamente sus componentes.");Pose();
  }
  void Room(){
   Bevel("Pavimento de resina",new Vector3(0,-.13f,0),new Vector3(30,.24f,24),.04f,concrete);for(int x=-12;x<=12;x+=4)Cube("Junta suelo",new Vector3(x,-.004f,0),new Vector3(.012f,.008f,24),paint);for(int z=-10;z<=10;z+=4)Cube("Junta suelo",new Vector3(0,-.004f,z),new Vector3(30,.008f,.012f),paint);
   Bevel("Plataforma celda",new Vector3(0,.025f,.2f),new Vector3(7.5f,.07f,5.6f),.035f,paint);for(int i=0;i<26;i++){var a=Cube("Marca seguridad",new Vector3(-3.6f+i*.28f,.067f,-2.5f),new Vector3(.13f,.008f,.22f),yellow);a.transform.rotation=Quaternion.Euler(0,35,0);}
   Cube("Pared posterior",new Vector3(0,3.3f,7.5f),new Vector3(30,6.6f,.3f),white);Cube("Zócalo",new Vector3(0,.7f,7.3f),new Vector3(30,1.4f,.08f),paint);
   for(int x=-12;x<=12;x+=4){Cube("Pilar",new Vector3(x,3.5f,7.1f),new Vector3(.23f,7,.3f),paint);Bevel("Ventanal",new Vector3(x+1.7f,4.3f,7.27f),new Vector3(2.8f,2.3f,.08f),.025f,glass);Cube("Travesaño",new Vector3(x+1.7f,4.3f,7.19f),new Vector3(2.8f,.045f,.04f),steel);}
   for(int x=-8;x<=8;x+=8){Cube("Viga",new Vector3(x,6.8f,0),new Vector3(.18f,.3f,16),paint);Bevel("Luminaria",new Vector3(x,6.5f,0),new Vector3(.4f,.12f,4),.035f,white);}
   Bevel("Rótulo taller",new Vector3(-1,3.8f,7.05f),new Vector3(7,1.25f,.08f),.025f,paint);Label("ORBIT  /  ROBOTICS LAB",new Vector3(-1,3.9f,6.99f),.1f,Color.white);Label("MECATRÓNICA    ·    ESTACIÓN M2",new Vector3(-1,3.5f,6.99f),.042f,new Color(.65f,.81f,.88f));
   for(int i=0;i<3;i++){float x=-9+i*8;Desk(new Vector3(x,1.05f,5.8f),2.5f,1.2f);Bevel("Instrumento banco",new Vector3(x,1.36f,5.8f),new Vector3(.85f,.5f,.65f),.055f,paint);Bevel("Pantalla instrumento",new Vector3(x,1.4f,5.45f),new Vector3(.5f,.25f,.025f),.02f,glass);}
   Bevel("Armario herramientas",new Vector3(-6,1.15f,3.8f),new Vector3(1.6f,2.3f,.8f),.05f,blue);for(int y=0;y<4;y++){Bevel("Cajón",new Vector3(-6,.45f+y*.4f,3.38f),new Vector3(1.45f,.35f,.05f),.02f,paint);Cube("Tirador",new Vector3(-6,.45f+y*.4f,3.32f),new Vector3(.5f,.035f,.05f),steel);}
  }
  void Conveyor(){
   Bevel("Bastidor cinta",new Vector3(-2.15f,.95f,-.5f),new Vector3(1.05f,.25f,3.9f),.055f,steel);Bevel("Banda caucho",new Vector3(-2.15f,1.09f,-.5f),new Vector3(.86f,.08f,3.8f),.02f,rubber);
   for(int i=0;i<27;i++){var r=Cyl("Rodillo",new Vector3(-2.15f,1.135f,-2.3f+i*.14f),.046f,.86f,paint,null,Vector3.right);rollers.Add(r.transform);}Legs(new Vector3(-2.15f,0,-.5f),.8f,3.3f,.85f);for(int s=-1;s<=1;s+=2)Cube("Guía lateral",new Vector3(-2.15f+s*.5f,1.18f,-.5f),new Vector3(.04f,.12f,3.8f),steel);
   Bevel("Motor banda",new Vector3(-2.8f,.79f,1),new Vector3(.5f,.45f,.55f),.06f,blue);for(int i=0;i<5;i++)Cube("Aleta motor",new Vector3(-2.8f,.8f,.8f+i*.08f),new Vector3(.55f,.04f,.025f),steel);
   Ring(new Vector3(-2.15f,1.2f,-.2f),.36f,cyan);Ring(new Vector3(-2.15f,1.2f,-1.55f),.35f,yellow);Desk(new Vector3(-4.5f,1.08f,-1.3f),1.6f,2.2f);
   for(int i=0;i<3;i++){var g=Bevel("Pieza aluminio "+(i+1),new Vector3(-4.5f,1.34f,-1.9f+i*.58f),new Vector3(.44f,.4f,.44f),.045f,orange);Cyl("Alojamiento mecanizado",new Vector3(0,.207f,0),.105f,.008f,rubber,g.transform);Cyl("Interior alojamiento",new Vector3(0,.212f,0),.065f,.01f,steel,g.transform);Handle(g,"piece","Pieza de trabajo","Arrastra hasta el aro amarillo de la cinta");pieces.Add(g.transform);}
   Bevel("Placa de mesa",new Vector3(-4.5f,.94f,-2.43f),new Vector3(1.3f,.26f,.035f),.02f,paint);Label("MATERIAL / ALUMINIO",new Vector3(-4.5f,.94f,-2.46f),.035f,Color.white);
   var sensor=Bevel("Sensor fotoeléctrico",new Vector3(-1.54f,1.26f,-.2f),new Vector3(.16f,.2f,.24f),.02f,blue);Cyl("Lente sensor",new Vector3(-.085f,0,0),.045f,.018f,red,sensor.transform,Vector3.right);Handle(sensor,"sensor","Sensor fotoeléctrico","Arrastra para alinear o desplazar el sensor");
  }
  void Robot(){
   Bevel("Anclaje robot",new Vector3(0,.14f,.7f),new Vector3(1.15f,.26f,1.15f),.05f,steel);for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)Cyl("Perno base",new Vector3(x*.45f,.285f,.7f+z*.45f),.035f,.025f,steel);
   Cyl("Pedestal",new Vector3(0,.49f,.7f),.45f,.55f,paint);Cyl("Corona inferior",new Vector3(0,.78f,.7f),.48f,.12f,rubber);robot=Root("Eje 1 · Giro",new Vector3(0,.88f,.7f));Cyl("Carcasa base",Vector3.zero,.4f,.3f,orange,robot);Cyl("Junta base",new Vector3(0,.18f,0),.34f,.08f,steel,robot);
   shoulder=Root("Eje 2 · Hombro",new Vector3(0,.28f,0),robot);Cyl("Rodamiento hombro",Vector3.zero,.29f,.58f,paint,shoulder,Vector3.forward);Cyl("Tapa hombro",new Vector3(0,0,-.31f),.24f,.07f,orange,shoulder,Vector3.forward);Cyl("Tapa interior",new Vector3(0,0,-.36f),.12f,.035f,steel,shoulder,Vector3.forward);
   Bevel("Brazo fundido",new Vector3(0,.72f,0),new Vector3(.34f,1.45f,.36f),.08f,orange,shoulder);Bevel("Cubierta dorsal",new Vector3(0,.7f,.19f),new Vector3(.25f,.96f,.055f),.025f,white,shoulder);
   elbow=Root("Eje 3 · Codo",new Vector3(0,1.45f,0),shoulder);Cyl("Rodamiento codo",Vector3.zero,.25f,.5f,paint,elbow,Vector3.forward);Cyl("Tapa codo",new Vector3(0,0,-.28f),.21f,.065f,orange,elbow,Vector3.forward);Bevel("Antebrazo",new Vector3(0,.66f,0),new Vector3(.27f,1.32f,.28f),.065f,orange,elbow);Bevel("Cubierta antebrazo",new Vector3(0,.67f,-.155f),new Vector3(.18f,.86f,.055f),.025f,white,elbow);
   wrist=Root("Muñeca",new Vector3(0,1.32f,0),elbow);Cyl("Muñeca mecánica",Vector3.zero,.16f,.3f,paint,wrist);Cyl("Brida herramienta",new Vector3(0,-.18f,0),.19f,.07f,steel,wrist);Bevel("Actuador neumático",new Vector3(0,-.27f,0),new Vector3(.36f,.15f,.28f),.035f,blue,wrist);
   for(int s=-1;s<=1;s+=2){Bevel("Dedo pinza",new Vector3(s*.19f,-.44f,0),new Vector3(.055f,.28f,.22f),.012f,steel,wrist);Cube("Mordaza",new Vector3(s*.14f,-.56f,0),new Vector3(.12f,.05f,.22f),rubber,wrist);}
   var handle=Cyl("Aro manipulación",new Vector3(0,.13f,0),.26f,.045f,cyan,wrist);Handle(handle,"tool","Pinza del robot","Arrastra la pinza sobre los aros de toma y depósito");cable=Line("Manguera neumática",new Vector3[20],.045f,rubber);
   Desk(new Vector3(2.05f,.98f,0),1.6f,2);Bevel("Fondo bandeja",new Vector3(2.05f,1.07f,0),new Vector3(1.35f,.08f,1.75f),.025f,steel);for(int s=-1;s<=1;s+=2){Bevel("Lateral bandeja",new Vector3(2.05f+s*.66f,1.19f,0),new Vector3(.065f,.25f,1.75f),.02f,blue);Bevel("Borde bandeja",new Vector3(2.05f,1.19f,s*.85f),new Vector3(1.35f,.25f,.06f),.02f,blue);}Ring(new Vector3(2.05f,1.13f,0),.38f,cyan);
  }
  void Stations(){
   var cabinet=Bevel("Gabinete control",new Vector3(3.65f,1.15f,2),new Vector3(1.1f,2.3f,.65f),.055f,white);Handle(cabinet,"cabinet","Gabinete PLC","Mantén el mouse para inspeccionar las señales");Bevel("Puerta gabinete",new Vector3(3.65f,1.2f,1.65f),new Vector3(1.02f,2.1f,.055f),.02f,paint);for(int i=0;i<10;i++)Cube("Ventilación gabinete",new Vector3(3.65f,.5f+i*.045f,1.615f),new Vector3(.65f,.012f,.012f),rubber);
   for(int i=0;i<4;i++){Bevel("Módulo PLC",new Vector3(3.34f+i*.2f,1.5f,1.605f),new Vector3(.15f,.5f,.06f),.015f,white);for(int n=0;n<4;n++)Cyl("LED",new Vector3(3.34f+i*.2f,1.65f-n*.08f,1.563f),.015f,.012f,green,null,Vector3.forward);}Label("PLC / 24 V",new Vector3(3.65f,1.96f,1.60f),.045f,Color.white);
   power=Root("Seccionador",new Vector3(3.65f,.95f,1.57f));Cyl("Placa seccionador",Vector3.zero,.15f,.03f,yellow,power,Vector3.forward);var knob=Bevel("Mando seccionador",new Vector3(0,0,-.07f),new Vector3(.06f,.25f,.1f),.025f,red,power);Handle(knob,"power","Seccionador general","Arrastra arriba para energizar; abajo para aislar");Label("0   /   I",new Vector3(3.65f,.68f,1.55f),.032f,Color.white);
   Cyl("Columna estado",new Vector3(3.65f,2.65f,2),.035f,.8f,steel);beacon=Cyl("Baliza",new Vector3(3.65f,3.05f,2),.11f,.22f,yellow).GetComponent<Renderer>();Cyl("Tapa baliza",new Vector3(3.65f,3.18f,2),.12f,.035f,rubber);
   var panel=Root("Puesto operación",new Vector3(3.85f,0,-1.7f));Cyl("Pie consola",new Vector3(0,.65f,0),.055f,1.3f,steel,panel);Bevel("Apoyo consola",new Vector3(0,.06f,0),new Vector3(.7f,.08f,.5f),.04f,paint,panel);Bevel("Consola HMI",new Vector3(0,1.48f,0),new Vector3(.95f,.72f,.22f),.05f,paint,panel);
   Bevel("Pantalla HMI",new Vector3(-.14f,1.58f,-.124f),new Vector3(.52f,.28f,.025f),.015f,blue,panel);Label("ORBIT / M2",new Vector3(-.14f,1.63f,-.145f),.028f,Color.white,panel);Label("CONTROL DE CELDA",new Vector3(-.14f,1.53f,-.145f),.014f,Color.white,panel);
   var stop=Cyl("Paro emergencia",new Vector3(.29f,1.59f,-.17f),.095f,.1f,red,panel,Vector3.forward);Handle(stop,"estop","Paro de emergencia","Presiona para detener; arrastra arriba para liberar");Cyl("Aro paro",new Vector3(.29f,1.59f,-.125f),.13f,.025f,yellow,panel,Vector3.forward);
   mode=Root("Selector modo",new Vector3(-.25f,1.26f,-.145f),panel);Cyl("Dial modo",Vector3.zero,.095f,.035f,steel,mode,Vector3.forward);var dial=Bevel("Mando modo",new Vector3(0,0,-.045f),new Vector3(.04f,.14f,.06f),.012f,rubber,mode);Handle(dial,"mode","Selector manual / semi / auto","Arrastra horizontalmente para cambiar de modo");
   lever=Root("Palanca marcha",new Vector3(.18f,1.25f,-.15f),panel);Cyl("Base palanca",Vector3.zero,.065f,.04f,steel,lever,Vector3.forward);var stick=Bevel("Palanca",new Vector3(0,.08f,-.06f),new Vector3(.055f,.18f,.065f),.025f,green,lever);Handle(stick,"run","Palanca de marcha","Arrastra arriba para iniciar; abajo para detener");Label("MODO      MARCHA",new Vector3(0,1.08f,-.16f),.024f,Color.white,panel);
  }
  void Safety(){
   Fence(-3.5f,3.5f,2.65f);Fence(-3.5f,-2.1f,-2.65f);for(int s=-1;s<=1;s+=2){Cube("Marco lateral",new Vector3(s*3.5f,2.28f,0),new Vector3(.045f,.045f,5.3f),paint);for(float y=.3f;y<2.3f;y+=.17f)Cube("Malla lateral",new Vector3(s*3.5f,y,0),new Vector3(.009f,.009f,5.3f),steel);}
   gate=Root("Puerta seguridad",new Vector3(-2.1f,0,-2.65f));for(int s=0;s<=1;s++){Cube("Marco vertical puerta",new Vector3(s*1.6f,1.17f,0),new Vector3(.045f,2.3f,.045f),yellow,gate);Cube("Marco horizontal puerta",new Vector3(.8f,.1f+s*2.13f,0),new Vector3(1.6f,.045f,.045f),yellow,gate);}for(float y=.3f;y<2.2f;y+=.17f)Cube("Malla puerta",new Vector3(.8f,y,0),new Vector3(1.6f,.009f,.009f),steel,gate);
   var grip=Bevel("Manija puerta",new Vector3(1.45f,1.13f,-.08f),new Vector3(.08f,.4f,.11f),.025f,cyan,gate);Handle(grip,"door","Puerta enclavada","Arrastra horizontalmente para abrir o cerrar");var bar=Bevel("Cortina óptica",new Vector3(.05f,1.15f,-2.64f),new Vector3(.08f,2.2f,.08f),.015f,yellow);Handle(bar,"curtain","Cortina de seguridad","Arrastra para interrumpir o restablecer el haz");Bevel("Aviso seguridad",new Vector3(-2.8f,1.7f,-2.7f),new Vector3(.62f,.42f,.025f),.01f,yellow);Label("ZONA ROBOT\nACCESO RESTRINGIDO",new Vector3(-2.8f,1.7f,-2.72f),.018f,Color.black);gate.localRotation=Quaternion.Euler(0,doorAngle,0);
  }
  void Toast(string value){notice=value;noticeUntil=Time.time+4;}
  void Highlight(LabHandle next){if(hovered==next)return;if(hovered&&originals!=null)for(int i=0;i<hovered.surfaces.Length;i++)if(hovered.surfaces[i])hovered.surfaces[i].sharedMaterial=originals[i];hovered=next;originals=null;if(!next)return;originals=new Material[next.surfaces.Length];for(int i=0;i<next.surfaces.Length;i++){if(!next.surfaces[i])continue;originals[i]=next.surfaces[i].sharedMaterial;next.surfaces[i].sharedMaterial=highlight;}}
  void Update(){
   if(!cam)return;float dt=Mathf.Min(Time.deltaTime,.05f);if(state.Pieces==0||state.Powered||state.RecoveryRequired)state.Tick(dt,1);
   if(Input.GetKeyDown(KeyCode.H))help=!help;if(Input.GetKeyDown(KeyCode.Tab))journal=!journal;if(Input.GetKeyDown(KeyCode.J))Download();if(Input.GetKeyDown(KeyCode.Escape)){if(journal)journal=false;else state.SetEmergency(true);}if(Input.GetKeyDown(KeyCode.R)&&!state.Running){state.Verify();state.Reset();Toast(state.Message);}
   if(Input.GetKeyDown(KeyCode.V)){focus=new Vector3(-.3f,1.15f,0);distance=12.5f;yaw=-29;pitch=29;}
   if(!journal){if(Input.GetMouseButton(1)){yaw+=Input.GetAxis("Mouse X")*2.8f;pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*2,9,70);}distance=Mathf.Clamp(distance-Input.mouseScrollDelta.y*.65f,4.5f,19);focus+=(cam.transform.right*Input.GetAxis("Horizontal")+Vector3.ProjectOnPlane(cam.transform.forward,Vector3.up).normalized*Input.GetAxis("Vertical"))*dt*2;if(Input.GetMouseButton(2))focus+=(-cam.transform.right*Input.GetAxis("Mouse X")-Vector3.ProjectOnPlane(cam.transform.forward,Vector3.up).normalized*Input.GetAxis("Mouse Y"))*.04f;}
   smoothFocus=Vector3.Lerp(smoothFocus,focus,1-Mathf.Exp(-dt*9));float fittedDistance=distance*Mathf.Max(1,1.36f/cam.aspect);cam.transform.position=smoothFocus+Quaternion.Euler(pitch,yaw,0)*new Vector3(0,0,-fittedDistance);cam.transform.LookAt(smoothFocus);var ray=cam.ScreenPointToRay(Input.mousePosition);
   if(!held){LabHandle next=null;if(!journal)next=PointerHandle(ray);Highlight(next);}if(Input.GetKeyDown(KeyCode.F)&&hovered){focus=hovered.transform.position;distance=5.5f;}
   if(Input.GetMouseButtonDown(0)&&hovered&&!journal)BeginDrag();if(held&&Input.GetMouseButton(0))Drag(ray);if(held&&Input.GetMouseButtonUp(0))EndDrag();
   if(state.Running){float t=state.Progress;var previousTool=toolPosition;var previousPart=part?part.position:Vector3.zero;Animate(t);Pose();if(part){if(t<.16f)part.position=Vector3.Lerp(new Vector3(-2.15f,1.295f,-1.55f),new Vector3(pick.x,1.295f,pick.z),Mathf.SmoothStep(0,1,t/.16f));else if(t<.28f)part.position=new Vector3(pick.x,1.295f,pick.z);else if(t<.76f)part.position=wrist.position-Vector3.up*.53f;else part.position=new Vector3(place.x,1.22f,place.z);Physics.SyncTransforms();if(!PartClear()){part.position=previousPart;toolPosition=previousTool;Pose();state.Trip("La pieza encontró un obstáculo");Toast("Movimiento detenido para evitar atravesar un componente.");}}foreach(var r in rollers)r.Rotate(Vector3.up,dt*120,Space.Self);}
   if(state.Pieces>completed){completed=state.Pieces;if(part){finished.Add(part);part.position=new Vector3(place.x,1.22f,place.z);part=null;loaded=false;}state.Stop();toolPosition=ParkPosition;state.Log("Prueba terminada","Pieza entregada. Aísla la celda para finalizar la práctica.");Toast(state.Message);}
   var gesture=held?(Input.mousePosition-dragStart)*(1280f/Screen.width):Vector3.zero;
   gate.localRotation=Quaternion.Euler(0,doorAngle,0);power.localRotation=Quaternion.Euler(0,0,(state.Powered?90:0)+(held&&held.kind=="power"?Mathf.Clamp(gesture.y,-90,90):0));mode.localRotation=Quaternion.Euler(0,0,(int)state.Mode*45-45+(held&&held.kind=="mode"?Mathf.Clamp(gesture.x,-45,45):0));lever.localRotation=Quaternion.Euler((state.Running?-25:25)+(held&&held.kind=="run"?Mathf.Clamp(-gesture.y,-50,50):0),0,0);beacon.sharedMaterial=!state.Safe||state.RecoveryRequired?red:state.Running?green:yellow;Pose();PublishGuide();
  }
  void BeginDrag(){
   held=hovered;dragStart=Input.mousePosition;objectStart=held.transform.position;startAngle=doorAngle;
   if(state.Pieces>0&&held.kind=="piece"){Toast("La prueba ya terminó. Aísla la celda y consulta el resultado.");held=null;return;}
   if(held.kind=="piece"&&(state.Powered||state.Running)){Toast("Aísla la celda con el seccionador antes de manipular piezas.");held=null;return;}
   if(held.kind=="piece"&&held.transform==part){part=null;loaded=false;}
   if(held.kind=="tool"&&(state.Running||!state.Powered||state.Mode!=CellMode.Manual||!state.Safe)){Toast("Enseñanza: celda segura, energizada y selector en manual.");held=null;return;}
   if(held.kind=="cabinet"){state.Log("Inspeccionar PLC","Señales de seguridad observadas en el gabinete.");Toast("PLC: puerta "+(state.DoorClosed?"cerrada":"abierta")+" · cortina "+(state.CurtainClear?"libre":"interrumpida"));}
   if(held.kind=="estop"&&!state.Emergency){state.SetEmergency(true);Toast("Paro accionado. Arrastra arriba para liberarlo.");}
  }
  void Drag(Ray ray){
   var delta=(Input.mousePosition-dragStart)*(1280f/Screen.width);
   if(held.kind=="piece"){var plane=new Plane(Vector3.up,new Vector3(0,1.4f,0));if(plane.Raycast(ray,out float t)){var p=ray.GetPoint(t);p.x=Mathf.Clamp(p.x,-5.2f,2.8f);p.z=Mathf.Clamp(p.z,-2.2f,1.5f);held.transform.position=p;}}
   else if(held.kind=="tool"){var plane=new Plane(Vector3.up,new Vector3(0,1.2f,0));if(plane.Raycast(ray,out float t)){var p=ray.GetPoint(t);p.y=2.3f;var d=p-new Vector3(0,1.16f,.7f);if(d.magnitude>2.68f)p=new Vector3(0,1.16f,.7f)+d.normalized*2.68f;toolPosition=p;}}
   else if(held.kind=="door"){doorAngle=Mathf.Clamp(startAngle-delta.x*.6f,0,90);if(doorAngle>2&&state.DoorClosed)state.SetDoor(false);}
   else if(held.kind=="sensor"){held.transform.position=objectStart+Vector3.forward*Mathf.Clamp(delta.x*.005f,-.5f,.5f);if(state.Running&&Mathf.Abs(held.transform.position.z+.2f)>.12f)state.Inject(CellFault.Sensor);}
  }
  void EndDrag(){
   var delta=(Input.mousePosition-dragStart)*(1280f/Screen.width);string kind=held.kind;
   if(kind=="piece"){
    if(Vector2.Distance(new Vector2(held.transform.position.x,held.transform.position.z),new Vector2(-2.15f,-1.55f))<.7f&&!loaded){part=held.transform;part.position=new Vector3(-2.15f,1.295f,-1.55f);loaded=true;state.Log("Cargar material","Pieza colocada manualmente sobre la entrada de cinta.");Toast("Pieza colocada. Cierra la puerta con su manija.");}else{held.transform.position=objectStart;Toast(loaded?"La cinta ya tiene una pieza.":"Suelta la pieza dentro del aro amarillo.");}
   }else if(kind=="door"){bool closed=doorAngle<=6;doorAngle=closed?0:doorAngle;if(state.DoorClosed!=closed){state.SetDoor(closed);Toast(closed?"Puerta cerrada. Gira el seccionador.":"Puerta abierta. Equipo aislado.");}}
   else if(kind=="power"){
    if(delta.y>6){if(state.Pieces>0){Toast("La prueba terminó. Baja el interruptor para finalizar.");}else if(!state.Safe)Toast("Cierra puerta, despeja cortina y libera paro.");else if(state.RecoveryRequired)Toast("Pulsa R para comprobar seguridad y rearmar.");else{state.Verify();state.Power();state.CheckIo();Toast(state.Message);}}else if(delta.y< -6){state.Stop();state.Powered=false;state.Log("Aislar celda","Seccionador en 0. Manipulación de material habilitada.");if(state.Pieces>0)state.Log("Finalizar práctica","Práctica completada: pieza entregada y celda aislada.");Toast(state.Pieces>0?"Práctica completada. Puedes descargar el informe.":"Celda aislada.");}
   }else if(kind=="tool"){
    var p=toolPosition;float dp=Vector2.Distance(new Vector2(p.x,p.z),new Vector2(-2.15f,-.2f)),dd=Vector2.Distance(new Vector2(p.x,p.z),new Vector2(2.05f,0));if(dp<.65f){pick=new Vector3(Mathf.Clamp(p.x,-2.23f,-2.07f),1.825f,Mathf.Clamp(p.z,-.30f,-.10f));state.Teach(true);state.Log("Posición de toma",pick.ToString("F2"));Toast("Toma enseñada con el mouse.");}else if(dd<.65f){place=new Vector3(Mathf.Clamp(p.x,1.85f,2.25f),1.75f,Mathf.Clamp(p.z,-.25f,.35f));state.Teach(false);state.Log("Posición de depósito",place.ToString("F2"));Toast("Depósito enseñado con el mouse.");}else Toast("Suelta la pinza sobre uno de los aros azules.");
   }else if(kind=="mode"){if(Mathf.Abs(delta.x)>12)state.ChangeMode((CellMode)Mathf.Clamp((int)state.Mode+(delta.x>0?1:-1),0,2));Toast("Modo: "+state.Mode);}
   else if(kind=="run"){if(delta.y>6){if(state.Pieces>0)Toast("Prueba terminada. Baja el interruptor rojo para finalizar.");else if(!loaded)Toast("Carga una pieza antes de iniciar.");else{if(state.Progress==0)cycleOrigin=toolPosition;state.Start();Toast(state.Message);}}else if(delta.y< -6)state.Stop();}
   else if(kind=="estop"&&delta.y>20){state.SetEmergency(false);Toast("Paro liberado. Pulsa R para verificar y rearmar.");}
   else if(kind=="curtain"&&Mathf.Abs(delta.x)>15){state.SetCurtain(!state.CurtainClear);Toast(state.Message);}
   else if(kind=="sensor"){bool aligned=Mathf.Abs(held.transform.position.z+.2f)<.12f;if(state.Running&&!aligned){state.Inject(CellFault.Sensor);Toast("Sensor desalineado: celda detenida.");}else if(!state.Powered&&aligned&&state.Fault==CellFault.Sensor){state.Correct();Toast("Sensor alineado. Pulsa R para verificar y rearmar.");}else Toast(aligned?"Sensor alineado.":"Sensor desplazado. Devuélvelo a la marca original.");}
   held=null;
  }
  static readonly Vector3 ParkPosition=new Vector3(.5f,2.65f,.65f);
  void Animate(float t){
   var upPick=new Vector3(pick.x,2.3f,pick.z);var upPlace=new Vector3(place.x,2.3f,place.z);
   if(t<.16f)toolPosition=Vector3.Lerp(cycleOrigin,upPick,Mathf.SmoothStep(0,1,t/.16f));
   else if(t<.28f)toolPosition=Vector3.Lerp(upPick,pick,Mathf.SmoothStep(0,1,(t-.16f)/.12f));
   else if(t<.4f)toolPosition=Vector3.Lerp(pick,upPick,Mathf.SmoothStep(0,1,(t-.28f)/.12f));
   else if(t<.64f)toolPosition=Vector3.Lerp(upPick,upPlace,Mathf.SmoothStep(0,1,(t-.4f)/.24f));
   else if(t<.76f)toolPosition=Vector3.Lerp(upPlace,place,Mathf.SmoothStep(0,1,(t-.64f)/.12f));
   else if(t<.82f)toolPosition=place;
   else if(t<.94f)toolPosition=Vector3.Lerp(place,upPlace,Mathf.SmoothStep(0,1,(t-.82f)/.12f));
   else toolPosition=Vector3.Lerp(upPlace,ParkPosition,Mathf.SmoothStep(0,1,(t-.94f)/.06f));
  }
  LabHandle PointerHandle(Ray ray){
   // Mouse targets retain a usable screen size even when the camera is far away.
   if(Physics.Raycast(ray,out var direct,50,1<<8)){var exact=direct.collider.GetComponentInParent<LabHandle>();if(exact&&exact.kind=="estop")return exact;}
   LabHandle nearest=null;float best=29f;
   foreach(var h in sceneHandles){if(!h||(h.kind!="power"&&h.kind!="run"))continue;var p=cam.WorldToScreenPoint(h.transform.position);if(p.z<=0)continue;float d=Vector2.Distance(Input.mousePosition,new Vector2(p.x,p.y));if(d<best){best=d;nearest=h;}}
   if(nearest)return nearest;
   return Physics.Raycast(ray,out var hit,50,1<<8)?hit.collider.GetComponentInParent<LabHandle>():null;
  }
  bool PartClear(){
   foreach(var c in Physics.OverlapBox(part.position,new Vector3(.224f,.104f,.204f),Quaternion.identity,~0,QueryTriggerInteraction.Ignore)){
    if(c.transform==part||c.transform.IsChildOf(part)||c.transform.IsChildOf(robot))continue;
    return false;
   }
   return true;
  }
  public void DownloadReport(){Download();}
  void Pose(){
   var d=toolPosition-new Vector3(0,1.16f,.7f);float radius=new Vector2(d.x,d.z).magnitude,reach=Mathf.Clamp(d.magnitude,.14f,2.76f);float a=-Mathf.Atan2(radius,d.y)+Mathf.Acos(Mathf.Clamp((reach*reach+1.45f*1.45f-1.32f*1.32f)/(2*reach*1.45f),-1,1));float b=-Mathf.Acos(Mathf.Clamp((reach*reach-1.45f*1.45f-1.32f*1.32f)/(2*1.45f*1.32f),-1,1));robot.localRotation=Quaternion.Euler(0,Mathf.Atan2(-d.z,d.x)*Mathf.Rad2Deg,0);shoulder.localRotation=Quaternion.Euler(0,0,a*Mathf.Rad2Deg);elbow.localRotation=Quaternion.Euler(0,0,b*Mathf.Rad2Deg);wrist.rotation=Quaternion.identity;float gap=state.Running&&state.Progress>=.28f&&state.Progress<.76f?.258f:.32f;foreach(Transform finger in wrist)if(finger.name=="Dedo pinza"||finger.name=="Mordaza"){var q=finger.localPosition;q.x=Mathf.Sign(q.x)*(finger.name=="Mordaza"?gap+.032f:gap);finger.localPosition=q;}var from=robot.position+Vector3.up*.2f;var to=wrist.position+Vector3.up*.12f;for(int i=0;i<20;i++){float t=i/19f;cable.SetPosition(i,Vector3.Lerp(from,to,t)+Vector3.up*Mathf.Sin(t*Mathf.PI)*.65f+Vector3.forward*.18f);}
  }
  string Objective(){if(state.RecoveryRequired)return "Restablece la seguridad y pulsa R para rearmar";if(!loaded&&state.Pieces==0)return "Arrastra una pieza naranja desde la mesa hasta la cinta";if(!state.DoorClosed)return "Cierra la puerta arrastrando su manija azul";if(!state.Powered)return "Arrastra arriba el seccionador rojo del gabinete";if(!state.PickTaught)return "Lleva el aro azul de la pinza hasta el aro de toma";if(!state.PlaceTaught)return "Lleva la pinza hasta el aro azul de la bandeja";if(state.Running)return "Observa la toma, el traslado y el depósito";if(state.Pieces>0&&!loaded)return "Aísla la celda y carga otra pieza para continuar";return "Arrastra arriba la palanca verde de la consola";}
  void InitGui(){if(pixel)return;pixel=new Texture2D(1,1);pixel.SetPixel(0,0,Color.white);pixel.Apply();heading=new GUIStyle{font=font,fontSize=23,fontStyle=FontStyle.Bold,normal={textColor=Color.white},wordWrap=true};text=new GUIStyle(heading){fontSize=15,fontStyle=FontStyle.Normal};small=new GUIStyle(text){fontSize=12,normal={textColor=new Color(.72f,.79f,.83f)}};number=new GUIStyle(heading){fontSize=34};}
  void Panel(float x,float y,float w,float h,Color color){var c=GUI.color;GUI.color=color;GUI.DrawTexture(new Rect(x,y,w,h),pixel);GUI.color=c;}
  void OnGUI(){
   #if UNITY_WEBGL && !UNITY_EDITOR
   if(!journal)return;
   InitGui();GUI.matrix=Matrix4x4.Scale(new Vector3(Screen.width/1280f,Screen.height/720f,1));Panel(210,72,860,570,new Color(.04f,.075f,.1f,.98f));GUI.Label(new Rect(240,95,790,35),"Registro de la práctica",heading);GUI.Label(new Rect(240,142,790,28),"Tab: volver al taller     J: descargar informe",small);GUILayout.BeginArea(new Rect(240,190,790,420));scroll=GUILayout.BeginScrollView(scroll);for(int i=state.Events.Count-1;i>=0;i--){var e=state.Events[i];GUILayout.Label(e.seconds.ToString("F1")+" s  /  "+e.action,text);GUILayout.Label(e.result,small);GUILayout.Space(16);}GUILayout.EndScrollView();GUILayout.EndArea();
   #else
   if(!font)return;InitGui();GUI.matrix=Matrix4x4.Scale(new Vector3(Screen.width/1280f,Screen.height/720f,1));var bg=new Color(.055f,.09f,.115f,.88f);
   Panel(24,22,348,75,bg);Panel(24,22,3,75,new Color(.94f,.52f,.22f));GUI.Label(new Rect(42,32,320,28),"Celda robotizada",heading);GUI.Label(new Rect(42,66,320,22),"M2   /   MECATRÓNICA",small);
   Panel(1016,22,240,75,bg);GUI.Label(new Rect(1034,32,90,42),state.Pieces.ToString("00"),number);GUI.Label(new Rect(1095,34,140,22),"piezas completadas",small);GUI.Label(new Rect(1095,60,145,23),state.Running?"En movimiento":state.RecoveryRequired?"Rearme pendiente":state.Powered?"Energizada":"Celda aislada",small);
   Panel(24,115,300,94,bg);GUI.Label(new Rect(41,127,270,20),"Tu siguiente acción",small);GUI.Label(new Rect(41,153,268,52),Objective(),text);
   if(help){Panel(24,555,275,141,new Color(.055f,.09f,.115f,.76f));GUI.Label(new Rect(40,568,249,120),"Mouse izquierdo · agarrar y arrastrar\nMouse derecho · mirar alrededor\nRueda · acercarte    WASD · desplazarte\nF · acercarte al objeto    V · vista general\nH · ocultar ayuda    Tab · bitácora",small);}
   string hint=held?held.hint:hovered?hovered.hint:"Explora el taller. Los objetos manipulables se iluminan al apuntarlos.";string name=held?held.caption:hovered?hovered.caption:"Manipulación directa";
   Panel(340,627,600,69,bg);GUI.Label(new Rect(360,635,560,24),name,text);GUI.Label(new Rect(360,663,560,26),Time.time<noticeUntil?notice:hint,small);
   if(hovered||held){var mouse=new Vector2(Input.mousePosition.x*1280/Screen.width,720-Input.mousePosition.y*720/Screen.height);Panel(mouse.x+17,mouse.y+17,10,10,new Color(.45f,.88f,.93f));}
   if(journal){Panel(735,115,521,495,new Color(.04f,.075f,.1f,.97f));GUI.Label(new Rect(757,134,470,30),"Bitácora de la práctica",heading);GUI.Label(new Rect(757,174,470,24),"J · descargar informe JSON      Tab · volver",small);GUILayout.BeginArea(new Rect(757,213,474,371));scroll=GUILayout.BeginScrollView(scroll);for(int i=state.Events.Count-1;i>=0;i--){var e=state.Events[i];GUILayout.Label(e.seconds.ToString("F1")+" s  /  "+e.action,text);GUILayout.Label(e.result,small);GUILayout.Space(16);}GUILayout.EndScrollView();GUILayout.EndArea();}
   #endif
  }
  public void Download(){string json=JsonUtility.ToJson(state.Report(),true);
   #if UNITY_WEBGL && !UNITY_EDITOR
   OrbitDownload(json);
   #else
   System.IO.File.WriteAllText(System.IO.Path.Combine(Application.persistentDataPath,"orbit-m2-informe.json"),json);
   #endif
   Toast("Informe descargado.");
  }
 }
}


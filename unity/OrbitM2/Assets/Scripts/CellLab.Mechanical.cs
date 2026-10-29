using System.Collections.Generic;
using UnityEngine;

namespace Orbit.M2 {
 public sealed partial class CellLab {
  Mesh BeltMesh(){
   var profile=new List<Vector3>();const int steps=24;
   for(int i=0;i<=steps;i++){float a=Mathf.PI+i*Mathf.PI/steps;profile.Add(new Vector3(0,Mathf.Cos(a)*.12f,-1.7f+Mathf.Sin(a)*.12f));}
   for(int i=0;i<=steps;i++){float a=i*Mathf.PI/steps;profile.Add(new Vector3(0,Mathf.Cos(a)*.12f,1.7f+Mathf.Sin(a)*.12f));}
   var v=new List<Vector3>();var t=new List<int>();
   for(int i=0;i<profile.Count;i++){int next=(i+1)%profile.Count,k=v.Count;v.AddRange(new[]{profile[i]+Vector3.left*.43f,profile[i]+Vector3.right*.43f,profile[next]+Vector3.right*.43f,profile[next]+Vector3.left*.43f});t.AddRange(new[]{k,k+2,k+1,k,k+3,k+2});}
   var m=new Mesh{name="Banda continua y retorno sobre rodillos"};m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();return m;
  }
  void FinishMechanicalDetails(){
   // La puerta cierra entre el poste de bisagras y el poste receptor, con holgura de 2,5 mm.
   gate.position=new Vector3(-2.1f,0,-2.71f);
   Fence(-.425f,3.5f,-2.65f);
   Bevel("Poste receptor de puerta",new Vector3(-.425f,1.18f,-2.65f),new Vector3(.10f,2.36f,.10f),.012f,yellow);
   Bevel("Placa receptora del enclavamiento",new Vector3(-.425f,1.13f,-2.742f),new Vector3(.14f,.25f,.055f),.012f,steel);
   Bevel("Alojamiento del pestillo",new Vector3(-.425f,1.13f,-2.78f),new Vector3(.10f,.12f,.035f),.008f,rubber);
   Bevel("Cuerpo de cerradura",new Vector3(1.53f,1.13f,-.075f),new Vector3(.14f,.24f,.065f),.014f,steel,gate);
   Bevel("Lengüeta de enclavamiento",new Vector3(1.65f,1.13f,-.07f),new Vector3(.16f,.065f,.035f),.008f,steel,gate);
   for(float x=.16f;x<1.56f;x+=.16f)Cube("Alambre vertical de puerta",new Vector3(x,1.2f,0),new Vector3(.009f,2.02f,.009f),steel,gate);
   for(int x=-1;x<=1;x+=2)for(int y=-1;y<=1;y+=2)Cyl("Tornillo de cerradura",new Vector3(1.53f+x*.045f,1.13f+y*.085f,-.113f),.012f,.015f,rubber,gate,Vector3.forward);
   var grip=ByKind("door");if(grip){grip.GetComponent<Renderer>().enabled=false;for(int s=-1;s<=1;s+=2)Cyl("Apoyo de manija",new Vector3(0,s*.14f,-.05f),.028f,.10f,steel,grip.transform,Vector3.forward);Cyl("Empuñadura azul",new Vector3(0,0,-.105f),.024f,.29f,blue,grip.transform);grip.surfaces=grip.GetComponentsInChildren<Renderer>();}
   foreach(var r in rollers)r.GetComponent<Renderer>().enabled=false;
   var oldBelt=GameObject.Find("Banda caucho");if(oldBelt)oldBelt.GetComponent<Renderer>().enabled=false;
   var belt=Root("Banda transportadora continua",new Vector3(-2.15f,1.06f,-.5f)).gameObject;belt.AddComponent<MeshFilter>().sharedMesh=BeltMesh();belt.AddComponent<MeshRenderer>().sharedMaterial=Mat("#252B30",.18f,0,2);
   for(int s=-1;s<=1;s+=2){Cyl("Tambor de cinta",new Vector3(-2.15f,1.06f,-.5f+s*1.7f),.11f,.9f,steel,null,Vector3.right);Bevel("Cojinete de tambor",new Vector3(-1.57f,1.035f,-.5f+s*1.7f),new Vector3(.12f,.18f,.2f),.02f,blue);}
   Cyl("Motorreductor · carcasa",new Vector3(-3.12f,.8f,1.06f),.16f,.45f,blue,null,Vector3.right);for(int i=0;i<10;i++)Cyl("Aleta de refrigeración",new Vector3(-3.32f+i*.04f,.8f,1.06f),.185f,.014f,blue,null,Vector3.right);
   Bevel("Caja de conexiones del motor",new Vector3(-3.1f,.99f,1.06f),new Vector3(.21f,.13f,.22f),.025f,paint);
   Line("Canalización eléctrica",new[]{new Vector3(-3.1f,.97f,1.15f),new Vector3(-3.1f,.30f,1.8f),new Vector3(3.7f,.30f,2.25f),new Vector3(3.7f,.7f,2.35f)},.025f,rubber);
   for(int side=-1;side<=1;side+=2)for(int end=-1;end<=1;end+=2){var p=new Vector3(side*3.5f,.045f,end*2.65f);Bevel("Zapata de poste",p,new Vector3(.22f,.07f,.22f),.018f,steel);for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)Cyl("Anclaje a pavimento",p+new Vector3(x*.075f,.045f,z*.075f),.018f,.02f,rubber);}
   foreach(var label in FindObjectsByType<TextMesh>(FindObjectsSortMode.None)){if(label.text=="R6 / 03")label.text="EJE 02";if(label.text.Contains("CELDA R6-03"))label.text="AUTOMATIZACIÓN INDUSTRIAL\nRobot · PLC · HMI";}
  }
 }
}

Shader "Orbit/Industrial" {
 Properties { _Color("Color",Color)=(1,1,1,1) _Gloss("Acabado",Range(0,1))=.3 _Metallic("Metal",Range(0,1))=0 _Surface("Pavimento",Float)=0 }
 SubShader {
 Tags {"RenderType"="Opaque"}
 Pass {
 Tags {"LightMode"="ForwardBase"}
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #pragma multi_compile_fwdbase
 #pragma multi_compile_fog
 #include "UnityCG.cginc"
 #include "Lighting.cginc"
 #include "AutoLight.cginc"
 fixed4 _Color;float _Gloss,_Metallic,_Surface;
 struct v2f {float4 pos:SV_POSITION;float3 normal:TEXCOORD0;float3 world:TEXCOORD1;SHADOW_COORDS(2) UNITY_FOG_COORDS(3)};
 v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.normal=UnityObjectToWorldNormal(v.normal);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;TRANSFER_SHADOW(o);UNITY_TRANSFER_FOG(o,o.pos);return o;}
 fixed4 frag(v2f i):SV_Target {
  float3 n=normalize(i.normal),light=normalize(_WorldSpaceLightPos0.xyz),view=normalize(_WorldSpaceCameraPos-i.world);float shadow=SHADOW_ATTENUATION(i);float diffuse=saturate(dot(n,light));float3 ambient=ShadeSH9(float4(n,1))*.45+.10;float3 color=_Color.rgb;
  if(_Surface>.5){float noise=frac(sin(dot(floor(i.world.xz*85),float2(12.9898,78.233)))*43758.5453);color*=.94+noise*.1;}
  float spec=pow(saturate(dot(n,normalize(light+view))),lerp(12,140,_Gloss))*_Gloss*shadow;float fresnel=pow(1-saturate(dot(n,view)),4)*.12*_Metallic;
  fixed4 c=fixed4(color*(ambient+_LightColor0.rgb*diffuse*shadow*.72)+spec*lerp(.18,color,_Metallic)+fresnel,1);UNITY_APPLY_FOG(i.fogCoord,c);return c;
 }
 ENDCG
 }
 Pass {
 Tags {"LightMode"="ShadowCaster"}
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #pragma multi_compile_shadowcaster
 #include "UnityCG.cginc"
 struct v2f {V2F_SHADOW_CASTER;};
 v2f vert(appdata_base v){v2f o;TRANSFER_SHADOW_CASTER_NORMALOFFSET(o);return o;}
 float4 frag(v2f i):SV_Target{SHADOW_CASTER_FRAGMENT(i)}
 ENDCG
 }
 }
}

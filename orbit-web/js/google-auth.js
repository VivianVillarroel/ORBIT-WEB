(function(){
  'use strict';
  var errors={
    unavailable:'El acceso con Google todavía no está disponible. Puedes continuar con tu correo y contraseña.',
    invalid_flow:'La solicitud de Google venció o ya se utilizó. Vuelve a intentarlo.',
    cancelled:'Cancelaste el acceso con Google. Puedes volver a intentarlo o usar tu contraseña.',
    existing_account:'Ya tienes una cuenta ORBIT con ese correo. Inicia sesión con tu contraseña y vincula Google desde Mi cuenta.',
    account_unavailable:'Tu cuenta no está disponible. Contacta al administrador de tu institución.',
    failed:'No pudimos confirmar el acceso con Google. Vuelve a intentarlo.'
  };
  var params=new URLSearchParams(location.search),key=params.get('google_error'),status=document.getElementById('googleStatus');
  if(status&&errors[key]){status.hidden=false;status.textContent=errors[key];}
  var available=false;
  var links=document.querySelectorAll('[data-google-start]');
  links.forEach(function(link){
    if(params.get('plan')==='premium')link.href='/api/auth/google/start?plan=premium';
    link.setAttribute('aria-disabled','true');
    link.addEventListener('click',function(event){
      if(available)return;
      event.preventDefault();
      if(status){status.hidden=false;status.textContent='El acceso con Google aún no está habilitado en ORBIT.';}
    });
  });
  if(links.length)fetch('/api/auth/google/status',{credentials:'same-origin',cache:'no-store'})
    .then(function(response){if(!response.ok)throw new Error('Unavailable');return response.json();})
    .then(function(data){
      available=data.enabled===true;
      links.forEach(function(link){link.setAttribute('aria-disabled',String(!available));});
      if(!available&&status){status.hidden=false;status.textContent='El acceso con Google aún no está habilitado en ORBIT.';}
    })
    .catch(function(){if(status){status.hidden=false;status.textContent='No pudimos comprobar el acceso con Google. Recarga la página para volver a intentarlo.';}});
})();

mergeInto(LibraryManager.library, {
 OrbitGuide: function(pointer) {
  window.dispatchEvent(new CustomEvent('orbit:guide',{detail:JSON.parse(UTF8ToString(pointer))}));
 },
 OrbitDownload: function(pointer) {
  var content=UTF8ToString(pointer);
  var url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
  var link=document.createElement('a'); link.href=url; link.download='orbit-m2-informe.json';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(function(){URL.revokeObjectURL(url);},10000);
 }
});

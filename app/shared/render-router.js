// Runtime-composed source module. Keep declarations in shared application scope.
function renderActive(){
  if(activePanel==='home')renderHome();
  else if(activePanel==='overview')renderOverview();
  else if(activePanel==='design')renderDesign();
  else if(activePanel==='progress')renderProgress();
  else if(activePanel==='bible'){rememberBibleScrollPosition();renderBible();}
  else if(activePanel==='vendors')renderVendors();
  else if(activePanel==='b1f')renderB1F();
  else if(activePanel==='members')renderMembers();
}

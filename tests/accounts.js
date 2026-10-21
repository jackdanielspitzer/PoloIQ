const {makeDocument}=require('./dom.js'); const {c,app}=require('./setup.js'); c.document=makeDocument(); const D=id=>c.document.getElementById(id);
let pass=0,fail=0; const check=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  ['+i+']')); };
(async()=>{
  const navy=app.teams.find(t=>t.name==='Navy'), cal=app.teams.find(t=>t.name==='California');
  const navyGame=app.games.find(g=>g.teamId===navy.id), calGame=app.games.find(g=>g.teamId===cal.id);
  const make=async(email,role,teamId)=>{ app.currentUserId=null; c.showUserForm({}); D('userNameInput').value='x'; D('userEmailInput').value=email; D('userPasswordInput').value='testpass-123'; D('userLoginMode').checked=false; D('userRoleInput').value=role; D('userTeamAssign').value=teamId||''; D('userFormError').style.display='none'; await c.saveUser(); return app.users.find(u=>u.email===email); };
  const jack=await make('jackdanielspitzer@gmail.com','admin','');
  check('owner can create Admin account', jack && jack.role==='admin');
  check('admin can manage any team\'s games', c.hasManagePermission(navyGame) && c.hasManagePermission(calGame));
  check('admin can open coaches page', (c.navigate('coaches'), app.page==='coaches'));
  const fake=await make('someone@else.com','admin','');
  check('anyone else is refused Admin', !fake && D('userFormError').style.display==='block');
  const stat=await make('navystats@example.com','manager',navy.id);
  check('Navy manager can log Navy games', c.hasManagePermission(navyGame));
  check('Navy manager cannot log Cal games', !c.hasManagePermission(calGame));
  // login again with password
  app.currentUserId=null; c.showUserForm({loginMode:true}); D('userEmailInput').value='navystats@example.com'; D('userPasswordInput').value='testpass-123'; D('userLoginMode').checked=true; await c.saveUser();
  check('Navy account logs in with its password', app.currentUserId===stat.id);
  app.currentUserId=null; D('userPasswordInput').value='wrong'; D('userFormError').style.display='none'; await c.saveUser();
  check('wrong password refused', app.currentUserId===null && D('userFormError').style.display==='block');
  console.log(`\n${pass} passed, ${fail} failed`);
})();

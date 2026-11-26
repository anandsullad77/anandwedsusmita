const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');}catch{playwright=require(path.resolve(__dirname,'../../.work-tools/node_modules/playwright-core'));}
const {scenario,wait,origin,id,eventId}=require('./test-wedding-browser.cjs');
const artifacts=path.resolve(__dirname,'../artifacts');
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
const basePoll={kind:'single',options:['Anand','Susmita'],photoIds:[],status:'open',startsAt:null,closesAt:null,revealAt:null,results:'after_vote',pinned:false,provisional:false,mine:null,counts:null,total:null,words:[],correct:null,coupleAnswers:null};
function state(){return{polls:[
  {...basePoll,id:id(101),category:'duel',question:'Who will control the TV remote?',pinned:true},
  {...basePoll,id:id(102),category:'duel',question:'Who will plan surprise dates?'},
  {...basePoll,id:id(103),category:'prediction',question:'Where will our first international trip be?',options:['Maldives','Switzerland','Bali','Dubai']},
  {...basePoll,id:id(104),category:'quiz',question:'Who takes more photographs?'},
  {...basePoll,id:id(105),category:'secret',question:'Who is more stubborn?',status:'closed',coupleAnswers:['Susmita','Anand'],results:'always',pinned:true},
  {...basePoll,id:id(106),category:'words',kind:'text',question:'Describe our love story in one word.',options:[],results:'always',pinned:true},
  {...basePoll,id:id(107),category:'photo',question:'Which wedding photograph makes you smile?',options:['The happy couple','All together'],photoIds:[id(30),id(31)],photoPaths:[`${eventId}/photo-30.webp`,`${eventId}/photo-31.webp`]},
  {...basePoll,id:id(108),category:'live',question:'What are you enjoying the most today?',options:['Wedding food','Wedding ceremony','Taking photographs','Meeting family'],results:'always',pinned:true},
  {...basePoll,id:id(109),category:'quiz',question:'Who initiated the first conversation?',status:'draft',provisional:true,correct:0},
],votes:new Map([[id(105),['0']],[id(106),['joyful']],[id(108),['0']]]),team:'b',writes:[],failVote:false,wordApproved:true};}
async function mock(context,s){
  await context.route(url=>url.pathname.endsWith('/rpc/wedding_playground'),route=>{
    const admin=route.request().postDataJSON().p_admin;
    const polls=s.polls.filter(p=>admin||p.status!=='draft').map(p=>{
      const mine=s.votes.get(p.id)??null,show=admin||p.results==='always'||!!mine;
      return{...p,mine,counts:show?p.options.map((_,i)=>mine?.includes(String(i))?1:0):null,total:show&&mine?1:show?0:null,correct:admin?p.correct:null,words:p.kind==='text'&&s.wordApproved?[{word:mine?.[0]??'joyful',count:1}]:[]};
    });
    return json(route,{polls,teams:['a','b','both'].map(team=>({id:team,members:s.team===team?1:0,points:s.team===team?s.votes.size*5:0})),myTeam:s.team,stats:{votes:s.votes.size,voters:s.votes.size?1:0,completed:s.votes.size},pendingWords:admin&&s.votes.get(id(106))&&!s.wordApproved?[{pollId:id(106),userId:id(12),question:s.polls.find(p=>p.id===id(106)).question,word:s.votes.get(id(106))[0]}]:[]});
  });
  await context.route(url=>url.pathname.endsWith('/rpc/vote_wedding_poll'),async route=>{
    const body=route.request().postDataJSON();s.writes.push(body);
    if(s.failVote)return json(route,{message:'Please try your vote again'},503);
    await new Promise(r=>setTimeout(r,100));s.votes.set(body.p_poll,body.p_answer);return json(route,null);
  });
  await context.route(url=>url.pathname.endsWith('/rpc/join_wedding_team'),route=>{s.team=route.request().postDataJSON().p_team;return json(route,null);});
  await context.route(url=>url.pathname.endsWith('/rpc/moderate_wedding_word'),route=>{s.wordApproved=route.request().postDataJSON().p_approved;return json(route,null);});
  await context.route(url=>url.pathname.endsWith('/rpc/save_wedding_poll')||url.pathname.endsWith('/rpc/edit_wedding_poll'),route=>{
    const p=route.request().postDataJSON().p_poll;
    if(p.status==='open'&&p.provisional)return json(route,{message:'Confirm provisional answers before publishing'},400);
    const old=s.polls.find(x=>x.id===p.id);if(old)Object.assign(old,p);else s.polls.push({...basePoll,...p});return json(route,{id:p.id,revised:false});
  });
}
async function layout(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');}
(async()=>{
  fs.mkdirSync(artifacts,{recursive:true});
  const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const runs=[];
  const names=['Invitation','Nostalgia','Create Post','Feed','Playground'];
  const activities=['Anand vs Susmita','Predict Our Future','Know the Couple','Photo Awards'];
  const retiredQuestions=['Who is more stubborn?','Describe our love story in one word.','What are you enjoying the most today?'];
  async function noRetiredContent(page){
    for(const question of retiredQuestions)assert.equal(await page.getByText(question,{exact:true}).count(),0,'Retired questions stay out of lists and pinned results');
    assert.equal(await page.getByRole('heading',{name:'Team Battle',exact:true}).count(),0,'Team scores are removed');
    assert.equal(await page.getByRole('link',{name:/Cheer for your team/}).count(),0);
  }
  const nav=page=>page.getByRole('navigation',{name:'Wedding',exact:true});
  try{
    for(const width of [320,390,768,1024,1440]){
      const s=state(),run=await scenario(browser,{width,initial:'google'});runs.push(run);await mock(run.context,s);const {page}=run;
      await page.goto(origin+'/invitation');await page.getByText('Public host update',{exact:true}).waitFor();
      assert.deepEqual(await nav(page).getByRole('link').allTextContents(),names,'Menu order');
      assert.equal(await page.locator('#before-we-said-yes,#wedding-playground').count(),0,'Invitation has its original content');
      const invitationVerdict=page.locator('.wedding-verdict');
      await invitationVerdict.locator('.verdict-poll').waitFor();
      await noRetiredContent(page);
      assert.equal(await invitationVerdict.getByRole('link',{name:'Go to Playground'}).getAttribute('href'),'/invitation/playground');
      assert.equal(await invitationVerdict.locator('.poll-options,.poll-word-form').count(),0,'Invitation verdict has no voting controls');
      await invitationVerdict.getByRole('link',{name:'Go to Playground'}).click();await page.waitForURL(origin+'/invitation/playground');
      await nav(page).getByRole('link',{name:'Invitation',exact:true}).click();
      await layout(page);
      assert.ok(await nav(page).getByRole('link').evaluateAll(links=>links.every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;})),'Five accessible menu targets fit');
      await nav(page).getByRole('link',{name:'Nostalgia',exact:true}).click();await page.getByRole('heading',{name:'Before We Said Yes',exact:true}).waitFor();
      assert.equal(await nav(page).getByRole('link',{name:'Nostalgia',exact:true}).getAttribute('aria-current'),'page');
      assert.equal(await page.locator('.nostalgia-memory').count(),13,'Nostalgia displays both childhood albums');
      assert.equal(await page.locator('main input,main textarea').count(),0,'Nostalgia has no editing or upload controls');
      await layout(page);await page.screenshot({path:path.join(artifacts,`nostalgia-navigation-${width}.png`)});
      await page.reload();await page.getByRole('heading',{name:'Before We Said Yes',exact:true}).waitFor();
      await nav(page).getByRole('link',{name:'Playground',exact:true}).click();const play=page.locator('#wedding-playground');await play.locator('.playground-categories a').first().waitFor();
      assert.equal(await nav(page).getByRole('link',{name:'Playground',exact:true}).getAttribute('aria-current'),'page');
      assert.equal(await nav(page).getByRole('link',{name:'Invitation',exact:true}).getAttribute('aria-current'),null);
      assert.deepEqual(await play.locator('.playground-categories a b').allTextContents(),activities,'Only the four requested activities appear, in order');await layout(page);
      await play.locator('.verdict-poll').waitFor();
      await noRetiredContent(page);
      assert.ok(await play.evaluate(el=>el.querySelector('.wedding-verdict').getBoundingClientRect().top>=el.querySelector('.playground-categories').getBoundingClientRect().bottom),'Verdict is below the activity cards');
      await play.screenshot({path:path.join(artifacts,`playground-${width}.png`),style:'.general-header,.general-skip{visibility:hidden!important}'});
      assert.equal(await play.locator('.playground-poll').count(),0,'Overview has no voting questions');
      const openActivity=async label=>{await nav(page).getByRole('link',{name:'Playground',exact:true}).click();await play.getByRole('link',{name:label}).click();await page.waitForURL(/\/playground\/[^/]+$/);};
      await openActivity('Anand vs Susmita Who is more likely?');
      await play.locator('.playground-poll').first().waitFor();
      assert.ok(await play.locator('.playground-poll').first().evaluate(el=>el.getBoundingClientRect().top<innerHeight-120),'First question is immediately visible');
      assert.equal(await play.locator('.playground-categories').count(),0,'Activity has no category grid above questions');
      await page.screenshot({path:path.join(artifacts,`playground-activity-${width}.png`)});
      assert.equal(await nav(page).getByRole('link',{name:'Playground',exact:true}).getAttribute('aria-current'),'page');
      const first=page.locator(`[data-poll-id="${id(101)}"]`);
      await first.getByRole('button',{name:'Anand',exact:true}).evaluate(el=>{el.click();el.click();});await first.getByText('Your vote is saved.',{exact:true}).waitFor();assert.equal(s.writes.length,1);
      s.failVote=true;await first.getByRole('button',{name:/Susmita/}).click();await first.getByRole('alert').waitFor();assert.equal(s.votes.get(id(101))[0],'0');
      s.failVote=false;await first.getByRole('button',{name:/Susmita/}).click();await wait(()=>s.votes.get(id(101))[0]==='1','Vote retry');
      await openActivity('Know the Couple How well do you know us?');const quiz=page.locator(`[data-poll-id="${id(104)}"]`);await quiz.getByRole('button',{name:/Anand/}).click();await quiz.getByText('Answer locked in',{exact:true}).waitFor();assert.ok(await quiz.getByRole('button',{name:/Susmita/}).isDisabled());
      await openActivity('Predict Our Future A little glimpse ahead');await play.getByText(/Revisit on/).waitFor();
      await openActivity('Photo Awards Give your favourite a vote');await play.locator('.poll-option img').nth(1).waitFor();assert.equal(await play.locator('.poll-option img').count(),2);
      await play.getByRole('button',{name:'The happy couple',exact:false}).click();await play.getByText('Your vote is saved.',{exact:true}).waitFor();
      await page.reload();await play.locator('.poll-option img').nth(1).waitFor();
      await play.getByRole('link',{name:'All activities'}).click();await page.waitForURL(origin+'/invitation/playground');
      await play.locator('.overview-result-track').first().waitFor();
      assert.ok(await play.locator('.overview-result-track').count()>0,'Overview retains result graphs');
      assert.equal(await play.locator('.poll-options,.poll-word-form').count(),0,'Result graphs contain no voting forms');
      await noRetiredContent(page);
      await page.goBack();await page.waitForURL(origin+'/invitation/playground/photo');
      await page.evaluate(()=>document.documentElement.style.fontSize='200%');await layout(page);await page.evaluate(()=>document.documentElement.style.fontSize='');
      for(const retired of ['live','team','secret','words']){
        await page.goto(origin+'/invitation/playground/'+retired);await page.waitForURL(origin+'/invitation/playground');
        await play.locator('.playground-categories a').first().waitFor();
        assert.deepEqual(await play.locator('.playground-categories a b').allTextContents(),activities);
        await noRetiredContent(page);
      }
      if(width===390){
        s.polls.forEach(p=>p.pinned=false);
        await nav(page).getByRole('link',{name:'Invitation',exact:true}).click();
        await page.locator('.wedding-verdict').getByText('The next verdict is on its way.',{exact:true}).waitFor();
        await page.locator('.wedding-verdict').screenshot({path:path.join(artifacts,'invitation-verdict-empty-390.png')});
        await page.locator('.wedding-verdict').getByRole('link',{name:'Go to Playground'}).click();await page.waitForURL(origin+'/invitation/playground');
        await play.getByText('The next verdict is on its way.',{exact:true}).waitFor();s.polls[0].pinned=true;
        const admin=await scenario(browser,{width,initial:'host'});runs.push(admin);await mock(admin.context,s);await admin.page.goto(origin+'/admin/polls');await admin.page.getByRole('heading',{name:'Wedding Playground',exact:true}).waitFor();await layout(admin.page);
        assert.equal(await admin.page.getByRole('button',{name:'Before We Said Yes',exact:true}).count(),0,'No Nostalgia content management');
        await noRetiredContent(admin.page);
        assert.equal(await admin.page.getByRole('button',{name:/Review words/}).count(),0,'Word moderation has been removed');
        const draft=admin.page.locator('.admin-poll-card').filter({hasText:'Who initiated the first conversation?'});await draft.getByRole('button',{name:'Edit',exact:true}).click();await admin.page.getByLabel('Status',{exact:true}).selectOption('open');await admin.page.getByRole('button',{name:'Save poll',exact:true}).click();await admin.page.getByRole('alert').filter({hasText:'Confirm provisional'}).waitFor();
        await admin.page.getByLabel('Provisional answer key (keep as draft)').uncheck();await admin.page.getByRole('button',{name:'Save poll',exact:true}).click();await admin.page.getByText('Poll saved.',{exact:true}).waitFor();
        await admin.page.getByRole('button',{name:'+ Create a poll',exact:true}).click();
        assert.deepEqual(await admin.page.getByLabel('Category',{exact:true}).locator('option').allTextContents(),activities,'Hosts can create only the four retained activities');
        await admin.page.getByRole('button',{name:'Cancel',exact:true}).click();
      }
      await nav(page).getByRole('link',{name:'Invitation',exact:true}).click();await page.getByText('Public host update',{exact:true}).waitFor();assert.equal(await page.locator('#wedding-playground').count(),0);
      assert.equal(await page.getByRole('link',{name:/big.screen/i}).count(),0,'No big-screen links');
      assert.deepEqual(run.errors,[]);console.log(`PASS: ${width}px four Playground activities, retired-route recovery, filtered results and retained voting flows`);
    }
    const signedOut=await scenario(browser,{width:320});runs.push(signedOut);
    await signedOut.page.goto(origin+'/invitation');await signedOut.page.locator('.wedding-verdict').getByRole('link',{name:'Go to Playground'}).waitFor();
    assert.equal(signedOut.requests.filter(r=>/wedding_playground/.test(r.path)).length,0,'Signed-out verdict never fetches private ballots');
    await signedOut.page.locator('.wedding-verdict').getByRole('link',{name:'Go to Playground'}).click();await signedOut.page.waitForURL(origin+'/invitation/playground');await signedOut.page.goto(origin+'/invitation/nostalgia');await signedOut.page.getByRole('heading',{name:'Before We Said Yes',exact:true}).waitFor();assert.equal(await signedOut.page.getByRole('button',{name:'Continue with Google'}).count(),0);await layout(signedOut.page);
    await nav(signedOut.page).getByRole('link',{name:'Playground',exact:true}).click();await signedOut.page.getByRole('link',{name:'Know the Couple How well do you know us?'}).click();await signedOut.page.waitForURL(origin+'/invitation/playground/quiz');await signedOut.page.getByRole('button',{name:'Continue with Google'}).waitFor();assert.equal(signedOut.requests.filter(r=>/wedding_playground/.test(r.path)).length,0);
    await signedOut.page.getByRole('button',{name:'Continue with Google'}).click();await signedOut.page.waitForURL(origin+'/invitation/playground/quiz');await wait(async()=>signedOut.exchanges===1 && await signedOut.page.getByRole('button',{name:'Continue with Google'}).count()===0,'Sign-in returns to chosen activity');await signedOut.page.getByRole('heading',{name:'Know the Couple',exact:true,level:1}).waitFor();
    await signedOut.page.goto(origin+'/invitation/playground/unknown');await signedOut.page.waitForURL(origin+'/invitation/playground');
    const family=await scenario(browser,{width:390,family:true});runs.push(family);
    await family.page.goto(origin+'/app/playground/team');await family.page.waitForURL(origin+'/app/playground');
    await family.page.locator('.playground-categories a').first().waitFor();
    assert.deepEqual(await family.page.locator('.playground-categories a b').allTextContents(),activities,'Family routes share the four activities');
    console.log('PASS: direct activity routes, invalid-route recovery and OAuth return to the chosen activity');
    console.log('PASS: Nostalgia albums are public; Playground ballots stay behind sign-in');
  }finally{for(const run of runs)await run.context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

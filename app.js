/* 拾物 Shelf
   本地模式默认可用。云端模式需要先按 README 配置 Supabase 表、RLS 和 Auth。
*/
(() => {
  const $ = (s) => document.querySelector(s);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const STORAGE_KEY = "shop-shelf-v1";
  const CONFIG_KEY = "shop-shelf-config-v1";
  const defaultFolders = [
    {id:"f-clothes", name:"穿搭服饰", description:"衣服、鞋包与配饰", emoji:"♧"},
    {id:"f-beauty", name:"美妆护肤", description:"彩妆、护肤与香氛", emoji:"✳"},
    {id:"f-tech", name:"数码好物", description:"电子产品与配件", emoji:"⌘"},
    {id:"f-other", name:"其他心动好物", description:"暂时没有归类的商品", emoji:"♡"}
  ];
  let state = loadLocal();
  let supabase = null, session = null, cloudEnabled = false, currentView = "all", activeFolder = "";
  let toastTimer;

  function loadLocal(){
    try { const x = JSON.parse(localStorage.getItem(STORAGE_KEY)); if(x && Array.isArray(x.products) && Array.isArray(x.folders)) return x; } catch(e){}
    return {folders:structuredClone(defaultFolders), products:[]};
  }
  function saveLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2800); }
  function esc(s=""){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function validUrl(raw){ try{const u=new URL(raw);return ["http:","https:"].includes(u.protocol)?u.href:null}catch(e){return null} }
  function hostOf(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch(e){return ""}}
  function autoFolder(url,title=""){
    const s=(url+" "+title).toLowerCase();
    if(/sephora|beauty|cosmetic|skincare|makeup|护肤|美妆|口红|香水|丝芙兰/.test(s)) return "f-beauty";
    if(/electronics|headphone|phone|camera|laptop|tech|apple\.com|digital|数码|耳机|手机|电脑/.test(s)) return "f-tech";
    if(/clothing|fashion|apparel|shoes|sneaker|bag|dress|衣服|鞋|包包|穿搭|服饰/.test(s)) return "f-clothes";
    return "";
  }
  function guessTitle(url){try{const h=hostOf(url);const path=new URL(url).pathname.split("/").filter(Boolean).pop()||"";return (decodeURIComponent(path).replace(/[-_]+/g," ").replace(/\.[a-z0-9]+$/i,"").slice(0,100)||h||url)}catch(e){return url}}
  function currencyFromUrl(url){const h=hostOf(url); if(/taobao|tmall|jd\.com|pinduoduo|1688|yangkeduo/.test(h))return "CNY"; if(/amazon\.it|zara\.com|zalando\.it|sephora\.it|ikea\.it/.test(h))return "EUR"; if(/amazon\.co\.uk/.test(h))return "GBP"; if(/amazon\.com$/.test(h))return "USD"; return "EUR";}
  function fmtPrice(p){if(p.price===null||p.price===undefined||p.price==="")return "价格待补";const n=Number(p.price);return (p.currency==="CNY"?"¥":p.currency==="EUR"?"€":p.currency==="USD"?"$":p.currency==="GBP"?"£":p.currency+" ")+(Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:2}):p.price);}
  function folderName(id){return state.folders.find(f=>f.id===id)?.name||"待整理";}
  function getProducts(){
    let ps=[...state.products];
    if(currentView==="inbox")ps=ps.filter(p=>!p.folderId);
    else if(currentView==="folder")ps=ps.filter(p=>p.folderId===activeFolder);
    else if(currentView==="cart")ps=ps.filter(p=>p.status==="want"||p.status==="considering");
    const q=$("#search-input").value.trim().toLowerCase();
    if(q)ps=ps.filter(p=>[p.title,p.store,p.url,p.notes,p.review,folderName(p.folderId)].join(" ").toLowerCase().includes(q));
    const sort=$("#sort-select").value;
    if(sort==="price-low")ps.sort((a,b)=>(Number(a.price)||Infinity)-(Number(b.price)||Infinity));
    else if(sort==="price-high")ps.sort((a,b)=>(Number(b.price)||0)-(Number(a.price)||0));
    else if(sort==="name")ps.sort((a,b)=>a.title.localeCompare(b.title));
    else ps.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    return ps;
  }
  function renderFolders(){
    $("#folder-list").innerHTML=state.folders.map(f=>`<div class="folder-row"><button class="folder-select ${currentView==="folder"&&activeFolder===f.id?"active":""}" data-folder="${esc(f.id)}"><span class="folder-emoji">${esc(f.emoji||"◇")}</span>${esc(f.name)} <span class="muted">· ${state.products.filter(p=>p.folderId===f.id).length}</span></button><button class="folder-edit" data-edit-folder="${esc(f.id)}" title="编辑合集">···</button></div>`).join("");
    const options='<option value="">自动分类 / 待整理</option>'+state.folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
    $("#import-folder").innerHTML=options;
    $("#p-folder").innerHTML='<option value="">待整理</option>'+state.folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
    $("#all-count").textContent=state.products.length;
    $("#inbox-count").textContent=state.products.filter(p=>!p.folderId).length;
    $("#cart-count").textContent=state.products.filter(p=>["want","considering"].includes(p.status)).length;
  }
  function render(){
    renderFolders();
    $("#nav-all").classList.toggle("active",currentView==="all");
    $("#nav-inbox").classList.toggle("active",currentView==="inbox");
    const title=currentView==="all"?"所有收藏":currentView==="inbox"?"待整理收件箱":currentView==="cart"?"我的购物清单":folderName(activeFolder);
    $("#view-title").textContent=title;
    $("#view-subtitle").textContent=currentView==="cart"?"还在考虑的心动好物":currentView==="inbox"?"这些商品还没有放进合集":"你的私人购物灵感库";
    const ps=getProducts();
    $("#product-grid").innerHTML=ps.map(p=>{
      const image=p.image?`<img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.querySelector('.image-placeholder').classList.remove('hidden')">`:"";
      const statusLabel={considering:"考虑中",want:"很想买",purchased:"已购买",passed:"已放弃"}[p.status]||"考虑中";
      return `<article class="product-card"><div class="product-image">${image}<span class="image-placeholder ${p.image?"hidden":""}">✳</span><span class="product-status">${statusLabel}</span><button class="card-menu" data-edit="${esc(p.id)}" aria-label="编辑商品">···</button></div><div class="product-info"><div class="product-store">${esc(p.store||hostOf(p.url)||"未填写店家")}</div><h3 class="product-title">${esc(p.title||"未命名商品")}</h3><div class="product-bottom"><div class="price">${esc(fmtPrice(p))}</div><div class="rating">${p.rating?"★".repeat(Number(p.rating))+"☆".repeat(5-Number(p.rating)):""}</div></div><div class="card-tags"><span class="tag">${esc(folderName(p.folderId))}</span>${p.review?'<span class="tag">有评价备注</span>':""}</div><div class="card-actions"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">打开商品 ↗</a><button class="edit-card" data-edit="${esc(p.id)}">编辑详情</button></div></div></article>`;
    }).join("");
    $("#empty-state").classList.toggle("hidden",ps.length!==0);
  }
  function openProduct(p=null){
    $("#product-dialog-title").textContent=p?"编辑商品":"添加商品";
    $("#product-id").value=p?.id||"";
    $("#p-title").value=p?.title||"";
    $("#p-price").value=p?.price??"";
    $("#p-currency").value=p?.currency||"EUR";
    $("#p-store").value=p?.store||"";
    $("#p-folder").value=p?.folderId||"";
    $("#p-url").value=p?.url||"";
    $("#p-image").value=p?.image||"";
    $("#p-rating").value=p?.rating||"";
    $("#p-status").value=p?.status||"considering";
    $("#p-review").value=p?.review||"";
    $("#p-notes").value=p?.notes||"";
    $("#delete-product").classList.toggle("hidden",!p);
    $("#product-dialog").showModal();
  }
  function openFolder(f=null){
    $("#folder-dialog-title").textContent=f?"编辑合集":"新建合集";
    $("#folder-id").value=f?.id||"";
    $("#folder-name").value=f?.name||"";
    $("#folder-description").value=f?.description||"";
    $("#delete-folder").classList.toggle("hidden",!f);
    $("#folder-dialog").showModal();
  }
  async function cloudSave(){
    saveLocal();
    if(!cloudEnabled||!supabase||!session)return;
    try{
      const userId=session.user.id;
      const folderRows=state.folders.map(f=>({id:f.id,user_id:userId,name:f.name,description:f.description||"",emoji:f.emoji||"◇",updated_at:new Date().toISOString()}));
      const productRows=state.products.map(p=>({id:p.id,user_id:userId,folder_id:p.folderId||null,title:p.title||"",price:p.price===""?null:Number(p.price)||null,currency:p.currency||"EUR",store:p.store||"",url:p.url,image_url:p.image||"",rating:p.rating?Number(p.rating):null,status:p.status||"considering",review:p.review||"",notes:p.notes||"",created_at:new Date(p.createdAt||Date.now()).toISOString(),updated_at:new Date().toISOString()}));
      const {error:fe}=await supabase.from("folders").upsert(folderRows); if(fe)throw fe;
      const {data:existing,error:ee}=await supabase.from("products").select("id").eq("user_id",userId);if(ee)throw ee;
      const keep=new Set(productRows.map(p=>p.id));
      const stale=(existing||[]).filter(p=>!keep.has(p.id)).map(p=>p.id);
      if(stale.length){const {error:de}=await supabase.from("products").delete().eq("user_id",userId).in("id",stale);if(de)throw de;}
      if(productRows.length){const {error:pe}=await supabase.from("products").upsert(productRows);if(pe)throw pe;}
      const existingFolders=await supabase.from("folders").select("id").eq("user_id",userId);
      if(!existingFolders.error){const keepF=new Set(state.folders.map(f=>f.id));const staleF=(existingFolders.data||[]).filter(f=>!keepF.has(f.id)).map(f=>f.id);if(staleF.length)await supabase.from("folders").delete().eq("user_id",userId).in("id",staleF);}
      setCloudStatus("云端已同步",true);
    }catch(e){console.error(e);setCloudStatus("同步失败："+(e.message||"请检查表结构和权限"),false);toast("本机已保存，但云端同步失败");}
  }
  async function loadCloud(){
    if(!cloudEnabled||!supabase||!session)return;
    try{
      const uid=session.user.id;
      const [{data:fs,error:fe},{data:ps,error:pe}]=await Promise.all([
        supabase.from("folders").select("*").eq("user_id",uid),
        supabase.from("products").select("*").eq("user_id",uid)
      ]);
      if(fe)throw fe;if(pe)throw pe;
      if(fs?.length||ps?.length){
        state.folders=fs.map(f=>({id:f.id,name:f.name,description:f.description||"",emoji:f.emoji||"◇"}));
        state.products=ps.map(p=>({id:p.id,folderId:p.folder_id||"",title:p.title,price:p.price??"",currency:p.currency||"EUR",store:p.store||"",url:p.url,image:p.image_url||"",rating:p.rating||"",status:p.status||"considering",review:p.review||"",notes:p.notes||"",createdAt:new Date(p.created_at).getTime()||Date.now()}));
        saveLocal();render();toast("已载入云端收藏");
      } else if(state.products.length||state.folders.length){await cloudSave();}
      setCloudStatus("云端已连接",true);
    }catch(e){console.error(e);setCloudStatus("云端读取失败："+(e.message||""),false);}
  }
  function setCloudStatus(msg,ok){$("#connection-status").classList.toggle("connected",!!ok);$("#connection-status").querySelector("span").textContent=msg;$("#cloud-message").textContent=msg;}
  function config(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}")}catch(e){return {}}}
  function setConfig(c){localStorage.setItem(CONFIG_KEY,JSON.stringify(c))}
  function initCloud(){
    const c=config();$("#supabase-url").value=c.url||"";$("#supabase-key").value=c.key||"";$("#admin-email").value=c.email||"";
    if(!c.url||!c.key||!window.supabase){setCloudStatus("本机模式",false);return;}
    supabase=window.supabase.createClient(c.url,c.key);
    cloudEnabled=true;
    supabase.auth.getSession().then(({data})=>{session=data.session;if(session){setCloudStatus("正在读取云端…",true);loadCloud()}else setCloudStatus("已连接，请登录以同步",false)});
    supabase.auth.onAuthStateChange((_event,s)=>{session=s;if(s){setCloudStatus("已登录，正在同步…",true);loadCloud()}else setCloudStatus("已连接，尚未登录",false)});
  }
  // 商品识别服务独立于 Supabase 同步，可单独配置。
  const EXTRACTOR_KEY="shop-shelf-extractor-v1";
  $("#extractor-url").value=localStorage.getItem(EXTRACTOR_KEY)||"";
  $("#save-extractor").addEventListener("click",()=>{
    const raw=$("#extractor-url").value.trim().replace(/\/+$/,"");
    if(raw&&!validUrl(raw)){toast("请填写有效的 https 后端地址");return;}
    localStorage.setItem(EXTRACTOR_KEY,raw);toast(raw?"商品识别服务地址已保存":"已清除商品识别服务地址");
  });
  async function extractProduct(url){
    const base=localStorage.getItem(EXTRACTOR_KEY)||"";
    if(!base) return {ok:false,error:"尚未配置商品识别后端"};
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
    try{
      const res=await fetch(base+"/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url}),signal:controller.signal});
      const result=await res.json();return result;
    }catch(e){return {ok:false,error:e.name==="AbortError"?"识别超时":"后端无法连接，请检查地址或服务状态"};}
    finally{clearTimeout(timer);}
  }
  $("#import-button").addEventListener("click",async()=>{
    const urls=$("#url-input").value.split(/\n|[,;\t ]+/).map(x=>x.trim()).filter(Boolean);
    if(!urls.length){toast("请先粘贴商品链接");return;}
    const chosen=$("#import-folder").value;let added=0,invalid=0,duplicates=0,failed=0;
    const button=$("#import-button");button.disabled=true;
    try{
      for(const raw of urls){
        const url=validUrl(raw);if(!url){invalid++;continue;}
        if(state.products.some(p=>p.url===url)){duplicates++;continue;}
        $("#import-hint").textContent=`正在读取 ${added+failed+1}/${urls.length} 个商品…`;
        const data=await extractProduct(url);
        const host=hostOf(url);
        const title=data.ok&&data.title?data.title:guessTitle(url);
        const folder=chosen||autoFolder(url,`${title} ${data.category||""} ${data.description||""}`);
        state.products.unshift({id:uid(),title,url,image:data.ok&&validUrl(data.image||"")||"",price:data.ok&&data.price!=null?data.price:"",currency:data.currency||currencyFromUrl(url),store:data.store||host,folderId:folder,rating:"",status:"considering",review:"",notes:data.ok?"":`自动识别未成功：${data.error||"网页没有提供可读取的商品信息"}`,createdAt:Date.now()+added});
        if(!data.ok)failed++;
        added++;render();saveLocal();
      }
      $("#url-input").value="";await cloudSave();
      toast(`已收藏 ${added} 个商品${failed?`，其中 ${failed} 个待补充信息`:""}${duplicates?`，跳过重复 ${duplicates} 个`:""}${invalid?`，无效链接 ${invalid} 个`:""}`);
    }finally{button.disabled=false;$("#import-hint").textContent="粘贴链接后自动读取；无法读取时保留链接供补充";}
  });
  $("#product-form").addEventListener("submit",async(e)=>{
    e.preventDefault();const id=$("#product-id").value;const url=validUrl($("#p-url").value.trim());if(!url){toast("请填写有效的 http/https 商品链接");return;}
    const p={id:id||uid(),title:$("#p-title").value.trim()||guessTitle(url),price:$("#p-price").value,currency:$("#p-currency").value,store:$("#p-store").value.trim(),folderId:$("#p-folder").value,url,image:validUrl($("#p-image").value.trim())||"",rating:$("#p-rating").value,status:$("#p-status").value,review:$("#p-review").value.trim(),notes:$("#p-notes").value.trim(),createdAt:id?(state.products.find(x=>x.id===id)?.createdAt||Date.now()):Date.now()};
    const i=state.products.findIndex(x=>x.id===id);if(i>=0)state.products[i]=p;else state.products.unshift(p);
    $("#product-dialog").close();render();await cloudSave();toast("商品信息已保存");
  });
  $("#delete-product").addEventListener("click",async()=>{const id=$("#product-id").value;if(!id)return;if(!confirm("确定删除这个商品吗？"))return;state.products=state.products.filter(p=>p.id!==id);$("#product-dialog").close();render();await cloudSave();toast("商品已删除");});
  $("#add-folder").addEventListener("click",()=>openFolder());
  $("#folder-form").addEventListener("submit",async(e)=>{
    e.preventDefault();const id=$("#folder-id").value;const name=$("#folder-name").value.trim();if(!name)return;
    if(id){const f=state.folders.find(f=>f.id===id);if(f){f.name=name;f.description=$("#folder-description").value.trim();}}
    else state.folders.push({id:uid(),name,description:$("#folder-description").value.trim(),emoji:"◇"});
    $("#folder-dialog").close();render();await cloudSave();toast("合集已保存");
  });
  $("#delete-folder").addEventListener("click",async()=>{const id=$("#folder-id").value;if(!id)return;if(!confirm("删除合集不会删除商品，里面的商品会移到待整理收件箱。继续吗？"))return;state.folders=state.folders.filter(f=>f.id!==id);state.products.forEach(p=>{if(p.folderId===id)p.folderId=""});if(activeFolder===id){currentView="all";activeFolder=""}$("#folder-dialog").close();render();await cloudSave();toast("合集已删除");});
  $("#folder-list").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-folder]");if(edit){openFolder(state.folders.find(f=>f.id===edit.dataset.editFolder));return;}const b=e.target.closest("[data-folder]");if(b){currentView="folder";activeFolder=b.dataset.folder;render();}});
  $("#product-grid").addEventListener("click",e=>{const b=e.target.closest("[data-edit]");if(b)openProduct(state.products.find(p=>p.id===b.dataset.edit));});
  $("#nav-all").addEventListener("click",()=>{currentView="all";activeFolder="";render()});
  $("#nav-inbox").addEventListener("click",()=>{currentView="inbox";activeFolder="";render()});
  $("#cart-open").addEventListener("click",()=>{currentView="cart";activeFolder="";render()});
  $("#search-input").addEventListener("input",render);$("#sort-select").addEventListener("change",render);
  $("#settings-open").addEventListener("click",()=>$("#settings-dialog").showModal());
  $("#settings-open-top").addEventListener("click",()=>$("#settings-dialog").showModal());
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).close()));
  $("#connect-cloud").addEventListener("click",()=>{
    const url=$("#supabase-url").value.trim(),key=$("#supabase-key").value.trim(),email=$("#admin-email").value.trim();
    if(!url||!key){toast("请填写 Supabase URL 和公开客户端密钥");return;}
    if(!validUrl(url)){toast("Supabase URL 格式不正确");return;}
    setConfig({url,key,email});initCloud();toast("已保存云端设置");
  });
  $("#sign-in").addEventListener("click",async()=>{
    if(!supabase){toast("请先连接 Supabase");return;}
    const email=$("#admin-email").value.trim();if(!email){toast("请填写管理员邮箱");return;}
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split("#")[0]}});
    if(error){toast("登录邮件发送失败："+error.message);return;}toast("已发送登录链接，请检查邮箱");
  });
  $("#sign-out").addEventListener("click",async()=>{if(supabase)await supabase.auth.signOut();session=null;setCloudStatus("已退出登录，本机数据仍保留",false);});
  $("#export-data").addEventListener("click",()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),...state},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="shop-shelf-backup.json";a.click();URL.revokeObjectURL(a.href);toast("备份已导出");});
  $("#import-file").addEventListener("change",async(e)=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.products)||!Array.isArray(data.folders))throw Error("格式不正确");if(!confirm("导入备份会替换当前本机数据，继续吗？"))return;state={folders:data.folders,products:data.products};render();await cloudSave();toast("备份已导入");}catch(err){toast("无法导入："+err.message)}e.target.value="";});
  window.addEventListener("online",()=>toast("网络已恢复"));window.addEventListener("beforeunload",saveLocal);
  render();initCloud();
})();
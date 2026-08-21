const PERSISTENCE_PATH = "/mini-app/vexa-live/persistence.js";
const PERSISTENCE_VERSION = "20260821-2";

export function isVexaLivePersistenceRequest(request) {
  return new URL(request.url).pathname === PERSISTENCE_PATH;
}

export function handleVexaLivePersistenceRequest(request) {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  return new Response(VEXA_LIVE_PERSISTENCE_RUNTIME_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function appendVexaLivePersistenceRuntime(request, response) {
  if (!response?.ok || request.method !== "GET") return response;
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;
  const source = await response.text();
  const tag = '<script src="' + PERSISTENCE_PATH + '?v=' + PERSISTENCE_VERSION + '"></script>';
  const html = source.includes(PERSISTENCE_PATH)
    ? source
    : source.includes("</body>") ? source.replace("</body>", tag + "\n</body>") : source + tag;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export const VEXA_LIVE_PERSISTENCE_RUNTIME_JS = String.raw`
(function () {
  const VERSION = 3;
  const REMOTE_KEY = "vexa_live_state_v3";
  const LOCAL_KEY_BASE = "vexa_live_state_v3";
  const REMOTE_SAVE_MS = 7000;
  const LOCAL_SAVE_MS = 900;
  const RESTORE_WAIT_MS = 1300;
  const VALID_SUBTITLE_LANGUAGES = new Set(["off","original","en","fa","ru","de","tr","es","ar","fr","pt","it","hi","zh","ja","ko"]);
  let state = null;
  let lastLocalSaveAt = 0;
  let lastRemoteSaveAt = 0;
  let childBound = false;
  let parentBound = false;
  let restoringMedia = false;
  let loadedSourceUrl = "";
  let localTimer = 0;

  function hostWindow() {
    try { if (window.parent && window.parent !== window && window.parent.location.origin === window.location.origin) return window.parent; }
    catch (error) {}
    return window;
  }
  function telegram() { const host = hostWindow(); return window.Telegram?.WebApp || host.Telegram?.WebApp || null; }
  function userId() {
    try {
      const value = telegram()?.initDataUnsafe?.user?.id;
      return value === undefined || value === null ? "anon" : String(value).replace(/[^0-9A-Za-z_-]/g, "").slice(0,40) || "anon";
    } catch (error) { return "anon"; }
  }
  function localKey() { return LOCAL_KEY_BASE + "_" + userId(); }
  function parseJson(value) { if (!value || typeof value !== "string") return null; try { return JSON.parse(value); } catch (error) { return null; } }
  function clampNumber(value,min,max,fallback) { const number=Number(value); return Number.isFinite(number) ? Math.min(max,Math.max(min,number)) : fallback; }
  function cleanYoutubeUrl(value) {
    const raw=String(value||"").trim(); if(!raw||raw.length>2048) return "";
    try {
      const url=new URL(raw); if(url.protocol!=="https:") return "";
      if(!["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com","youtu.be"].includes(url.hostname.toLowerCase())) return "";
      url.hash=""; return url.toString();
    } catch(error){ return ""; }
  }
  function cleanPlaybackUrl(value) {
    const raw=String(value||"").trim(); if(!raw) return "";
    try {
      const url=new URL(raw,window.location.origin); if(url.origin!==window.location.origin||url.pathname!=="/mini-app/live/api/youtube-playback") return "";
      const token=String(url.searchParams.get("token")||""); if(!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return "";
      url.searchParams.delete("download"); url.searchParams.delete("session"); return url.href;
    } catch(error){ return ""; }
  }
  function normalizeState(value) {
    if(!value||typeof value!=="object") return null;
    const subtitleLanguage=VALID_SUBTITLE_LANGUAGES.has(String(value.subtitleLanguage||"off"))?String(value.subtitleLanguage||"off"):"off";
    const normalized={
      version:VERSION,
      updatedAt:clampNumber(value.updatedAt,0,Number.MAX_SAFE_INTEGER,0),
      workspaceOpen:Boolean(value.workspaceOpen),
      sourceUrl:cleanYoutubeUrl(value.sourceUrl),
      draftUrl:cleanYoutubeUrl(value.draftUrl),
      playbackUrl:cleanPlaybackUrl(value.playbackUrl),
      title:String(value.title||"YouTube video").slice(0,500),
      currentTime:clampNumber(value.currentTime,0,86400,0),
      paused:value.paused!==false,
      subtitleLanguage,
    };
    if(!normalized.sourceUrl&&normalized.playbackUrl) normalized.playbackUrl="";
    return normalized;
  }
  function readLocal() { try { return normalizeState(parseJson(hostWindow().localStorage.getItem(localKey()))); } catch(error){ return null; } }
  function writeLocal(next) { try { hostWindow().localStorage.setItem(localKey(),JSON.stringify(next)); } catch(error){} }
  function remoteSafeState(next) {
    return {
      version:VERSION,updatedAt:Number(next.updatedAt||Date.now()),workspaceOpen:Boolean(next.workspaceOpen),
      sourceUrl:cleanYoutubeUrl(next.sourceUrl),draftUrl:cleanYoutubeUrl(next.draftUrl),title:String(next.title||"YouTube video").slice(0,500),
      currentTime:clampNumber(next.currentTime,0,86400,0),paused:next.paused!==false,
      subtitleLanguage:VALID_SUBTITLE_LANGUAGES.has(String(next.subtitleLanguage||"off"))?String(next.subtitleLanguage||"off"):"off"
    };
  }
  function storageGet(storage) {
    return new Promise(function(resolve){
      if(!storage||typeof storage.getItem!=="function") return resolve(null);
      let done=false;
      const finish=function(value){ if(done)return; done=true; resolve(normalizeState(parseJson(String(value||"")))); };
      const timer=setTimeout(function(){finish(null);},RESTORE_WAIT_MS);
      try { storage.getItem(REMOTE_KEY,function(error,value){clearTimeout(timer); if(error)return finish(null); finish(value);}); }
      catch(error){clearTimeout(timer);finish(null);}
    });
  }
  function storageSet(storage,value){ if(!storage||typeof storage.setItem!=="function")return; try{storage.setItem(REMOTE_KEY,value,function(){});}catch(error){} }
  async function loadBestState(){
    const local=readLocal(); const tg=telegram();
    const results=await Promise.all([storageGet(tg?.DeviceStorage),storageGet(tg?.CloudStorage)]);
    const candidates=[local,...results].filter(Boolean); if(!candidates.length)return null;
    candidates.sort(function(a,b){return Number(b.updatedAt||0)-Number(a.updatedAt||0);});
    const best={...candidates[0]};
    if(!best.playbackUrl&&local?.playbackUrl&&local.sourceUrl&&local.sourceUrl===best.sourceUrl) best.playbackUrl=local.playbackUrl;
    return normalizeState(best);
  }
  function mergeState(patch){
    const local=readLocal();
    const base=!state
      ? (local||normalizeState({})||{})
      : (!local||Number(state.updatedAt||0)>=Number(local.updatedAt||0)?state:local);
    const next=normalizeState({...base,...patch,updatedAt:Date.now()}); if(!next)return null;
    state=next; writeLocal(next); lastLocalSaveAt=Date.now(); return next;
  }
  function saveRemote(next,force){
    if(!next)return; const now=Date.now(); if(!force&&now-lastRemoteSaveAt<REMOTE_SAVE_MS)return;
    lastRemoteSaveAt=now; const serialized=JSON.stringify(remoteSafeState(next)); const tg=telegram();
    storageSet(tg?.DeviceStorage,serialized); storageSet(tg?.CloudStorage,serialized);
  }
  function savePatch(patch,forceRemote){const next=mergeState(patch||{});saveRemote(next,Boolean(forceRemote));return next;}
  function currentWorkspaceOpen(){
    try{
      const host=hostWindow(); const button=host.document.getElementById("vexaLiveOpen"); if(button?.getAttribute("aria-pressed")==="true")return true;
      const workspace=host.document.getElementById("vexaMediaWorkspace"); if(workspace?.getAttribute("aria-hidden")==="false")return true;
    }catch(error){}
    return Boolean(state?.workspaceOpen);
  }
  function subtitleLanguage(){const selected=document.querySelector("#vexaCustomPlayer [data-language].is-selected");const value=String(selected?.dataset?.language||"off");return VALID_SUBTITLE_LANGUAGES.has(value)?value:"off";}
  function collectChildState(){
    const input=document.getElementById("vexaLiveYoutubeUrl"),video=document.getElementById("vexaLiveVideo"),title=document.getElementById("vexaLiveVideoTitle");
    const directPlaybackUrl=cleanPlaybackUrl(video?.currentSrc||video?.src||""),inputUrl=cleanYoutubeUrl(input?.value||"");
    const sourceUrl=cleanYoutubeUrl(loadedSourceUrl)||state?.sourceUrl||(directPlaybackUrl?inputUrl:"");
    return {workspaceOpen:currentWorkspaceOpen(),sourceUrl,draftUrl:inputUrl,playbackUrl:directPlaybackUrl||state?.playbackUrl||"",title:String(title?.textContent||state?.title||"YouTube video"),currentTime:video?clampNumber(video.currentTime,0,86400,state?.currentTime||0):state?.currentTime||0,paused:video?Boolean(video.paused||video.ended):state?.paused!==false,subtitleLanguage:subtitleLanguage()};
  }
  function saveChild(forceRemote){if(!childBound||restoringMedia)return;const now=Date.now();if(!forceRemote&&now-lastLocalSaveAt<LOCAL_SAVE_MS)return;savePatch(collectChildState(),forceRemote);}
  function scheduleChildSave(forceRemote){clearTimeout(localTimer);localTimer=setTimeout(function(){saveChild(forceRemote);},forceRemote?40:180);}
  function showStage(saved){
    const stage=document.getElementById("vexaLiveStage"),empty=document.getElementById("vexaLiveEmpty"),title=document.getElementById("vexaLiveVideoTitle"),download=document.getElementById("vexaLiveDownload");
    stage?.classList.add("show"); if(empty)empty.style.display="none"; if(title)title.textContent=String(saved?.title||"YouTube video");
    if(download){download.disabled=false;download.textContent="Download";download.classList.add("show");}
  }
  function waitFor(selector,timeoutMs){
    return new Promise(function(resolve){
      const existing=document.querySelector(selector);if(existing)return resolve(existing);let finished=false;
      const observer=new MutationObserver(function(){const node=document.querySelector(selector);if(!node||finished)return;finished=true;observer.disconnect();resolve(node);});
      observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){if(finished)return;finished=true;observer.disconnect();resolve(null);},Math.max(500,timeoutMs||8000));
    });
  }
  function waitForMediaEvent(video,timeoutMs){
    return new Promise(function(resolve){
      if(Number.isFinite(video.duration)&&video.readyState>=1)return resolve(true);let done=false;
      const finish=function(ok){if(done)return;done=true;video.removeEventListener("loadedmetadata",onLoaded);video.removeEventListener("error",onError);resolve(ok);};
      const onLoaded=function(){finish(true);},onError=function(){finish(false);};
      video.addEventListener("loadedmetadata",onLoaded);video.addEventListener("error",onError);setTimeout(function(){finish(false);},Math.max(2000,timeoutMs||45000));
    });
  }
  async function playbackStillValid(url){
    const playbackUrl=cleanPlaybackUrl(url);if(!playbackUrl)return false;const controller=new AbortController();const timer=setTimeout(function(){controller.abort();},5500);
    try{const response=await fetch(playbackUrl,{method:"HEAD",cache:"no-store",headers:{"Accept":"video/mp4"},signal:controller.signal});return response.ok;}
    catch(error){return false;}finally{clearTimeout(timer);}
  }
  async function applyResume(video,saved){
    const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:Infinity;
    const target=Math.max(0,Math.min(Number(saved.currentTime||0),Number.isFinite(duration)?Math.max(0,duration-0.05):Number(saved.currentTime||0)));
    try{if(target>0.05)video.currentTime=target;}catch(error){}
    if(saved.paused){
      try{video.pause();}catch(error){}
      const keepPaused=function(){try{video.pause();}catch(error){}};video.addEventListener("playing",keepPaused,{once:true});setTimeout(keepPaused,220);
    }else{try{await video.play();}catch(error){}}
  }
  async function restoreSubtitle(saved){
    const language=VALID_SUBTITLE_LANGUAGES.has(String(saved.subtitleLanguage||"off"))?String(saved.subtitleLanguage||"off"):"off";if(language==="off")return;
    const option=await waitFor('#vexaCustomPlayer [data-language="'+language+'"]',7000);if(!option)return;try{option.click();}catch(error){}
  }
  async function restoreWithSavedPlayback(video,saved){
    if(!(await playbackStillValid(saved.playbackUrl)))return false;showStage(saved);loadedSourceUrl=cleanYoutubeUrl(saved.sourceUrl);
    try{video.pause();}catch(error){} video.removeAttribute("src");try{video.load();}catch(error){} video.src=cleanPlaybackUrl(saved.playbackUrl);video.load();
    const loaded=await waitForMediaEvent(video,18000);if(!loaded)return false;await applyResume(video,saved);await restoreSubtitle(saved);return true;
  }
  async function restoreByPreparing(video,saved){
    const sourceUrl=cleanYoutubeUrl(saved.sourceUrl||saved.draftUrl);if(!sourceUrl)return false;
    const input=document.getElementById("vexaLiveYoutubeUrl"),open=document.getElementById("vexaLiveLoad");if(!input||!open)return false;
    input.value=sourceUrl;loadedSourceUrl=sourceUrl;const wait=waitForMediaEvent(video,50000);try{open.click();}catch(error){return false;}
    const loaded=await wait;if(!loaded)return false;await applyResume(video,saved);await restoreSubtitle(saved);return true;
  }
  async function restoreChild(saved){
    if(!saved)return;const input=document.getElementById("vexaLiveYoutubeUrl")||await waitFor("#vexaLiveYoutubeUrl",8000);const video=document.getElementById("vexaLiveVideo")||await waitFor("#vexaLiveVideo",8000);
    if(input&&!saved.sourceUrl&&saved.draftUrl)input.value=saved.draftUrl;if(!video||video.tagName!=="VIDEO")return;if(!saved.sourceUrl&&!saved.playbackUrl)return;
    restoringMedia=true;try{if(input&&saved.sourceUrl)input.value=saved.sourceUrl;let restored=false;if(saved.playbackUrl)restored=await restoreWithSavedPlayback(video,saved);if(!restored)restored=await restoreByPreparing(video,saved);if(restored)savePatch(collectChildState(),true);}finally{restoringMedia=false;}
  }
  function bindChild(){
    if(childBound)return;childBound=true;
    const attach=async function(){
      const video=document.getElementById("vexaLiveVideo")||await waitFor("#vexaLiveVideo",8000);const input=document.getElementById("vexaLiveYoutubeUrl")||await waitFor("#vexaLiveYoutubeUrl",8000);if(!video||video.tagName!=="VIDEO")return;
      const captureLoadedSource=function(){const candidate=cleanYoutubeUrl(input?.value||"");if(cleanPlaybackUrl(video.currentSrc||video.src||"")&&candidate)loadedSourceUrl=candidate;};
      video.addEventListener("loadedmetadata",function(){captureLoadedSource();scheduleChildSave(true);});video.addEventListener("timeupdate",function(){saveChild(false);});video.addEventListener("pause",function(){scheduleChildSave(true);});video.addEventListener("play",function(){scheduleChildSave(true);});video.addEventListener("seeked",function(){scheduleChildSave(true);});video.addEventListener("ended",function(){scheduleChildSave(true);});video.addEventListener("durationchange",function(){scheduleChildSave(false);});
      const srcObserver=new MutationObserver(function(){captureLoadedSource();scheduleChildSave(true);});srcObserver.observe(video,{attributes:true,attributeFilter:["src"]});
      input?.addEventListener("input",function(){scheduleChildSave(false);});input?.addEventListener("change",function(){scheduleChildSave(true);});
      document.addEventListener("click",function(event){const option=event.target?.closest?.("#vexaCustomPlayer [data-language]");if(!option)return;setTimeout(function(){scheduleChildSave(true);},70);},true);
      document.addEventListener("visibilitychange",function(){if(document.hidden)saveChild(true);});window.addEventListener("pagehide",function(){saveChild(true);});
    };attach();
  }
  function explicitOtherSection(){
    let raw="";const tg=telegram();try{raw=String(tg?.initDataUnsafe?.start_param||"");}catch(error){}
    if(!raw){try{const params=new URLSearchParams(window.location.search);raw=String(params.get("tgWebAppStartParam")||params.get("startapp")||params.get("section")||"");}catch(error){}}
    const section=raw.trim().toLowerCase();return Boolean(section&&section!=="live"&&section!=="vexa-live");
  }
  function persistWorkspaceOpen(forceRemote){if(!parentBound)return;savePatch({workspaceOpen:currentWorkspaceOpen()},forceRemote);}
  function bindParentWatchers(){
    if(parentBound)return;parentBound=true;
    const attach=function(){
      const button=document.getElementById("vexaLiveOpen"),workspace=document.getElementById("vexaMediaWorkspace");
      if(button&&button.dataset.vexaPersistBound!=="1"){
        button.dataset.vexaPersistBound="1";const observer=new MutationObserver(function(){persistWorkspaceOpen(true);});observer.observe(button,{attributes:true,attributeFilter:["aria-pressed"]});
        button.addEventListener("click",function(){setTimeout(function(){persistWorkspaceOpen(true);},100);},true);
      }
      if(workspace&&workspace.dataset.vexaPersistBound!=="1"){
        workspace.dataset.vexaPersistBound="1";const observer=new MutationObserver(function(){persistWorkspaceOpen(true);});observer.observe(workspace,{attributes:true,attributeFilter:["aria-hidden","style"]});
      }
    };
    attach();const documentObserver=new MutationObserver(attach);documentObserver.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener("visibilitychange",function(){if(document.hidden)persistWorkspaceOpen(true);});window.addEventListener("pagehide",function(){persistWorkspaceOpen(true);});
  }
  async function reopenWorkspace(saved){
    if(!saved?.workspaceOpen||explicitOtherSection())return;const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      const button=document.getElementById("vexaLiveOpen");
      if(button){
        if(button.getAttribute("aria-pressed")==="true")return;const speech=document.getElementById("speechToTextOpen");if(speech?.getAttribute("aria-pressed")==="true")return;
        try{button.click();}catch(error){} await new Promise(function(resolve){setTimeout(resolve,420);});if(button.getAttribute("aria-pressed")==="true")return;
      }else await new Promise(function(resolve){setTimeout(resolve,220);});
    }
  }
  async function runParent(){const saved=await loadBestState();if(saved)state=saved;bindParentWatchers();await reopenWorkspace(saved);}
  async function runChild(){const saved=await loadBestState();if(saved)state=saved;bindChild();await restoreChild(saved);}
  const childPath=window.location.pathname==="/mini-app/vexa-live"||window.location.pathname==="/mini-app/vexa-live/";
  if(childPath)runChild();else runParent();
})();
`;

export const TTS_KEYBOARD_LOCK_PATCH = String.raw`
(function installTtsKeyboardLayoutLock(){
  var locked=false;
  var focused=false;
  var baselineViewportHeight=0;
  var bottomNode=null;

  function viewportHeight(){
    var viewport=window.visualViewport;
    var height=Number(viewport&&viewport.height||window.innerHeight||0);
    return Number.isFinite(height)&&height>0?height:0;
  }

  function isDialogueInput(target){
    return !!(target&&target.matches&&target.matches('[data-dialogue-text]'));
  }

  function lock(){
    if(locked)return;
    var node=document.querySelector('#flow.active .tts-bottom')||document.querySelector('.tts-bottom');
    if(!node)return;
    var rect=node.getBoundingClientRect();
    if(!Number.isFinite(rect.top)||!Number.isFinite(rect.left)||rect.width<1||rect.height<1)return;

    locked=true;
    bottomNode=node;
    baselineViewportHeight=viewportHeight();

    node.style.setProperty('position','fixed','important');
    node.style.setProperty('top',Math.round(rect.top)+'px','important');
    node.style.setProperty('bottom','auto','important');
    node.style.setProperty('left',Math.round(rect.left)+'px','important');
    node.style.setProperty('right','auto','important');
    node.style.setProperty('width',Math.round(rect.width)+'px','important');
    node.style.setProperty('transform','none','important');
  }

  function release(){
    if(!locked)return;
    var node=bottomNode;
    locked=false;
    focused=false;
    baselineViewportHeight=0;
    bottomNode=null;
    if(!node)return;

    node.style.removeProperty('position');
    node.style.removeProperty('top');
    node.style.removeProperty('bottom');
    node.style.removeProperty('left');
    node.style.removeProperty('right');
    node.style.removeProperty('width');
    node.style.removeProperty('transform');
  }

  function releaseIfRecovered(){
    if(!locked||focused)return;
    var height=viewportHeight();
    if(!baselineViewportHeight||height>=Math.max(320,baselineViewportHeight-24))release();
  }

  document.addEventListener('pointerdown',function(event){
    if(!isDialogueInput(event.target))return;
    lock();
  },true);

  document.addEventListener('focusin',function(event){
    if(!isDialogueInput(event.target))return;
    if(!locked)lock();
    focused=true;
  },true);

  document.addEventListener('focusout',function(event){
    if(!isDialogueInput(event.target))return;
    focused=false;
    requestAnimationFrame(releaseIfRecovered);
  },true);

  var viewportSource=window.visualViewport||window;
  viewportSource.addEventListener('resize',releaseIfRecovered,{passive:true});
  window.addEventListener('pagehide',release,{passive:true});
})();
`;

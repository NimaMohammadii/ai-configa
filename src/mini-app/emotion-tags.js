export const EMOTION_TAGS_JS = String.raw`
;(function(){
  var tags=[
    ['Emotion','happy','Bright, positive delivery'],
    ['Emotion','sad','Soft, downcast delivery'],
    ['Emotion','excited','More energy and enthusiasm'],
    ['Emotion','angry','Tense, forceful delivery'],
    ['Emotion','annoyed','Irritated and impatient tone'],
    ['Emotion','appalled','Shock mixed with disapproval'],
    ['Emotion','thoughtful','Reflective, considered delivery'],
    ['Emotion','surprised','Adds genuine surprise'],
    ['Emotion','curious','Inquisitive, interested tone'],
    ['Emotion','sarcastic','Dry, ironic delivery'],
    ['Emotion','nervous','Anxious, uncertain delivery'],
    ['Emotion','frustrated','Controlled frustration'],
    ['Emotion','sorrowful','Deep sadness and weight'],
    ['Emotion','calm','Relaxed, steady delivery'],
    ['Emotion','tired','Low-energy, exhausted tone'],
    ['Emotion','regretful','Adds remorse and hesitation'],
    ['Emotion','playfully','Light, playful delivery'],
    ['Emotion','mischievously','Cheeky, secretive playfulness'],
    ['Emotion','resigned tone','Accepting, defeated tone'],
    ['Emotion','hesitant','Unsure and cautious delivery'],
    ['Emotion','suspicious tone','Adds doubt and suspicion'],
    ['Delivery','whispers','Drops the voice to a whisper'],
    ['Delivery','quietly','Makes the next line softer'],
    ['Delivery','cheerfully','Warm, upbeat delivery'],
    ['Delivery','flatly','Removes emotional variation'],
    ['Delivery','deadpan','Dry and deliberately neutral'],
    ['Delivery','rushed','Speeds up with urgency'],
    ['Delivery','slows down','Reduces speaking pace'],
    ['Delivery','deliberate','Measured, intentional pacing'],
    ['Delivery','rapid-fire','Very fast rhythmic delivery'],
    ['Delivery','timidly','Small, cautious delivery'],
    ['Delivery','drawn out','Stretches words and timing'],
    ['Delivery','emphasized','Adds stronger emphasis'],
    ['Delivery','stress on next word','Stresses the following word'],
    ['Delivery','understated','Keeps the performance subtle'],
    ['Delivery','questioning','Turns delivery inquisitive'],
    ['Delivery','stammers','Adds vocal hesitation'],
    ['Delivery','pauses','Adds a natural pause'],
    ['Delivery','short pause','Adds a brief pause'],
    ['Delivery','long pause','Adds a longer dramatic pause'],
    ['Delivery','continues after a beat','Resumes after a small beat'],
    ['Reactions','laughs','Adds a natural laugh'],
    ['Reactions','laughs harder','Makes the laugh more intense'],
    ['Reactions','starts laughing','Transitions into laughter'],
    ['Reactions','laughing','Speaks while laughing'],
    ['Reactions','chuckles','Adds a soft chuckle'],
    ['Reactions','light chuckle','Adds a subtle chuckle'],
    ['Reactions','giggles','Adds light giggling'],
    ['Reactions','wheezing','Breathy laughter or strain'],
    ['Reactions','sighs','Adds an audible sigh'],
    ['Reactions','sigh of relief','Adds relieved exhalation'],
    ['Reactions','exhales','Adds an audible exhale'],
    ['Reactions','exhales sharply','Adds a quick sharp exhale'],
    ['Reactions','inhales deeply','Adds a deep inhale'],
    ['Reactions','breathes','Adds natural breathing'],
    ['Reactions','gasps','Adds a sudden gasp'],
    ['Reactions','gulps','Adds a nervous gulp'],
    ['Reactions','swallows','Adds an audible swallow'],
    ['Reactions','snorts','Adds a short nasal reaction'],
    ['Reactions','crying','Adds crying to the delivery'],
    ['Reactions','clears throat','Adds a throat-clear'],
    ['Sounds','applause','Adds audience applause'],
    ['Sounds','clapping','Adds clapping sounds'],
    ['Sounds','gunshot','Adds a gunshot sound effect'],
    ['Sounds','explosion','Adds an explosion sound effect'],
    ['Sounds','sings','Switches into singing'],
    ['Sounds','woo','Adds a celebratory woo'],
    ['Sounds','fart','Adds the experimental sound effect'],
    ['Sounds','strong French accent','Applies the documented accent example']
  ];
  var activeCategory='All';
  var savedStart=0;
  var savedEnd=0;
  var open=false;
  var input=document.getElementById('ttsText');
  var historyButton=document.getElementById('historyButton');
  if(!input||!historyButton)return;

  function icon(){return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="6" stroke="currentColor" stroke-width="1.55"/><path d="M8.25 10.1h.01M15.75 10.1h.01M8.4 14.15c1.08 1.02 2.26 1.52 3.6 1.52 1.34 0 2.52-.5 3.6-1.52" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.7 7.55c.7-.55 1.42-.73 2.17-.55M17.3 7.55c-.7-.55-1.42-.73-2.17-.55" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>'}

  var trigger=document.createElement('button');
  trigger.id='emotionButton';
  trigger.className='emotion-trigger';
  trigger.type='button';
  trigger.setAttribute('data-action','toggle-emotions');
  trigger.setAttribute('aria-label','Open emotion tags');
  trigger.setAttribute('aria-expanded','false');
  trigger.innerHTML='<span class="emotion-trigger-icon">'+icon()+'</span><span>Emotions</span>';
  historyButton.parentNode.insertBefore(trigger,historyButton);

  var panel=document.createElement('div');
  panel.id='emotionPanel';
  panel.className='emotion-panel';
  panel.setAttribute('aria-hidden','true');
  panel.innerHTML='<button class="emotion-backdrop" data-emotion-close type="button" aria-label="Close emotion tags"></button><section class="emotion-card" role="dialog" aria-label="Emotion tags"><div class="emotion-handle" aria-hidden="true"></div><div class="emotion-head"><div><span>AUDIO DIRECTION</span><strong>Emotions</strong></div><small>Tap a tag to add it at the cursor</small></div><label class="emotion-search"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.1" stroke="currentColor" stroke-width="1.8"/><path d="m15.4 15.4 4.1 4.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="emotionSearch" type="search" autocomplete="off" placeholder="Search audio tags"/></label><div class="emotion-categories" role="tablist"></div><div class="emotion-list"></div></section>';
  document.body.appendChild(panel);
  var list=panel.querySelector('.emotion-list');
  var categories=panel.querySelector('.emotion-categories');
  var search=panel.querySelector('#emotionSearch');

  ['All','Emotion','Delivery','Reactions','Sounds'].forEach(function(category){
    var button=document.createElement('button');
    button.type='button';
    button.textContent=category;
    button.setAttribute('data-emotion-category',category);
    button.setAttribute('role','tab');
    categories.appendChild(button);
  });

  function rememberCursor(){
    savedStart=typeof input.selectionStart==='number'?input.selectionStart:input.value.length;
    savedEnd=typeof input.selectionEnd==='number'?input.selectionEnd:savedStart;
  }

  function render(){
    var query=String(search.value||'').trim().toLowerCase();
    var visible=tags.filter(function(item){return(activeCategory==='All'||item[0]===activeCategory)&&(!query||(item[1]+' '+item[2]).toLowerCase().indexOf(query)>=0)});
    categories.querySelectorAll('button').forEach(function(button){var selected=button.getAttribute('data-emotion-category')===activeCategory;button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected?'true':'false')});
    list.innerHTML='';
    visible.forEach(function(item,index){
      var button=document.createElement('button');
      button.type='button';
      button.className='emotion-tag';
      button.style.setProperty('--tag-index',String(index));
      button.setAttribute('data-emotion-tag',item[1]);
      var name=document.createElement('strong');
      name.textContent='['+item[1]+']';
      var description=document.createElement('small');
      description.textContent=item[2];
      button.appendChild(name);
      button.appendChild(description);
      list.appendChild(button);
    });
    if(!visible.length){var empty=document.createElement('div');empty.className='emotion-empty';empty.textContent='No matching audio tags';list.appendChild(empty)}
  }

  function setOpen(value){
    open=!!value;
    panel.classList.toggle('open',open);
    panel.setAttribute('aria-hidden',open?'false':'true');
    trigger.classList.toggle('active',open);
    trigger.setAttribute('aria-expanded',open?'true':'false');
    document.body.classList.toggle('emotions-open',open);
    if(open){rememberCursor();render();requestAnimationFrame(function(){input.focus({preventScroll:true});try{input.setSelectionRange(savedStart,savedEnd)}catch(error){}})}
  }

  function insertTag(tag){
    var start=Math.min(savedStart,input.value.length);
    var end=Math.min(savedEnd,input.value.length);
    var before=input.value.slice(0,start);
    var after=input.value.slice(end);
    var prefix=before&&!/\s$/.test(before)?' ':'';
    var suffix=after&&!/^\s/.test(after)?' ':' ';
    var value=prefix+'['+tag+']'+suffix;
    input.setRangeText(value,start,end,'end');
    savedStart=input.selectionStart;
    savedEnd=input.selectionEnd;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus({preventScroll:true});
    trigger.classList.remove('tagged');
    void trigger.offsetWidth;
    trigger.classList.add('tagged');
  }

  input.addEventListener('input',rememberCursor);
  input.addEventListener('select',rememberCursor);
  input.addEventListener('keyup',rememberCursor);
  input.addEventListener('click',rememberCursor);
  search.addEventListener('input',render);
  document.addEventListener('pointerdown',function(event){var button=event.target.closest&&event.target.closest('[data-action="toggle-emotions"],[data-emotion-tag]');if(button)event.preventDefault()});
  document.addEventListener('click',function(event){
    var toggle=event.target.closest&&event.target.closest('[data-action="toggle-emotions"]');
    if(toggle){event.preventDefault();setOpen(!open);return}
    var category=event.target.closest&&event.target.closest('[data-emotion-category]');
    if(category){activeCategory=category.getAttribute('data-emotion-category')||'All';render();return}
    var tag=event.target.closest&&event.target.closest('[data-emotion-tag]');
    if(tag){insertTag(tag.getAttribute('data-emotion-tag')||'');return}
    if(event.target.closest&&event.target.closest('[data-emotion-close]'))setOpen(false);
    if(event.target.closest&&event.target.closest('#modeToggle'))setTimeout(function(){if(document.body.classList.contains('image-mode'))setOpen(false)},0);
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&open)setOpen(false)});
  render();
})();
`;

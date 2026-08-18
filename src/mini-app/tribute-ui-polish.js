export const TRIBUTE_UI_POLISH_JS = String.raw`
(function(){
  if(window.__vexaTributeUiPolishLoaded)return;
  window.__vexaTributeUiPolishLoaded=true;

  function installStyles(){
    if(document.getElementById('vexaTributeUiPolishStyles'))return;
    var style=document.createElement('style');
    style.id='vexaTributeUiPolishStyles';
    style.textContent='\
html body .credits-page .tribute-product{border:0!important;box-shadow:0 10px 22px rgba(0,0,0,.22)!important}\
html body .credits-page .tribute-product:before{content:none!important;display:none!important;background:none!important}\
html body .credits-page .tribute-product:hover,html body .credits-page .tribute-product:focus-visible{box-shadow:0 12px 26px rgba(0,0,0,.24)!important}\
html body .credits-page .tribute-product:active{box-shadow:0 5px 14px rgba(0,0,0,.2)!important}\
html body .credits-page .tribute-product.waiting,html body .credits-page .tribute-product.success,html body .credits-page .tribute-product.failed{border:0!important}\
html body .credits-page .tribute-stars-bonus-title{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important}\
html body .credits-page .tribute-stars-bonus-title strong{display:block!important;font-size:16px!important;line-height:1!important;font-weight:770!important;letter-spacing:-.035em!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}\
html body .credits-page .tribute-stars-bonus-title strong b{color:rgba(255,255,255,.6)!important;font-weight:700!important}\
html body .credits-page .tribute-stars-bonus-title em{padding:3px 5px!important;border-radius:6px!important;background:#fff!important;color:#050505!important;font-size:7px!important;line-height:1!important;font-weight:850!important;font-style:normal!important;letter-spacing:.05em!important;white-space:nowrap!important}\
@media(max-width:370px){html body .credits-page .tribute-stars-bonus-title strong{font-size:15px!important}html body .credits-page .tribute-stars-bonus-title em{display:none!important}}';
    document.head.appendChild(style);
  }

  function rateText(meta){
    if(!meta)return '';
    var matches=Array.prototype.slice.call(meta.querySelectorAll('span')).filter(function(node){return String(node.textContent||'').indexOf('/ 1K')>=0});
    if(matches.length)return String(matches[matches.length-1].textContent||'').trim();
    var text=String(meta.textContent||'').trim();
    var match=text.match(/([^·]*\/\s*1K[^·]*)/i);
    return match?String(match[1]||'').trim():'';
  }

  function decorateBonusCard(card){
    if(!card||card.dataset.starsBonusMatch==='1')return;
    if(String(card.getAttribute('data-catalog-id')||'')!=='card_120000')return;
    var main=card.querySelector('.tribute-product-main');
    var meta=card.querySelector('.tribute-product-meta');
    if(!main||!meta)return;
    var rate=rateText(meta);
    var title=document.createElement('span');
    title.className='credits-pack-title tribute-stars-bonus-title';
    title.innerHTML='<strong>120,000 <b>+ 10,000</b></strong><em>10,000 gift</em>';
    var oldTitle=main.querySelector(':scope > strong');
    if(oldTitle)oldTitle.replaceWith(title);else main.insertBefore(title,main.firstChild);
    meta.innerHTML=rate?'<span style="white-space:nowrap">'+rate+'</span>':'';
    card.dataset.starsBonusMatch='1';
  }

  function decorate(){
    installStyles();
    document.querySelectorAll('#tributeProductList .tribute-product').forEach(decorateBonusCard);
  }

  function boot(){
    decorate();
    var root=document.getElementById('tributeProductList')||document.body;
    if(!root)return;
    var observer=new MutationObserver(function(){decorate()});
    observer.observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
`;
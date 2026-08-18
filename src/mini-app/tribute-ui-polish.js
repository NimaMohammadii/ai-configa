export const TRIBUTE_UI_POLISH_JS = String.raw`
(function(){
  if(window.__vexaTributeUiPolishLoaded)return;
  window.__vexaTributeUiPolishLoaded=true;

  function installStyles(){
    if(document.getElementById('vexaTributeUiPolishStyles'))return;
    var style=document.createElement('style');
    style.id='vexaTributeUiPolishStyles';
    style.textContent='\
html body .credits-page .tribute-product{border:0!important;background:var(--ticket-glass-bg,rgba(13,13,13,.62))!important;box-shadow:inset 0 0 18px rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.22)!important}\
html body .credits-page .tribute-product:before{content:none!important;display:none!important;background:none!important}\
html body .credits-page .tribute-product:hover,html body .credits-page .tribute-product:focus-visible{background:rgba(255,255,255,.075)!important;box-shadow:inset 0 0 20px rgba(255,255,255,.055),0 12px 26px rgba(0,0,0,.24)!important}\
html body .credits-page .tribute-product:active{background:rgba(255,255,255,.105)!important;box-shadow:inset 0 0 16px rgba(255,255,255,.05),0 5px 14px rgba(0,0,0,.2)!important}\
html body .credits-page .tribute-product.waiting,html body .credits-page .tribute-product.success,html body .credits-page .tribute-product.failed{border:0!important}\
html body .credits-page .tribute-stars-promo-title{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important}\
html body .credits-page .tribute-stars-promo-title strong{display:block!important;font-size:16px!important;line-height:1!important;font-weight:770!important;letter-spacing:-.035em!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}\
html body .credits-page .tribute-stars-promo-title strong b{color:rgba(255,255,255,.6)!important;font-weight:700!important}\
html body .credits-page .tribute-stars-promo-title em{display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:3px 5px!important;border:0!important;border-radius:6px!important;background:#fff!important;box-shadow:0 3px 10px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.72)!important;color:#050505!important;font-size:7px!important;line-height:1!important;font-weight:850!important;font-style:normal!important;letter-spacing:.05em!important;white-space:nowrap!important;-webkit-font-smoothing:antialiased!important}\
@media(max-width:370px){html body .credits-page .tribute-stars-promo-title strong{font-size:15px!important}html body .credits-page .tribute-stars-promo-title em{font-size:6.5px!important;padding:3px 5px!important}}';
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

  function replacePromoTitle(card,markup){
    var main=card&&card.querySelector('.tribute-product-main');
    var meta=card&&card.querySelector('.tribute-product-meta');
    if(!main||!meta)return;
    var rate=rateText(meta);
    var title=document.createElement('span');
    title.className='credits-pack-title tribute-stars-promo-title';
    title.innerHTML=markup;
    var oldTitle=main.querySelector(':scope > strong, :scope > .tribute-stars-promo-title');
    if(oldTitle)oldTitle.replaceWith(title);else main.insertBefore(title,main.firstChild);
    meta.innerHTML=rate?'<span style="white-space:nowrap">'+rate+'</span>':'';
  }

  function decorateCard(card){
    if(!card)return;
    var id=String(card.getAttribute('data-catalog-id')||'');
    if(id==='card_40000'){
      replacePromoTitle(card,'<strong>40,000</strong><em>30% OFF</em>');
      return;
    }
    if(id==='card_120000'){
      replacePromoTitle(card,'<strong>120,000 <b>+ 10,000</b></strong><em>10,000 gift</em>');
    }
  }

  function decorate(){
    installStyles();
    document.querySelectorAll('#tributeProductList .tribute-product').forEach(decorateCard);
  }

  function boot(){
    decorate();
    var root=document.getElementById('tributeProductList')||document.body;
    if(!root)return;
    var scheduled=false;
    var observer=new MutationObserver(function(){
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(function(){scheduled=false;decorate()});
    });
    observer.observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
`;

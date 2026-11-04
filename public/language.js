(() => {
  'use strict';
  const API = () => String(window.GRAMSUTRA_API || '').replace(/\/$/, '');
  const codes = { English:'en', Hindi:'hi', Bengali:'bn', Telugu:'te', Marathi:'mr', Tamil:'ta', Gujarati:'gu', Kannada:'kn', Malayalam:'ml', Punjabi:'pa', Odia:'or', Assamese:'as', Urdu:'ur' };
  const textRecords = new Map(), attrRecords = new Map(), cache = new Map();
  const pending = new Set();
  let activeLanguage = 'English', observer = null, scheduled = false, failed = false;
  const excluded = 'script,style,noscript,textarea,input,[contenteditable="true"],[data-no-translate],.msg.me,.msg.bot,.post,.person,.listing .user-content';
  const hasLetters = s => /[\p{L}]{2}/u.test(s);
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  function language() {
    try { return (typeof PROF !== 'undefined' && PROF.lang) || localStorage.getItem('gs_language') || 'English'; }
    catch (_) { return 'English'; }
  }
  function getTextNodes(root=document) {
    const out=[]; const walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      const value=node.nodeValue || '', parent=node.parentElement;
      if (!parent || !clean(value) || !hasLetters(value) || parent.closest(excluded)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    while(walker.nextNode()) out.push(walker.currentNode); return out;
  }
  function collect(root=document) {
    const texts=[];
    // Freeze implicit option values before translating their visible captions.
    const optionRoot = root.nodeType===1 ? root : document;
    (optionRoot.matches && optionRoot.matches('option') ? [optionRoot] : []).concat([...optionRoot.querySelectorAll('option')]).forEach(option=>{ if(!option.hasAttribute('value')) option.value=option.textContent.trim(); });
    getTextNodes(root).forEach(node=>{
      let rec=textRecords.get(node);
      if (!rec) { rec={original:node.nodeValue,last:null}; textRecords.set(node,rec); }
      else if (rec.last !== null && node.nodeValue !== rec.last) { rec.original=node.nodeValue; rec.last=null; }
      if (activeLanguage !== 'English' && rec.last === null) texts.push({type:'text',node,source:rec.original});
    });
    const els = root.nodeType===1 ? [root,...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
    els.forEach(el=>{
      if (el.matches(excluded) || el.closest(excluded)) return;
      ['placeholder','title','aria-label'].forEach(attr=>{
        if (!el.hasAttribute(attr)) return;
        let byAttr=attrRecords.get(el); if(!byAttr){byAttr=new Map();attrRecords.set(el,byAttr);}
        let rec=byAttr.get(attr), value=el.getAttribute(attr);
        if(!rec){rec={original:value,last:null};byAttr.set(attr,rec);}
        else if(rec.last!==null && value!==rec.last){rec.original=value;rec.last=null;}
        if(activeLanguage!=='English' && rec.last===null && hasLetters(rec.original)) texts.push({type:'attr',el,attr,source:rec.original,rec});
      });
      if(el.tagName==='OPTION') {
        // Option captions are text nodes; option values remain stable for app logic.
      }
    });
    return texts;
  }
  function restoreEnglish() {
    for(const [node,rec] of textRecords){ if(node.isConnected && rec.last!==null){ if(node.nodeValue===rec.last) node.nodeValue=rec.original; rec.last=null; } }
    for(const [el,attrs] of attrRecords){ if(el.isConnected) for(const [attr,rec] of attrs){ if(rec.last!==null){ if(el.getAttribute(attr)===rec.last) el.setAttribute(attr,rec.original); rec.last=null; } } }
  }
  function setTranslated(item,value){
    if(item.type==='text') { if(item.node.isConnected){const rec=textRecords.get(item.node);rec.last=value;item.node.nodeValue=value;} }
    else if(item.el.isConnected){item.rec.last=value;item.el.setAttribute(item.attr,value);}
  }
  function cacheKey(lang,source){return lang+'\u0000'+source;}
  async function translateBatch(items,lang){
    const missing=[], mapItems=[];
    items.forEach(item=>{const key=cacheKey(lang,item.source);if(cache.has(key)){setTranslated(item,cache.get(key));}else{missing.push(item.source);mapItems.push(item);}});
    if(!missing.length)return;
    try{
      const r=await fetch(API()+'/api/translate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({language:lang,texts:missing})});
      const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||'Translation is unavailable.');
      j.translations.forEach((value,i)=>{const source=missing[i],safe=String(value||source);cache.set(cacheKey(lang,source),safe);setTranslated(mapItems[i],safe);});
      try { const obj={}; let n=0; for(const [k,v] of cache){if(n++>2500)break;obj[k]=v;} localStorage.setItem('gs_ui_translations',JSON.stringify(obj)); } catch(_){ }
      failed=false;
    }catch(e){
      failed=true; console.warn('GramSutra language translation:',e.message);
      const status=document.getElementById('languageStatus');
      if(status){status.textContent='Translation could not load. Check your internet connection and server AI API key setup.';status.hidden=false;}
    }
  }
  async function process(root=document){
    if(activeLanguage==='English')return;
    const items=collect(root); if(!items.length)return;
    const groups=[]; for(let i=0;i<items.length;i+=60)groups.push(items.slice(i,i+60));
    for(const group of groups) { await translateBatch(group,activeLanguage); if(failed) break; }
    if(!failed){const status=document.getElementById('languageStatus');if(status)status.hidden=true;}
  }
  function schedule(){ if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;process(document);}); }
  function apply(lang){
    activeLanguage=codes[lang] ? lang : 'English';
    document.documentElement.lang=codes[activeLanguage]||'en';
    document.documentElement.dir=activeLanguage==='Urdu'?'rtl':'ltr';
    try{localStorage.setItem('gs_language',activeLanguage);}catch(_){ }
    if(activeLanguage==='English'){restoreEnglish();const status=document.getElementById('languageStatus');if(status)status.hidden=true;return;}
    restoreEnglish(); schedule(document);
  }
  try{const saved=JSON.parse(localStorage.getItem('gs_ui_translations')||'{}');Object.entries(saved).forEach(([k,v])=>cache.set(k,v));}catch(_){ }
  window.GramSutraLanguage={apply,get:()=>activeLanguage,retry:()=>{failed=false;process(document);}};
  function start(){
    const initial=language(); apply(initial);
    const picker=document.getElementById('pl');
    if(picker){picker.addEventListener('change',()=>apply(picker.value));}
    const save=document.getElementById('psave');
    if(save)save.addEventListener('click',()=>setTimeout(()=>apply(language()),0));
    const edit=document.getElementById('pedit');
    if(edit)edit.addEventListener('click',()=>setTimeout(()=>{const p=document.getElementById('pl');if(p)p.value=activeLanguage;},0));
    observer=new MutationObserver(records=>{for(const record of records){if(record.type==='childList')record.addedNodes.forEach(n=>{if(n.nodeType===1||n.nodeType===3)schedule();});else if(record.type==='characterData'){const rec=textRecords.get(record.target);if(rec && rec.last===record.target.nodeValue)return;schedule();}}});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    if(activeLanguage!=='English')schedule(document);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

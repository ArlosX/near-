// Presentation only: no wallet, API, agreement or stored evidence mutations
(()=>{
 const root=document.documentElement,key='prooflane-theme';
 let theme='dark';try{if(localStorage.getItem(key)==='light')theme='light';}catch{}
 root.dataset.theme=theme;
 function apply(next){
  theme=next==='light'?'light':'dark';root.dataset.theme=theme;
  const button=document.getElementById('theme-toggle');
  if(button){button.setAttribute('aria-pressed',String(theme==='light'));button.setAttribute('aria-label',theme==='light'?'Switch to graphite night mode':'Switch to ice day mode');button.title=theme==='light'?'Graphite night':'Ice day';}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#F1F8FC':'#090D11');
 }
 function clean(text){
  // Sentence stops only: retain decimals, URLs, account names and file paths
  return text.replace(/(^|\s)([^\s]+)\.(?=\s|$)/g,(all,space,word)=>/^(?:https?:\/\/|www\.)/.test(word)||/[\\/]/.test(word)?all:space+word);
 }
 function polish(node){
  if(node.nodeType===Node.TEXT_NODE){const parent=node.parentElement;if(parent&&!parent.closest('pre,code,script,style,textarea,svg,[data-preserve-punctuation]')){const text=clean(node.data);if(text!==node.data)node.data=text;}return;}
  if(node.nodeType!==Node.ELEMENT_NODE||node.closest('pre,code,script,style,textarea,svg,[data-preserve-punctuation]'))return;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while((text=walker.nextNode()))polish(text);
 }
 function boot(){
  const button=document.getElementById('theme-toggle');
  if(button)button.addEventListener('click',()=>{apply(theme==='dark'?'light':'dark');try{localStorage.setItem(key,theme);}catch{}});
  apply(theme);polish(document.body);
  const pending=new Set();let queued=false;
  const observer=new MutationObserver(records=>{
   for(const record of records){if(record.type==='characterData')pending.add(record.target);else for(const node of record.addedNodes)pending.add(node);}
   if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;for(const node of pending)if(node.isConnected)polish(node);pending.clear();});
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

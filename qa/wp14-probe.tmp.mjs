import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
await p.goto('http://localhost:4173/', {waitUntil:'load'});
await p.waitForTimeout(2000);
await p.evaluate(()=>document.querySelector('#validation').scrollIntoView());
await p.waitForTimeout(3000);
const r = await p.evaluate(()=>{
  return [...document.querySelectorAll('.sec-validation__row')].map(row=>{
    const g=(s)=>{const e=row.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); const cs=getComputedStyle(e); return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),l:+b.left.toFixed(1),r:+b.right.toFixed(1),op:cs.opacity,tr:cs.transform};};
    return {word:g('.sec-validation__word'), mark:g('.sec-validation__mark'), reason:g('.sec-validation__reason'), status:g('.sec-validation__status')};
  });
});
console.log(JSON.stringify(r,null,1));
await b.close();

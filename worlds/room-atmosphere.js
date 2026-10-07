const TAU=Math.PI*2;
import { drawOdysseySectors } from "./odyssey-sectors.js";
function u(n){const x=Math.sin(n*91.17+17.31)*43758.5453;return x-Math.floor(x);}
function w(v,s){const m=v%s;return m<0?m+s:m;}
function vig(ctx,W,H,a){const g=ctx.createRadialGradient(W*.5,H*.44,H*.18,W*.5,H*.48,Math.max(W,H)*.78);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,"+a+")");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
const CHARACTER_THEMES = {
 kilo:    { c1:"#ffd36a", c2:"#ff7b52", motif:"sun" },
 stitcho: { c1:"#7ee7ff", c2:"#8c7bff", motif:"stitches" },
 chispin: { c1:"#ffe66a", c2:"#60e5ff", motif:"spark" },
 cat:     { c1:"#ff83d0", c2:"#9b8cff", motif:"moon" },
 dragon:  { c1:"#ff7048", c2:"#ffd36a", motif:"ember" },
 dino:    { c1:"#8fe28e", c2:"#c5a77a", motif:"fern" },
 frita:   { c1:"#ff9a5a", c2:"#ffd36a", motif:"fry" },
 pizza:   { c1:"#ffcf68", c2:"#ff6a63", motif:"cheese" },
 yomi:    { c1:"#f6efff", c2:"#bb93ff", motif:"ofuda" },
 cuerno:  { c1:"#b8f090", c2:"#ffec8a", motif:"rainbow" },
};

export function drawRoomAtmosphere(ctx,id,cam,t,W,H,characterId){
 ctx.save();ctx.globalCompositeOperation="source-over";
 drawOdysseySectors(ctx,id,cam,t,W,H,characterId);
 if(id==="hub") hub(ctx,cam,t,W,H); else if(id==="beach") beach(ctx,cam,t,W,H); else if(id==="jungle") jungle(ctx,cam,t,W,H);
 else if(id==="cave") cave(ctx,cam,t,W,H); else if(id==="lab") lab(ctx,cam,t,W,H); else if(id==="ridge") ridge(ctx,cam,t,W,H);
 else if(id==="space") space(ctx,cam,t,W,H); else if(id==="reef") reef(ctx,cam,t,W,H); else if(id==="volcano") volcano(ctx,cam,t,W,H); else if(id==="boss") boss(ctx,cam,t,W,H);
 const roomSignature = {
   hub:"kilo", beach:"stitcho", jungle:"chispin", cave:"cat", lab:"dragon",
   ridge:"dino", space:"frita", reef:"pizza", volcano:"yomi", boss:"cuerno"
 }[id] || "kilo";
 drawCharacterOdyssey(ctx, id, characterId || roomSignature, roomSignature, cam, t, W, H);
 ctx.restore();
}
function hub(ctx,cam,t,W,H){ctx.globalAlpha=.25;ctx.strokeStyle="#ffe9ae";ctx.lineWidth=1.4;for(let i=0;i<9;i++){let x=w(i*240-cam.x*.18+t*.05,W+260)-130;ctx.beginPath();ctx.arc(x,H*.23+(i%3)*22,18+(i%4)*5,0,TAU);ctx.stroke();}vig(ctx,W,H,.12);}
function beach(ctx,cam,t,W,H){ctx.globalAlpha=.15;ctx.strokeStyle="#fff8df";ctx.lineWidth=1.5;for(let i=0;i<7;i++){let x=w(i*210-cam.x*.3+t*.42,W+220)-110,y=H*.60+i*22;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+60,y-8,x+120,y);ctx.stroke();}vig(ctx,W,H,.08);}
function jungle(ctx,cam,t,W,H){ctx.globalAlpha=.18;ctx.strokeStyle="#9bdc73";ctx.lineWidth=2;for(let i=0;i<8;i++){let x=w(i*190-cam.x*.32,W+240)-120;ctx.beginPath();ctx.moveTo(x,0);ctx.quadraticCurveTo(x+Math.sin(t*.02+i)*18,H*.18,x+40,H*.40);ctx.stroke();}ctx.globalAlpha=.12;ctx.fillStyle="#e7ffbf";for(let i=0;i<24;i++){let x=w(u(i+70)*W-cam.x*.22+t*.2,W),y=u(i+90)*H*.65;ctx.beginPath();ctx.arc(x,y,1.2+u(i+110)*1.6,0,TAU);ctx.fill();}vig(ctx,W,H,.18);}
function cave(ctx,cam,t,W,H){ctx.globalAlpha=.18;ctx.fillStyle="#5db9ff";for(let i=0;i<6;i++){let x=w(i*340-cam.x*.16,W+360)-180,h=H*(.12+(i%3)*.05);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+28,0);ctx.lineTo(x+12,h);ctx.closePath();ctx.fill();}ctx.globalAlpha=.16;ctx.strokeStyle="#a4e6ff";for(let i=0;i<7;i++){let x=w(i*260-cam.x*.25,W+300)-120,y=H*.72+(i%3)*18;ctx.beginPath();ctx.ellipse(x,y,45+(i%2)*20,12,0,0,TAU);ctx.stroke();}vig(ctx,W,H,.28);}
function lab(ctx,cam,t,W,H){ctx.globalAlpha=.08;ctx.strokeStyle="#67e8ff";ctx.lineWidth=1;for(let x=0;x<W;x+=70){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=52){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.globalAlpha=.18;ctx.lineWidth=2;for(let i=0;i<4;i++){let x=w(i*470-cam.x*.12,W+500)-250;ctx.beginPath();ctx.rect(x,H*.16,100,180);ctx.stroke();ctx.beginPath();ctx.arc(x+50,H*.25,34+Math.sin(t*.03+i)*6,0,TAU);ctx.stroke();}vig(ctx,W,H,.22);}
function ridge(ctx,cam,t,W,H){ctx.globalAlpha=.15;ctx.strokeStyle="#e5f5ff";ctx.lineWidth=2;for(let i=0;i<6;i++){let y=H*(.18+i*.09)+Math.sin(t*.01+i)*8;ctx.beginPath();ctx.moveTo(0,y);ctx.quadraticCurveTo(W*.5,y-24,W,y+6);ctx.stroke();}vig(ctx,W,H,.10);}
function space(ctx,cam,t,W,H){ctx.globalAlpha=.14;ctx.fillStyle="#9b8aff";ctx.beginPath();ctx.arc(W*.8,H*.2,H*.12,0,TAU);ctx.fill();ctx.globalAlpha=.34;ctx.fillStyle="#fff";for(let i=0;i<28;i++){let x=w(u(i+200)*W-cam.x*.05,W),y=u(i+230)*H*.7;ctx.fillRect(x,y,1.5+u(i+260)*2,1.5+u(i+270)*2);}vig(ctx,W,H,.18);}
function reef(ctx,cam,t,W,H){ctx.globalAlpha=.14;ctx.strokeStyle="#6aeaff";ctx.lineWidth=2;for(let i=0;i<7;i++){let x=w(i*220-cam.x*.2,W+240)-120;ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x+40,H*.65,x+10,H*.42);ctx.stroke();}vig(ctx,W,H,.18);}
function volcano(ctx,cam,t,W,H){ctx.globalAlpha=.14;ctx.fillStyle="#ff783d";for(let i=0;i<10;i++){let x=w(i*170-cam.x*.25+t*.18,W+220)-110,y=H*.8-u(i+300)*H*.46;ctx.beginPath();ctx.arc(x,y,2+u(i+320)*3,0,TAU);ctx.fill();}vig(ctx,W,H,.25);}
function boss(ctx,cam,t,W,H){ctx.globalAlpha=.16;ctx.strokeStyle="#ff657d";ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(W*.5,H*.54,W*.33,H*.23,0,0,TAU);ctx.stroke();ctx.globalAlpha=.16;ctx.strokeStyle="#ffd86a";for(let i=0;i<8;i++){let a=t*.006+i*TAU/8;ctx.beginPath();ctx.arc(W*.5,H*.54,Math.min(W,H)*(.18+.02*(i%3)),a,a+.45);ctx.stroke();}vig(ctx,W,H,.30);}


function roundedGlow(ctx,x,y,w,h,r,c1,c2,alpha=.26){
 const g=ctx.createLinearGradient(x,y,x+w,y+h);
 g.addColorStop(0,c1);g.addColorStop(1,c2);
 ctx.globalAlpha=alpha;ctx.fillStyle=g;
 ctx.beginPath();ctx.roundRect ? ctx.roundRect(x,y,w,h,r) : (ctx.rect(x,y,w,h));ctx.fill();
 ctx.globalAlpha=1;
}

function beam(ctx,x0,y0,x1,y1,c,alpha=.18,width=12){
 ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=c;ctx.lineWidth=width;ctx.lineCap="round";
 ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();ctx.restore();
}

function drawCharacterOdyssey(ctx,roomId,characterId,signatureId,cam,t,W,H){
 const theme=CHARACTER_THEMES[characterId]||CHARACTER_THEMES[signatureId]||CHARACTER_THEMES.kilo;
 const cx=W*.5;
 const horizon=H*.52;
 const pulse=.5+.5*Math.sin(t*.02);
 ctx.save();

 // Large architectural "sky object" for depth and identity, never a bitmap.
 if(theme.motif==="sun"){
   const sx=W*.78,sy=H*.16;
   const rg=ctx.createRadialGradient(sx,sy,8,sx,sy,260);
   rg.addColorStop(0,theme.c1+"cc");rg.addColorStop(.2,theme.c1+"55");rg.addColorStop(1,"transparent");
   ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
   for(let i=0;i<14;i++){const a=(i/14)*Math.PI*2+t*.001;beam(ctx,sx,sy,sx+Math.cos(a)*360,sy+Math.sin(a)*260,theme.c1,.035,18);}
 } else if(theme.motif==="stitches"){
   for(let i=0;i<7;i++){
     const x=(w(i*300-cam.x*.08+t*.2,W+320)-160),y=120+(i%3)*80;
     ctx.strokeStyle=theme.c1+"66";ctx.lineWidth=2;ctx.setLineDash([8,7]);
     ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+120,H*.52);ctx.stroke();ctx.setLineDash([]);
   }
 } else if(theme.motif==="spark"){
   for(let i=0;i<16;i++){
     const x=w(i*170-cam.x*.18+t*.35,W+180)-90;
     const y=110+u(i+600)*H*.5;
     ctx.strokeStyle=i%2?theme.c1:theme.c2;ctx.lineWidth=1.8;
     ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x,y-12);ctx.lineTo(x+8,y);ctx.lineTo(x,y+12);ctx.closePath();ctx.stroke();
   }
 } else if(theme.motif==="moon"){
   const mx=W*.76,my=H*.17;
   ctx.fillStyle=theme.c2+"55";ctx.beginPath();ctx.arc(mx,my,120,0,TAU);ctx.fill();
   ctx.fillStyle=theme.c2+"cc";ctx.beginPath();ctx.arc(mx,my,54,0,TAU);ctx.fill();
   ctx.fillStyle="rgba(4,6,16,.86)";ctx.beginPath();ctx.arc(mx+18,my-10,46,0,TAU);ctx.fill();
   for(let i=0;i<18;i++){const x=w(i*180-cam.x*.05+t*.05,W+200),y=u(i+700)*H*.46;ctx.fillStyle=theme.c1;ctx.globalAlpha=.25+.5*u(i+710);ctx.fillRect(x,y,2,2);}
   ctx.globalAlpha=1;
 } else if(theme.motif==="ember"){
   for(let i=0;i<26;i++){
     const x=w(i*110-cam.x*.22+t*(.12+i%3*.06),W+140)-70;
     const y=H*.78-u(i+800)*H*.62;
     ctx.fillStyle=i%3?theme.c1:theme.c2;ctx.globalAlpha=.12+.38*u(i+810);
     ctx.beginPath();ctx.arc(x,y,1.5+u(i+820)*3,0,TAU);ctx.fill();
   }
   ctx.globalAlpha=1;
 } else if(theme.motif==="fern"){
   ctx.globalAlpha=.22;
   for(let i=0;i<12;i++){
     const x=w(i*190-cam.x*.3,W+220)-100;
     const y=horizon+20+(i%4)*12;
     ctx.strokeStyle=i%2?theme.c1:theme.c2;ctx.lineWidth=2;
     ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+24,y-100,x+8,y-180);ctx.stroke();
   }
   ctx.globalAlpha=1;
 } else if(theme.motif==="fry"){
   for(let i=0;i<8;i++){
     const x=w(i*280-cam.x*.12+t*.15,W+300)-150;
     const y=H*.22+(i%3)*70;
     roundedGlow(ctx,x,y,90,30,15,theme.c1,theme.c2,.12);
     ctx.strokeStyle=theme.c1+"55";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+45,y+15,18+pulse*6,0,TAU);ctx.stroke();
   }
 } else if(theme.motif==="cheese"){
   const base=H*.32;
   for(let i=0;i<6;i++){
     const x=w(i*340-cam.x*.16+t*.08,W+360)-120;
     ctx.fillStyle=theme.c1+"30";ctx.beginPath();
     ctx.moveTo(x,base+80);ctx.lineTo(x+90,base-10);ctx.lineTo(x+180,base+80);ctx.closePath();ctx.fill();
     ctx.fillStyle=theme.c2+"55";
     for(let k=0;k<4;k++){ctx.beginPath();ctx.arc(x+60+k*28,base+34+(k%2)*18,5,0,TAU);ctx.fill();}
   }
 } else if(theme.motif==="ofuda"){
   for(let i=0;i<12;i++){
     const x=w(i*170-cam.x*.16+t*.04,W+200)-100;
     const y=130+u(i+900)*H*.42;
     ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*.01+i)*.18);
     ctx.fillStyle=theme.c1+"35";ctx.fillRect(-14,-24,28,48);
     ctx.strokeStyle=theme.c2+"88";ctx.lineWidth=1.5;ctx.strokeRect(-14,-24,28,48);
     ctx.strokeStyle=theme.c2+"66";ctx.beginPath();ctx.moveTo(-8,-12);ctx.lineTo(8,12);ctx.moveTo(8,-12);ctx.lineTo(-8,12);ctx.stroke();ctx.restore();
   }
 } else if(theme.motif==="rainbow"){
   const rx=W*.5,ry=H*.22;
   for(let i=0;i<7;i++){
     ctx.strokeStyle=[theme.c1,theme.c2,"#ff7aa2","#8fb8ff","#ffe66a","#8fe28e","#ffffff"][i];
     ctx.globalAlpha=.16;ctx.lineWidth=10;
     ctx.beginPath();ctx.arc(rx,ry+140,170+i*18,Math.PI,TAU);ctx.stroke();
   }
   ctx.globalAlpha=1;
 }

 // Character "home lane": a readable landmark on the ground that changes the room's identity.
 const laneY=H*.74;
 const lx=w(240-cam.x*.44+t*.03,W+W)-W*.18;
 ctx.globalAlpha=.18;
 ctx.strokeStyle=theme.c1;ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(lx,laneY);ctx.quadraticCurveTo(cx,laneY-60,lx+W*.65,laneY);ctx.stroke();
 ctx.globalAlpha=1;

 // room-specific monumental silhouette
 const monumentSeed=({hub:1,beach:2,jungle:3,cave:4,lab:5,ridge:6,space:7,reef:8,volcano:9,boss:10}[roomId]||1);
 const mw=220+monumentSeed*12, mh=130+(monumentSeed%4)*30;
 const mx=(W*(.18+.06*(monumentSeed%5))) - cam.x*.10;
 const my=horizon-30;
 ctx.save();ctx.globalAlpha=.12;ctx.fillStyle=theme.c2;
 ctx.beginPath();
 ctx.moveTo(mx,my+mh);ctx.lineTo(mx+mw*.2,my+20);ctx.lineTo(mx+mw*.5,my);
 ctx.lineTo(mx+mw*.78,my+34);ctx.lineTo(mx+mw,my+mh);ctx.closePath();ctx.fill();
 ctx.restore();

 // tiny ambient particles, seeded, stable, camera-aware.
 for(let i=0;i<26;i++){
   const x=w(u(i+1000)*W-cam.x*.22+t*(.06+u(i+1010)*.18),W+40);
   const y=u(i+1020)*H*.72+Math.sin(t*.015+i)*7;
   ctx.fillStyle=i%2?theme.c1:theme.c2;ctx.globalAlpha=.08+.22*u(i+1030);
   ctx.beginPath();ctx.arc(x,y,1.1+u(i+1040)*1.8,0,TAU);ctx.fill();
 }
 ctx.globalAlpha=1;
 ctx.restore();
}

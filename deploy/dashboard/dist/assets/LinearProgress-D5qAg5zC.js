import{B as e,Dt as t,H as n,S as r,Tt as i,V as a,bt as o,gt as s,h as c,ht as l,jt as u,k as d,m as f,p,vt as m,xt as h,yt as g}from"./Box-BCns6wJi.js";import{r as _}from"./IconButton-cuUuRm6J.js";function v(e){return a(`MuiLinearProgress`,e)}e(`MuiLinearProgress`,[`root`,`colorPrimary`,`colorSecondary`,`determinate`,`indeterminate`,`buffer`,`query`,`dashed`,`dashedColorPrimary`,`dashedColorSecondary`,`bar`,`barColorPrimary`,`barColorSecondary`,`bar1Indeterminate`,`bar1Determinate`,`bar1Buffer`,`bar2Indeterminate`,`bar2Buffer`]),g(),h();var y=u(t()),b=r(),x=i(),S=[`className`,`color`,`value`,`valueBuffer`,`variant`],C=e=>e,w,T,E,D,O,k,A=4,j=s(w||=C`
  0% {
    left: -35%;
    right: 100%;
  }

  60% {
    left: 100%;
    right: -90%;
  }

  100% {
    left: 100%;
    right: -90%;
  }
`),M=s(T||=C`
  0% {
    left: -200%;
    right: 100%;
  }

  60% {
    left: 107%;
    right: -8%;
  }

  100% {
    left: 107%;
    right: -8%;
  }
`),N=s(E||=C`
  0% {
    opacity: 1;
    background-position: 0 -23px;
  }

  60% {
    opacity: 0;
    background-position: 0 -23px;
  }

  100% {
    opacity: 1;
    background-position: -200px -23px;
  }
`),P=e=>{let{classes:t,variant:n,color:r}=e;return d({root:[`root`,`color${f(r)}`,n],dashed:[`dashed`,`dashedColor${f(r)}`],bar1:[`bar`,`barColor${f(r)}`,(n===`indeterminate`||n===`query`)&&`bar1Indeterminate`,n===`determinate`&&`bar1Determinate`,n===`buffer`&&`bar1Buffer`],bar2:[`bar`,n!==`buffer`&&`barColor${f(r)}`,n===`buffer`&&`color${f(r)}`,(n===`indeterminate`||n===`query`)&&`bar2Indeterminate`,n===`buffer`&&`bar2Buffer`]},v,t)},F=(e,t)=>t===`inherit`?`currentColor`:e.vars?e.vars.palette.LinearProgress[`${t}Bg`]:e.palette.mode===`light`?(0,b.lighten)(e.palette[t].main,.62):(0,b.darken)(e.palette[t].main,.5),I=c(`span`,{name:`MuiLinearProgress`,slot:`Root`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.root,t[`color${f(n.color)}`],t[n.variant]]}})(({ownerState:e,theme:t})=>o({position:`relative`,overflow:`hidden`,display:`block`,height:4,zIndex:0,"@media print":{colorAdjust:`exact`},backgroundColor:F(t,e.color)},e.color===`inherit`&&e.variant!==`buffer`&&{backgroundColor:`none`,"&::before":{content:`""`,position:`absolute`,left:0,top:0,right:0,bottom:0,backgroundColor:`currentColor`,opacity:.3}},e.variant===`buffer`&&{backgroundColor:`transparent`},e.variant===`query`&&{transform:`rotate(180deg)`})),L=c(`span`,{name:`MuiLinearProgress`,slot:`Dashed`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.dashed,t[`dashedColor${f(n.color)}`]]}})(({ownerState:e,theme:t})=>{let n=F(t,e.color);return o({position:`absolute`,marginTop:0,height:`100%`,width:`100%`},e.color===`inherit`&&{opacity:.3},{backgroundImage:`radial-gradient(${n} 0%, ${n} 16%, transparent 42%)`,backgroundSize:`10px 10px`,backgroundPosition:`0 -23px`})},l(D||=C`
    animation: ${0} 3s infinite linear;
  `,N)),R=c(`span`,{name:`MuiLinearProgress`,slot:`Bar1`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.bar,t[`barColor${f(n.color)}`],(n.variant===`indeterminate`||n.variant===`query`)&&t.bar1Indeterminate,n.variant===`determinate`&&t.bar1Determinate,n.variant===`buffer`&&t.bar1Buffer]}})(({ownerState:e,theme:t})=>o({width:`100%`,position:`absolute`,left:0,bottom:0,top:0,transition:`transform 0.2s linear`,transformOrigin:`left`,backgroundColor:e.color===`inherit`?`currentColor`:(t.vars||t).palette[e.color].main},e.variant===`determinate`&&{transition:`transform .${A}s linear`},e.variant===`buffer`&&{zIndex:1,transition:`transform .${A}s linear`}),({ownerState:e})=>(e.variant===`indeterminate`||e.variant===`query`)&&l(O||=C`
      width: auto;
      animation: ${0} 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
    `,j)),z=c(`span`,{name:`MuiLinearProgress`,slot:`Bar2`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.bar,t[`barColor${f(n.color)}`],(n.variant===`indeterminate`||n.variant===`query`)&&t.bar2Indeterminate,n.variant===`buffer`&&t.bar2Buffer]}})(({ownerState:e,theme:t})=>o({width:`100%`,position:`absolute`,left:0,bottom:0,top:0,transition:`transform 0.2s linear`,transformOrigin:`left`},e.variant!==`buffer`&&{backgroundColor:e.color===`inherit`?`currentColor`:(t.vars||t).palette[e.color].main},e.color===`inherit`&&{opacity:.3},e.variant===`buffer`&&{backgroundColor:F(t,e.color),transition:`transform .${A}s linear`}),({ownerState:e})=>(e.variant===`indeterminate`||e.variant===`query`)&&l(k||=C`
      width: auto;
      animation: ${0} 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite;
    `,M)),B=y.forwardRef(function(e,t){let r=p({props:e,name:`MuiLinearProgress`}),{className:i,color:a=`primary`,value:s,valueBuffer:c,variant:l=`indeterminate`}=r,u=m(r,S),d=o({},r,{color:a,variant:l}),f=P(d),h=_(),g={},v={bar1:{},bar2:{}};if((l===`determinate`||l===`buffer`)&&s!==void 0){g[`aria-valuenow`]=Math.round(s),g[`aria-valuemin`]=0,g[`aria-valuemax`]=100;let e=s-100;h&&(e=-e),v.bar1.transform=`translateX(${e}%)`}if(l===`buffer`&&c!==void 0){let e=(c||0)-100;h&&(e=-e),v.bar2.transform=`translateX(${e}%)`}return(0,x.jsxs)(I,o({className:n(f.root,i),ownerState:d,role:`progressbar`},g,{ref:t},u,{children:[l===`buffer`?(0,x.jsx)(L,{className:f.dashed,ownerState:d}):null,(0,x.jsx)(R,{className:f.bar1,ownerState:d,style:v.bar1}),l===`determinate`?null:(0,x.jsx)(z,{className:f.bar2,ownerState:d,style:v.bar2})]}))});export{B as t};
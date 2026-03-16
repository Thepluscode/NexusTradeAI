import{B as e,Dt as t,H as n,Tt as r,V as i,bt as a,gt as o,h as s,ht as c,jt as l,k as u,p as d,vt as f,xt as p,yt as m}from"./Box-BCns6wJi.js";import{R as h}from"./index-CbCpRwR2.js";function g(e){return String(e).match(/[\d.\-+]*\s*(.*)/)[1]||``}function _(e){return parseFloat(e)}function v(e){return i(`MuiSkeleton`,e)}e(`MuiSkeleton`,[`root`,`text`,`rectangular`,`rounded`,`circular`,`pulse`,`wave`,`withChildren`,`fitContent`,`heightAuto`]),m(),p();var y=l(t()),b=r(),x=[`animation`,`className`,`component`,`height`,`style`,`variant`,`width`],S=e=>e,C,w,T,E,D=e=>{let{classes:t,variant:n,animation:r,hasChildren:i,width:a,height:o}=e;return u({root:[`root`,n,r,i&&`withChildren`,i&&!a&&`fitContent`,i&&!o&&`heightAuto`]},v,t)},O=o(C||=S`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }

  100% {
    opacity: 1;
  }
`),k=o(w||=S`
  0% {
    transform: translateX(-100%);
  }

  50% {
    /* +0.5s of delay between each loop */
    transform: translateX(100%);
  }

  100% {
    transform: translateX(100%);
  }
`),A=s(`span`,{name:`MuiSkeleton`,slot:`Root`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.root,t[n.variant],n.animation!==!1&&t[n.animation],n.hasChildren&&t.withChildren,n.hasChildren&&!n.width&&t.fitContent,n.hasChildren&&!n.height&&t.heightAuto]}})(({theme:e,ownerState:t})=>{let n=g(e.shape.borderRadius)||`px`,r=_(e.shape.borderRadius);return a({display:`block`,backgroundColor:e.vars?e.vars.palette.Skeleton.bg:h(e.palette.text.primary,e.palette.mode===`light`?.11:.13),height:`1.2em`},t.variant===`text`&&{marginTop:0,marginBottom:0,height:`auto`,transformOrigin:`0 55%`,transform:`scale(1, 0.60)`,borderRadius:`${r}${n}/${Math.round(r/.6*10)/10}${n}`,"&:empty:before":{content:`"\\00a0"`}},t.variant===`circular`&&{borderRadius:`50%`},t.variant===`rounded`&&{borderRadius:(e.vars||e).shape.borderRadius},t.hasChildren&&{"& > *":{visibility:`hidden`}},t.hasChildren&&!t.width&&{maxWidth:`fit-content`},t.hasChildren&&!t.height&&{height:`auto`})},({ownerState:e})=>e.animation===`pulse`&&c(T||=S`
      animation: ${0} 2s ease-in-out 0.5s infinite;
    `,O),({ownerState:e,theme:t})=>e.animation===`wave`&&c(E||=S`
      position: relative;
      overflow: hidden;

      /* Fix bug in Safari https://bugs.webkit.org/show_bug.cgi?id=68196 */
      -webkit-mask-image: -webkit-radial-gradient(white, black);

      &::after {
        animation: ${0} 2s linear 0.5s infinite;
        background: linear-gradient(
          90deg,
          transparent,
          ${0},
          transparent
        );
        content: '';
        position: absolute;
        transform: translateX(-100%); /* Avoid flash during server-side hydration */
        bottom: 0;
        left: 0;
        right: 0;
        top: 0;
      }
    `,k,(t.vars||t).palette.action.hover)),j=y.forwardRef(function(e,t){let r=d({props:e,name:`MuiSkeleton`}),{animation:i=`pulse`,className:o,component:s=`span`,height:c,style:l,variant:u=`text`,width:p}=r,m=f(r,x),h=a({},r,{animation:i,component:s,variant:u,hasChildren:!!m.children});return(0,b.jsx)(A,a({as:s,ref:t,className:n(D(h).root,o),ownerState:h},m,{style:a({width:p,height:c},l)}))});export{j as t};
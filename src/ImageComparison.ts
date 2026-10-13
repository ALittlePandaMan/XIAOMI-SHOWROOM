export interface PixelImage {width:number;height:number;data:ArrayLike<number>}
export interface ImageRegion {name:string;x:number;y:number;width:number;height:number}
/** Local 8x8 RGB SSIM; chromatic errors cannot hide in a luminance-only average. */
export function compareImages(a:PixelImage,b:PixelImage,region?:ImageRegion){
 if(a.width!==b.width||a.height!==b.height||a.data.length!==b.data.length)throw new Error('Comparison requires identical drawing-buffer dimensions');
 const left=Math.max(0,Math.floor(region?.x??0)),top=Math.max(0,Math.floor(region?.y??0)),right=Math.min(a.width,Math.ceil(left+(region?.width??a.width))),bottom=Math.min(a.height,Math.ceil(top+(region?.height??a.height)));
 let weighted=0,pixels=0,maxDifference=0,changed=0;
 const c1=(.01*255)**2,c2=(.03*255)**2;
 for(let y=top;y<bottom;y+=8)for(let x=left;x<right;x+=8){
  const n=(Math.min(x+8,right)-x)*(Math.min(y+8,bottom)-y);let tile=0;
  for(let channel=0;channel<3;channel++){
   let sa=0,sb=0,saa=0,sbb=0,sab=0;
   for(let py=y;py<Math.min(y+8,bottom);py++)for(let px=x;px<Math.min(x+8,right);px++){
    const i=(py*a.width+px)*4+channel,av=a.data[i],bv=b.data[i];sa+=av;sb+=bv;saa+=av*av;sbb+=bv*bv;sab+=av*bv;maxDifference=Math.max(maxDifference,Math.abs(av-bv));
    if(channel===0&&(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2]))changed++;
   }
   const ma=sa/n,mb=sb/n,va=Math.max(0,saa/n-ma*ma),vb=Math.max(0,sbb/n-mb*mb),cov=sab/n-ma*mb;
   tile+=((2*ma*mb+c1)*(2*cov+c2))/((ma*ma+mb*mb+c1)*(va+vb+c2));
  }
  weighted+=tile/3*n;pixels+=n;
 }
 return {ssim:pixels?weighted/pixels:1,pixels,changedPixels:changed,maxChannelDifference:maxDifference};
}

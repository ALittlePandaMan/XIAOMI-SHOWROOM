/** Compress transport bytes only. The decoded half-float texels are unchanged. */
export async function loadLosslessBinary(rawUrl:string,compressedUrl:string){
 if(typeof DecompressionStream!=='undefined'){
  try{
   const response=await fetch(compressedUrl);
   if(response.ok&&!response.headers.get('content-type')?.includes('text/html')){
    const buffer=await response.arrayBuffer(),magic=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength));
    // Some static hosts set Content-Encoding:gzip and the browser has already
    // decoded the response. Avoid decompressing such a payload twice.
    if(magic[0]===0x1f&&magic[1]===0x8b){
     const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
     return await new Response(stream).arrayBuffer();
    }
    return buffer;
   }
  }catch{/* Older deployments/browsers can still load the original bytes. */}
 }
 const response=await fetch(rawUrl);
 if(!response.ok)throw new Error('展厅环境载入失败');
 return response.arrayBuffer();
}

// Only the in-memory card preview is resized. Stored originals stay untouched.
export async function photoThumbnail(blob){
  let bitmap;
  try{
    bitmap=await createImageBitmap(blob,{resizeWidth:480,resizeQuality:'medium'});
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    canvas.getContext('2d').drawImage(bitmap,0,0);
    return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/jpeg',0.8));
  }catch{return blob;}
  finally{bitmap?.close();}
}

// Called at upload time only. Never replace or return the original as a thumbnail.
export async function photoThumbnail(blob){
  let bitmap;
  try{
    bitmap=await createImageBitmap(blob);
    const scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const drawing=canvas.getContext('2d');
    drawing.fillStyle='#fff';drawing.fillRect(0,0,canvas.width,canvas.height);
    drawing.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('縮圖無法建立，請重新上傳照片。')),'image/jpeg',0.8));
  }catch(error){throw Error('縮圖建立失敗，照片尚未新增。'+(error.message||''));}
  finally{bitmap?.close();}
}

const TIANAPI_URL='https://apis.tianapi.com/joke/index';

export default async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({message:'Method not allowed'});
  const apiKey=process.env.TIANAPI_KEY;
  if(!apiKey)return response.status(503).json({message:'TIANAPI_KEY is not configured'});
  try{
    const upstream=await fetch(`${TIANAPI_URL}?key=${encodeURIComponent(apiKey)}&num=1`,{headers:{accept:'application/json'}});
    const payload=await upstream.json();
    if(!upstream.ok||payload?.code!==200)return response.status(502).json({message:payload?.msg||'TianAPI request failed'});
    const result=payload.result||{};
    const item=Array.isArray(result.list)?result.list[0]:result;
    if(!item?.content)return response.status(502).json({message:'TianAPI returned no joke'});
    response.setHeader('Cache-Control','no-store');
    return response.status(200).json({title:item.title||'今日笑話',content:item.content,sourceRef:String(item.id||'')});
  }catch(error){
    return response.status(502).json({message:'Unable to reach TianAPI'});
  }
}

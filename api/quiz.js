export default async function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({message:'Method not allowed'});
  const apiKey=process.env.TIANAPI_KEY;
  if(!apiKey)return response.status(503).json({message:'TianAPI key is not configured'});
  try{
    const upstream=await fetch(`https://apis.tianapi.com/baiketiku/index?key=${encodeURIComponent(apiKey)}`,{headers:{accept:'application/json'}});
    const data=await upstream.json();
    if(!upstream.ok||data?.code!==200||!data?.result)throw new Error(data?.msg||`TianAPI ${upstream.status}`);
    const item=data.result,answer=String(item.answer||'').trim().toUpperCase();
    if(!item.title||!['A','B','C','D'].includes(answer))throw new Error('Invalid quiz response');
    response.setHeader('Cache-Control','no-store');
    return response.status(200).json({
      type:'multiple-choice',question:item.title,
      options:{A:item.answerA||'',B:item.answerB||'',C:item.answerC||'',D:item.answerD||''},
      answer,analytic:item.analytic||'',source:'tianapi',sourceRef:''
    });
  }catch(error){return response.status(502).json({message:'Unable to fetch quiz',detail:error.message});}
}

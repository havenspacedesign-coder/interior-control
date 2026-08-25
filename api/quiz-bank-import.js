const FIREBASE_PROJECT_ID='have000';
const FIREBASE_WEB_API_KEY='AIzaSyA6W_C2H84heiVwDe_a6ElMwuEjvbR0aRo';
const FIRESTORE_ROOT=`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const BLOCKED_TERMS=['politic','politics','election','president','religion','religious','god','jesus','adult','sex','porn','weapon','war','murder','blood','gore','violence'];

function htmlDecode(value=''){return String(value).replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function hash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
function normalise(value=''){return htmlDecode(value).toLowerCase().replace(/<[^>]*>/g,' ').replace(/[^\p{L}\p{N}]/gu,'').trim();}
function isSafeCandidate(item){const text=normalise(`${item.question} ${item.correctAnswer} ${(item.incorrectAnswers||[]).join(' ')}`);if(!item.question||!item.correctAnswer||!Array.isArray(item.incorrectAnswers)||item.incorrectAnswers.length!==3)return false;if(text.length<12||text.length>500)return false;return !BLOCKED_TERMS.some(term=>text.includes(term));}
function firestoreString(value){return{stringValue:String(value??'')}}
function firestoreBool(value){return{booleanValue:!!value}}
function firestoreFields(item){return{question:firestoreString(item.question),options:{mapValue:{fields:{A:firestoreString(item.options.A),B:firestoreString(item.options.B),C:firestoreString(item.options.C),D:firestoreString(item.options.D)}}},answer:firestoreString(item.answer),analytic:firestoreString(item.analytic||''),category:firestoreString(item.category||'一般常識'),difficulty:firestoreString(item.difficulty||'medium'),source:firestoreString(item.source),sourceId:firestoreString(item.sourceId||''),enabled:firestoreBool(true),createdBy:firestoreString(item.createdBy),createdAt:{timestampValue:new Date().toISOString()}}}
function fieldValue(document,name){return document?.fields?.[name]?.stringValue||'';}

async function authenticateManager(request){
  const token=String(request.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('請先登入後再匯入題庫。');
  const lookup=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token})});
  const account=await lookup.json();const uid=account?.users?.[0]?.localId;if(!lookup.ok||!uid)throw new Error('登入驗證已失效，請重新登入。');
  const member=await fetch(`${FIRESTORE_ROOT}/members/${encodeURIComponent(uid)}`,{headers:{authorization:`Bearer ${token}`}});
  const memberData=await member.json();if(!member.ok||fieldValue(memberData,'role')!=='manager')throw new Error('只有管理員可以匯入題庫。');
  return{token,uid};
}
async function fetchTriviaCandidates(){
  const [trivia,openTdb]=await Promise.all([
    fetch('https://the-trivia-api.com/v2/questions?limit=30&types=multiple').then(r=>r.ok?r.json():[]),
    fetch('https://opentdb.com/api.php?amount=30&type=multiple').then(r=>r.ok?r.json():{results:[]})
  ]);
  const fromTrivia=(Array.isArray(trivia)?trivia:[]).map(item=>({source:'the-trivia-api',sourceId:item.id||hash(item.question||''),question:htmlDecode(item.question),correctAnswer:htmlDecode(item.correctAnswer),incorrectAnswers:(item.incorrectAnswers||[]).map(htmlDecode),category:item.category||'',difficulty:item.difficulty||'medium'}));
  const fromOpenTdb=(openTdb?.results||[]).map(item=>({source:'open-trivia-db',sourceId:hash(`${item.category}|${item.question}|${item.correct_answer}`),question:htmlDecode(item.question),correctAnswer:htmlDecode(item.correct_answer),incorrectAnswers:(item.incorrect_answers||[]).map(htmlDecode),category:item.category||'',difficulty:item.difficulty||'medium'}));
  return [...fromTrivia,...fromOpenTdb].filter(isSafeCandidate);
}
async function translateCandidates(candidates,batchSize){
  const prompt=`你是台灣公司內部輕量每日猜題的內容編輯。請從下列英文四選一候選題中，最多保留 ${batchSize} 題，翻譯成自然的台灣繁體中文。必須排除政治、宗教爭議、成人、暴力血腥、答案易隨年份改變、太冷門、題意或答案有爭議的題目；不要自行捏造事實。每一題必須有清楚的四個不同選項，答案只能是 A、B、C 或 D。保留 source、sourceId、category、difficulty；category 請翻成簡短台灣繁體中文，difficulty 只可為 easy、medium、hard。analytic 用一句簡短台灣繁體中文說明答案；沒有把握就不要保留。請只輸出一個有效的 JSON object，格式為 {"items":[...]}; 不要輸出 Markdown 或其他文字。\n\n候選資料：\n${JSON.stringify(candidates)}`;
  const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.QUIZ_TRANSLATION_MODEL||'gpt-4o-mini',store:false,input:prompt,text:{format:{type:'json_object'}},max_output_tokens:6000})});
  const data=await ai.json();if(!ai.ok)throw new Error(data?.error?.message||'翻譯服務暫時無法使用');
  const text=data.output_text||data.output?.flatMap(item=>item.content||[]).find(part=>part.type==='output_text')?.text||'';
  let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('翻譯結果格式無法讀取，請再試一次。');}
  const raw=Array.isArray(parsed)?parsed:(parsed.items||parsed.questions||[]);const originals=new Map(candidates.map(item=>[`${item.source}|${item.sourceId}`,item]));
  return raw.filter(item=>item&&item.question&&item.options&&['A','B','C','D'].includes(item.answer)&&['A','B','C','D'].every(letter=>String(item.options[letter]||'').trim())).map(item=>{
    const original=originals.get(`${String(item.source||'')}|${String(item.sourceId||'')}`);if(!original)return null;
    return{...item,question:String(item.question).trim(),options:{A:String(item.options.A).trim(),B:String(item.options.B).trim(),C:String(item.options.C).trim(),D:String(item.options.D).trim()},answer:String(item.answer).trim(),analytic:String(item.analytic||'').trim(),category:String(item.category||'一般常識').trim(),difficulty:['easy','medium','hard'].includes(item.difficulty)?item.difficulty:'medium',source:original.source,sourceId:original.sourceId};
  }).filter(Boolean);
}
async function listExistingQuestions(token){
  const response=await fetch(`${FIRESTORE_ROOT}/quizBank?pageSize=3000&mask.fieldPaths=question`,{headers:{authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error('無法讀取現有題庫。');return(data.documents||[]).map(item=>normalise(fieldValue(item,'question'))).filter(Boolean);
}
async function writeBankItems(token,uid,items){
  if(!items.length)return;
  const writes=items.map(item=>{const id=`quiz_${item.source.replace(/[^a-z0-9]+/gi,'_')}_${hash(`${item.sourceId}|${item.question}`)}`;return{update:{name:`projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/quizBank/${id}`,fields:firestoreFields({...item,createdBy:uid})}};});
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({writes})});if(!response.ok){const error=await response.json();throw new Error(error?.error?.message||'題庫寫入失敗');}
}

export default async function handler(request,response){
  if(request.method!=='POST')return response.status(405).json({message:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY)return response.status(503).json({message:'翻譯服務尚未設定。'});
  try{
    const {token,uid}=await authenticateManager(request);const batchSize=Math.max(3,Math.min(15,Number(request.body?.batchSize)||10));
    const existing=new Set(await listExistingQuestions(token));const candidates=(await fetchTriviaCandidates()).filter(item=>!existing.has(normalise(item.question)));
    const translated=await translateCandidates(candidates,batchSize);const unique=[];const seen=new Set(existing);
    for(const item of translated){const key=normalise(item.question);if(!key||seen.has(key))continue;seen.add(key);unique.push(item);if(unique.length>=batchSize)break;}
    await writeBankItems(token,uid,unique);return response.status(200).json({added:unique.length,total:existing.size+unique.length});
  }catch(error){console.error('quiz bank import failed',error);return response.status(400).json({message:error.message||'題庫匯入失敗'});}
}

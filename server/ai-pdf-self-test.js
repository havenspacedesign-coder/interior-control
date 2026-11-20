import {inspectPdfEvidence,loadEvidenceParser,locateCitation} from './ai-case-evidence.js';

const sampleText=['PDF self-test page one','PDF self-test page two'];
const source={kind:'quote',fileId:'synthetic-pdf-self-test',name:'synthetic-two-pages.pdf'};
const failures={
  PDF_CANVAS_INIT_FAILED:['canvas','Canvas 原生套件無法載入或建立畫布。'],
  PDF_DOMMATRIX_TEST_FAILED:['domMatrix','DOMMatrix 無法建立或完成平移運算。'],
  PARSER_LOAD_FAILED:['pdfjs','PDF.js 模組或資源無法初始化。'],
  PDF_WORKER_INIT_FAILED:['worker','PDF.js Worker 檔案或訊息處理器無法初始化。'],
  PDF_OPEN_FAILED:['open','無法開啟內建測試 PDF。'],
  INDEX_TIMEOUT:['open','PDF 解析逾時。'],
  PAGE_TEXT_FAILED:['text','無法擷取測試頁的文字。'],
  NO_TEXT_LAYER:['text','測試頁沒有擷取到文字。'],
};
const errorNames=new Set(['Error','TypeError','ReferenceError','RangeError','SyntaxError','AbortError','TimeoutError',
  'InvalidPDFException','MissingPDFException','PasswordException','UnknownErrorException']);
const errorName=value=>errorNames.has(value)?value:'Error';

async function makeSample(){
  const {PDFDocument,StandardFonts}=await import('pdf-lib');
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const text of sampleText)pdf.addPage([300,160]).drawText(text,{x:20,y:80,size:12,font});
  return pdf.save();
}

export async function runPdfParserSelfTest(loadParser=loadEvidenceParser){
  const passed=[];
  const fail=(stage,code,reason,name='Error',page=null)=>({ok:false,passed,error:{stage,code,name,reason,page}});
  let bytes;
  try{bytes=await makeSample();}
  catch(error){return fail('fixture','PDF_FIXTURE_FAILED','無法建立內建測試 PDF。',errorName(error.name));}

  const citations=sampleText.map((_,index)=>({source:source.kind,page:index+1}));
  let initializationError;
  let index;
  try{
    index=await inspectPdfEvidence(new Map([[source.kind,bytes]]),{work:[{citations}]},[source],async()=>{
      try{return await loadParser(stage=>passed.push(stage));}
      catch(error){initializationError=error.cause??error;throw error;}
    });
  }catch(error){
    return fail('index','PDF_INDEX_FAILED','執行 PDF 索引時發生非預期錯誤。',errorName(error.name));
  }
  const document=index.get(source.kind);
  if(document)passed.push('open');
  const diagnostic=index.diagnostics[0];
  if(diagnostic){
    let [stage,reason]=failures[diagnostic.code]??['index','無法建立測試 PDF 的證據索引。'];
    if(diagnostic.code==='INDEX_TIMEOUT'&&diagnostic.page!==null)stage='text';
    if(diagnostic.code==='PARSER_LOAD_FAILED'&&passed.includes('worker')){
      stage='assets';reason='PDF.js 已載入，但無法定位部署的字型資源。';
    }
    const safeCode=/^(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ERR_DLOPEN_FAILED)$/.test(diagnostic.errorType)
      ?'（'+diagnostic.errorType+'）':'';
    return fail(stage,diagnostic.code,reason+safeCode,errorName(initializationError?.name??diagnostic.errorType),diagnostic.page);
  }
  if(!document)return fail('open','PDF_OPEN_FAILED','索引未回傳已開啟的測試 PDF。');
  if(document.pageCount!==sampleText.length||
    citations.some(ref=>locateCitation(ref,index)?.sourceId!==source.fileId)||
    locateCitation({source:source.kind,page:sampleText.length+1},index)!==null){
    return fail('pages','PDF_PAGE_INDEX_INCORRECT','頁數或來源頁碼與內建測試 PDF 不符。');
  }
  const extracted=citations.map(({page})=>({page,text:document.texts.get(page)??null}));
  if(extracted.some(item=>!item.text))return fail('text','PDF_TEXT_MISSING','測試頁沒有擷取到文字。');
  passed.push('text');
  const mismatch=extracted.find(({page,text})=>text!==sampleText[page-1]);
  if(mismatch)return fail('pages','PDF_PAGE_TEXT_MISMATCH','擷取的文字與該頁的預期標記不符。','Error',mismatch.page);
  passed.push('pages');
  return {ok:true,passed,pageCount:document.pageCount,pages:extracted};
}

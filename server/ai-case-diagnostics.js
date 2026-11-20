import {SUMMARY_SECTIONS} from '../app/features/ai-database/summary-format.js';

const structuredKeys=['quotedTotal','changeNet','workItems','materials','spaces'];
const count=value=>Array.isArray(value)?value.length:Number(value!=null);

export function recordParsedAnalysis(trace,parsed){
  trace.json={state:'parsed',
    sections:Object.fromEntries(Object.keys(SUMMARY_SECTIONS).map(key=>[key,count(parsed?.[key])])),
    knowledge:Object.fromEntries(structuredKeys.map(key=>[key,count(parsed?.knowledge?.[key])])),
  };
}

export function traceVerification(trace,group){
  return (section,index,row,reason)=>trace.validation.push({
    group,section,item:index+1,
    status:row?.verificationStatus??'excluded',reason:reason??null,
    ...(row?.citationChecks?.length?{citations:row.citationChecks}:{}),
    ...(row?.unverifiedFields?.length?{unverifiedFields:row.unverifiedFields}:{}),
  });
}

export function finishValidation(trace){
  const counts={};
  for(const {group,section,status} of trace.validation){
    const key=group+'.'+section;
    const entry=counts[key]??={input:0,retained:0,verified:0,pending:0,excluded:0};
    entry.input++;
    if(status==='excluded')entry.excluded++;
    else{
      entry.retained++;
      if(status==='verified')entry.verified++;
      else entry.pending++;
    }
  }
  trace.validationCounts=counts;
}

// Runtime log contains only run ID, stage states and numeric counts. The run document holds details.
export function logAnalysisTrace(trace){
  console.info('ai_case_analysis',JSON.stringify({
    runId:trace.runId,openAI:trace.openAI,json:trace.json,
    pdf:trace.pdf.map(file=>({kind:file.source,open:file.open,requested:file.requestedPages.length,
      extracted:file.extractedPages.length,errors:[...new Set(file.diagnostics.map(row=>row.code))]})),
    validation:trace.validationCounts,firestore:trace.firestore,
  }));
}

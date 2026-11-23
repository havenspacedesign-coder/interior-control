const headerNames=[
  ['index',/^(?:項次|編號|no\.?|#)$/u],
  ['item',/^(?:品名|工項|工程項目|項目|item)$/u],
  ['description',/^(?:說明|規格|內容|description|specification)$/u],
  ['quantity',/^(?:數量|quantity|qty)$/u],
  ['unit',/^(?:單位|unit)$/u],
  ['unitPrice',/^(?:單價|unit price)(?: ?\((?:nt\$|twd|新臺幣|新台幣|元)\))?$/u],
  ['amount',/^(?:金額|小計|複價|合價|amount|subtotal)(?: ?\((?:nt\$|twd|新臺幣|新台幣|元)\))?$/u],
];
const currency=/^(?:nt\$|twd|新臺幣|新台幣)|(?:nt\$|twd|新臺幣|新台幣|元)$/u;
const decimal=/^[+-]?\d+(?:\.\d+)?$/u;
const twd=text=>currency.test(text)?'TWD':null;

export function readEvidenceTableRows(rows,normalize){
  let columns=null,previous=null;
  const records=[];
  for(const cells of rows){
    const header=cells.map(cell=>({...cell,field:headerNames.find(([,pattern])=>pattern.test(normalize(cell.text)))?.[0]}));
    const fields=new Set(header.map(({field})=>field));
    if(!fields.has(undefined)&&fields.size===header.length&&
      ['item','quantity','unit','unitPrice','amount'].every(field=>fields.has(field))){
      columns=header;
      previous=null;
      continue;
    }
    if(!columns)continue;
    const mapped=new Map();
    for(const cell of cells){
      const index=columns.findLastIndex(column=>column.x<=cell.x+3);
      const field=columns[index]?.field;
      if(!field||cell.end>(columns[index+1]?.x??Infinity)+3){mapped.clear();break;}
      mapped.set(field,[...(mapped.get(field)??[]),cell.text]);
    }
    const values=Object.fromEntries([...mapped].map(([key,text])=>[key,text.join(' ')]));
    if(previous&&mapped.size===1&&values.description&&previous.y-cells[0].y<=18){
      previous.description=[previous.description,values.description].filter(Boolean).join(' ');
      previous.quote+='\n'+values.description;
      previous.y=cells[0].y;
      continue;
    }
    const quantity=normalize(values.quantity??'');
    const unitPrice=normalize(values.unitPrice??'').replace(currency,'').trim();
    const amountText=normalize(values.amount??'');
    const amount=amountText.replace(currency,'').trim();
    if(!values.item||!values.unit||!decimal.test(quantity)||!decimal.test(unitPrice)||!decimal.test(amount)){
      columns=null;
      previous=null;
      continue;
    }
    const amountHeader=columns.find(({field})=>field==='amount').text;
    previous={item:values.item,description:values.description??'',quantity,unit:values.unit,
      amount,currency:twd(amountText)??twd(normalize(amountHeader).replace(/[()]/gu,'')),
      quote:cells.map(({text})=>text).join(' '),y:cells[0].y};
    records.push(previous);
  }
  return records;
}

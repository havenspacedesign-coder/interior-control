// New category types opt into their own editor; they never inherit a case form.
export const CATEGORY_MODULES={cases:{label:'案件資料庫',supportsCases:true},blank:{label:'尚未建立內容模組',supportsCases:false}};
export function categoryModule(category){return CATEGORY_MODULES[category?.moduleType]||CATEGORY_MODULES.blank;}

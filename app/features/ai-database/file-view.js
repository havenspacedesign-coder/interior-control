import {esc,size,date} from './ui-utils.js';

export function renderFile(file){
  const photo=file.kind==='photo';
  return `<article class="aidb-file${photo?' aidb-photo-card':''}">
    ${photo?`<div class="aidb-photo-media">
      <button class="aidb-photo-preview" type="button" data-action="file.open" data-id="${esc(file.id)}" aria-label="預覽照片：${esc(file.name)}">
        <img class="aidb-photo" data-photo-id="${esc(file.id)}" loading="lazy" decoding="async" width="480" height="360" alt="${esc(file.caption||file.name)}">
      </button>
      <button class="aidb-photo-delete" type="button" data-action="file.delete" data-id="${esc(file.id)}" aria-label="刪除照片：${esc(file.name)}" title="刪除照片">×</button>
    </div>`:''}
    <div class="aidb-file-info">
      <strong>${esc(file.name)}</strong>
      ${photo?'':`<div class="aidb-muted aidb-small">${size(file.size)} · ${date(file.uploadedAt)}</div>`}
      ${photo?`<label class="aidb-caption">
        <textarea maxlength="2000" rows="4" data-caption="${esc(file.id)}" aria-label="照片備註說明" placeholder="照片備註說明" data-caption-editing="false">${esc(file.caption)}</textarea>
      </label>`:''}
    </div>
    ${photo?'':`<div class="aidb-actions">
      <button class="btn btn-sm" type="button" data-action="file.open" data-id="${esc(file.id)}">預覽</button>
      <button class="btn btn-sm btn-danger" type="button" data-action="file.delete" data-id="${esc(file.id)}">刪除</button>
    </div>`}
  </article>`;
}

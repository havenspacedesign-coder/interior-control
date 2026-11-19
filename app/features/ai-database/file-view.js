import {esc,size,date} from './ui-utils.js';

export function renderFile(file){
  const photo=file.kind==='photo';
  return `<article class="aidb-file${photo?' aidb-photo-card':''}">
    ${photo?`<img class="aidb-photo" data-photo-id="${esc(file.id)}" alt="${esc(file.caption||file.name)}">`:''}
    <div class="aidb-file-info">
      <strong>${esc(file.name)}</strong>
      ${photo?'':`<div class="aidb-muted aidb-small">${size(file.size)} · ${date(file.uploadedAt)}</div>`}
      ${photo?`<label class="aidb-caption">照片備註說明
        <input maxlength="2000" data-caption="${esc(file.id)}" value="${esc(file.caption)}" placeholder="雙擊輸入說明" readonly>
      </label>`:''}
    </div>
    <div class="aidb-actions">
      <button class="btn btn-sm" type="button" data-action="file.open" data-id="${esc(file.id)}">預覽</button>
      <button class="btn btn-sm btn-danger" type="button" data-action="file.delete" data-id="${esc(file.id)}">刪除</button>
    </div>
  </article>`;
}

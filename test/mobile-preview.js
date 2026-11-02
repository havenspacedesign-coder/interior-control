// Test-only viewport wrapper. The app still runs at the same single test entry.
const appUrl = new URL(window.location.href);
const showPhone = appUrl.searchParams.get('preview') === 'mobile' && window.self === window.top;

if (!showPhone) {
  await import('../app/loader.js');
} else {
  appUrl.searchParams.delete('preview');
  document.title = '手機直向預覽｜測試環境';
  const style = document.createElement('style');
  style.textContent = `
    html, body { margin:0; min-height:100%; background:#ecebea; }
    body { padding:24px 16px; box-sizing:border-box; overflow:auto; }
    .phone-preview { width:414px; margin:0 auto; color:#333; font:14px system-ui,sans-serif; }
    .phone-preview-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .phone-preview-header small { display:block; margin-top:4px; color:#666; }
    .phone-preview-header a { color:#5547b5; text-decoration:underline; white-space:nowrap; }
    .phone-preview-shell { padding:12px; border-radius:36px; background:#242424; box-shadow:0 12px 32px #0002; }
    .phone-preview iframe { display:block; width:390px; height:844px; border:0; border-radius:24px; background:white; }
    .phone-preview-hint { margin:12px 0 0; color:#666; font-size:12px; line-height:1.6; }
  `;
  document.head.appendChild(style);
  const preview = document.createElement('main');
  preview.className = 'phone-preview';
  preview.innerHTML = `
    <header class="phone-preview-header">
      <div><strong>手機直向預覽</strong><small>390 × 844 px · 本機測試</small></div>
      <a>切回一般預覽</a>
    </header>
    <div class="phone-preview-shell"><iframe title="手機直向測試網頁" width="390" height="844"></iframe></div>
    <p class="phone-preview-hint">在手機框內捲動及操作。這是手機尺寸預覽，不包含真實手機的觸控與鍵盤模擬。</p>
  `;
  preview.querySelector('a').href = appUrl.href;
  preview.querySelector('iframe').src = appUrl.href;
  document.body.replaceChildren(preview);
}

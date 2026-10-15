async function boot() {
  if (!isSecureContext || !('serviceWorker' in navigator) || !('DecompressionStream' in window) || !navigator.storage?.getDirectory) {
    throw new Error('このブラウザは対応していません。最新版のPC版Chrome / Edgeの通常ウィンドウで開いてください。');
  }
  await navigator.serviceWorker.register('./service-worker.js', {scope: './', updateViaCache: 'none'});
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
  }
  if (!crossOriginIsolated) {
    const key = 'tanoshi-isolation-reload';
    if (sessionStorage.getItem(key)) throw new Error('起動に必要な設定を有効にできませんでした。他のゲームタブを閉じて、ブラウザを再起動してください。');
    sessionStorage.setItem(key, '1');
    location.reload();
    return;
  }
  sessionStorage.removeItem('tanoshi-isolation-reload');
  sessionStorage.setItem('nostalgist status for mkxp-z @ ' + location.href, 'ready');
  await navigator.storage.getDirectory();
  await import('./assets/player.js');
}
boot().catch(error => {
  document.getElementById('status').textContent = '起動できませんでした。';
  const output = document.getElementById('error');
  output.style.display = 'block';
  output.textContent = error.message + '\nページを再読み込みしてお試しください。';
  console.error(error);
});

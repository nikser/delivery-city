const STORAGE_KEY = 'ad_banner_closed'

export function showAdBanner(): void {
  // Don't show if dismissed in this session
  if (sessionStorage.getItem(STORAGE_KEY)) return

  if (document.getElementById('ad-banner')) return

  const banner = document.createElement('div')
  banner.id = 'ad-banner'
  banner.innerHTML = `
    <div id="ad-banner-inner">
      <!-- ═══════════════════════════════════════════════════════════
           GOOGLE ADSENSE — замени этот блок на свой код
           1. Зарегистрируй сайт на https://adsense.google.com
           2. Создай рекламный блок (тип: «Баннер», 728×90 или адаптивный)
           3. Вставь полученный <script> и <ins> вместо заглушки ниже
      ═══════════════════════════════════════════════════════════ -->

      <!-- ЗАГЛУШКА — удали после подключения AdSense -->
      <div id="ad-placeholder">
        <span>[ Реклама · 728×90 · Google AdSense ]</span>
      </div>

      <!-- ADSENSE БЛОК — раскомментируй и вставь свои данные
      <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
           data-ad-slot="XXXXXXXXXX"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      -->

      <button id="ad-close" title="Закрыть">✕</button>
    </div>
  `

  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    width: '100%',
    zIndex: '1000',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  })

  const style = document.createElement('style')
  style.textContent = `
    #ad-banner-inner {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0d0d1a;
      border-top: 1px solid #2a2a5a;
      padding: 8px 48px 8px 16px;
      min-height: 60px;
      width: 100%;
      max-width: 800px;
      pointer-events: all;
    }
    #ad-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 728px;
      max-width: 100%;
      height: 44px;
      background: #16213e;
      border: 1px dashed #3a3a6a;
      color: #555577;
      font-family: monospace;
      font-size: 13px;
      letter-spacing: 0.5px;
    }
    #ad-close {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: 1px solid #3a3a6a;
      color: #555577;
      cursor: pointer;
      font-size: 13px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      padding: 0;
      line-height: 1;
    }
    #ad-close:hover { border-color: #aaaaaa; color: #aaaaaa; }
  `
  document.head.appendChild(style)
  document.body.appendChild(banner)

  document.getElementById('ad-close')!.addEventListener('click', hideAdBanner)
}

export function hideAdBanner(): void {
  const banner = document.getElementById('ad-banner')
  if (banner) banner.remove()
  sessionStorage.setItem(STORAGE_KEY, '1')
}
